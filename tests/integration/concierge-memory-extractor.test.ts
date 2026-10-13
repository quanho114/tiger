/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: vitest integration test runner via `npm run test:integration`
 * - Affected API: processAndPersistExplicitMemory in supabase/functions/_shared/concierge/memory-extractor.ts and createConciergeV2MemoryRepository in supabase/functions/_shared/concierge/memory-repository.ts
 * - Data Schemas: public.user_ai_memories, public.user_ai_memory_settings, ConciergeV2MemoryFactInputSchema, ConciergeV2MemoryWriteInputSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V06: Durable explicit fact extraction", "Deliverable: implementation + applicable tests + ../reports/V06.md", "New tests/server/concierge-memory-extractor.test.ts and epoch-race integration cases", "Exit criteria: A durable statement is remembered only with enabled memory. Temporary/ambiguous text is excluded. Forget/disable while extraction runs defeats the later write."
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { processAndPersistExplicitMemory } from '../../supabase/functions/_shared/concierge/memory-extractor.js'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.js'
import type { ConciergeV2ActorBinding } from '../../supabase/functions/_shared/contracts/concierge-v2.js'
import { FIXTURE_USERS, seedFixtureUsers } from '../fixtures/auth-users.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'

const { Pool } = pg

function createPool(): pg.Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  })
}

describe('Concierge V2 Explicit Memory Extractor (Real Database Integration)', () => {
  let pool: pg.Pool
  let customerARepo: ReturnType<typeof createConciergeV2MemoryRepository>

  const customerActor: ConciergeV2ActorBinding = {
    authenticated_user_id: FIXTURE_USERS.customerA.id,
  }

  const guestActor: ConciergeV2ActorBinding = {
    authenticated_user_id: null,
  }

  async function resetCustomerA(): Promise<void> {
    await pool.query('DELETE FROM public.user_ai_memory_suppressions WHERE user_id = $1', [
      FIXTURE_USERS.customerA.id,
    ])
    await pool.query('DELETE FROM public.user_ai_memories WHERE user_id = $1', [
      FIXTURE_USERS.customerA.id,
    ])
    await pool.query('DELETE FROM public.user_ai_memory_settings WHERE user_id = $1', [
      FIXTURE_USERS.customerA.id,
    ])
  }

  beforeAll(async () => {
    pool = createPool()
    await assertIsolatedTestDatabase(pool)
    await seedFixtureUsers(pool)
    await resetCustomerA()
    customerARepo = createConciergeV2MemoryRepository(pool, {
      role: 'customer',
      userId: FIXTURE_USERS.customerA.id,
    })
  })

  afterAll(async () => {
    if (pool) {
      await resetCustomerA()
      await pool.end()
    }
  })

  it('rejects memory write when customer has not opted in (default disabled)', async () => {
    await resetCustomerA()

    const result = await processAndPersistExplicitMemory({
      message: 'Mình rất thích sườn nướng mật ong',
      actor: customerActor,
      repository: customerARepo,
    })

    expect(result.persisted).toBe(0)
    expect(result.rejection_reason).toBe('MEMORY_DISABLED')

    const dbRows = await pool.query(
      'SELECT * FROM public.user_ai_memories WHERE user_id = $1',
      [FIXTURE_USERS.customerA.id]
    )
    expect(dbRows.rows.length).toBe(0)
  })

  it('persists extracted facts to real database once opted in', async () => {
    await resetCustomerA()
    await customerARepo.setEnabled({ enabled: true, consent_version: 1 })

    const result = await processAndPersistExplicitMemory({
      message: 'Tôi mê sườn nướng mật ong',
      actor: customerActor,
      repository: customerARepo,
    })

    expect(result.persisted).toBe(1)
    expect(result.rejection_reason).toBeNull()

    const dbRows = await pool.query(
      'SELECT * FROM public.user_ai_memories WHERE user_id = $1',
      [FIXTURE_USERS.customerA.id]
    )
    expect(dbRows.rows.length).toBe(1)
    expect(dbRows.rows[0].memory_type).toBe('preference')
    expect(dbRows.rows[0].memory_key).toBe('suon-nuong-mat-ong')
    expect(dbRows.rows[0].value).toEqual({ food: 'Sườn nướng mật ong' })
    expect(dbRows.rows[0].source).toBe('explicit')
  })

  it('defeats stale write on epoch race condition when forgetAll was executed mid-flight', async () => {
    await resetCustomerA()
    await customerARepo.setEnabled({ enabled: true, consent_version: 1 })

    const currentSettings = await customerARepo.getSettings()
    const capturedEpoch = currentSettings.memory_epoch

    // User clicks forgetAll mid-flight and re-enables memory with new epoch
    await customerARepo.forgetAll()
    await customerARepo.setEnabled({ enabled: true, consent_version: 1 })

    const writeResult = await customerARepo.writeFact({
      expected_memory_epoch: capturedEpoch,
      fact: {
        memory_type: 'preference',
        memory_key: 'thit-bo',
        value: { food: 'Thịt bò' },
        source: 'explicit',
        confidence: 90,
        observed_at: new Date().toISOString(),
        expires_at: null,
        schema_version: 1,
      },
    })

    expect(writeResult.ok).toBe(false)
    if (!writeResult.ok) {
      expect(writeResult.reason).toBe('MEMORY_EPOCH_MISMATCH')
    }

    const dbRows = await pool.query(
      'SELECT * FROM public.user_ai_memories WHERE user_id = $1',
      [FIXTURE_USERS.customerA.id]
    )
    expect(dbRows.rows.length).toBe(0)
  })

  it('executes corrections by removing prior constraints in real database', async () => {
    await resetCustomerA()
    await customerARepo.setEnabled({ enabled: true, consent_version: 1 })

    await processAndPersistExplicitMemory({
      message: 'Tôi ghét ăn đậu bắp',
      actor: customerActor,
      repository: customerARepo,
    })

    const dbRowsBefore = await pool.query(
      'SELECT * FROM public.user_ai_memories WHERE user_id = $1 AND memory_key = $2',
      [FIXTURE_USERS.customerA.id, 'dau-bap']
    )
    expect(dbRowsBefore.rows.length).toBe(1)

    const correctionResult = await processAndPersistExplicitMemory({
      message: 'Mình ăn được đậu bắp rồi nhé',
      actor: customerActor,
      repository: customerARepo,
    })

    expect(correctionResult.persisted).toBe(0)
    expect(correctionResult.deleted_corrections).toBe(1)

    const dbRowsAfter = await pool.query(
      'SELECT * FROM public.user_ai_memories WHERE user_id = $1 AND memory_key = $2',
      [FIXTURE_USERS.customerA.id, 'dau-bap']
    )
    expect(dbRowsAfter.rows.length).toBe(0)
  })

  it('rejects guest actor without making database mutations', async () => {
    const result = await processAndPersistExplicitMemory({
      message: 'Tôi mê cá hồi',
      actor: guestActor,
      repository: customerARepo,
    })

    expect(result.persisted).toBe(0)
    expect(result.rejection_reason).toBe('GUEST_OR_UNAUTHENTICATED')
  })
})
