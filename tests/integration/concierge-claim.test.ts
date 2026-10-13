import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { claimGuestSession, prepareGuestClaim } from '../../supabase/functions/_shared/concierge/session-claim.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
const store = createConciergeV2SessionStore({ backend: new PostgresConciergeV2SessionBackend(pool) })
const userId = crypto.randomUUID()
let sessionId = ''

beforeAll(async () => {
  await ensureConciergePostgresSessionTable(pool)
  const exists = await pool.query("SELECT to_regclass('public.concierge_v2_claim_tickets') AS name")
  if (!exists.rows[0].name) await pool.query(await readFile('supabase/migrations/20260923000004_concierge_guest_claim.sql', 'utf8'))
  await pool.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [userId, `${userId}@example.test`])
})

afterAll(async () => {
  if (sessionId) await pool.query('DELETE FROM public.concierge_v2_sessions WHERE session_id = $1', [sessionId])
  await pool.query('DELETE FROM auth.users WHERE id = $1', [userId])
  await pool.end()
})

it('claims once, retains the conversation, and revokes the guest capability', async () => {
  const guest = { authenticated_user_id: null }
  const created = await store.create({ ...emptyConciergeSession(), actor: guest })
  if (!created.ok) throw new Error(created.error.code)
  sessionId = created.reference.session_id
  const updated = await store.compareAndSwap({ reference: created.reference, actor: guest,
    expected_state_version: 1, request_id: crypto.randomUUID(), operation_hash: 'a'.repeat(64),
    next: { ...emptyConciergeSession(), transcript: [{ role: 'user', content: '4 người nha' }] },
    result: { response_id: crypto.randomUUID(), phase: 'DISCOVERY', message: 'Mình ghi nhận.', cards: [], warnings: [] } })
  expect(updated.ok).toBe(true)

  await expect(prepareGuestClaim(pool, { ...created.reference, session_capability: 'csc_' + '0'.repeat(64) })).rejects.toThrow()
  const ticket = await prepareGuestClaim(pool, created.reference)
  const saved = await pool.query<{ ticket_hash: string }>('SELECT ticket_hash FROM public.concierge_v2_claim_tickets WHERE session_id = $1', [sessionId])
  expect(saved.rows[0].ticket_hash).not.toContain(ticket)
  const claimed = await claimGuestSession(pool, ticket, userId)
  expect(claimed.transcript).toEqual([{ role: 'user', content: '4 người nha' }])
  expect(claimed.session.session_capability).not.toBe(created.reference.session_capability)
  expect(await store.read(created.reference, guest)).toMatchObject({ ok: false, error: { code: 'OWNERSHIP_MISMATCH' } })
  expect(await store.read({ session_id: sessionId, session_capability: claimed.session.session_capability },
    { authenticated_user_id: userId })).toMatchObject({ ok: true, record: { state_version: 3 } })
  await expect(claimGuestSession(pool, ticket, userId)).rejects.toThrow()
})
