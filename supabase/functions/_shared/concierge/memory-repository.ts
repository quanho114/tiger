import type pg from 'pg'
import {
  ConciergeV2BehavioralMemorySelectorSchema,
  ConciergeV2MemoryDeleteOperationSchema,
  ConciergeV2MemoryFactSchema,
  ConciergeV2MemoryFactSelectorSchema,
  ConciergeV2MemoryRestoreOperationSchema,
  ConciergeV2MemorySettingsInputSchema,
  ConciergeV2MemorySettingsOperationSchema,
  ConciergeV2MemorySettingsSchema,
  ConciergeV2MemoryWriteInputSchema,
  ConciergeV2MemoryWriteOperationSchema,
  type ConciergeV2BehavioralMemorySelector,
  type ConciergeV2MemoryDeleteOperation,
  type ConciergeV2MemoryFact,
  type ConciergeV2MemoryFactSelector,
  type ConciergeV2MemoryRepository,
  type ConciergeV2MemoryRestoreOperation,
  type ConciergeV2MemorySettings,
  type ConciergeV2MemorySettingsInput,
  type ConciergeV2MemorySettingsOperation,
  type ConciergeV2MemoryWriteInput,
  type ConciergeV2MemoryWriteOperation,
} from '../contracts/concierge-v2.ts'
import type { AuthActor } from '../types.ts'
import { withMemoryBarrier, invalidateMemorySessions } from './memory-barrier.ts'

const DEFAULT_MEMORY_SETTINGS: ConciergeV2MemorySettings = {
  enabled: false,
  consent_version: 1,
  memory_epoch: 0,
  updated_at: null,
}

