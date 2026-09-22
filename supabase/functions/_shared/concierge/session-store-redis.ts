import type {
  ConciergeV2ActorBinding,
  ConciergeV2SessionDeleteResult,
  ConciergeV2SessionMutationInput,
  ConciergeV2SessionMutationResult,
  ConciergeV2SessionRecord,
  ConciergeV2SessionReference,
} from '../contracts/concierge-v2.ts'
import {
  createConciergeV2ExpiredError,
  createConciergeV2IdempotencyMismatchError,
  createConciergeV2OwnershipError,
  createConciergeV2StateConflictError,
  type ConciergeV2AtomicSessionBackend,
} from './session-store.ts'

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

interface UpstashRedisResponse<T> {
  error?: string
  result?: T
}

interface RedisMutationSuccess {
  record: ConciergeV2SessionRecord
  replay: boolean
  result: ConciergeV2SessionMutationResult extends { ok: true; result: infer T } ? T : never
  status: 'ok'
}

interface RedisMutationFailure {
  status: 'expired' | 'idempotency_mismatch' | 'ownership_mismatch' | 'state_conflict'
}

interface RedisDeleteSuccess {
  status: 'deleted'
}

export interface UpstashRedisSessionBackendOptions {
  fetch?: typeof fetch
  keyPrefix: string
  restToken: string
  restUrl: string
}

const CREATE_SCRIPT = "if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end local written = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX') if written then return 1 end return 0"
const MUTATE_SCRIPT = "local raw = redis.call('GET', KEYS[1]) if not raw then return cjson.encode({status='expired'}) end local record = cjson.decode(raw) if record.idle_expires_at <= ARGV[4] or record.absolute_expires_at <= ARGV[4] then redis.call('DEL', KEYS[1]) return cjson.encode({status='expired'}) end local actor = record.actor.authenticated_user_id or '' if actor ~= ARGV[2] or record.capability_hash ~= ARGV[1] then return cjson.encode({status='ownership_mismatch'}) end for _, entry in ipairs(record.idempotency) do if entry.request_id == ARGV[5] then if entry.operation_hash == ARGV[6] then return cjson.encode({status='ok', replay=true, record=record, result=entry.result}) end return cjson.encode({status='idempotency_mismatch'}) end end if record.state_version ~= tonumber(ARGV[3]) then return cjson.encode({status='state_conflict'}) end local next = cjson.decode(ARGV[7]) record.transcript = next.transcript record.summary = next.summary record.constraints = next.constraints record.draft = next.draft record.pending_suggestion_ids = next.pending_suggestion_ids record.state_version = record.state_version + 1 record.idle_expires_at = ARGV[8] table.insert(record.idempotency, {request_id=ARGV[5], operation_hash=ARGV[6], result=cjson.decode(ARGV[9])}) while #record.idempotency > 32 do table.remove(record.idempotency, 1) end redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL') return cjson.encode({status='ok', replay=false, record=record, result=cjson.decode(ARGV[9])})"
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

function parseResponse<T>(value: unknown): T {
  if (typeof value !== 'string') {
    return value as T
  }
  return JSON.parse(value) as T
}

function errorFor(status: RedisMutationFailure['status']) {
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

  async create(record: ConciergeV2SessionRecord): Promise<boolean> {
    const remainingLifetime = Date.parse(record.absolute_expires_at) - Date.now()
    if (remainingLifetime <= 0) {
      return false
    }

    const result = await this.eval<number>(CREATE_SCRIPT, [keyFor(this.options.keyPrefix, record.session_id)], [JSON.stringify(record), String(Math.min(remainingLifetime, FOUR_HOURS_MS))])
    return result === 1
  }

  async compareAndSwap(input: ConciergeV2SessionMutationInput, capabilityHash: string, now: Date): Promise<ConciergeV2SessionMutationResult> {
    const response = parseResponse<RedisMutationSuccess | RedisMutationFailure>(
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
          new Date(Math.min(now.getTime() + 45 * 60 * 1000, now.getTime() + FOUR_HOURS_MS)).toISOString(),
          JSON.stringify(input.result),
        ]
      )
    )

    if (response.status !== 'ok') {
      return { ok: false, error: errorFor(response.status) }
    }

    return { ok: true, record: response.record, replay: response.replay, result: response.result }
  }

  async deleteOwned(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding, capabilityHash: string, now: Date): Promise<ConciergeV2SessionDeleteResult> {
    const response = parseResponse<RedisDeleteSuccess | RedisMutationFailure>(
      await this.eval<unknown>(DELETE_SCRIPT, [keyFor(this.options.keyPrefix, reference.session_id)], [capabilityHash, actorId(actor), now.toISOString()])
    )

    return response.status === 'deleted' ? { ok: true, deleted: true } : { ok: false, error: errorFor(response.status) }
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

    const payload = (await response.json()) as UpstashRedisResponse<T>[]
    const item = payload[0]
    if (!item || item.error || !('result' in item)) {
      throw new Error('Shared session store response failed')
    }

    return item.result as T
  }
}

function defaultEnvironment(): Record<string, string | undefined> {
  return typeof process === 'undefined' ? {} : process.env
}

export function createUpstashRedisSessionBackendFromEnvironment(environment: Record<string, string | undefined> = defaultEnvironment()): UpstashRedisSessionBackend | null {
  if (environment.CONCIERGE_SESSION_STORE !== 'upstash') {
    return null
  }

  const restUrl = environment.CONCIERGE_REDIS_REST_URL
  const restToken = environment.CONCIERGE_REDIS_REST_TOKEN
  const keyPrefix = environment.CONCIERGE_REDIS_KEY_PREFIX
  if (!restUrl || !restToken || !keyPrefix) {
    return null
  }

  try {
    return new UpstashRedisSessionBackend({ restUrl, restToken, keyPrefix })
  } catch {
    return null
  }
}
