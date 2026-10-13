import { expect, it, vi } from 'vitest'
import type pg from 'pg'
import { sha256 } from '../../supabase/functions/_shared/crypto.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { claimGuestSession, prepareGuestClaim } from '../../supabase/functions/_shared/concierge/session-claim.ts'

it('uses a one-time ticket and rotates the guest capability on claim', async () => {
  const sessionId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const reference = { session_id: sessionId, session_capability: 'csc_' + 'a'.repeat(64) }
  let record = JSON.stringify({ ...emptyConciergeSession(), session_id: sessionId,
    capability_hash: sha256(reference.session_capability), actor: { authenticated_user_id: null },
    state_version: 2, created_at: new Date().toISOString(), idle_expires_at: new Date(Date.now() + 600_000).toISOString(),
    absolute_expires_at: new Date(Date.now() + 3_600_000).toISOString(), idempotency: [],
    transcript: [{ role: 'user', content: '4 người nha' }] })
  let ticket: { ticket_hash: string; session_id: string; expires_at: Date } | null = null
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT ticket_hash')) return { rows: ticket ? [{ ticket_hash: ticket.ticket_hash }] : [] }
    if (sql.startsWith('SELECT record')) return { rows: [{ record }] }
    if (sql.startsWith('INSERT INTO public.concierge_v2_claim_tickets')) {
      ticket = { ticket_hash: params![0] as string, session_id: params![1] as string, expires_at: params![2] as Date }
      return { rows: [] }
    }
    if (sql.startsWith('SELECT session_id, expires_at')) return { rows: ticket && ticket.ticket_hash === params![0] ? [ticket] : [] }
    if (sql.startsWith('UPDATE public.concierge_v2_sessions')) { record = params![2] as string; return { rows: [] } }
    if (sql.startsWith('DELETE FROM public.concierge_v2_claim_tickets')) { ticket = null; return { rows: [] } }
    return { rows: [] }
  })
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as pg.Pool
  await expect(prepareGuestClaim(pool, { ...reference, session_capability: 'csc_' + '0'.repeat(64) })).rejects.toThrow()
  const issued = await prepareGuestClaim(pool, reference)
  expect(ticket && (ticket as { ticket_hash: string }).ticket_hash).toBe(sha256(issued))
  const result = await claimGuestSession(pool, issued, userId)
  expect(result.transcript).toEqual([{ role: 'user', content: '4 người nha' }])
  expect(result.session.session_capability).not.toBe(reference.session_capability)
  expect(JSON.parse(record)).toMatchObject({ actor: { authenticated_user_id: userId },
    capability_hash: sha256(result.session.session_capability), state_version: 3, idempotency: [] })
  await expect(claimGuestSession(pool, issued, userId)).rejects.toThrow()
})
