import type pg from 'pg'
import { ConciergeV2SessionRecordSchema, type ConciergeV2SessionReference } from '../contracts/concierge-v2.ts'
import { sha256 } from '../crypto.ts'
import { ConciergeRuntimeError } from './runtime.ts'
import { initializeMemoryContext } from './memory-state.ts'

function opaque(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return prefix + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function prepareGuestClaim(pool: pg.Pool, reference: ConciergeV2SessionReference): Promise<string> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Both prepare and claim lock the ticket before the session to avoid deadlocks.
    await client.query('SELECT ticket_hash FROM public.concierge_v2_claim_tickets WHERE session_id = $1 FOR UPDATE', [reference.session_id])
    const row = await client.query<{ record: string }>(
      'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1 FOR UPDATE', [reference.session_id])
    const parsed = ConciergeV2SessionRecordSchema.safeParse(row.rows[0] && JSON.parse(row.rows[0].record))
    const record = parsed.success ? parsed.data : null
    const now = Date.now()
    if (!record || record.actor.authenticated_user_id || Date.parse(record.idle_expires_at) <= now ||
        Date.parse(record.absolute_expires_at) <= now || record.capability_hash !== sha256(reference.session_capability)) {
      throw new ConciergeRuntimeError({ code: 'OWNERSHIP_MISMATCH', message: 'Phiên khách không còn hợp lệ.' })
    }
    const ticket = opaque('cct_')
    const expires = new Date(Math.min(now + 5 * 60_000, Date.parse(record.idle_expires_at), Date.parse(record.absolute_expires_at)))
    await client.query(`INSERT INTO public.concierge_v2_claim_tickets (ticket_hash, session_id, expires_at)
      VALUES ($1, $2, $3) ON CONFLICT (session_id) DO UPDATE SET ticket_hash = EXCLUDED.ticket_hash,
      expires_at = EXCLUDED.expires_at`, [sha256(ticket), record.session_id, expires])
    await client.query('COMMIT')
    return ticket
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function claimGuestSession(pool: pg.Pool, ticket: string, userId: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query<{ session_id: string; expires_at: Date }>(
      'SELECT session_id, expires_at FROM public.concierge_v2_claim_tickets WHERE ticket_hash = $1 FOR UPDATE', [sha256(ticket)])
    const claim = found.rows[0]
    if (!claim || claim.expires_at.getTime() <= Date.now()) {
      throw new ConciergeRuntimeError({ code: 'SESSION_EXPIRED', message: 'Liên kết chuyển phiên đã hết hạn.' })
    }
    const selected = await client.query<{ record: string }>(
      'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1 FOR UPDATE', [claim.session_id])
    const parsed = ConciergeV2SessionRecordSchema.safeParse(selected.rows[0] && JSON.parse(selected.rows[0].record))
    const record = parsed.success ? parsed.data : null
    const now = Date.now()
    if (!record || record.actor.authenticated_user_id || Date.parse(record.idle_expires_at) <= now ||
        Date.parse(record.absolute_expires_at) <= now) {
      throw new ConciergeRuntimeError({ code: 'OWNERSHIP_MISMATCH', message: 'Phiên khách không còn hợp lệ.' })
    }
    const capability = opaque('csc_')
    initializeMemoryContext(record)
    const next = ConciergeV2SessionRecordSchema.parse({ ...record, actor: { authenticated_user_id: userId },
      capability_hash: sha256(capability), state_version: record.state_version + 1, idempotency: [] })
    initializeMemoryContext(next, userId)
    if (next.conversation_context?.pending_question) next.conversation_context.pending_question.state_version = next.state_version
    await client.query('UPDATE public.concierge_v2_sessions SET user_id = $2, record = $3 WHERE session_id = $1',
      [record.session_id, userId, JSON.stringify(next)])
    await client.query('DELETE FROM public.concierge_v2_claim_tickets WHERE ticket_hash = $1', [sha256(ticket)])
    await client.query('COMMIT')
    return { session: { session_id: record.session_id, session_capability: capability,
      state_version: next.state_version, idle_expires_at: next.idle_expires_at, absolute_expires_at: next.absolute_expires_at },
      transcript: next.transcript, draft: next.draft }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
