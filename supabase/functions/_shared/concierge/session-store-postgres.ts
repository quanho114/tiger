import type pg from 'pg'
import {
  ConciergeV2SessionRecordSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2SessionDeleteResult,
  type ConciergeV2SessionMutationInput,
  type ConciergeV2SessionMutationResult,
  type ConciergeV2SessionRecord,
  type ConciergeV2SessionReference,
} from '../contracts/concierge-v2.ts'
import {
  createConciergeV2ExpiredError,
  createConciergeV2IdempotencyMismatchError,
  createConciergeV2OwnershipError,
  createConciergeV2StateConflictError,
  internalError,
  MAX_CONCIERGE_SESSION_BYTES,
  type ConciergeV2AtomicSessionBackend,
} from './session-store.ts'

const IDLE_TIMEOUT_MS = 45 * 60 * 1000

function parseRecord(raw: string): ConciergeV2SessionRecord | null {
  try {
    const parsed = ConciergeV2SessionRecordSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function expired(record: ConciergeV2SessionRecord, now: Date): boolean {
  return Date.parse(record.idle_expires_at) <= now.getTime() || Date.parse(record.absolute_expires_at) <= now.getTime()
}

function owned(record: ConciergeV2SessionRecord, actor: ConciergeV2ActorBinding, capabilityHash: string): boolean {
  return record.actor.authenticated_user_id === actor.authenticated_user_id && record.capability_hash === capabilityHash
}

export class PostgresConciergeV2SessionBackend implements ConciergeV2AtomicSessionBackend {
  constructor(private readonly pool: pg.Pool) {}

  async create(record: ConciergeV2SessionRecord, now: Date): Promise<boolean> {
    if (expired(record, now)) return false
    const raw = JSON.stringify(record)
    const result = await this.pool.query(
      `INSERT INTO public.concierge_v2_sessions (session_id, user_id, record, expires_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT (session_id) DO NOTHING`,
      [record.session_id, record.actor.authenticated_user_id, raw, record.idle_expires_at]
    )
    return result.rowCount === 1
  }

  async read(sessionId: string): Promise<string | null> {
    const result = await this.pool.query<{ record: string }>(
      'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1', [sessionId]
    )
    return result.rows[0]?.record ?? null
  }

  async delete(sessionId: string): Promise<void> {
    await this.pool.query('DELETE FROM public.concierge_v2_sessions WHERE session_id = $1', [sessionId])
  }

  async update<T>(_sessionId: string, _operation: (current: string | null) => { next: string | null; result: T }): Promise<T> {
    throw new Error('Atomic session backend does not expose non-atomic updates')
  }

  async compareAndSwap(input: ConciergeV2SessionMutationInput, capabilityHash: string, now: Date): Promise<ConciergeV2SessionMutationResult> {
    const client = await this.pool.connect()
    let committed = false
    try {
      await client.query('BEGIN')
      const selected = await client.query<{ record: string }>(
        'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1 FOR UPDATE',
        [input.reference.session_id]
      )
      const record = selected.rows[0] ? parseRecord(selected.rows[0].record) : null
      if (!record) return { ok: false, error: selected.rows[0] ? internalError() : createConciergeV2ExpiredError() }
      if (expired(record, now)) return { ok: false, error: createConciergeV2ExpiredError() }
      if (!owned(record, input.actor, capabilityHash)) return { ok: false, error: createConciergeV2OwnershipError() }

      const previous = record.idempotency.find(entry => entry.request_id === input.request_id)
      if (previous) {
        return previous.operation_hash === input.operation_hash
          ? { ok: true, record, replay: true, result: previous.result }
          : { ok: false, error: createConciergeV2IdempotencyMismatchError() }
      }
      if (record.state_version !== input.expected_state_version) {
        return { ok: false, error: createConciergeV2StateConflictError() }
      }

      const nextRecord: ConciergeV2SessionRecord = {
        session_id: record.session_id,
        capability_hash: record.capability_hash,
        actor: record.actor,
        created_at: record.created_at,
        absolute_expires_at: record.absolute_expires_at,
        ...input.next,
        state_version: record.state_version + 1,
        idle_expires_at: new Date(Math.min(now.getTime() + IDLE_TIMEOUT_MS, Date.parse(record.absolute_expires_at))).toISOString(),
        idempotency: [...record.idempotency, {
          request_id: input.request_id, operation_hash: input.operation_hash, result: input.result,
        }].slice(-32),
      }
      const raw = JSON.stringify(nextRecord)
      if (new TextEncoder().encode(raw).byteLength > MAX_CONCIERGE_SESSION_BYTES) {
        return { ok: false, error: internalError() }
      }
      await client.query(
        'UPDATE public.concierge_v2_sessions SET record = $2, expires_at = $3 WHERE session_id = $1',
        [record.session_id, raw, nextRecord.idle_expires_at]
      )
      await client.query('COMMIT')
      committed = true
      return { ok: true, record: nextRecord, replay: false, result: input.result }
    } finally {
      if (!committed) await client.query('ROLLBACK').catch(() => {})
      client.release()
    }
  }

  async deleteOwned(reference: ConciergeV2SessionReference, actor: ConciergeV2ActorBinding, capabilityHash: string, now: Date): Promise<ConciergeV2SessionDeleteResult> {
    const client = await this.pool.connect()
    let committed = false
    try {
      await client.query('BEGIN')
      const selected = await client.query<{ record: string }>(
        'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1 FOR UPDATE', [reference.session_id]
      )
      const record = selected.rows[0] ? parseRecord(selected.rows[0].record) : null
      if (!record) return { ok: false, error: selected.rows[0] ? internalError() : createConciergeV2ExpiredError() }
      if (expired(record, now)) return { ok: false, error: createConciergeV2ExpiredError() }
      if (!owned(record, actor, capabilityHash)) return { ok: false, error: createConciergeV2OwnershipError() }
      await client.query('DELETE FROM public.concierge_v2_sessions WHERE session_id = $1', [reference.session_id])
      await client.query('COMMIT')
      committed = true
      return { ok: true, deleted: true }
    } finally {
      if (!committed) await client.query('ROLLBACK').catch(() => {})
      client.release()
    }
  }
}
