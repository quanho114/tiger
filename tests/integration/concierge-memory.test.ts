import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.js'
import type { ConciergeV2MemoryFactInput } from '../../supabase/functions/_shared/contracts/concierge-v2.js'
import { FIXTURE_USERS, seedFixtureUsers } from '../fixtures/auth-users.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'

const { Pool } = pg

function createPool(): pg.Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  })
}

function createFactInput(overrides: Partial<ConciergeV2MemoryFactInput> = {}): ConciergeV2MemoryFactInput {
  return {
    memory_type: 'preference',
    memory_key: 'likes-grilled-beef',
    value: { food: 'Bò nướng' },
    source: 'explicit',
    confidence: 100,
    observed_at: '2026-09-22T12:00:00.000Z',
    expires_at: null,
    schema_version: 1,
    ...overrides,
  }
}

describe('Concierge V2 memory repository', () => {
  let pool: pg.Pool
  let customerARepository: ReturnType<typeof createConciergeV2MemoryRepository>
  let customerBRepository: ReturnType<typeof createConciergeV2MemoryRepository>

  async function clearMemoryFixtures(): Promise<void> {
    const userIds = [FIXTURE_USERS.customerA.id, FIXTURE_USERS.customerB.id]
    await pool.query('DELETE FROM public.user_ai_memory_suppressions WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.user_ai_memories WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.user_ai_memory_settings WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.customer_tombstones WHERE user_id = ANY($1::uuid[])', [userIds])
    await pool.query('DELETE FROM public.account_deletion_jobs WHERE user_id = ANY($1::uuid[])', [userIds])
  }

  async function resetCustomerA(): Promise<void> {
    await pool.query('DELETE FROM public.user_ai_memory_suppressions WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    await pool.query('DELETE FROM public.user_ai_memories WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    await pool.query('DELETE FROM public.user_ai_memory_settings WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    await pool.query('DELETE FROM public.customer_tombstones WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    await pool.query('DELETE FROM public.account_deletion_jobs WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
  }

  beforeAll(async () => {
    pool = createPool()
    await assertIsolatedTestDatabase(pool)
    await seedFixtureUsers(pool)
    await clearMemoryFixtures()
    customerARepository = createConciergeV2MemoryRepository(pool, {
      role: 'customer',
      userId: FIXTURE_USERS.customerA.id,
    })
    customerBRepository = createConciergeV2MemoryRepository(pool, {
      role: 'customer',
      userId: FIXTURE_USERS.customerB.id,
    })
  })

  afterAll(async () => {
    if (pool) {
      await clearMemoryFixtures()
      await pool.end()
    }
  })

  it('starts disabled and does not persist a fact before explicit enablement', async () => {
    await resetCustomerA()

    expect(await customerARepository.getSettings()).toMatchObject({ enabled: false, memory_epoch: 0 })
    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 0,
        fact: createFactInput(),
      })
    ).toEqual({ ok: false, reason: 'MEMORY_DISABLED' })
    expect(await customerARepository.listFacts()).toEqual([])
  })

  it('keeps explicit and order-history facts at separate source-aware identities', async () => {
    await resetCustomerA()
    const enabled = await customerARepository.setEnabled({ enabled: true, consent_version: 1 })

    expect(enabled).toMatchObject({ ok: true, settings: { enabled: true, memory_epoch: 0 } })
    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 0,
        fact: createFactInput(),
      })
    ).toMatchObject({ ok: true, fact: { source: 'explicit' } })
    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 0,
        fact: createFactInput({ source: 'order_history', confidence: 70 }),
      })
    ).toMatchObject({ ok: true, fact: { source: 'order_history' } })

    expect(await customerARepository.listFacts()).toMatchObject([
      { memory_key: 'likes-grilled-beef', source: 'explicit' },
      { memory_key: 'likes-grilled-beef', source: 'order_history' },
    ])
    expect(await customerBRepository.listFacts()).toEqual([])
  })

  it('rejects malformed and oversized facts before they can become durable records', async () => {
    await resetCustomerA()
    await customerARepository.setEnabled({ enabled: true, consent_version: 1 })

    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 0,
        fact: createFactInput({ value: { food: 'x'.repeat(121) } }),
      })
    ).toEqual({ ok: false, reason: 'INVALID_MEMORY_FACT' })
    const result = await pool.query(
      `SELECT public.concierge_v2_write_memory_fact(
         $1::uuid, 0, 'preference', 'invalid-direct-fact', '{"food":"Bò nướng","raw_utterance":"Không được lưu"}'::jsonb,
         'explicit', 100::smallint, now(), NULL::timestamptz, 1::smallint
       ) AS result`,
      [FIXTURE_USERS.customerA.id]
    )
    expect(result.rows[0].result).toEqual({ ok: false, reason: 'INVALID_MEMORY_FACT' })
    expect(await customerARepository.listFacts()).toEqual([])
  })

  it('fences delayed writes after forget-all and disable', async () => {
    await resetCustomerA()
    await customerARepository.setEnabled({ enabled: true, consent_version: 1 })
    const initialWrite = await customerARepository.writeFact({
      expected_memory_epoch: 0,
      fact: createFactInput(),
    })
    expect(initialWrite.ok).toBe(true)

    const forgotten = await customerARepository.forgetAll()
    expect(forgotten).toMatchObject({ ok: true, settings: { enabled: false, memory_epoch: 1 } })
    expect(await customerARepository.setEnabled({ enabled: true, consent_version: 1 })).toMatchObject({ ok: true })
    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 0,
        fact: createFactInput(),
      })
    ).toEqual({ ok: false, reason: 'MEMORY_EPOCH_MISMATCH' })

    const currentWrite = await customerARepository.writeFact({
      expected_memory_epoch: 1,
      fact: createFactInput(),
    })
    expect(currentWrite.ok).toBe(true)
    const disabled = await customerARepository.setEnabled({ enabled: false, consent_version: 1 })
    expect(disabled).toMatchObject({ ok: true, settings: { enabled: false, memory_epoch: 2 } })
    expect(await customerARepository.setEnabled({ enabled: true, consent_version: 1 })).toMatchObject({ ok: true })
    expect(
      await customerARepository.writeFact({
        expected_memory_epoch: 1,
        fact: createFactInput(),
      })
    ).toEqual({ ok: false, reason: 'MEMORY_EPOCH_MISMATCH' })
  })

  it('suppresses deleted behavioral facts without storing the deleted value', async () => {
    await resetCustomerA()
    await customerARepository.setEnabled({ enabled: true, consent_version: 1 })
    const behavioralFact = createFactInput({ source: 'order_history', confidence: 70 })
    const written = await customerARepository.writeFact({ expected_memory_epoch: 0, fact: behavioralFact })
    expect(written).toMatchObject({ ok: true, fact: { source: 'order_history' } })

    const deleted = await customerARepository.deleteFact({
      memory_type: 'preference',
      memory_key: 'likes-grilled-beef',
      source: 'order_history',
    })
    expect(deleted).toEqual({ ok: true, deleted: true })
    expect(
      await customerARepository.writeFact({ expected_memory_epoch: (await customerARepository.getSettings()).memory_epoch, fact: behavioralFact })
    ).toEqual({ ok: false, reason: 'MEMORY_SUPPRESSED' })

    const suppression = await pool.query(
      `SELECT to_jsonb(suppression) AS data
       FROM public.user_ai_memory_suppressions AS suppression
       WHERE user_id = $1`,
      [FIXTURE_USERS.customerA.id]
    )
    expect(suppression.rows[0].data).not.toHaveProperty('value')
    expect(suppression.rows[0].data).not.toHaveProperty('food')

    expect(
      await customerARepository.restoreBehavioralFact({
        memory_type: 'preference',
        memory_key: 'likes-grilled-beef',
      })
    ).toEqual({ ok: true, restored: true })
    expect(
      await customerARepository.writeFact({ expected_memory_epoch: (await customerARepository.getSettings()).memory_epoch, fact: behavioralFact })
    ).toMatchObject({ ok: true, fact: { source: 'order_history' } })
  })

  it('denies writes for tombstoned and deleting accounts', async () => {
    await resetCustomerA()
    await customerARepository.setEnabled({ enabled: true, consent_version: 1 })

    await pool.query(
      `INSERT INTO public.customer_tombstones (user_id, deletion_requested_at)
       VALUES ($1, now())`,
      [FIXTURE_USERS.customerA.id]
    )
    expect(
      await customerARepository.writeFact({ expected_memory_epoch: 0, fact: createFactInput() })
    ).toEqual({ ok: false, reason: 'ACCOUNT_INELIGIBLE' })
    await pool.query('DELETE FROM public.customer_tombstones WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = now() WHERE user_id = $1', [FIXTURE_USERS.customerA.id])
    expect(
      await customerARepository.writeFact({ expected_memory_epoch: 0, fact: createFactInput() })
    ).toEqual({ ok: false, reason: 'ACCOUNT_INELIGIBLE' })
    await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = NULL WHERE user_id = $1', [FIXTURE_USERS.customerA.id])

    await pool.query(
      `INSERT INTO public.account_deletion_jobs (user_id, status, step)
       VALUES ($1, 'pending', 'requested')`,
      [FIXTURE_USERS.customerA.id]
    )
    expect(
      await customerARepository.writeFact({ expected_memory_epoch: 0, fact: createFactInput() })
    ).toEqual({ ok: false, reason: 'ACCOUNT_INELIGIBLE' })
  })
})
