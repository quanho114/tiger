import { beforeAll, afterAll, it, expect } from 'vitest'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.ts'
import { assertConciergeHealthy, recordConciergeDependencyFailure } from '../../supabase/functions/_shared/concierge/health.ts'
import { withConciergeTurnLease } from '../../supabase/functions/_shared/concierge/turn-lease.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
beforeAll(async () => { await assertIsolatedTestDatabase(pool) })
afterAll(async () => { await pool.end() })

it('persists the pause after five failures without extending it on rejected requests', async () => {
  const client = await pool.connect()
  await client.query('BEGIN')
  try {
    const tx = client as unknown as pg.Pool
    await client.query('UPDATE public.concierge_v2_health SET failure_count = 0, window_started_at = now(), open_until = NULL')
    for (let index = 0; index < 4; index++) await recordConciergeDependencyFailure(tx)
    await expect(assertConciergeHealthy(tx)).resolves.toBeUndefined()
    await recordConciergeDependencyFailure(tx)
    await expect(assertConciergeHealthy(tx)).rejects.toMatchObject({ status: 503 })
    const before = (await client.query('SELECT * FROM public.concierge_v2_health')).rows
    await recordConciergeDependencyFailure(tx)
    expect((await client.query('SELECT * FROM public.concierge_v2_health')).rows).toEqual(before)
    await client.query("UPDATE public.concierge_v2_health SET open_until = now() - interval '1 second', window_started_at = now() - interval '2 minutes'")
    await expect(assertConciergeHealthy(tx)).resolves.toBeUndefined()
    await recordConciergeDependencyFailure(tx)
    expect((await client.query('SELECT failure_count FROM public.concierge_v2_health')).rows[0].failure_count).toBe(1)
  } finally { await client.query('ROLLBACK'); client.release() }
})

it('serializes model work across independent connections and releases failed leases', async () => {
  const id = crypto.randomUUID()
  let started!: () => void
  let release!: () => void
  const acquired = new Promise<void>(resolve => { started = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const first = withConciergeTurnLease(pool, id, async () => { started(); await held })
  await acquired
  try {
    await expect(withConciergeTurnLease(pool, id, async () => 'must not execute')).rejects.toThrow('STATE_CONFLICT')
  } finally { release(); await first }
  await expect(withConciergeTurnLease(pool, id, async () => { throw new Error('fixture failure') })).rejects.toThrow('fixture failure')
  await expect(withConciergeTurnLease(pool, id, async () => 'released')).resolves.toBe('released')
})
