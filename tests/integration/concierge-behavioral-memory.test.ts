/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: vitest integration test runner (npm run test:integration)
 * - Affected API: computeBehavioralCandidates, aggregateBehavioralMemory, retrieveSelectiveMemory
 * - Data Schemas: public.orders, public.order_items, public.user_ai_memories, public.user_ai_memory_settings, public.user_ai_memory_suppressions, ConciergeV2BehavioralAggregationResultSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V07: Behavioral aggregates and selective retrieval", "1. Aggregate eligible completed orders from the last 90 days by item/category; distinguish frequency per order from quantity.", "2. Exclude cancelled and ineligible refunded/test data using V01 rules. Do not infer party size, allergies or dietary restrictions from weak behavior.", "3. Bound queries and results, add appropriate indexes if evidence requires them, and use a refresh schedule/invalidations suitable for one restaurant.", "4. Retrieve facts only for relevant food/draft intents; no personal lookup for parking/hours. Dietary constraints outrank inferred favorites; current explicit constraints outrank defaults.", "5. Produce source-tagged compact facts within 200-400 tokens and 12 facts. Never include address/phone/order transcript in model memory.", "6. Honor consent/epoch/deletion and expiry; allow serving without personalization during repository failures.", "A08: Ask parking, then recommend dinner | Parking triggers no personal-memory read; dinner loads compact relevant constraints/favorites"
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import {
  aggregateBehavioralMemory,
  computeBehavioralCandidates,
} from '../../supabase/functions/_shared/concierge/behavioral-memory.ts'
import { retrieveSelectiveMemory } from '../../supabase/functions/_shared/concierge/memory-retrieval.ts'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.ts'
import type { ConciergeV2ActorBinding } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { FIXTURE_USERS, seedFixtureUsers } from '../fixtures/auth-users.ts'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.ts'

const { Pool } = pg

function createPool(): pg.Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  })
}

