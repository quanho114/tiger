import type pg from 'pg'
import { sha256 } from '../crypto.ts'
import { ConciergeV2SessionRecordSchema } from '../contracts/concierge-v2.ts'
import { initializeMemoryContext } from './memory-state.ts'
import { MAX_CONCIERGE_SESSION_BYTES } from './session-store.ts'

const scopedClients = new WeakSet<object>()

/** One account-wide transaction barrier across Edge isolates. A forget operation
 * waits for an admitted turn; no old turn may commit or emit after it returns.
 * Nested repository operations reuse the transaction instead of another pool slot.
 */
export async function withMemoryBarrier<T>(pool: pg.Pool, userId: string, work: (queryPool: pg.Pool) => Promise<T>, wait = true): Promise<T> {
  if (scopedClients.has(pool)) return work(pool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL lock_timeout = '25s'")
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '35s'")
    const key = sha256(`concierge-memory:${userId}`)
    if (wait) await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
    else {
      const lock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', [key])
      if (!lock.rows[0]?.acquired) throw new Error('STATE_CONFLICT')
    }
    scopedClients.add(client)
    const value = await work(client as unknown as pg.Pool)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    scopedClients.delete(client)
    client.release()
  }
}

/** Purge imported data in the same transaction as a successful privacy change.
 * Accepted draft state and independently supplied current-meal constraints stay.
 * Replay tombstones retain request hashes, so retries cannot re-run old writes.
 */
export async function invalidateMemorySessions(pool: pg.Pool, userId: string): Promise<void> {
  const selected = await pool.query<{ session_id: string; record: string }>(
    'SELECT session_id, record FROM public.concierge_v2_sessions WHERE user_id = $1 FOR UPDATE', [userId])
  for (const row of selected.rows) {
    const record = ConciergeV2SessionRecordSchema.parse(typeof row.record === 'string' ? JSON.parse(row.record) : row.record)
    initializeMemoryContext(record, userId)
    record.constraints = structuredClone(record.memory_context!.current)
    record.memory_context!.imported = []
    delete record.memory_context!.epoch
    delete record.memory_context!.behavioral_refreshed_epoch
    record.transcript = []; record.summary = ''
    record.pending_items = []; record.pending_suggestion_ids = []
    if (record.conversation_context) delete record.conversation_context.displayed
    record.state_version++
    if (record.conversation_context?.pending_question) record.conversation_context.pending_question.state_version = record.state_version
    record.idempotency = record.idempotency.map(entry => ({ ...entry, result: {
      ...entry.result, message: 'Kết quả trước đã được ẩn sau khi cập nhật quyền riêng tư. Hãy tiếp tục với trạng thái hiện tại.',
      cards: [], suggested_actions: [], warnings: [],
    } }))
    const serialized = JSON.stringify(ConciergeV2SessionRecordSchema.parse(record))
    if (new TextEncoder().encode(serialized).length > MAX_CONCIERGE_SESSION_BYTES) throw new Error('MEMORY_SESSION_SIZE_LIMIT')
    await pool.query('UPDATE public.concierge_v2_sessions SET record = $2 WHERE session_id = $1 AND user_id = $3',
      [row.session_id, serialized, userId])
  }
}
