import type {
  ConciergeV2ActorBinding,
  ConciergeV2SessionDeleteResult,
  ConciergeV2SessionMutationInput,
  ConciergeV2SessionMutationResult,
  ConciergeV2SessionRecord,
  ConciergeV2SessionReference,
  ConciergeV2StoredTurnResult,
} from '../contracts/concierge-v2.ts'
import {
  ConciergeV2SessionRecordSchema,
  ConciergeV2StoredTurnResultSchema,
} from '../contracts/concierge-v2.ts'
import {
  createConciergeV2ExpiredError,
  createConciergeV2IdempotencyMismatchError,
  createConciergeV2OwnershipError,
  createConciergeV2StateConflictError,
  type ConciergeV2AtomicSessionBackend,
} from './session-store.ts'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000
const IDLE_TIMEOUT_MS = 45 * 60 * 1000

type RedisFailureStatus = 'expired' | 'idempotency_mismatch' | 'ownership_mismatch' | 'state_conflict'

interface RedisMutationSuccess {
  record: ConciergeV2SessionRecord
  replay: boolean
  result: ConciergeV2StoredTurnResult
  status: 'ok'
}

export interface UpstashRedisSessionBackendOptions {
  fetch?: typeof fetch
  keyPrefix: string
  restToken: string
  restUrl: string
}

const CREATE_SCRIPT = "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end local written = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') if written then return 1 end return 0"
const MUTATE_SCRIPT = "local raw = redis.call('GET', KEYS[1]) if not raw then return cjson.encode({status='expired'}) end local record = cjson.decode(raw) if record.idle_expires_at <= ARGV[4] or record.absolute_expires_at <= ARGV[4] then redis.call('DEL', KEYS[1]) return cjson.encode({status='expired'}) end local actor = record.actor.authenticated_user_id or '' if actor ~= ARGV[2] or record.capability_hash ~= ARGV[1] then return cjson.encode({status='ownership_mismatch'}) end for _, entry in ipairs(record.idempotency) do if entry.request_id == ARGV[5] then if entry.operation_hash == ARGV[6] then return cjson.encode({status='ok', replay=true, record=record, result=entry.result}) end return cjson.encode({status='idempotency_mismatch'}) end end if record.state_version ~= tonumber(ARGV[3]) then return cjson.encode({status='state_conflict'}) end local next = cjson.decode(ARGV[7]) record.transcript = next.transcript record.summary = next.summary record.constraints = next.constraints record.draft = next.draft record.pending_suggestion_ids = next.pending_suggestion_ids record.state_version = record.state_version + 1 record.idle_expires_at = ARGV[8] if record.idle_expires_at > record.absolute_expires_at then record.idle_expires_at = record.absolute_expires_at end table.insert(record.idempotency, {request_id=ARGV[5], operation_hash=ARGV[6], result=cjson.decode(ARGV[9])}) while #record.idempotency > 32 do table.remove(record.idempotency, 1) end redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL') return cjson.encode({status='ok', replay=false, record=record, result=cjson.decode(ARGV[9])})"
const DELETE_SCRIPT = "local raw = redis.call('GET', KEYS[1]) if not raw then return cjson.encode({status='expired'}) end local record = cjson.decode(raw) if record.idle_expires_at <= ARGV[3] or record.absolute_expires_at <= ARGV[3] then redis.call('DEL', KEYS[1]) return cjson.encode({status='expired'}) end local actor = record.actor.authenticated_user_id or '' if actor ~= ARGV[2] or record.capability_hash ~= ARGV[1] then return cjson.encode({status='ownership_mismatch'}) end redis.call('DEL', KEYS[1]) return cjson.encode({status='deleted'})"

