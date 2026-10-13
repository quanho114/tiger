/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: memory-retrieval.ts, runtime.ts, tests/server/concierge-memory-retrieval.test.ts, tests/integration/concierge-behavioral-memory.test.ts
 * - Affected API: aggregateBehavioralMemory, computeBehavioralCandidates
 * - Data Schemas: ConciergeV2BehavioralItemCandidateSchema, ConciergeV2BehavioralAggregationResultSchema, ConciergeV2MemoryFactInputSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V07: Behavioral aggregates and selective retrieval", "1. Aggregate eligible completed orders from the last 90 days by item/category; distinguish frequency per order from quantity.", "2. Exclude cancelled and ineligible refunded/test data using V01 rules.", "3. Bound queries and results... use a refresh schedule/invalidations suitable for one restaurant.", "6. Honor consent/epoch/deletion and expiry; allow serving without personalization during repository failures."
 */

import {
  ConciergeV2BehavioralAggregationResultSchema,
  ConciergeV2MemoryFactInputSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2BehavioralAggregationResult,
  type ConciergeV2BehavioralItemCandidate,
  type ConciergeV2MemoryFactInput,
  type ConciergeV2MemoryRepository,
} from '../contracts/concierge-v2.ts'
import type { AuthActor } from '../types.ts'
import { cleanFoodText, slugifyFoodKey } from './memory-extractor.ts'

export interface DbQueryRunner {
  query<R = Record<string, unknown>>(
    queryText: string,
    values?: unknown[]
  ): Promise<{ rows: R[] }>
}

