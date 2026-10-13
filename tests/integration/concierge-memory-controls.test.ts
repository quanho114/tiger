import { beforeAll, afterAll, it, expect } from 'vitest'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.ts'
import { seedFixtureUsers, FIXTURE_USERS, getUserToken } from '../fixtures/auth-users.ts'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.ts'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.ts'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
beforeAll(async () => { await assertIsolatedTestDatabase(pool); await seedFixtureUsers(pool) })
afterAll(async () => { await pool.end() })
it('rejects stale and unfenced customer edits after forgetting and enabling memory again', async () => {
  const repo = createConciergeV2MemoryRepository(pool, { role: 'customer', userId: FIXTURE_USERS.customerA.id })
  const send = (path: string, body: unknown, method: string) => handleCustomerApi(new Request(`http://localhost/customer-api/me/ai-memory/${path}`, {
    method, headers: { Authorization: `Bearer ${getUserToken('customerA')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { pool })
  await repo.forgetAll()
  try {
    const enabled = await repo.setEnabled({ enabled: true, consent_version: 1 })
    if (!enabled.ok) throw new Error(enabled.reason)
    const fact = { memory_type: 'dislike' as const, memory_key: 'hanh', value: { food: 'Hành' }, source: 'explicit' as const,
      confidence: 100, observed_at: new Date().toISOString(), expires_at: null, schema_version: 1 as const }
    const selector = { memory_type: fact.memory_type, memory_key: fact.memory_key, source: fact.source }
    await repo.writeFact({ expected_memory_epoch: enabled.settings.memory_epoch, fact })
    await repo.forgetAll()
    const reenabled = await repo.setEnabled({ enabled: true, consent_version: 1 })
    if (!reenabled.ok) throw new Error(reenabled.reason)
    await repo.writeFact({ expected_memory_epoch: reenabled.settings.memory_epoch, fact })
    const before = await repo.listFacts()
    expect((await send('edit', { selector, food: 'Tỏi' }, 'PUT')).status).toBe(400)
    const stale = { ...selector, expected_memory_epoch: enabled.settings.memory_epoch }
    expect((await send('edit', { selector: stale, food: 'Tỏi' }, 'PUT')).status).toBe(409)
    expect((await send('delete', stale, 'POST')).status).toBe(409)
    expect(await repo.listFacts()).toEqual(before)
    const current = { ...selector, expected_memory_epoch: reenabled.settings.memory_epoch }
    expect((await send('edit', { selector: current, food: 'Tỏi' }, 'PUT')).status).toBe(200)
    expect((await repo.listFacts()).map(item => item.value.food)).toEqual(['Tỏi'])
  } finally { await repo.forgetAll() }
})
it('actual authenticated controls fence a stale writer, reject cross-user bodies, and pause regeneration', async () => {
  const client = await pool.connect()
  await client.query('BEGIN')
  try {
    const tx = client as unknown as pg.Pool
    const repo = createConciergeV2MemoryRepository(tx, { role: 'customer', userId: FIXTURE_USERS.customerA.id })
    const enabled = await repo.setEnabled({ enabled: true, consent_version: 1 })
    if (!enabled.ok) throw new Error(enabled.reason)
    const fact = { memory_type: 'dislike' as const, memory_key: 'hanh', value: { food: 'Hành' }, source: 'explicit' as const,
      confidence: 100, observed_at: new Date().toISOString(), expires_at: null, schema_version: 1 as const }
    expect((await repo.writeFact({ expected_memory_epoch: enabled.settings.memory_epoch, fact })).ok).toBe(true)
    const send = (path: string, body?: unknown, method = 'POST') => handleCustomerApi(new Request(`http://localhost/customer-api/me/ai-memory${path}`, {
      method, headers: { Authorization: `Bearer ${getUserToken('customerA')}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { pool: tx })
    const selector = { memory_type: 'dislike', memory_key: 'hanh', source: 'explicit', expected_memory_epoch: enabled.settings.memory_epoch }
    expect((await send('/delete', selector)).status).toBe(200)
    expect(await repo.writeFact({ expected_memory_epoch: enabled.settings.memory_epoch, fact })).toMatchObject({ ok: false, reason: 'MEMORY_EPOCH_MISMATCH' })
    expect(await repo.deleteFact({ ...selector, memory_type: 'dislike', source: 'explicit', expected_memory_epoch: enabled.settings.memory_epoch })).toMatchObject({ ok: false, reason: 'MEMORY_EPOCH_MISMATCH' })
    expect((await send('/settings', { enabled: true, consent_version: 1, user_id: FIXTURE_USERS.customerB.id }, 'PUT')).status).toBeGreaterThanOrEqual(400)
    expect((await send('/forget', {})).status).toBe(200)
    expect(await repo.getSettings()).toMatchObject({ enabled: false })
    expect(await repo.listFacts()).toEqual([])
  } finally { await client.query('ROLLBACK'); client.release() }
})
it('account deletion immediately clears facts and fences writes before Auth deletion', async () => {
  const client = await pool.connect()
  await client.query('BEGIN')
  try {
    const repo = createConciergeV2MemoryRepository(client as unknown as pg.Pool, { role: 'customer', userId: FIXTURE_USERS.customerA.id })
    const enabled = await repo.setEnabled({ enabled: true, consent_version: 1 })
    if (!enabled.ok) throw new Error(enabled.reason)
    const fact = { memory_type: 'preference' as const, memory_key: 'bo', value: { food: 'Bò' }, source: 'explicit' as const,
      confidence: 100, observed_at: new Date().toISOString(), expires_at: null, schema_version: 1 as const }
    await repo.writeFact({ expected_memory_epoch: enabled.settings.memory_epoch, fact })
    const before = await client.query('SELECT count(*) FROM public.orders')
    await client.query('UPDATE public.customer_profiles SET deletion_requested_at = now() WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    expect((await client.query('SELECT count(*) FROM public.user_ai_memories WHERE user_id = $1', [FIXTURE_USERS.customerA.id])).rows[0].count).toBe('0')
    expect((await repo.writeFact({ expected_memory_epoch: enabled.settings.memory_epoch, fact })).ok).toBe(false)
    expect((await client.query('SELECT count(*) FROM public.orders')).rows).toEqual(before.rows)
  } finally { await client.query('ROLLBACK'); client.release() }
})
