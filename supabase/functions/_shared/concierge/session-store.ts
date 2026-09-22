import {
  ConciergeV2SessionCreateInputSchema,
  ConciergeV2SessionMutationInputSchema,
  ConciergeV2SessionRecordSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2Error,
  type ConciergeV2SessionCreateInput,
  type ConciergeV2SessionCreateResult,
  type ConciergeV2SessionDeleteResult,
  type ConciergeV2SessionMutationInput,
  type ConciergeV2SessionMutationResult,
  type ConciergeV2SessionReadResult,
  type ConciergeV2SessionRecord,
  type ConciergeV2SessionReference,
  type ConciergeV2SessionStore,
} from '../contracts/concierge-v2.ts'

const IDLE_TIMEOUT_MS = 45 * 60 * 1000
const ABSOLUTE_TIMEOUT_MS = 4 * 60 * 60 * 1000

export interface ConciergeV2Clock {
  now(): Date
}

export interface ConciergeV2SessionBackend {
  delete(sessionId: string): Promise<void>
  read(sessionId: string): Promise<string | null>
  update<T>(sessionId: string, operation: (current: string | null) => { next: string | null; result: T }): Promise<T>
}

export interface ConciergeV2AtomicSessionBackend extends ConciergeV2SessionBackend {
  create(record: ConciergeV2SessionRecord): Promise<boolean>
  compareAndSwap(input: ConciergeV2SessionMutationInput, capabilityHash: string, now: Date): Promise<ConciergeV2SessionMutationResult>
  deleteOwned(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding, capabilityHash: string, now: Date): Promise<ConciergeV2SessionDeleteResult>
}

export interface ConciergeV2SessionStoreOptions {
  backend: ConciergeV2SessionBackend
  clock?: ConciergeV2Clock
}

const systemClock: ConciergeV2Clock = { now: (): Date => new Date() }

function error(code: ConciergeV2Error['code'], message: string, retryable?: boolean): ConciergeV2Error {
  return retryable === undefined ? { code, message } : { code, message, retryable }
}

function unavailableError(): ConciergeV2Error {
  return error('DEPENDENCY_UNAVAILABLE', 'Dịch vụ phiên tạm thời chưa sẵn sàng.', true)
}

function expiredError(): ConciergeV2Error {
  return error('SESSION_EXPIRED', 'Phiên trò chuyện đã hết hạn. Vui lòng bắt đầu phiên mới.')
}

function ownershipError(): ConciergeV2Error {
  return error('OWNERSHIP_MISMATCH', 'Phiên trò chuyện không thuộc về danh tính hiện tại.')
}

function conflictError(): ConciergeV2Error {
  return error('STATE_CONFLICT', 'Phiên trò chuyện đã thay đổi. Vui lòng làm mới trạng thái.')
}

function idempotencyMismatchError(): ConciergeV2Error {
  return error('IDEMPOTENCY_MISMATCH', 'Mã yêu cầu đã được dùng cho một thao tác khác.')
}

export function createConciergeV2StateConflictError(): ConciergeV2Error {
  return conflictError()
}

export function createConciergeV2IdempotencyMismatchError(): ConciergeV2Error {
  return idempotencyMismatchError()
}

export function createConciergeV2ExpiredError(): ConciergeV2Error {
  return expiredError()
}

export function createConciergeV2OwnershipError(): ConciergeV2Error {
  return ownershipError()
}

function internalError(): ConciergeV2Error {
  return error('INTERNAL_SAFE_FAILURE', 'Không thể xử lý phiên trò chuyện một cách an toàn.', true)
}

function toIso(value: Date): string {
  return value.toISOString()
}

function addMilliseconds(value: Date, milliseconds: number): Date {
  return new Date(value.getTime() + milliseconds)
}

function hasExpired(record: ConciergeV2SessionRecord, now: Date): boolean {
  return Date.parse(record.idle_expires_at) <= now.getTime() || Date.parse(record.absolute_expires_at) <= now.getTime()
}

function nextIdleExpiry(now: Date, absoluteExpiry: Date): Date {
  const idleExpiry = addMilliseconds(now, IDLE_TIMEOUT_MS)
  return idleExpiry.getTime() < absoluteExpiry.getTime() ? idleExpiry : absoluteExpiry
}

