import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { createOrderQuote } from '../../supabase/functions/_shared/quote.js'
import { sha256, generateSecureToken } from '../../supabase/functions/_shared/crypto.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Order Engine & Quote Integration (Task T07, Invariants V08, V09, V10)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string

  const createdTableIds: string[] = []
  const createdOrderIds: string[] = []

  let testTableId: string
  let testVisitId: string
  let testCapability: string

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng (245,000)
  const ITEM_2_ID = '10000000-0000-0000-0000-000000000002' // Gỏi cuốn (135,000)
  const ORIGINAL_PRICE_ITEM_1 = 245000

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')

    // 1. Create a dining table
    const tableCode = `TB-ORD-${Date.now().toString().slice(-4)}`
    const createTableReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.1',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Test Đặt Món 01',
        sort_order: 1,
      }),
    })
    const tableRes = await handleAdminApi(createTableReq, { pool, supabaseAdmin })
    expect(tableRes.status).toBe(201)
    const tableData = await tableRes.json()
    testTableId = tableData.data.table.id
    createdTableIds.push(testTableId)
    const qrToken = tableData.data.qr_token

    // 2. Open table visit
    const openVisitReq = new Request(
      `http://localhost/functions/v1/admin-api/tables/${testTableId}/visits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_table_version: 1,
        }),
      }
    )
    const visitRes = await handleAdminApi(openVisitReq, { pool, supabaseAdmin })
    expect(visitRes.status).toBe(201)
    const visitData = await visitRes.json()
    testVisitId = visitData.data.id

    // 3. Resolve QR token to obtain signed visit capability
    const resolveReq = new Request('http://localhost/functions/v1/public-api/tables/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100',
      },
      body: JSON.stringify({ token: qrToken }),
    })
    const resolveRes = await handlePublicApi(resolveReq, { pool, supabaseAdmin })
    expect(resolveRes.status).toBe(200)
    const resolveData = await resolveRes.json()
    testCapability = resolveData.data.visit_capability
  })

  afterAll(async () => {
    if (pool) {
      // Restore restaurant settings
      await pool.query(
        `UPDATE public.restaurant_settings
         SET accepting_orders = true, accepting_dine_in_orders = true
         WHERE id = 1`
      )

      // Restore menu items
      await pool.query(
        `UPDATE public.menu_items
         SET price_vnd = $1, published = true, available = true, allow_dine_in = true
         WHERE id = $2`,
        [ORIGINAL_PRICE_ITEM_1, ITEM_1_ID]
      )

      // Clean up orders and related tables
      if (createdOrderIds.length > 0) {
        await pool.query(
          'DELETE FROM public.guest_order_claims WHERE order_id = ANY($1)',
          [createdOrderIds]
        )
        await pool.query(
          'DELETE FROM public.order_status_history WHERE order_id = ANY($1)',
          [createdOrderIds]
        )
        await pool.query(
          'DELETE FROM public.order_items WHERE order_id = ANY($1)',
          [createdOrderIds]
        )
        await pool.query(
          'DELETE FROM public.idempotency_requests WHERE result_id = ANY($1)',
          [createdOrderIds]
        )
        await pool.query(
          'DELETE FROM public.orders WHERE id = ANY($1)',
          [createdOrderIds]
        )
      }

      // Clean up tables
      for (const tableId of createdTableIds) {
        await pool.query(
          'DELETE FROM public.orders WHERE table_id = $1',
          [tableId]
        )
        await pool.query('DELETE FROM public.table_visits WHERE table_id = $1', [tableId])
        await pool.query('DELETE FROM public.table_qr_tokens WHERE table_id = $1', [tableId])
        await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [tableId])
      }

      await pool.end()
    }
  })

  it('1. POST /order-quotes: generates signed quote with server-computed prices and TTL 5 minutes', async () => {
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [
          { menu_item_id: ITEM_1_ID, quantity: 2, note: 'Ít tiêu' },
          { menu_item_id: ITEM_2_ID, quantity: 1 },
        ],
      }),
    })

    const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.data.quote_token).toBeDefined()
    expect(typeof body.data.quote_token).toBe('string')
    expect(body.data.expires_at).toBeDefined()

    // 245,000 * 2 + 135,000 * 1 = 625,000
    expect(body.data.subtotal_vnd).toBe(625000)
    expect(body.data.shipping_fee_vnd).toBe(0)
    expect(body.data.total_vnd).toBe(625000)
    expect(body.data.items).toHaveLength(2)
    expect(body.data.items[0].menu_item_id).toBe(ITEM_1_ID)
    expect(body.data.items[0].unit_price_vnd).toBe(245000)
    expect(body.data.items[0].line_total_vnd).toBe(490000)
  })

  it('2. POST /order-quotes: rejects client price / total injection (V09)', async () => {
    const tamperReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        total_vnd: 1000, // Attempt to tamper total
      }),
    })

    const res = await handlePublicApi(tamperReq, { pool, supabaseAdmin })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('3. POST /order-quotes: validates delivery requires valid delivery_zone_id', async () => {
    const deliveryReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100',
        'X-Test-Now': '2026-09-20T12:00:00.000Z',
      },
      body: JSON.stringify({
        order_type: 'delivery',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })

    const res = await handlePublicApi(deliveryReq, { pool, supabaseAdmin })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.details.delivery_zone_id).toBeDefined()
  })

  it('4. POST /orders: creates atomic order with receipt and database records', async () => {
    // 1. Get quote
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.100',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [
          { menu_item_id: ITEM_1_ID, quantity: 2, note: 'Ít tiêu' },
          { menu_item_id: ITEM_2_ID, quantity: 1 },
        ],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteData = await quoteRes.json()
    const quoteToken = quoteData.data.quote_token

    // 2. Submit order with Idempotency-Key
    const idempotencyKey = `idemp-${Date.now()}-${generateSecureToken(16)}`
    const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.100',
      },
      body: JSON.stringify({
        quote_token: quoteToken,
        items: [
          { menu_item_id: ITEM_1_ID, quantity: 2, note: 'Ít tiêu' },
          { menu_item_id: ITEM_2_ID, quantity: 1 },
        ],
        note: 'Bàn ngoài hiên nhé quán',
      }),
    })

    const res = await handlePublicApi(orderReq, { pool, supabaseAdmin })
    expect(res.status).toBe(201)

    const body = await res.json()
    const receipt = body.data
    expect(receipt.id).toBeDefined()
    expect(receipt.code).toMatch(/^TG-[A-Z0-9]{8}$/)
    expect(receipt.order_type).toBe('dine_in')
    expect(receipt.status).toBe('pending')
    expect(receipt.payment_status).toBe('unpaid')
    expect(receipt.subtotal_vnd).toBe(625000)
    expect(receipt.shipping_fee_vnd).toBe(0)
    expect(receipt.total_vnd).toBe(625000)
    expect(receipt.created_at).toBeDefined()

    createdOrderIds.push(receipt.id)

    // 3. Verify DB state
    const orderDbRes = await pool.query(
      `SELECT id, code, status, table_id, table_visit_id, total_vnd, note
       FROM public.orders WHERE id = $1`,
      [receipt.id]
    )
    expect(orderDbRes.rows).toHaveLength(1)
    expect(orderDbRes.rows[0].status).toBe('pending')
    expect(orderDbRes.rows[0].table_id).toBe(testTableId)
    expect(orderDbRes.rows[0].table_visit_id).toBe(testVisitId)
    expect(Number(orderDbRes.rows[0].total_vnd)).toBe(625000)

    const itemsDbRes = await pool.query(
      `SELECT menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd, note
       FROM public.order_items WHERE order_id = $1 ORDER BY position ASC`,
      [receipt.id]
    )
    expect(itemsDbRes.rows).toHaveLength(2)
    expect(itemsDbRes.rows[0].menu_item_id).toBe(ITEM_1_ID)
    expect(Number(itemsDbRes.rows[0].unit_price_vnd)).toBe(245000)
    expect(itemsDbRes.rows[0].quantity).toBe(2)
    expect(itemsDbRes.rows[0].note).toBe('Ít tiêu')

    const historyDbRes = await pool.query(
      `SELECT from_status, to_status FROM public.order_status_history WHERE order_id = $1`,
      [receipt.id]
    )
    expect(historyDbRes.rows).toHaveLength(1)
    expect(historyDbRes.rows[0].to_status).toBe('pending')

    const idempDbRes = await pool.query(
      `SELECT operation, key_hash, result_id FROM public.idempotency_requests WHERE result_id = $1`,
      [receipt.id]
    )
    expect(idempDbRes.rows).toHaveLength(1)
    expect(idempDbRes.rows[0].operation).toBe('create_order')
  })

  it('5. Idempotency Replay: identical request replays minimal receipt with 200 without creating new records (V08)', async () => {
    // 1. Get quote
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.101',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 2 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    const idempotencyKey = `replay-test-${Date.now()}-${generateSecureToken(16)}`
    const payload = {
      quote_token: quoteToken,
      items: [{ menu_item_id: ITEM_2_ID, quantity: 2 }],
      note: 'Ghi chú cố định',
    }

    // 2. Initial submit
    const req1 = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.101',
      },
      body: JSON.stringify(payload),
    })
    const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
    expect(res1.status).toBe(201)
    const receipt1 = (await res1.json()).data
    createdOrderIds.push(receipt1.id)

    // 3. Exact replay
    const req2 = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.101',
      },
      body: JSON.stringify(payload),
    })
    const res2 = await handlePublicApi(req2, { pool, supabaseAdmin })
    expect(res2.status).toBe(200) // Replay returns 200
    const receipt2 = (await res2.json()).data
    expect(receipt2.id).toBe(receipt1.id)
    expect(receipt2.code).toBe(receipt1.code)

    // Total orders with this ID in DB must remain 1
    const countRes = await pool.query(
      `SELECT count(*) FROM public.orders WHERE id = $1`,
      [receipt1.id]
    )
    expect(Number(countRes.rows[0].count)).toBe(1)
  })

  it('6. Idempotency Conflict: same key with altered payload or actor returns 409 IDEMPOTENCY_CONFLICT (V08)', async () => {
    // 1. Get quote
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.102',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    const idempotencyKey = `conflict-test-${Date.now()}-${generateSecureToken(16)}`

    // Initial submit
    const req1 = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.102',
      },
      body: JSON.stringify({
        quote_token: quoteToken,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
        note: 'Payload gốc',
      }),
    })
    const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
    expect(res1.status).toBe(201)
    createdOrderIds.push((await res1.json()).data.id)

    // Same key with different note
    const reqConflictPayload = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.102',
      },
      body: JSON.stringify({
        quote_token: quoteToken,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
        note: 'Payload đã bị sửa đổi!',
      }),
    })
    const resConflictPayload = await handlePublicApi(reqConflictPayload, { pool, supabaseAdmin })
    expect(resConflictPayload.status).toBe(409)
    expect((await resConflictPayload.json()).error.code).toBe('IDEMPOTENCY_CONFLICT')

    // Same key with different actor (different IP)
    const reqConflictActor = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '10.0.0.99', // Different actor scope
      },
      body: JSON.stringify({
        quote_token: quoteToken,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
        note: 'Payload gốc',
      }),
    })
    const resConflictActor = await handlePublicApi(reqConflictActor, { pool, supabaseAdmin })
    expect(resConflictActor.status).toBe(409)
    expect((await resConflictActor.json()).error.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('7. Concurrency Race: simultaneous identical requests serialize cleanly with exactly one order created (V08)', async () => {
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.103',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    const idempotencyKey = `race-test-${Date.now()}-${generateSecureToken(16)}`
    const payload = JSON.stringify({
      quote_token: quoteToken,
      items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
    })

    const makeReq = () =>
      new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.103',
        },
        body: payload,
      })

    // Fire 2 concurrent requests
    const [resA, resB] = await Promise.all([
      handlePublicApi(makeReq(), { pool, supabaseAdmin }),
      handlePublicApi(makeReq(), { pool, supabaseAdmin }),
    ])

    const statuses = [resA.status, resB.status]
    expect(statuses).toContain(201)
    expect(statuses).toContain(200)

    const dataA = (await resA.json()).data
    const dataB = (await resB.json()).data
    expect(dataA.id).toBe(dataB.id)
    expect(dataA.code).toBe(dataB.code)
    createdOrderIds.push(dataA.id)

    // Confirm DB has exactly 1 order row
    const countRes = await pool.query(
      `SELECT count(*) FROM public.orders WHERE id = $1`,
      [dataA.id]
    )
    expect(Number(countRes.rows[0].count)).toBe(1)
  })

  it('8. Replay after store closure: committed order replay succeeds even if restaurant has closed (V08)', async () => {
    // 1. Create order
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.104',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    const idempotencyKey = `closure-replay-${Date.now()}-${generateSecureToken(16)}`
    const payload = JSON.stringify({
      quote_token: quoteToken,
      items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
    })

    const createRes = await handlePublicApi(
      new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.104',
        },
        body: payload,
      }),
      { pool, supabaseAdmin }
    )
    expect(createRes.status).toBe(201)
    const receipt = (await createRes.json()).data
    createdOrderIds.push(receipt.id)

    // 2. Close the restaurant
    await pool.query(
      `UPDATE public.restaurant_settings SET accepting_orders = false WHERE id = 1`
    )

    try {
      // 3. Replay request
      const replayRes = await handlePublicApi(
        new Request('http://localhost/functions/v1/public-api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'X-Forwarded-For': '192.168.1.104',
          },
          body: payload,
        }),
        { pool, supabaseAdmin }
      )
      expect(replayRes.status).toBe(200)
      const replayReceipt = (await replayRes.json()).data
      expect(replayReceipt.id).toBe(receipt.id)
    } finally {
      // Re-open restaurant
      await pool.query(
        `UPDATE public.restaurant_settings SET accepting_orders = true WHERE id = 1`
      )
    }
  })

  it('9. Invariant V10: price change between quote and create raises 409 QUOTE_CHANGED without creating order', async () => {
    // 1. Generate quote at current price (245,000)
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.105',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    // 2. Change price in database
    await pool.query(
      `UPDATE public.menu_items SET price_vnd = 299000 WHERE id = $1`,
      [ITEM_1_ID]
    )

    try {
      // 3. Attempt order creation
      const idempotencyKey = `price-change-${Date.now()}-${generateSecureToken(16)}`
      const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.105',
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(orderReq, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('QUOTE_CHANGED')

      // Verify no order was inserted
      const idempRes = await pool.query(
        `SELECT 1 FROM public.idempotency_requests WHERE key_hash = $1`,
        [sha256(idempotencyKey)]
      )
      expect(idempRes.rows).toHaveLength(0)
    } finally {
      // Restore price
      await pool.query(
        `UPDATE public.menu_items SET price_vnd = $1 WHERE id = $2`,
        [ORIGINAL_PRICE_ITEM_1, ITEM_1_ID]
      )
    }
  })

  it('10. Invariant V10: expired quote token raises 409 QUOTE_EXPIRED', async () => {
    // Generate an expired quote (TTL -10 seconds)
    const expiredQuote = createOrderQuote(
      {
        actor_scope: 'guest:' + sha256('192.168.1.106'),
        order_type: 'dine_in',
        context: {
          table_id: testTableId,
          table_visit_id: testVisitId,
          table_name: 'Bàn Test Đặt Món 01',
          epoch: 1,
        },
        items: [
          {
            menu_item_id: ITEM_2_ID,
            item_name: 'Gỏi Cuốn Tôm Thịt & Bơ Sáp',
            quantity: 1,
            note: '',
            unit_price_vnd: 135000,
            line_total_vnd: 135000,
          },
        ],
        subtotal_vnd: 135000,
        shipping_fee_vnd: 0,
        total_vnd: 135000,
      },
      undefined,
      -10 // Expired 10 seconds ago
    )

    const idempotencyKey = `expired-quote-${Date.now()}-${generateSecureToken(16)}`
    const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.106',
      },
      body: JSON.stringify({
        quote_token: expiredQuote.quote_token,
        items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
      }),
    })

    const res = await handlePublicApi(orderReq, { pool, supabaseAdmin })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('QUOTE_EXPIRED')
  })

  it('11. Invariant V09: price snapshot invariance ensures menu edits do not alter historical orders', async () => {
    // 1. Create order
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.107',
      },
      body: JSON.stringify({
        order_type: 'dine_in',
        visit_capability: testCapability,
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    const quoteToken = (await quoteRes.json()).data.quote_token

    const idempotencyKey = `snapshot-test-${Date.now()}-${generateSecureToken(16)}`
    const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-Forwarded-For': '192.168.1.107',
      },
      body: JSON.stringify({
        quote_token: quoteToken,
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })

    const createRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
    expect(createRes.status).toBe(201)
    const receipt = (await createRes.json()).data
    createdOrderIds.push(receipt.id)

    // 2. Change price and name of item in menu_items
    await pool.query(
      `UPDATE public.menu_items SET price_vnd = 999000, name = 'Sườn Nướng Đặc Biệt Mới' WHERE id = $1`,
      [ITEM_1_ID]
    )

    try {
      // 3. Verify order_items and orders records still retain historical snapshots
      const orderDbRes = await pool.query(
        `SELECT total_vnd, subtotal_vnd FROM public.orders WHERE id = $1`,
        [receipt.id]
      )
      expect(Number(orderDbRes.rows[0].total_vnd)).toBe(245000)

      const itemDbRes = await pool.query(
        `SELECT item_name, unit_price_vnd, line_total_vnd FROM public.order_items WHERE order_id = $1`,
        [receipt.id]
      )
      expect(itemDbRes.rows[0].item_name).toBe('Sườn Nướng Mật Ong Hoa Cà Phê')
      expect(Number(itemDbRes.rows[0].unit_price_vnd)).toBe(245000)
      expect(Number(itemDbRes.rows[0].line_total_vnd)).toBe(245000)
    } finally {
      // Restore menu item
      await pool.query(
        `UPDATE public.menu_items
         SET price_vnd = $1, name = 'Sườn Nướng Mật Ong Hoa Cà Phê'
         WHERE id = $2`,
        [ORIGINAL_PRICE_ITEM_1, ITEM_1_ID]
      )
    }
  })
})