type DatabaseRow = Record<string, unknown>
type QueryResultRow = { result: unknown }
type FactResultRow = { fact: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resultFromRows(rows: readonly unknown[]): unknown {
  const row = rows[0]
  return isRecord(row) && 'result' in row ? row.result : null
}

function factFromRows(rows: readonly unknown[]): unknown[] {
  return rows.map((row) => (isRecord(row) && 'fact' in row ? row.fact : null))
}

function storageFailure(): { ok: false; reason: 'MEMORY_STORAGE_UNAVAILABLE' } {
  return { ok: false, reason: 'MEMORY_STORAGE_UNAVAILABLE' }
}

function requireVerifiedCustomer(actor: AuthActor): string {
  if (actor.role !== 'customer' || typeof actor.userId !== 'string') {
    throw new Error('Memory repository requires a verified customer actor')
  }

  return actor.userId
}

function createRawMemoryRepository(pool: pg.Pool, actor: AuthActor): ConciergeV2MemoryRepository {
  const userId = requireVerifiedCustomer(actor)

  const repository: ConciergeV2MemoryRepository = {
    async getSettings(): Promise<ConciergeV2MemorySettings> {
      try {
        const response = await pool.query<DatabaseRow>('SELECT public.concierge_v2_memory_settings_dto($1) AS result', [userId])
        const result = resultFromRows(response.rows)
        if (result === null) {
          return DEFAULT_MEMORY_SETTINGS
        }

        const parsed = ConciergeV2MemorySettingsSchema.safeParse(result)
        if (!parsed.success) {
          throw new Error('Memory settings response failed validation')
        }

        return parsed.data
      } catch {
        throw new Error('Memory settings storage unavailable')
      }
    },

    async setEnabled(input: ConciergeV2MemorySettingsInput): Promise<ConciergeV2MemorySettingsOperation> {
      const validatedInput = ConciergeV2MemorySettingsInputSchema.safeParse(input)
      if (!validatedInput.success) {
        return { ok: false, reason: 'INVALID_MEMORY_SETTINGS' }
      }

      try {
        const response = await pool.query<QueryResultRow>(
          'SELECT public.concierge_v2_set_memory_enabled($1, $2, $3) AS result',
          [userId, validatedInput.data.enabled, validatedInput.data.consent_version]
        )
        const parsed = ConciergeV2MemorySettingsOperationSchema.safeParse(resultFromRows(response.rows))
        return parsed.success ? parsed.data : storageFailure()
      } catch {
        return storageFailure()
      }
    },

    async listFacts(): Promise<ReadonlyArray<ConciergeV2MemoryFact>> {
      try {
        const response = await pool.query<FactResultRow>(
          `SELECT jsonb_build_object(
             'id', memory.id,
             'memory_type', memory.memory_type,
             'memory_key', memory.memory_key,
             'value', memory.value,
             'source', memory.source,
             'confidence', memory.confidence,
             'observed_at', memory.observed_at,
             'expires_at', memory.expires_at,
             'schema_version', memory.schema_version,
             'updated_at', memory.updated_at
           ) AS fact
           FROM public.user_ai_memories AS memory
           WHERE memory.user_id = $1
             AND (memory.expires_at IS NULL OR memory.expires_at > now())
           ORDER BY CASE memory.source WHEN 'explicit' THEN 0 ELSE 1 END, memory.observed_at DESC`,
          [userId]
        )
        const facts: ConciergeV2MemoryFact[] = []
        for (const fact of factFromRows(response.rows)) {
          const parsed = ConciergeV2MemoryFactSchema.safeParse(fact)
          if (!parsed.success) {
            throw new Error('Memory fact response failed validation')
          }
          facts.push(parsed.data)
        }

        return facts
      } catch {
        throw new Error('Memory facts storage unavailable')
      }
    },

    async writeFact(input: ConciergeV2MemoryWriteInput): Promise<ConciergeV2MemoryWriteOperation> {
      const validatedInput = ConciergeV2MemoryWriteInputSchema.safeParse(input)
      if (!validatedInput.success) {
        return { ok: false, reason: 'INVALID_MEMORY_FACT' }
      }

      const { fact } = validatedInput.data
      try {
        const response = await pool.query<QueryResultRow>(
          `SELECT public.concierge_v2_write_memory_fact(
             $1, $2, $3, $4, $5::jsonb, $6, $7, $8::timestamptz, $9::timestamptz, $10
           ) AS result`,
          [
            userId,
            validatedInput.data.expected_memory_epoch,
            fact.memory_type,
            fact.memory_key,
            JSON.stringify(fact.value),
            fact.source,
            fact.confidence,
            fact.observed_at,
            fact.expires_at,
            fact.schema_version,
          ]
        )
        const parsed = ConciergeV2MemoryWriteOperationSchema.safeParse(resultFromRows(response.rows))
        return parsed.success ? parsed.data : storageFailure()
      } catch {
        return storageFailure()
      }
    },

    async deleteFact(input: ConciergeV2MemoryFactSelector): Promise<ConciergeV2MemoryDeleteOperation> {
      const validatedInput = ConciergeV2MemoryFactSelectorSchema.safeParse(input)
      if (!validatedInput.success) {
        return { ok: false, reason: 'INVALID_MEMORY_FACT' }
      }

      try {
        const response = await pool.query<QueryResultRow>(
          'SELECT public.concierge_v2_delete_memory_fact_fenced($1, $2, $3, $4, $5) AS result',
          [
            userId,
            validatedInput.data.memory_type,
            validatedInput.data.memory_key,
            validatedInput.data.source,
            validatedInput.data.expected_memory_epoch ?? null,
          ]
        )
        const parsed = ConciergeV2MemoryDeleteOperationSchema.safeParse(resultFromRows(response.rows))
        return parsed.success ? parsed.data : storageFailure()
      } catch {
        return storageFailure()
      }
    },

    async forgetAll(): Promise<ConciergeV2MemorySettingsOperation> {
      try {
        const response = await pool.query<QueryResultRow>('SELECT public.concierge_v2_forget_all_memory($1) AS result', [userId])
        const parsed = ConciergeV2MemorySettingsOperationSchema.safeParse(resultFromRows(response.rows))
        return parsed.success ? parsed.data : storageFailure()
      } catch {
        return storageFailure()
      }
    },

    async restoreBehavioralFact(input: ConciergeV2BehavioralMemorySelector): Promise<ConciergeV2MemoryRestoreOperation> {
      const validatedInput = ConciergeV2BehavioralMemorySelectorSchema.safeParse(input)
      if (!validatedInput.success) {
        return { ok: false, reason: 'INVALID_MEMORY_FACT' }
      }

      try {
        const response = await pool.query<QueryResultRow>(
          'SELECT public.concierge_v2_restore_behavioral_memory_fact($1, $2, $3) AS result',
          [
            userId,
            validatedInput.data.memory_type,
            validatedInput.data.memory_key,
          ]
        )
        const parsed = ConciergeV2MemoryRestoreOperationSchema.safeParse(resultFromRows(response.rows))
        return parsed.success ? parsed.data : storageFailure()
      } catch {
        return storageFailure()
      }
    },
  }
  return repository
}

export function createConciergeV2MemoryRepository(pool: pg.Pool, actor: AuthActor): ConciergeV2MemoryRepository {
  const userId = requireVerifiedCustomer(actor)
  const repository = createRawMemoryRepository(pool, actor)
  const privacyChange = async <T extends { ok: boolean }>(work: (repo: ConciergeV2MemoryRepository) => Promise<T>): Promise<T | ReturnType<typeof storageFailure>> => {
    try {
      return await withMemoryBarrier(pool, userId, async queryPool => {
        await queryPool.query('SAVEPOINT concierge_memory_privacy_change')
        try {
          const result = await work(createRawMemoryRepository(queryPool, actor))
          if (result.ok) await invalidateMemorySessions(queryPool, userId)
          await queryPool.query('RELEASE SAVEPOINT concierge_memory_privacy_change')
          return result
        } catch (error) {
          await queryPool.query('ROLLBACK TO SAVEPOINT concierge_memory_privacy_change')
          await queryPool.query('RELEASE SAVEPOINT concierge_memory_privacy_change')
          throw error
        }
      })
    } catch { return storageFailure() }
  }
  return { ...repository,
    setEnabled: input => ConciergeV2MemorySettingsInputSchema.safeParse(input).success
      ? privacyChange(repo => repo.setEnabled(input)) : Promise.resolve({ ok: false, reason: 'INVALID_MEMORY_SETTINGS' }),
    deleteFact: input => ConciergeV2MemoryFactSelectorSchema.safeParse(input).success
      ? privacyChange(repo => repo.deleteFact(input)) : Promise.resolve({ ok: false, reason: 'INVALID_MEMORY_FACT' }),
    forgetAll: () => privacyChange(repo => repo.forgetAll()),
    restoreBehavioralFact: input => ConciergeV2BehavioralMemorySelectorSchema.safeParse(input).success
      ? privacyChange(repo => repo.restoreBehavioralFact(input)) : Promise.resolve({ ok: false, reason: 'INVALID_MEMORY_FACT' }),
  }
}