function parseRecord(raw: string): ConciergeV2SessionRecord | null {
  try {
    const parsed = ConciergeV2SessionRecordSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function serialize(record: ConciergeV2SessionRecord): string {
  return JSON.stringify(record)
}

function actorMatches(expected: ConciergeV2ActorBinding, actual: ConciergeV2ActorBinding): boolean {
  return expected.authenticated_user_id === actual.authenticated_user_id
}

function createCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `csc_${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}

async function hashCapability(capability: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(capability))
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function isAuthorized(record: ConciergeV2SessionRecord, actor: ConciergeV2ActorBinding, capabilityHash: string): boolean {
  return actorMatches(record.actor, actor) && record.capability_hash === capabilityHash
}

function isAtomicBackend(backend: ConciergeV2SessionBackend): backend is ConciergeV2AtomicSessionBackend {
  return 'compareAndSwap' in backend && typeof backend.compareAndSwap === 'function'
}

export class InMemoryConciergeV2SessionBackend implements ConciergeV2SessionBackend {
  private readonly records = new Map<string, string>()

  constructor(private readonly clock: ConciergeV2Clock = systemClock) {}

  async delete(sessionId: string): Promise<void> {
    this.records.delete(sessionId)
  }

  async getRaw(sessionId: string): Promise<string> {
    return this.records.get(sessionId) ?? ''
  }

  async read(sessionId: string): Promise<string | null> {
    const raw = this.records.get(sessionId)
    if (!raw) {
      return null
    }

    const record = parseRecord(raw)
    if (!record || hasExpired(record, this.clock.now())) {
      this.records.delete(sessionId)
      return null
    }

    return raw
  }

  async update<T>(sessionId: string, operation: (current: string | null) => { next: string | null; result: T }): Promise<T> {
    const updated = operation(this.records.get(sessionId) ?? null)
    if (updated.next === null) {
      this.records.delete(sessionId)
    } else {
      this.records.set(sessionId, updated.next)
    }
    return updated.result
  }
}

class UnavailableConciergeV2SessionStore implements ConciergeV2SessionStore {
  async read(): Promise<ConciergeV2SessionReadResult> {
    return { ok: false, error: unavailableError() }
  }

  async create(): Promise<ConciergeV2SessionCreateResult> {
    return { ok: false, error: unavailableError() }
  }

  async compareAndSwap(): Promise<ConciergeV2SessionMutationResult> {
    return { ok: false, error: unavailableError() }
  }

  async delete(): Promise<ConciergeV2SessionDeleteResult> {
    return { ok: false, error: unavailableError() }
  }
}

class SessionStore implements ConciergeV2SessionStore {
  constructor(private readonly backend: ConciergeV2SessionBackend, private readonly clock: ConciergeV2Clock) {}

  async read(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding): Promise<ConciergeV2SessionReadResult> {
    try {
      const raw = await this.backend.read(reference.session_id)
      if (!raw) {
        return { ok: false, error: expiredError() }
      }

      const record = parseRecord(raw)
      if (!record) {
        await this.backend.delete(reference.session_id)
        return { ok: false, error: internalError() }
      }
      if (hasExpired(record, this.clock.now())) {
        await this.backend.delete(reference.session_id)
        return { ok: false, error: expiredError() }
      }
      if (!isAuthorized(record, actor, await hashCapability(reference.session_capability))) {
        return { ok: false, error: ownershipError() }
      }

      return { ok: true, record }
    } catch {
      return { ok: false, error: unavailableError() }
    }
  }

  async create(input: ConciergeV2SessionCreateInput): Promise<ConciergeV2SessionCreateResult> {
    const parsedInput = ConciergeV2SessionCreateInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return { ok: false, error: internalError() }
    }

    try {
      const now = this.clock.now()
      const sessionId = crypto.randomUUID()
      const capability = createCapability()
      const absoluteExpiry = addMilliseconds(now, ABSOLUTE_TIMEOUT_MS)
      const record: ConciergeV2SessionRecord = {
        session_id: sessionId,
        capability_hash: await hashCapability(capability),
        state_version: 1,
        created_at: toIso(now),
        idle_expires_at: toIso(nextIdleExpiry(now, absoluteExpiry)),
        absolute_expires_at: toIso(absoluteExpiry),
        ...parsedInput.data,
        idempotency: [],
      }
      const created = isAtomicBackend(this.backend)
        ? await this.backend.create(record)
        : await this.backend.update(sessionId, (current) => ({ next: current === null ? serialize(record) : null, result: current === null }))

      return created
        ? { ok: true, record, reference: { session_id: sessionId, session_capability: capability } }
        : { ok: false, error: unavailableError() }
    } catch {
      return { ok: false, error: unavailableError() }
    }
  }

  async compareAndSwap(input: ConciergeV2SessionMutationInput): Promise<ConciergeV2SessionMutationResult> {
    const parsedInput = ConciergeV2SessionMutationInputSchema.safeParse(input)
    if (!parsedInput.success) {
      return { ok: false, error: internalError() }
    }

    try {
      const capabilityHash = await hashCapability(parsedInput.data.reference.session_capability)
      if (isAtomicBackend(this.backend)) {
        return await this.backend.compareAndSwap(parsedInput.data, capabilityHash, this.clock.now())
      }
      return await this.backend.update(parsedInput.data.reference.session_id, (raw) => this.mutate(raw, parsedInput.data, capabilityHash))
    } catch {
      return { ok: false, error: unavailableError() }
    }
  }

  async delete(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding): Promise<ConciergeV2SessionDeleteResult> {
    try {
      const capabilityHash = await hashCapability(reference.session_capability)
      if (isAtomicBackend(this.backend)) {
        return await this.backend.deleteOwned(reference, actor, capabilityHash, this.clock.now())
      }
      return await this.backend.update(reference.session_id, (raw) => this.deleteOwned(raw, reference, actor, capabilityHash))
    } catch {
      return { ok: false, error: unavailableError() }
    }
  }

  private mutate(raw: string | null, input: ConciergeV2SessionMutationInput, capabilityHash: string): { next: string | null; result: ConciergeV2SessionMutationResult } {
    const record = raw ? parseRecord(raw) : null
    if (!record || hasExpired(record, this.clock.now())) {
      return { next: null, result: { ok: false, error: expiredError() } }
    }
    if (!isAuthorized(record, input.actor, capabilityHash)) {
      return { next: raw, result: { ok: false, error: ownershipError() } }
    }

    const previous = record.idempotency.find((entry) => entry.request_id === input.request_id)
    if (previous) {
      return previous.operation_hash === input.operation_hash
        ? { next: raw, result: { ok: true, record, replay: true, result: previous.result } }
        : { next: raw, result: { ok: false, error: idempotencyMismatchError() } }
    }
    if (record.state_version !== input.expected_state_version) {
      return { next: raw, result: { ok: false, error: conflictError() } }
    }

    const now = this.clock.now()
    const nextRecord: ConciergeV2SessionRecord = {
      ...record,
      ...input.next,
      state_version: record.state_version + 1,
      idle_expires_at: toIso(nextIdleExpiry(now, new Date(record.absolute_expires_at))),
      idempotency: [...record.idempotency, { request_id: input.request_id, operation_hash: input.operation_hash, result: input.result }].slice(-32),
    }
    return { next: serialize(nextRecord), result: { ok: true, record: nextRecord, replay: false, result: input.result } }
  }

  private deleteOwned(raw: string | null, reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding, capabilityHash: string): { next: string | null; result: ConciergeV2SessionDeleteResult } {
    const record = raw ? parseRecord(raw) : null
    if (!record || hasExpired(record, this.clock.now())) {
      return { next: null, result: { ok: false, error: expiredError() } }
    }
    if (!isAuthorized(record, actor, capabilityHash)) {
      return { next: raw, result: { ok: false, error: ownershipError() } }
    }
    return { next: null, result: { ok: true, deleted: true } }
  }
}

export function createConciergeV2SessionStore(options: ConciergeV2SessionStoreOptions): ConciergeV2SessionStore {
  return new SessionStore(options.backend, options.clock ?? systemClock)
}

export function createConciergeV2UnavailableSessionStore(): ConciergeV2SessionStore {
  return new UnavailableConciergeV2SessionStore()
}