export interface AggregateBehavioralMemoryInput {
  pool: DbQueryRunner
  actor: ConciergeV2ActorBinding | AuthActor
  repository: ConciergeV2MemoryRepository
  nowIso?: string
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function getAuthenticatedCustomerId(actor: ConciergeV2ActorBinding | AuthActor): string | null {
  if ('authenticated_user_id' in actor) {
    return typeof actor.authenticated_user_id === 'string' && actor.authenticated_user_id.length > 0
      ? actor.authenticated_user_id
      : null
  }
  if (actor.role === 'customer' && typeof actor.userId === 'string' && actor.userId.length > 0) {
    return actor.userId
  }
  return null
}

interface OrderAggRow {
  menu_item_id: string | null
  item_name: string
  order_count: number
  total_quantity: number
  last_ordered_at: Date | string
}

/**
 * Aggregates eligible completed, non-cancelled, paid orders from the last 90 days.
 * Strictly excludes cancelled, refunded, or unpaid orders.
 * Distinguishes order count (order frequency) from total quantity.
 */
export async function computeBehavioralCandidates(
  pool: DbQueryRunner,
  customerUserId: string,
  nowIso?: string
): Promise<{ eligibleOrdersCount: number; candidates: ConciergeV2BehavioralItemCandidate[] }> {
  const referenceTime = nowIso ? new Date(nowIso) : new Date()

  // 1. Count total eligible completed orders
  const countRes = await pool.query<{ total_orders: number }>(
    `SELECT count(DISTINCT o.id)::int AS total_orders
     FROM public.orders o
     WHERE o.customer_user_id = $1
       AND o.status = 'completed'
       AND o.payment_status = 'paid'
       AND o.created_at >= ($2::timestamptz - INTERVAL '90 days')`,
    [customerUserId, referenceTime.toISOString()]
  )
  const eligibleOrdersCount = countRes.rows[0]?.total_orders ? Number(countRes.rows[0].total_orders) : 0

  if (eligibleOrdersCount === 0) {
    return { eligibleOrdersCount: 0, candidates: [] }
  }

  // 2. Query items ordered across at least 2 distinct orders
  const aggRes = await pool.query<OrderAggRow>(
    `SELECT
       oi.menu_item_id,
       oi.item_name,
       count(DISTINCT o.id)::int AS order_count,
       sum(oi.quantity)::int AS total_quantity,
       max(o.created_at) AS last_ordered_at
     FROM public.orders o
     JOIN public.order_items oi ON oi.order_id = o.id
     WHERE o.customer_user_id = $1
       AND o.status = 'completed'
       AND o.payment_status = 'paid'
       AND o.created_at >= ($2::timestamptz - INTERVAL '90 days')
     GROUP BY oi.menu_item_id, oi.item_name
     HAVING count(DISTINCT o.id) >= 2
     ORDER BY count(DISTINCT o.id) DESC, sum(oi.quantity) DESC
     LIMIT 20`,
    [customerUserId, referenceTime.toISOString()]
  )

  const candidates: ConciergeV2BehavioralItemCandidate[] = []

  for (const row of aggRes.rows) {
    const cleanedFood = cleanFoodText(row.item_name)
    if (!cleanedFood || cleanedFood.length < 2) continue

    const orderCount = Number(row.order_count)
    const totalQuantity = Number(row.total_quantity)
    const lastOrderedDate = row.last_ordered_at instanceof Date
      ? row.last_ordered_at
      : new Date(row.last_ordered_at)

    // Confidence ranges [70, 85], strictly below explicit preference (90)
    const confidence = Math.min(85, Math.max(70, 70 + (orderCount - 2) * 5))

    candidates.push({
      menu_item_id: row.menu_item_id || null,
      item_name: cleanedFood,
      order_count: orderCount,
      total_quantity: totalQuantity,
      last_ordered_at: lastOrderedDate.toISOString(),
      confidence,
    })
  }

  return { eligibleOrdersCount, candidates }
}

/**
 * Aggregates behavioral orders and persists qualified items into user_ai_memories.
 * Honors customer opt-in consent and atomic expected_memory_epoch.
 * Skips items that were previously deleted by user (MEMORY_SUPPRESSED).
 */
export async function aggregateBehavioralMemory(
  input: AggregateBehavioralMemoryInput
): Promise<ConciergeV2BehavioralAggregationResult> {
  const { pool, actor, repository, nowIso } = input

  const customerUserId = getAuthenticatedCustomerId(actor)
  if (!customerUserId) {
    return ConciergeV2BehavioralAggregationResultSchema.parse({
      user_id: '00000000-0000-0000-0000-000000000000',
      eligible_orders_count: 0,
      candidates: [],
      persisted_facts_count: 0,
      suppressed_facts_count: 0,
    })
  }

  let settings
  try {
    settings = await repository.getSettings()
  } catch {
    return ConciergeV2BehavioralAggregationResultSchema.parse({
      user_id: customerUserId,
      eligible_orders_count: 0,
      candidates: [],
      persisted_facts_count: 0,
      suppressed_facts_count: 0,
    })
  }

  if (!settings.enabled) {
    return ConciergeV2BehavioralAggregationResultSchema.parse({
      user_id: customerUserId,
      eligible_orders_count: 0,
      candidates: [],
      persisted_facts_count: 0,
      suppressed_facts_count: 0,
    })
  }

  const expectedEpoch = settings.memory_epoch
  const { eligibleOrdersCount, candidates } = await computeBehavioralCandidates(
    pool,
    customerUserId,
    nowIso
  )

  let persistedCount = 0
  let suppressedCount = 0

  for (const cand of candidates) {
    const memoryKey = slugifyFoodKey(cand.item_name, 'preference')
    const lastOrderedMs = Date.parse(cand.last_ordered_at)
    const expiresAt = new Date(lastOrderedMs + NINETY_DAYS_MS).toISOString()

    const factInput: ConciergeV2MemoryFactInput = {
      memory_type: 'preference',
      memory_key: memoryKey,
      value: { food: cand.item_name },
      source: 'order_history',
      confidence: cand.confidence,
      observed_at: cand.last_ordered_at,
      expires_at: expiresAt,
      schema_version: 1,
    }

    try {
      const validated = ConciergeV2MemoryFactInputSchema.parse(factInput)
      const writeOp = await repository.writeFact({
        expected_memory_epoch: expectedEpoch,
        fact: validated,
      })

      if (writeOp.ok) {
        persistedCount++
      } else if (writeOp.reason === 'MEMORY_SUPPRESSED') {
        suppressedCount++
      } else if (
        writeOp.reason === 'MEMORY_EPOCH_MISMATCH' ||
        writeOp.reason === 'MEMORY_DISABLED'
      ) {
        // Epoch race or memory disabled mid-flight
        break
      }
    } catch {
      // Skip invalid items
    }
  }

  return ConciergeV2BehavioralAggregationResultSchema.parse({
    user_id: customerUserId,
    eligible_orders_count: eligibleOrdersCount,
    candidates,
    persisted_facts_count: persistedCount,
    suppressed_facts_count: suppressedCount,
  })
}