describe('Concierge V2 Behavioral Memory & Selective Retrieval (Real Database Integration)', () => {
  let pool: pg.Pool
  let customerARepo: ReturnType<typeof createConciergeV2MemoryRepository>

  const customerActor: ConciergeV2ActorBinding = {
    authenticated_user_id: FIXTURE_USERS.customerA.id,
  }

  const customerUserId = FIXTURE_USERS.customerA.id
  const testZoneId = '40000000-0000-0000-0000-000000000001'

  async function cleanCustomerData(): Promise<void> {
    await pool.query('DELETE FROM public.user_ai_memory_suppressions WHERE user_id = $1', [
      customerUserId,
    ])
    await pool.query('DELETE FROM public.user_ai_memories WHERE user_id = $1', [customerUserId])
    await pool.query('DELETE FROM public.user_ai_memory_settings WHERE user_id = $1', [
      customerUserId,
    ])
    // Delete orders created by customerA for testing
    await pool.query('DELETE FROM public.orders WHERE customer_user_id = $1', [customerUserId])
  }

  async function insertTestOrder(opts: {
    code: string
    status: 'completed' | 'cancelled' | 'pending'
    paymentStatus: 'paid' | 'unpaid' | 'refunded'
    daysAgo: number
    items: Array<{ name: string; quantity: number }>
  }): Promise<string> {
    const orderId = `60000000-0000-0000-0000-${Math.random().toString().slice(2, 14)}`
    const createdAt = new Date(Date.now() - opts.daysAgo * 24 * 60 * 60 * 1000).toISOString()

    let subtotal = 0
    for (const item of opts.items) {
      subtotal += item.quantity * 50000
    }

    await pool.query(
      `INSERT INTO public.orders (
         id, code, order_type, status, payment_status, customer_user_id, customer_name, customer_phone,
         address_snapshot, delivery_zone_id, zone_name_snapshot,
         subtotal_vnd, shipping_fee_vnd, total_vnd, created_at
       ) VALUES (
         $1, $2, 'delivery', $3, $4, $5, 'Khách A', '0912345678',
         '123 Đường Test, Quận 1', $6, 'Quận 1',
         $7, 0, $7, $8
       )`,
      [
        orderId,
        opts.code,
        opts.status,
        opts.paymentStatus,
        customerUserId,
        testZoneId,
        subtotal,
        createdAt,
      ]
    )

    for (const item of opts.items) {
      const lineTotal = item.quantity * 50000
      await pool.query(
        `INSERT INTO public.order_items (
           order_id, item_name, unit_price_vnd, quantity, line_total_vnd
         ) VALUES ($1, $2, 50000, $3, $4)`,
        [orderId, item.name, item.quantity, lineTotal]
      )
    }

    return orderId
  }

  beforeAll(async () => {
    pool = createPool()
    await assertIsolatedTestDatabase(pool)
    await seedFixtureUsers(pool)
    await cleanCustomerData()
    customerARepo = createConciergeV2MemoryRepository(pool, {
      role: 'customer',
      userId: customerUserId,
    })
  })

  afterAll(async () => {
    if (pool) {
      await cleanCustomerData()
      await pool.end()
    }
  })

  it('aggregates completed, paid orders within 90 days and enforces >= 2 order frequency', async () => {
    await cleanCustomerData()

    // 1. Completed & paid order 10 days ago (Phở Bò, Trà Đá)
    await insertTestOrder({
      code: `ORD-TEST-01-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      paymentStatus: 'paid',
      daysAgo: 10,
      items: [
        { name: 'Phở Bò Tái Lăn', quantity: 2 },
        { name: 'Trà Đá', quantity: 2 },
      ],
    })

    // 2. Completed & paid order 20 days ago (Phở Bò, Gỏi Cuốn)
    await insertTestOrder({
      code: `ORD-TEST-02-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      paymentStatus: 'paid',
      daysAgo: 20,
      items: [
        { name: 'Phở Bò Tái Lăn', quantity: 1 },
        { name: 'Gỏi Cuốn Tôm Thịt', quantity: 3 },
      ],
    })

    // 3. Completed & paid order 30 days ago (Gỏi Cuốn)
    await insertTestOrder({
      code: `ORD-TEST-03-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      paymentStatus: 'paid',
      daysAgo: 30,
      items: [{ name: 'Gỏi Cuốn Tôm Thịt', quantity: 2 }],
    })

    // 4. Cancelled order (Bún Bò Huế) -> MUST be excluded
    await insertTestOrder({
      code: `ORD-TEST-04-${Date.now().toString().slice(-6)}`,
      status: 'cancelled',
      paymentStatus: 'paid',
      daysAgo: 5,
      items: [{ name: 'Bún Bò Huế', quantity: 4 }],
    })

    // 5. Unpaid order (Cơm Tấm Sườn) -> MUST be excluded
    await insertTestOrder({
      code: `ORD-TEST-05-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      paymentStatus: 'unpaid',
      daysAgo: 5,
      items: [{ name: 'Cơm Tấm Sườn', quantity: 4 }],
    })

    // 6. Old order > 90 days ago (Lẩu Thái) -> MUST be excluded
    await insertTestOrder({
      code: `ORD-TEST-06-${Date.now().toString().slice(-6)}`,
      status: 'completed',
      paymentStatus: 'paid',
      daysAgo: 110,
      items: [{ name: 'Lẩu Thái Chua Cay', quantity: 2 }],
    })

    const { eligibleOrdersCount, candidates } = await computeBehavioralCandidates(
      pool,
      customerUserId
    )

    // Exactly 3 completed & paid orders within 90 days
    expect(eligibleOrdersCount).toBe(3)

    const candidateNames = candidates.map((c) => c.item_name)
    // Phở Bò Tái Lăn appeared in 2 orders -> qualified candidate
    expect(candidateNames).toContain('Phở Bò Tái Lăn')
    // Gỏi Cuốn Tôm Thịt appeared in 2 orders -> qualified candidate
    expect(candidateNames).toContain('Gỏi Cuốn Tôm Thịt')
    // Trà Đá appeared in only 1 order -> disqualified
    expect(candidateNames).not.toContain('Trà Đá')
    // Cancelled / unpaid / old items disqualified
    expect(candidateNames).not.toContain('Bún Bò Huế')
    expect(candidateNames).not.toContain('Cơm Tấm Sườn')
    expect(candidateNames).not.toContain('Lẩu Thái Chua Cay')

    // Verify confidence is bounded within [70, 85]
    for (const cand of candidates) {
      expect(cand.confidence).toBeGreaterThanOrEqual(70)
      expect(cand.confidence).toBeLessThanOrEqual(85)
    }
  })

  it('persists qualified behavioral facts when memory is enabled and respects suppression', async () => {
    // 1. Enable memory for customerA
    await customerARepo.setEnabled({ enabled: true, consent_version: 1 })

    // 2. Run behavioral aggregation
    const aggResult = await aggregateBehavioralMemory({
      pool,
      actor: customerActor,
      repository: customerARepo,
    })

    expect(aggResult.eligible_orders_count).toBe(3)
    expect(aggResult.persisted_facts_count).toBeGreaterThanOrEqual(2)
    expect(aggResult.suppressed_facts_count).toBe(0)

    // 3. Verify facts in public.user_ai_memories
    const facts = await customerARepo.listFacts()
    const factFoods = facts.map((f) => f.value.food)
    expect(factFoods).toContain('Phở Bò Tái Lăn')
    expect(factFoods).toContain('Gỏi Cuốn Tôm Thịt')

    for (const f of facts) {
      expect(f.source).toBe('order_history')
      expect(f.confidence).toBeGreaterThanOrEqual(70)
      expect(f.confidence).toBeLessThanOrEqual(85)
      expect(f.expires_at).not.toBeNull()
    }

    // 4. Delete one behavioral fact ("Phở Bò Tái Lăn"), which writes a value-free suppression record
    const phoFact = facts.find((f) => f.value.food === 'Phở Bò Tái Lăn')!
    await customerARepo.deleteFact({
      memory_type: phoFact.memory_type,
      memory_key: phoFact.memory_key,
      source: phoFact.source,
    })

    // Verify suppression record exists in database
    const suppressionsRes = await pool.query<{ memory_key: string }>(
      'SELECT memory_key FROM public.user_ai_memory_suppressions WHERE user_id = $1',
      [customerUserId]
    )
    expect(suppressionsRes.rows.some((s) => s.memory_key === phoFact.memory_key)).toBe(true)

    // 5. Re-run aggregation: previously deleted fact MUST be skipped via suppression
    const reAggResult = await aggregateBehavioralMemory({
      pool,
      actor: customerActor,
      repository: customerARepo,
    })

    expect(reAggResult.suppressed_facts_count).toBeGreaterThanOrEqual(1)

    // Check database facts again: "Phở Bò Tái Lăn" has NOT been recreated!
    const updatedFacts = await customerARepo.listFacts()
    expect(updatedFacts.map((f) => f.value.food)).not.toContain('Phở Bò Tái Lăn')
    expect(updatedFacts.map((f) => f.value.food)).toContain('Gỏi Cuốn Tôm Thịt')
  })

  it('end-to-end selective retrieval: A08 zero lookup on FAQ, dislike defeats favorite on food query', async () => {
    // 1. Add explicit dislike for 'thịt bò'
    await customerARepo.writeFact({
      expected_memory_epoch: (await customerARepo.getSettings()).memory_epoch,
      fact: {
        memory_type: 'dislike',
        memory_key: 'thit-bo',
        value: { food: 'thịt bò' },
        source: 'explicit',
        confidence: 90,
        observed_at: new Date().toISOString(),
        expires_at: null,
        schema_version: 1,
      },
    })

    // Also manually add back a favorite 'Cơm Chiên Bò'
    await customerARepo.writeFact({
      expected_memory_epoch: (await customerARepo.getSettings()).memory_epoch,
      fact: {
        memory_type: 'preference',
        memory_key: 'com-chien-bo',
        value: { food: 'Cơm Chiên Bò' },
        source: 'order_history',
        confidence: 75,
        observed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        schema_version: 1,
      },
    })

    // A08 Requirement: Parking query triggers zero memory retrieval
    const faqResult = await retrieveSelectiveMemory({
      message: 'Quán có chỗ đậu xe ô tô không bạn?',
      actor: customerActor,
      repository: customerARepo,
    })

    expect(faqResult.intent_type).toBe('faq')
    expect(faqResult.fetched_from_storage).toBe(false)
    expect(faqResult.facts).toEqual([])
    expect(faqResult.formatted_prompt).toBe('')

    // Food query triggers selective retrieval and explicit dislike defeats matching favorite
    const foodResult = await retrieveSelectiveMemory({
      message: 'Gợi ý món ăn tối nay cho 2 người',
      actor: customerActor,
      repository: customerARepo,
    })

    expect(foodResult.intent_type).toBe('food_or_draft')
    expect(foodResult.fetched_from_storage).toBe(true)

    const retrievedFoods = foodResult.facts.map((f) => f.food)
    // Dislike is preserved
    expect(retrievedFoods).toContain('thịt bò')
    // Gỏi Cuốn Tôm Thịt is preserved
    expect(retrievedFoods).toContain('Gỏi Cuốn Tôm Thịt')
    // 'Cơm Chiên Bò' MUST be defeated by dislike for 'thịt bò'
    expect(retrievedFoods).not.toContain('Cơm Chiên Bò')

    // Formatted prompt check
    expect(foodResult.formatted_prompt).toContain('- [Không thích (tự khai)]: thịt bò')
    expect(foodResult.formatted_prompt).toContain('- [Yêu thích (từ lịch sử gọi món)]: Gỏi Cuốn Tôm Thịt')
    expect(foodResult.formatted_prompt).not.toContain('Cơm Chiên Bò')
  })
})