function normalizeRestUrl(restUrl: string): string | null {
  try {
    const url = new URL(restUrl)
    return url.protocol === 'https:' ? url.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

function keyFor(prefix: string, sessionId: string): string {
  return `${prefix}:concierge-v2:session:${sessionId}`
}

function actorId(actor: ConciergeV2ActorBinding): string {
  return actor.authenticated_user_id ?? ''
}

function parseResponse(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  return JSON.parse(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFailureStatus(value: unknown): value is RedisFailureStatus {
  return value === 'expired' || value === 'idempotency_mismatch' || value === 'ownership_mismatch' || value === 'state_conflict'
}

function errorFor(status: RedisFailureStatus) {
  if (status === 'expired') {
    return createConciergeV2ExpiredError()
  }
  if (status === 'ownership_mismatch') {
    return createConciergeV2OwnershipError()
  }
  if (status === 'idempotency_mismatch') {
    return createConciergeV2IdempotencyMismatchError()
  }

  return createConciergeV2StateConflictError()
}

function parseMutationResponse(value: unknown): RedisMutationSuccess | RedisFailureStatus | null {
  if (!isRecord(value)) {
    return null
  }
  if (isFailureStatus(value.status)) {
    return value.status
  }
  if (value.status !== 'ok' || typeof value.replay !== 'boolean') {
    return null
  }

  const record = ConciergeV2SessionRecordSchema.safeParse(value.record)
  const result = ConciergeV2StoredTurnResultSchema.safeParse(value.result)
  return record.success && result.success ? { status: 'ok', replay: value.replay, record: record.data, result: result.data } : null
}

function parseDeleteResponse(value: unknown): 'deleted' | RedisFailureStatus | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.status === 'deleted' || isFailureStatus(value.status)) {
    return value.status
  }

  return null
}

function initialTtlMilliseconds(record: ConciergeV2SessionRecord, now: Date): number {
  const remainingLifetime = Date.parse(record.absolute_expires_at) - now.getTime()
  return Math.min(Math.max(remainingLifetime, 0), FOUR_HOURS_MS)
}

export class UpstashRedisSessionBackend implements ConciergeV2AtomicSessionBackend {
  private readonly fetcher: typeof fetch
  private readonly restUrl: string

  constructor(private readonly options: UpstashRedisSessionBackendOptions) {
    const restUrl = normalizeRestUrl(options.restUrl)
    if (!restUrl || !options.restToken.trim() || !options.keyPrefix.trim()) {
      throw new Error('Invalid shared session store configuration')
    }

    this.fetcher = options.fetch ?? fetch
    this.restUrl = restUrl
  }

  async create(record: ConciergeV2SessionRecord, now: Date): Promise<boolean> {
    const ttl = initialTtlMilliseconds(record, now)
    if (ttl <= 0) {
      return false
    }

    const result = await this.eval<number>(CREATE_SCRIPT, [keyFor(this.options.keyPrefix, record.session_id)], [JSON.stringify(record), String(ttl)])
    return result === 1
  }

  async compareAndSwap(input: ConciergeV2SessionMutationInput, capabilityHash: string, now: Date): Promise<ConciergeV2SessionMutationResult> {
    const response = parseMutationResponse(
      parseResponse(
        await this.eval<unknown>(
          MUTATE_SCRIPT,
          [keyFor(this.options.keyPrefix, input.reference.session_id)],
          [
            capabilityHash,
            actorId(input.actor),
            String(input.expected_state_version),
            now.toISOString(),
            input.request_id,
            input.operation_hash,
            JSON.stringify(input.next),
            new Date(now.getTime() + IDLE_TIMEOUT_MS).toISOString(),
            JSON.stringify(input.result),
          ]
        )
      )
    )

    if (response === null) {
      throw new Error('Shared session store response failed')
    }
    if (typeof response === 'string') {
      return { ok: false, error: errorFor(response) }
    }

    return { ok: true, record: response.record, replay: response.replay, result: response.result }
  }

  async deleteOwned(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding, capabilityHash: string, now: Date): Promise<ConciergeV2SessionDeleteResult> {
    const response = parseDeleteResponse(
      parseResponse(await this.eval<unknown>(DELETE_SCRIPT, [keyFor(this.options.keyPrefix, reference.session_id)], [capabilityHash, actorId(actor), now.toISOString()]))
    )

    if (response === null) {
      throw new Error('Shared session store response failed')
    }
    if (response === 'deleted') {
      return { ok: true, deleted: true }
    }

    return { ok: false, error: errorFor(response) }
  }

  async delete(sessionId: string): Promise<void> {
    await this.command<unknown>(['DEL', keyFor(this.options.keyPrefix, sessionId)])
  }

  async read(sessionId: string): Promise<string | null> {
    const result = await this.command<string | null>(['GET', keyFor(this.options.keyPrefix, sessionId)])
    return typeof result === 'string' ? result : null
  }

  async update<T>(_sessionId: string, _operation: (current: string | null) => { next: string | null; result: T }): Promise<T> {
    throw new Error('Atomic session backend does not expose non-atomic updates')
  }

  private async eval<T>(script: string, keys: readonly string[], args: readonly string[]): Promise<T> {
    return this.command<T>(['EVAL', script, String(keys.length), ...keys, ...args])
  }

  private async command<T>(command: readonly string[]): Promise<T> {
    const response = await this.fetcher(`${this.restUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.restToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([command]),
    })
    if (!response.ok) {
      throw new Error('Shared session store request failed')
    }

    const payload: unknown = await response.json()
    if (!Array.isArray(payload) || !isRecord(payload[0]) || typeof payload[0].error === 'string' || !('result' in payload[0])) {
      throw new Error('Shared session store response failed')
    }

    return payload[0].result as T
  }
}

function defaultEnvironment(): Record<string, string | undefined> {
  return typeof process === 'undefined' ? {} : process.env
}

export function createUpstashRedisSessionBackendFromEnvironment(
  environment: Record<string, string | undefined> = defaultEnvironment(),
  keyPrefixOverride?: string
): UpstashRedisSessionBackend | null {
  if (environment.CONCIERGE_SESSION_STORE !== 'upstash') {
    return null
  }

  const restUrl = environment.CONCIERGE_REDIS_REST_URL
  const restToken = environment.CONCIERGE_REDIS_REST_TOKEN
  const keyPrefix = keyPrefixOverride ?? environment.CONCIERGE_REDIS_KEY_PREFIX
  if (!restUrl || !restToken || !keyPrefix) {
    return null
  }

  try {
    return new UpstashRedisSessionBackend({ restUrl, restToken, keyPrefix })
  } catch {
    return null
  }
}
