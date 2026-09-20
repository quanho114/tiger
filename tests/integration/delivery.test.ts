import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { generateSecureToken } from '../../supabase/functions/_shared/crypto.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Delivery API & Delivery Zone Rules (Task T10, Invariants V10, V14)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  const createdOrderIds: string[] = []

  // Test constants
  const ZONE_1_ID = '40000000-0000-0000-0000-000000000001' // Fee 15,000, free >= 200,000
  const ZONE_2_ID = '40000000-0000-0000-0000-000000000002' // Fee 30,000, free >= 400,000
  const ZONE_3_ID = '40000000-0000-0000-0000-000000000003' // Fee 50,000, free threshold NULL (never free)

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng (245,000)
  const ITEM_2_ID = '10000000-0000-0000-0000-000000000002' // Gỏi cuốn (135,000)
  const ITEM_DINE_IN_ONLY = '10000000-0000-0000-0000-000000000003' // Cá Hồi (allow_delivery = false)

  // Operating time during 10:30 - 21:30 VN time (UTC 03:30 - 14:30)
  const TEST_TIME_OPEN = '2026-09-20T05:00:00.000Z' // 12:00 VN time
  const TEST_TIME_CLOSED = '2026-09-20T01:00:00.000Z' // 08:00 VN time (before 10:30)

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
  })

  afterAll(async () => {
    if (pool) {
      // Clean up test closures
      await pool.query("DELETE FROM public.business_closures WHERE reason LIKE 'TEST_%'")

      // Restore restaurant settings
      await pool.query(
        `UPDATE public.restaurant_settings
         SET accepting_orders = true,
             accepting_delivery_orders = true,
             min_delivery_order_vnd = 100000
         WHERE id = 1`
      )

      // Restore delivery zones
      await pool.query(
        `UPDATE public.delivery_zones
         SET active = true, fee_vnd = 15000, free_threshold_vnd = 200000
         WHERE id = $1`,
        [ZONE_1_ID]
      )

      // Restore menu items
      await pool.query(
        `UPDATE public.menu_items
         SET price_vnd = 245000, published = true, available = true, allow_delivery = true
         WHERE id = $1`,
        [ITEM_1_ID]
      )

      // Clean up orders
      if (createdOrderIds.length > 0) {
        await pool.query('DELETE FROM public.guest_order_claims WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_status_history WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_items WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.idempotency_requests WHERE result_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.orders WHERE id = ANY($1)', [createdOrderIds])
      }

      await pool.end()
    }
  })

  // --------------------------------------------------------------------------
  // 1. QUOTE VALIDATION & CALCULATION (Invariant V14)
  // --------------------------------------------------------------------------
  describe('Delivery Quote Calculation & Validation', () => {
    it('1.1. Calculates full shipping fee when subtotal is below free shipping threshold', async () => {
      // Subtotal: 135,000 < 200,000 (Zone 1 threshold), fee: 15,000
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.quote_token).toBeDefined()
      expect(body.data.subtotal_vnd).toBe(135000)
      expect(body.data.shipping_fee_vnd).toBe(15000)
      expect(body.data.total_vnd).toBe(150000)
    })

    it('1.2. Waives shipping fee (0 VND) when subtotal meets free shipping threshold', async () => {
      // Subtotal: 245,000 >= 200,000 (Zone 1 threshold), fee: 0
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.subtotal_vnd).toBe(245000)
      expect(body.data.shipping_fee_vnd).toBe(0)
      expect(body.data.total_vnd).toBe(245000)
    })

    it('1.3. Enforces nullable free threshold: Zone 3 never receives free shipping regardless of subtotal', async () => {
      // Subtotal: 245,000 * 2 = 490,000 > 400,000, but Zone 3 threshold is NULL -> fee remains 50,000
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_3_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 2 }],
        }),
      })

      const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.subtotal_vnd).toBe(490000)
      expect(body.data.shipping_fee_vnd).toBe(50000)
      expect(body.data.total_vnd).toBe(540000)
    })

    it('1.4. Rejects delivery quote if subtotal is below minimum order threshold', async () => {
      // Set temporary min order to 300,000
      await pool.query('UPDATE public.restaurant_settings SET min_delivery_order_vnd = 300000 WHERE id = 1')

      try {
        const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.101',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_1_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }], // 245,000 < 300,000
          }),
        })

        const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.error.code).toBe('VALIDATION_ERROR')
        expect(body.error.message).toContain('chưa đạt mức tối thiểu')
      } finally {
        await pool.query('UPDATE public.restaurant_settings SET min_delivery_order_vnd = 100000 WHERE id = 1')
      }
    })

    it('1.5. Rejects deactivated or non-existent delivery zone (no fake zero fee)', async () => {
      // Non-existent zone UUID
      const invalidZoneReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: '40000000-0000-0000-0000-999999999999',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const invalidRes = await handlePublicApi(invalidZoneReq, { pool, supabaseAdmin })
      expect(invalidRes.status).toBe(409)
      const invalidBody = await invalidRes.json()
      expect(invalidBody.error.code).toBe('ZONE_UNAVAILABLE')

      // Deactivated zone
      await pool.query('UPDATE public.delivery_zones SET active = false WHERE id = $1', [ZONE_2_ID])
      try {
        const disabledReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.101',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_2_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        })
        const disabledRes = await handlePublicApi(disabledReq, { pool, supabaseAdmin })
        expect(disabledRes.status).toBe(409)
        const disabledBody = await disabledRes.json()
        expect(disabledBody.error.code).toBe('ZONE_UNAVAILABLE')
      } finally {
        await pool.query('UPDATE public.delivery_zones SET active = true WHERE id = $1', [ZONE_2_ID])
      }
    })

    it('1.6. Rejects menu item marked allow_delivery = false', async () => {
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_DINE_IN_ONLY, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('ITEM_UNAVAILABLE')
      expect(body.error.message).toContain('không áp dụng giao tận nơi')
    })

    it('1.7. Rejects quote outside operating hours or on business closures', async () => {
      // Outside operating hours
      const closedHoursReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_CLOSED,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const closedRes = await handlePublicApi(closedHoursReq, { pool, supabaseAdmin })
      expect(closedRes.status).toBe(409)
      const closedBody = await closedRes.json()
      expect(closedBody.error.code).toBe('SERVICE_CLOSED')
      expect(closedBody.error.message).toContain('Ngoài khung giờ giao hàng')

      // Date closure
      await pool.query(
        "INSERT INTO public.business_closures (date, service_type, reason) VALUES ('2026-09-25', 'delivery', 'TEST_BAO_TRI_XE')"
      )
      try {
        const closureReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.101',
            'X-Test-Now': '2026-09-25T05:00:00.000Z',
          },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_1_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        })
        const closureRes = await handlePublicApi(closureReq, { pool, supabaseAdmin })
        expect(closureRes.status).toBe(409)
        const closureBody = await closureRes.json()
        expect(closureBody.error.code).toBe('SERVICE_CLOSED')
        expect(closureBody.error.message).toContain('TEST_BAO_TRI_XE')
      } finally {
        await pool.query("DELETE FROM public.business_closures WHERE reason = 'TEST_BAO_TRI_XE'")
      }
    })

    it('1.8. Rejects dine-in fields supplied in delivery quote request', async () => {
      const tamperReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.101',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          visit_capability: 'dummy-visit-cap',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(tamperReq, { pool, supabaseAdmin })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // --------------------------------------------------------------------------
  // 2. ORDER CREATION & ATOMIC SNAPSHOTS (Invariants V10, V14)
  // --------------------------------------------------------------------------
  describe('Delivery Order Creation & Snapshots', () => {
    it('2.1. Successfully creates delivery order with accurate snapshots and no table context', async () => {
      // 1. Get quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.102',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1, note: 'Giao trước 12h' }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(quoteRes.status).toBe(200)
      const quoteData = await quoteRes.json()
      const quoteToken = quoteData.data.quote_token

      // 2. Create order
      const idempotencyKey = `idemp-deliv-${Date.now()}-${generateSecureToken(8)}`
      const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.102',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Nguyễn Văn Test',
          customer_phone: '0901234567',
          address: '123 Đường Số 2, KP2, Vĩnh An',
          note: 'Bấm chuông giúp mình',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1, note: 'Giao trước 12h' }],
        }),
      })

      const orderRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
      expect(orderRes.status).toBe(201)

      const orderData = await orderRes.json()
      expect(orderData.data.id).toBeDefined()
      expect(orderData.data.code).toMatch(/^TG-[A-Z0-9]{8}$/)
      expect(orderData.data.order_type).toBe('delivery')
      expect(orderData.data.status).toBe('pending')
      expect(orderData.data.total_vnd).toBe(245000)

      const createdOrderId = orderData.data.id
      createdOrderIds.push(createdOrderId)

      // 3. Verify Database snapshot integrity
      const dbRes = await pool.query('SELECT * FROM public.orders WHERE id = $1', [createdOrderId])
      expect(dbRes.rows).toHaveLength(1)
      const orderRow = dbRes.rows[0]

      // Strict context isolation
      expect(orderRow.order_type).toBe('delivery')
      expect(orderRow.table_id).toBeNull()
      expect(orderRow.table_visit_id).toBeNull()
      expect(orderRow.table_name_snapshot).toBeNull()

      // Exact snapshots
      expect(orderRow.customer_name).toBe('Nguyễn Văn Test')
      expect(orderRow.customer_phone).toBe('0901234567')
      expect(orderRow.address_snapshot).toBe('123 Đường Số 2, KP2, Vĩnh An')
      expect(orderRow.delivery_zone_id).toBe(ZONE_1_ID)
      expect(orderRow.zone_name_snapshot).toBe('Nội ô Thị trấn Vĩnh An (< 3km)')
      expect(Number(orderRow.subtotal_vnd)).toBe(245000)
      expect(Number(orderRow.shipping_fee_vnd)).toBe(0) // free shipping threshold met
      expect(Number(orderRow.total_vnd)).toBe(245000)

      // Initial status history
      const historyRes = await pool.query(
        'SELECT * FROM public.order_status_history WHERE order_id = $1',
        [createdOrderId]
      )
      expect(historyRes.rows).toHaveLength(1)
      expect(historyRes.rows[0].to_status).toBe('pending')
      expect(historyRes.rows[0].reason).toContain('website')
    })

    it('2.2. Validates customer name, phone, and address requirements', async () => {
      // Get valid quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.103',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteData = await quoteRes.json()
      const quoteToken = quoteData.data.quote_token

      // Test short name (< 2 chars)
      const shortNameReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${Date.now()}-1`,
          'X-Forwarded-For': '192.168.1.103',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'A',
          customer_phone: '0901234567',
          address: '123 Đường Số 2',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const shortNameRes = await handlePublicApi(shortNameReq, { pool, supabaseAdmin })
      expect(shortNameRes.status).toBe(400)

      // Test short phone (< 9 chars)
      const shortPhoneReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${Date.now()}-2`,
          'X-Forwarded-For': '192.168.1.103',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Test Name',
          customer_phone: '12345',
          address: '123 Đường Số 2',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const shortPhoneRes = await handlePublicApi(shortPhoneReq, { pool, supabaseAdmin })
      expect(shortPhoneRes.status).toBe(400)

      // Test short address (< 5 chars)
      const shortAddrReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-${Date.now()}-3`,
          'X-Forwarded-For': '192.168.1.103',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Test Name',
          customer_phone: '0901234567',
          address: 'Nhà',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const shortAddrRes = await handlePublicApi(shortAddrReq, { pool, supabaseAdmin })
      expect(shortAddrRes.status).toBe(400)
    })

    it('2.3. Idempotency Replay: identical request returns cached receipt even after restaurant closes', async () => {
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.104',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteToken = (await quoteRes.json()).data.quote_token

      const idempotencyKey = `idemp-replay-${Date.now()}`
      const orderPayload = {
        quote_token: quoteToken,
        customer_name: 'Khách Replay',
        customer_phone: '0909999888',
        address: '456 Đường Hùng Vương',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }

      // Initial submission
      const orderReq1 = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.104',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify(orderPayload),
      })
      const orderRes1 = await handlePublicApi(orderReq1, { pool, supabaseAdmin })
      expect(orderRes1.status).toBe(201)
      const data1 = await orderRes1.json()
      createdOrderIds.push(data1.data.id)

      // Now close delivery orders in settings
      await pool.query('UPDATE public.restaurant_settings SET accepting_delivery_orders = false WHERE id = 1')

      try {
        // Replayed request should succeed and return cached receipt
        const orderReq2 = new Request('http://localhost/functions/v1/public-api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': idempotencyKey,
            'X-Forwarded-For': '192.168.1.104',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify(orderPayload),
        })
        const orderRes2 = await handlePublicApi(orderReq2, { pool, supabaseAdmin })
        expect(orderRes2.status).toBe(200)
        const data2 = await orderRes2.json()
        expect(data2.data.id).toBe(data1.data.id)
        expect(data2.data.code).toBe(data1.data.code)
      } finally {
        await pool.query('UPDATE public.restaurant_settings SET accepting_delivery_orders = true WHERE id = 1')
      }
    })

    it('2.4. Idempotency Conflict: tampering with customer details or line items under same key raises 409', async () => {
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.105',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteToken = (await quoteRes.json()).data.quote_token

      const idempotencyKey = `idemp-conflict-${Date.now()}`

      // Order 1
      const orderReq1 = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.105',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Khách Gốc',
          customer_phone: '0901112222',
          address: '789 Đường Lê Lợi',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const orderRes1 = await handlePublicApi(orderReq1, { pool, supabaseAdmin })
      expect(orderRes1.status).toBe(201)
      createdOrderIds.push((await orderRes1.json()).data.id)

      // Tampered Order with different phone under same key
      const tamperReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'X-Forwarded-For': '192.168.1.105',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Khách Gốc',
          customer_phone: '0909999999', // altered phone
          address: '789 Đường Lê Lợi',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const tamperRes = await handlePublicApi(tamperReq, { pool, supabaseAdmin })
      expect(tamperRes.status).toBe(409)
      const tamperBody = await tamperRes.json()
      expect(tamperBody.error.code).toBe('IDEMPOTENCY_CONFLICT')
    })
  })

  // --------------------------------------------------------------------------
  // 3. LIVE PRICE & ZONE FEE DEFENSE (Invariant V10)
  // --------------------------------------------------------------------------
  describe('Live Price & Zone Fee Change Defense', () => {
    it('3.1. Rejects order creation if menu item price changes after quote (V10)', async () => {
      // 1. Get quote at original price (245,000)
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.106',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteToken = (await quoteRes.json()).data.quote_token

      // 2. Admin updates menu item price to 260,000
      await pool.query('UPDATE public.menu_items SET price_vnd = 260000 WHERE id = $1', [ITEM_1_ID])

      try {
        // 3. Attempt to submit order with old quote token
        const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `idemp-price-chg-${Date.now()}`,
            'X-Forwarded-For': '192.168.1.106',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify({
            quote_token: quoteToken,
            customer_name: 'Khách Giá Cũ',
            customer_phone: '0901234567',
            address: '100 Đường CMT8',
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        })

        const orderRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
        expect(orderRes.status).toBe(409)
        const orderBody = await orderRes.json()
        expect(orderBody.error.code).toBe('QUOTE_CHANGED')
        expect(orderBody.error.message).toContain('đã thay đổi')
      } finally {
        await pool.query('UPDATE public.menu_items SET price_vnd = 245000 WHERE id = $1', [ITEM_1_ID])
      }
    })

    it('3.2. Rejects order creation if zone shipping fee changes after quote (V10)', async () => {
      // 1. Get quote for Zone 1 (subtotal 135,000 -> shipping fee 15,000)
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.107',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteToken = (await quoteRes.json()).data.quote_token

      // 2. Admin updates Zone 1 shipping fee to 20,000
      await pool.query('UPDATE public.delivery_zones SET fee_vnd = 20000 WHERE id = $1', [ZONE_1_ID])

      try {
        // 3. Attempt to submit order with old quote token
        const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `idemp-fee-chg-${Date.now()}`,
            'X-Forwarded-For': '192.168.1.107',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify({
            quote_token: quoteToken,
            customer_name: 'Khách Phí Cũ',
            customer_phone: '0901234567',
            address: '100 Đường CMT8',
            items: [{ menu_item_id: ITEM_2_ID, quantity: 1 }],
          }),
        })

        const orderRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
        expect(orderRes.status).toBe(409)
        const orderBody = await orderRes.json()
        expect(orderBody.error.code).toBe('QUOTE_CHANGED')
        expect(orderBody.error.message).toContain('Phí giao hàng đã thay đổi')
      } finally {
        await pool.query('UPDATE public.delivery_zones SET fee_vnd = 15000 WHERE id = $1', [ZONE_1_ID])
      }
    })

    it('3.3. Rejects order creation if delivery zone is deactivated after quote', async () => {
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.108',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteToken = (await quoteRes.json()).data.quote_token

      // Admin disables Zone 1
      await pool.query('UPDATE public.delivery_zones SET active = false WHERE id = $1', [ZONE_1_ID])

      try {
        const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `idemp-zone-dis-${Date.now()}`,
            'X-Forwarded-For': '192.168.1.108',
            'X-Test-Now': TEST_TIME_OPEN,
          },
          body: JSON.stringify({
            quote_token: quoteToken,
            customer_name: 'Khách Zone Tắt',
            customer_phone: '0901234567',
            address: '100 Đường CMT8',
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        })

        const orderRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
        expect(orderRes.status).toBe(409)
        const orderBody = await orderRes.json()
        expect(orderBody.error.code).toBe('ZONE_UNAVAILABLE')
      } finally {
        await pool.query('UPDATE public.delivery_zones SET active = true WHERE id = $1', [ZONE_1_ID])
      }
    })
  })

  // --------------------------------------------------------------------------
  // 4. DELIVERY STATE MACHINE & TRANSITIONS (Task T10.5)
  // --------------------------------------------------------------------------
  describe('Delivery Order Transition Graph', () => {
    it('4.1. Follows delivery graph: pending -> confirmed -> preparing -> delivering -> completed', async () => {
      // Create fresh delivery order
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.109',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteToken = (await (await handlePublicApi(quoteReq, { pool, supabaseAdmin })).json()).data.quote_token

      const orderReq = new Request('http://localhost/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `idemp-trans-${Date.now()}`,
          'X-Forwarded-For': '192.168.1.109',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Khách Chuyển Trạng Thái',
          customer_phone: '0901234567',
          address: '200 Đường 30/4',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const orderRes = await handlePublicApi(orderReq, { pool, supabaseAdmin })
      expect(orderRes.status).toBe(201)
      const order = (await orderRes.json()).data
      createdOrderIds.push(order.id)
      let currentVersion = 1

      // 1. Transition pending -> confirmed
      const confirmReq = new Request(`http://localhost/functions/v1/admin-api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: currentVersion,
          target_status: 'confirmed',
        }),
      })
      const confirmRes = await handleAdminApi(confirmReq, { pool, supabaseAdmin })
      expect(confirmRes.status).toBe(200)
      currentVersion++

      // 2. Transition confirmed -> preparing
      const prepareReq = new Request(`http://localhost/functions/v1/admin-api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: currentVersion,
          target_status: 'preparing',
        }),
      })
      const prepareRes = await handleAdminApi(prepareReq, { pool, supabaseAdmin })
      expect(prepareRes.status).toBe(200)
      currentVersion++

      // 3. Attempt preparing -> served (MUST BE REJECTED for delivery)
      const servedReq = new Request(`http://localhost/functions/v1/admin-api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: currentVersion,
          target_status: 'served',
        }),
      })
      const servedRes = await handleAdminApi(servedReq, { pool, supabaseAdmin })
      expect(servedRes.status).toBe(422)
      const servedBody = await servedRes.json()
      expect(servedBody.error.code).toBe('INVALID_TRANSITION')

      // 4. Transition preparing -> delivering (Valid for delivery)
      const deliverReq = new Request(`http://localhost/functions/v1/admin-api/orders/${order.id}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: currentVersion,
          target_status: 'delivering',
        }),
      })
      const deliverRes = await handleAdminApi(deliverReq, { pool, supabaseAdmin })
      expect(deliverRes.status).toBe(200)
      currentVersion++

      // 5. Attempt delivering -> completed while payment_status is unpaid (MUST FAIL)
      const completeFailReq = new Request(
        `http://localhost/functions/v1/admin-api/orders/${order.id}/transition`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: currentVersion,
            target_status: 'completed',
          }),
        }
      )
      const completeFailRes = await handleAdminApi(completeFailReq, { pool, supabaseAdmin })
      expect(completeFailRes.status).toBe(409)
      const completeFailBody = await completeFailRes.json()
      expect(completeFailBody.error.code).toBe('PAYMENT_REQUIRED')

      // 6. Settle payment directly in database to simulate payment confirmation
      await pool.query("UPDATE public.orders SET payment_status = 'paid' WHERE id = $1", [order.id])

      // 7. Transition delivering -> completed now succeeds
      const completeSuccessReq = new Request(
        `http://localhost/functions/v1/admin-api/orders/${order.id}/transition`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: currentVersion,
            target_status: 'completed',
          }),
        }
      )
      const completeSuccessRes = await handleAdminApi(completeSuccessReq, { pool, supabaseAdmin })
      expect(completeSuccessRes.status).toBe(200)
      const finalOrder = (await completeSuccessRes.json()).data
      expect(finalOrder.status).toBe('completed')
    })
  })

  // --------------------------------------------------------------------------
  // 5. CONCURRENCY & SERIALIZATION
  // --------------------------------------------------------------------------
  describe('Delivery Order Concurrency & Advisory Lock Serialization', () => {
    it('5.1. Serializes concurrent submissions with same Idempotency-Key resulting in exactly 1 order', async () => {
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.110',
          'X-Test-Now': TEST_TIME_OPEN,
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_1_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteToken = (await (await handlePublicApi(quoteReq, { pool, supabaseAdmin })).json()).data.quote_token

      const idempotencyKey = `idemp-race-${Date.now()}`
      const orderPayload = {
        quote_token: quoteToken,
        customer_name: 'Khách Đua Concurrency',
        customer_phone: '0901234567',
        address: '500 Đường Trần Phú',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }

      // Fire 4 concurrent requests with the identical Idempotency-Key
      const results = await Promise.all(
        Array.from({ length: 4 }).map(() => {
          const req = new Request('http://localhost/functions/v1/public-api/orders', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
              'X-Forwarded-For': '192.168.1.110',
              'X-Test-Now': TEST_TIME_OPEN,
            },
            body: JSON.stringify(orderPayload),
          })
          return handlePublicApi(req, { pool, supabaseAdmin })
        })
      )

      for (const res of results) {
        expect([200, 201]).toContain(res.status)
      }

      const bodies = await Promise.all(results.map((r) => r.json()))
      const firstOrderId = bodies[0].data.id
      createdOrderIds.push(firstOrderId)

      // All 4 responses must have returned the exact same order id and code
      for (const b of bodies) {
        expect(b.data.id).toBe(firstOrderId)
      }

      // Verify DB count for this code
      const countRes = await pool.query(
        'SELECT count(*)::int as count FROM public.orders WHERE id = $1',
        [firstOrderId]
      )
      expect(countRes.rows[0].count).toBe(1)
    })
  })
})