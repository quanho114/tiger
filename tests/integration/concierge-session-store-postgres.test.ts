import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'

const HASH = 'a'.repeat(64)
const OTHER_HASH = 'b'.repeat(64)

function result() {
  return { response_id: crypto.randomUUID(), phase: 'DISCOVERY' as const, message: 'Đã cập nhật.', cards: [], warnings: [] }
}

describe('PostgreSQL Concierge V2 session backend', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  const backend = new PostgresConciergeV2SessionBackend(pool)
  const first = createConciergeV2SessionStore({ backend })
  const second = createConciergeV2SessionStore({ backend: new PostgresConciergeV2SessionBackend(pool) })
  const ids: string[] = []

  beforeAll(() => ensureConciergePostgresSessionTable(pool))
  afterAll(async () => {
    for (const id of ids) await backend.delete(id)
    await pool.end()
  })

  it('shares a private session, serializes concurrent updates, and replays a retry', async () => {
    const actor = { authenticated_user_id: null }
    const created = await first.create({ ...emptyConciergeSession(), actor })
    if (!created.ok) throw new Error(created.error.code)
    ids.push(created.reference.session_id)

    const raw = await pool.query<{ record: string }>(
      'SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1', [created.reference.session_id]
    )
    expect(raw.rows[0].record).not.toContain(created.reference.session_capability)
    expect(await second.read(created.reference, actor)).toMatchObject({ ok: true, record: { state_version: 1 } })

    const base = {
      reference: created.reference,
      actor,
      expected_state_version: 1,
      next: { ...emptyConciergeSession(), transcript: [{ role: 'user' as const, content: 'Món chay?' }] },
      result: result(),
    }
    const a = { ...base, request_id: crypto.randomUUID(), operation_hash: HASH }
    const b = { ...base, request_id: crypto.randomUUID(), operation_hash: OTHER_HASH }
    const [aResult, bResult] = await Promise.all([first.compareAndSwap(a), second.compareAndSwap(b)])
    expect([aResult, bResult].filter(value => value.ok)).toHaveLength(1)
    expect([aResult, bResult].filter(value => !value.ok)).toMatchObject([{ error: { code: 'STATE_CONFLICT' } }])

    const winner = aResult.ok ? a : b
    expect(await second.compareAndSwap(winner)).toMatchObject({ ok: true, replay: true, result: winner.result })
    expect(await second.compareAndSwap({ ...winner, operation_hash: winner.operation_hash === HASH ? OTHER_HASH : HASH }))
      .toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_MISMATCH' } })
    expect(await second.read(created.reference, actor)).toMatchObject({ ok: true, record: { state_version: 2 } })
    expect(await second.delete(created.reference, actor)).toEqual({ ok: true, deleted: true })
    expect(await first.read(created.reference, actor)).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('enforces ownership and the 45-minute idle limit', async () => {
    let now = Date.now()
    const clock = { now: () => new Date(now) }
    const timed = createConciergeV2SessionStore({ backend, clock })
    const actor = { authenticated_user_id: null }
    const created = await timed.create({ ...emptyConciergeSession(), actor })
    if (!created.ok) throw new Error(created.error.code)
    ids.push(created.reference.session_id)

    const wrongReference = { ...created.reference, session_capability: 'csc_' + '0'.repeat(64) }
    expect(await timed.read(wrongReference, actor)).toMatchObject({ ok: false, error: { code: 'OWNERSHIP_MISMATCH' } })
    expect(await timed.delete(wrongReference, actor)).toMatchObject({ ok: false, error: { code: 'OWNERSHIP_MISMATCH' } })
    expect(await timed.read(created.reference, actor)).toMatchObject({ ok: true })

    now += 45 * 60 * 1000 + 1
    expect(await timed.read(created.reference, actor)).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
    expect(await timed.compareAndSwap({ reference: created.reference, actor, expected_state_version: 1,
      request_id: crypto.randomUUID(), operation_hash: HASH, next: emptyConciergeSession(), result: result() }))
      .toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('refreshes idle expiry without extending the four-hour absolute limit', async () => {
    let now = Date.now()
    const clock = { now: () => new Date(now) }
    const store = createConciergeV2SessionStore({ backend, clock })
    const actor = { authenticated_user_id: null }
    const created = await store.create({ ...emptyConciergeSession(), actor })
    if (!created.ok) throw new Error(created.error.code)
    ids.push(created.reference.session_id)

    for (let turn = 1; turn <= 5; turn++) {
      now += 40 * 60 * 1000
      const changed = await store.compareAndSwap({ reference: created.reference, actor,
        expected_state_version: turn, request_id: crypto.randomUUID(), operation_hash: HASH,
        next: emptyConciergeSession(), result: result() })
      expect(changed).toMatchObject({ ok: true, record: { state_version: turn + 1 } })
      if (!changed.ok) break
      const row = await pool.query<{ expires_at: Date }>(
        'SELECT expires_at FROM public.concierge_v2_sessions WHERE session_id = $1', [created.reference.session_id]
      )
      expect(row.rows[0].expires_at.getTime()).toBeLessThanOrEqual(Date.parse(created.record.absolute_expires_at))
    }
    now = Date.parse(created.record.absolute_expires_at)
    expect(await store.read(created.reference, actor)).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('blocks browser roles from reading session transcripts', async () => {
    const grants = await pool.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'concierge_v2_sessions' AND privilege_type = 'SELECT'`
    )
    expect(grants.rows.map(row => row.grantee)).not.toContain('anon')
    expect(grants.rows.map(row => row.grantee)).not.toContain('authenticated')
    expect(grants.rows.map(row => row.grantee)).not.toContain('PUBLIC')
  })
})
