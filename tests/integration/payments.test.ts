import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Payment Events, Settlement & Visit Lifecycle Integration (Task T17, Invariant V18)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  let customerToken: string

  const createdTableIds: string[] = []
  const createdOrderIds: string[] = []

  let testTableId: string
  let testVisitId: string
  let testCapability: string
  let testZoneId: string

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng (245,000)

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
    customerToken = getUserToken('customerA')

    // Fetch delivery zone
    const zoneRes = await pool.query('SELECT id FROM public.delivery_zones LIMIT 1')
    testZoneId = zoneRes.rows[0].id

    // Create table via admin-api
    const tableRes = await handleAdminApi(
      new Request('http://localhost:54321/functions/v1/admin-api/tables', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          code: `T_PAY_${Date.now().toString().slice(-4)}`,
          name: 'Bàn Test Payment',
          sort_order: 888,
        }),
      }),
      { pool, supabaseAdmin }
    )
    const tableData = await tableRes.json()
    testTableId = tableData.data.table.id
    createdTableIds.push(testTableId)
    const qrToken = tableData.data.qr_token

    // Open visit via admin-api
    const visitRes = await handleAdminApi(
      new Request(`http://localhost:54321/functions/v1/admin-api/tables/${testTableId}/visits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({ expected_table_version: 1 }),
      }),
      { pool, supabaseAdmin }
    )
    const visitData = await visitRes.json()
    testVisitId = visitData.data.id

    // Resolve QR token
    const resolveRes = await handlePublicApi(
      new Request('http://localhost:54321/functions/v1/public-api/tables/resolve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.100',
        },
        body: JSON.stringify({ token: qrToken }),
      }),
      { pool, supabaseAdmin }
    )
    const resolveData = await resolveRes.json()
    testCapability = resolveData.data.visit_capability
  })

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM public.order_payment_events WHERE order_id = ANY($1::uuid[])`, [createdOrderIds])
      await pool.query(`DELETE FROM public.guest_order_claims WHERE order_id = ANY($1::uuid[])`, [createdOrderIds])
      await pool.query(`DELETE FROM public.order_status_history WHERE order_id = ANY($1::uuid[])`, [createdOrderIds])
      await pool.query(`DELETE FROM public.order_items WHERE order_id = ANY($1::uuid[])`, [createdOrderIds])
      await pool.query(`DELETE FROM public.orders WHERE id = ANY($1::uuid[])`, [createdOrderIds])
    }
    if (createdTableIds.length > 0) {
      await pool.query(`DELETE FROM public.table_visits WHERE table_id = ANY($1::uuid[])`, [createdTableIds])
      await pool.query(`DELETE FROM public.table_qr_tokens WHERE table_id = ANY($1::uuid[])`, [createdTableIds])
      await pool.query(`DELETE FROM public.dining_tables WHERE id = ANY($1::uuid[])`, [createdTableIds])
    }
    await pool.end()
  })

  // Helper to create dine-in order
  async function createDineInOrder(note = ''): Promise<{ id: string; code: string; version: number; total_vnd: number }> {
    const randomIp = `10.88.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`
    const quoteRes = await handlePublicApi(
      new Request('http://localhost:54321/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': randomIp,
        },
        body: JSON.stringify({
          order_type: 'dine_in',
          visit_capability: testCapability,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1, note }],
          note,
        }),
      }),
      { pool, supabaseAdmin }
    )
    const quoteData = await quoteRes.json()
    const quoteToken = quoteData.data.quote_token

    const idemKey = `idem_pay_dine_${Date.now()}_${Math.random()}`
    const orderRes = await handlePublicApi(
      new Request('http://localhost:54321/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Forwarded-For': randomIp,
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1, note }],
          note,
        }),
      }),
      { pool, supabaseAdmin }
    )
    const orderData = await orderRes.json()
    createdOrderIds.push(orderData.data.id)
    return { ...orderData.data, version: 1 }
  }

  // Helper to create delivery order
  async function createDeliveryOrder(): Promise<{ id: string; code: string; version: number; total_vnd: number }> {
    const randomIp = `10.89.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`
    const quoteRes = await handlePublicApi(
      new Request('http://localhost:54321/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': randomIp,
          'X-Test-Now': '2026-09-20T12:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: testZoneId,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      }),
      { pool, supabaseAdmin }
    )
    const quoteData = await quoteRes.json()
    const quoteToken = quoteData.data.quote_token

    const idemKey = `idem_pay_deliv_${Date.now()}_${Math.random()}`
    const orderRes = await handlePublicApi(
      new Request('http://localhost:54321/functions/v1/public-api/orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Forwarded-For': randomIp,
          'X-Test-Now': '2026-09-20T12:00:00.000Z',
        },
        body: JSON.stringify({
          quote_token: quoteToken,
          customer_name: 'Khách Test Pay',
          customer_phone: '0901234567',
          address: '123 Đường Test, Vĩnh Cửu, Đồng Nai',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      }),
      { pool, supabaseAdmin }
    )
    const orderData = await orderRes.json()
    createdOrderIds.push(orderData.data.id)
    return { ...orderData.data, version: 1 }
  }

  // Helper to transition order status
  async function transitionOrder(
    orderId: string,
    toStatus: string,
    expectedVersion: number,
    reason?: string
  ): Promise<{ status: number; body: any }> {
    const res = await handleAdminApi(
      new Request(`http://localhost:54321/functions/v1/admin-api/orders/${orderId}/transition`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          target_status: toStatus,
          expected_version: expectedVersion,
          reason: reason || `Transition to ${toStatus}`,
        }),
      }),
      { pool, supabaseAdmin }
    )
    return { status: res.status, body: await res.json() }
  }

  describe('1. Individual Order Payment Recording & Idempotency', () => {
    it('records cash payment on delivery order and prevents duplicate events via Idempotency-Key', async () => {
      const order = await createDeliveryOrder()

      // Confirm order first
      const conf = await transitionOrder(order.id, 'confirmed', order.version)
      expect(conf.status).toBe(200)

      const idemKey = `pay_deliv_idem_${Date.now()}`
      const payReq = new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: conf.body.data.version,
          event: 'paid',
          method: 'cash',
          amount_vnd: order.total_vnd,
        }),
      })

      const payRes1 = await handleAdminApi(payReq, { pool, supabaseAdmin })
      expect(payRes1.status).toBe(200)
      const payBody1 = await payRes1.json()
      expect(payBody1.data.payment_status).toBe('paid')
      expect(payBody1.data.payment_method).toBe('cash')

      // Second identical request with same Idempotency-Key returns cached response
      const payReq2 = new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
          'X-Forwarded-For': '192.168.1.1',
        },
        body: JSON.stringify({
          expected_version: conf.body.data.version,
          event: 'paid',
          method: 'cash',
          amount_vnd: order.total_vnd,
        }),
      })
      const payRes2 = await handleAdminApi(payReq2, { pool, supabaseAdmin })
      expect(payRes2.status).toBe(200)
      const payBody2 = await payRes2.json()
      expect(payBody2.data.payment_status).toBe('paid')

      // Verify in DB that only 1 payment event was inserted
      const { rows } = await pool.query(
        'SELECT * FROM public.order_payment_events WHERE order_id = $1',
        [order.id]
      )
      expect(rows.length).toBe(1)
      expect(rows[0].event).toBe('paid')
      expect(rows[0].method).toBe('cash')
      expect(Number(rows[0].amount_vnd)).toBe(order.total_vnd)

      // Transition order to delivering, then completed (succeeds because it is paid)
      // Note: payment increments version
      const { rows: postPayRows } = await pool.query('SELECT version FROM public.orders WHERE id = $1', [order.id])
      const prep = await transitionOrder(order.id, 'preparing', postPayRows[0].version)
      expect(prep.status).toBe(200)
      const deliv = await transitionOrder(order.id, 'delivering', prep.body.data.version)
      expect(deliv.status).toBe(200)

      // Fetch latest order version after payment was recorded
      const comp = await transitionOrder(order.id, 'completed', deliv.body.data.version)
      expect(comp.status).toBe(200)
      expect(comp.body.data.status).toBe('completed')
    })

    it('rejects completing an unpaid order with PAYMENT_REQUIRED', async () => {
      const order = await createDeliveryOrder()
      const conf = await transitionOrder(order.id, 'confirmed', order.version)
      expect(conf.status).toBe(200)
      const prep = await transitionOrder(order.id, 'preparing', conf.body.data.version)
      expect(prep.status).toBe(200)
      const deliv = await transitionOrder(order.id, 'delivering', prep.body.data.version)
      expect(deliv.status).toBe(200)

      // Try to complete without paying
      const comp = await transitionOrder(order.id, 'completed', deliv.body.data.version)
      expect(comp.status).toBe(409)
      expect(comp.body.error.code).toBe('PAYMENT_REQUIRED')
    })
  })

  describe('2. Paid Cancellation Guard & Refund Lifecycle', () => {
    it('blocks cancelling or rejecting a paid order until refund is recorded (PAID_ORDER_NOT_REFUNDED)', async () => {
      const order = await createDeliveryOrder()
      const conf = await transitionOrder(order.id, 'confirmed', order.version)
      expect(conf.status).toBe(200)

      // Pay order
      const payRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: conf.body.data.version,
            event: 'paid',
            method: 'bank_transfer',
            amount_vnd: order.total_vnd,
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(payRes.status).toBe(200)

      // Attempt to cancel paid order -> blocked!
      const { rows: paidRows } = await pool.query('SELECT version FROM public.orders WHERE id = $1', [order.id])
      const cancelRes = await transitionOrder(
        order.id,
        'cancelled',
        paidRows[0].version,
        'Khách đổi ý muốn hủy'
      )
      expect(cancelRes.status).toBe(409)
      expect(cancelRes.body.error.code).toBe('PAID_ORDER_NOT_REFUNDED')

      // Record refund with reason
      const refundRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: paidRows[0].version,
            event: 'refunded',
            amount_vnd: order.total_vnd,
            reason: 'Hoàn tiền cho khách do hủy đơn',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(refundRes.status).toBe(200)
      const refundBody = await refundRes.json()
      expect(refundBody.data.payment_status).toBe('refunded')

      // Now cancellation succeeds
      const { rows: refundedRows } = await pool.query('SELECT version FROM public.orders WHERE id = $1', [order.id])
      const cancelRes2 = await transitionOrder(
        order.id,
        'cancelled',
        refundedRows[0].version,
        'Hủy đơn sau khi đã hoàn tiền'
      )
      expect(cancelRes2.status).toBe(200)
      expect(cancelRes2.body.data.status).toBe('cancelled')

      // Check payment events ledger: contains both paid and refunded events
      const { rows } = await pool.query(
        'SELECT event, amount_vnd, reason FROM public.order_payment_events WHERE order_id = $1 ORDER BY created_at ASC',
        [order.id]
      )
      expect(rows.length).toBe(2)
      expect(rows[0].event).toBe('paid')
      expect(rows[1].event).toBe('refunded')
      expect(rows[1].reason).toBe('Hoàn tiền cho khách do hủy đơn')
    })
  })

  describe('3. Payment Correction (Mistaken Payment Adjustment)', () => {
    it('allows correcting paid status back to unpaid with mandatory reason and audit entry', async () => {
      const order = await createDeliveryOrder()
      const conf = await transitionOrder(order.id, 'confirmed', order.version)
      expect(conf.status).toBe(200)

      // Mistakenly record paid
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: conf.body.data.version,
            event: 'paid',
            method: 'cash',
            amount_vnd: order.total_vnd,
          }),
        }),
        { pool, supabaseAdmin }
      )

      // Correct it back to unpaid
      const { rows: paidRows } = await pool.query('SELECT version FROM public.orders WHERE id = $1', [order.id])
      const correctRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: paidRows[0].version,
            event: 'corrected',
            reason: 'Bấm nhầm thu tiền mặt khi khách chưa trả',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(correctRes.status).toBe(200)
      const correctBody = await correctRes.json()
      expect(correctBody.data.payment_status).toBe('unpaid')
      expect(correctBody.data.payment_method).toBeNull()

      // Order in DB has payment_status='unpaid'
      const { rows: orderRows } = await pool.query(
        'SELECT payment_status, payment_method, paid_at FROM public.orders WHERE id = $1',
        [order.id]
      )
      expect(orderRows[0].payment_status).toBe('unpaid')
      expect(orderRows[0].payment_method).toBeNull()
      expect(orderRows[0].paid_at).toBeNull()

      // Ledger preserves history: 'paid' then 'corrected'
      const { rows: eventRows } = await pool.query(
        'SELECT event, reason FROM public.order_payment_events WHERE order_id = $1 ORDER BY created_at ASC',
        [order.id]
      )
      expect(eventRows.length).toBe(2)
      expect(eventRows[0].event).toBe('paid')
      expect(eventRows[1].event).toBe('corrected')
      expect(eventRows[1].reason).toBe('Bấm nhầm thu tiền mặt khi khách chưa trả')
    })
  })

  describe('4. Dine-In Visit Settlement & Concurrency Protection', () => {
    it('settles all orders in visit atomically and rejects with ORDER_LIST_MISMATCH if concurrent order placed', async () => {
      // Create Round 1 order
      const order1 = await createDineInOrder('Đợt 1')
      const conf1 = await transitionOrder(order1.id, 'confirmed', order1.version)
      expect(conf1.status).toBe(200)
      const prep1 = await transitionOrder(order1.id, 'preparing', conf1.body.data.version)
      expect(prep1.status).toBe(200)
      const served1 = await transitionOrder(order1.id, 'served', prep1.body.data.version)
      expect(served1.status).toBe(200)

      // Create Round 2 order
      const order2 = await createDineInOrder('Đợt 2')
      const conf2 = await transitionOrder(order2.id, 'confirmed', order2.version)
      expect(conf2.status).toBe(200)
      const prep2 = await transitionOrder(order2.id, 'preparing', conf2.body.data.version)
      expect(prep2.status).toBe(200)
      const served2 = await transitionOrder(order2.id, 'served', prep2.body.data.version)
      expect(served2.status).toBe(200)

      // Query visit details via admin-api
      const visitRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'X-Forwarded-For': '192.168.1.1',
          },
        }),
        { pool, supabaseAdmin }
      )
      expect(visitRes.status).toBe(200)
      const visitData = await visitRes.json()
      expect(visitData.data.unpaid_summary.unpaid_orders_count).toBe(2)
      expect(visitData.data.unpaid_summary.unpaid_total_vnd).toBe(order1.total_vnd + order2.total_vnd)

      // Test Concurrency / Mismatch Protection:
      // If admin settles expecting ONLY order1, the database must reject with ORDER_LIST_MISMATCH
      const mismatchRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}/settle`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: visitData.data.visit.version,
            expected_orders: [
              { id: order1.id, version: served1.body.data.version },
            ],
            payment_method: 'cash',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(mismatchRes.status).toBe(400)
      const mismatchBody = await mismatchRes.json()
      expect(mismatchBody.error.code).toBe('ORDER_LIST_MISMATCH')

      // Now settle both orders correctly with Idempotency-Key
      const settleIdemKey = `settle_visit_${Date.now()}`
      const settleRes1 = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}/settle`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': settleIdemKey,
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: visitData.data.visit.version,
            expected_orders: [
              { id: order1.id, version: served1.body.data.version },
              { id: order2.id, version: served2.body.data.version },
            ],
            payment_method: 'bank_transfer',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(settleRes1.status).toBe(200)
      const settleBody1 = await settleRes1.json()
      expect(settleBody1.data.settled_orders_count).toBe(2)
      expect(settleBody1.data.total_amount_vnd).toBe(order1.total_vnd + order2.total_vnd)
      expect(settleBody1.data.batch_id).toBeDefined()

      // Retry with same Idempotency-Key -> returns same result without duplicating events
      const settleRes2 = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}/settle`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': settleIdemKey,
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: visitData.data.visit.version,
            expected_orders: [
              { id: order1.id, version: served1.body.data.version },
              { id: order2.id, version: served2.body.data.version },
            ],
            payment_method: 'bank_transfer',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(settleRes2.status).toBe(200)
      const settleBody2 = await settleRes2.json()
      expect(settleBody2.data.batch_id).toBe(settleBody1.data.batch_id)

      // Both orders are now marked paid with bank_transfer
      const { rows: checkOrders } = await pool.query(
        'SELECT id, payment_status, payment_method, version FROM public.orders WHERE id IN ($1, $2)',
        [order1.id, order2.id]
      )
      expect(checkOrders.every((r) => r.payment_status === 'paid')).toBe(true)
      expect(checkOrders.every((r) => r.payment_method === 'bank_transfer')).toBe(true)

      // Both orders can now be completed
      const order1Row = checkOrders.find((r) => r.id === order1.id)!
      const order2Row = checkOrders.find((r) => r.id === order2.id)!
      const comp1 = await transitionOrder(order1.id, 'completed', order1Row.version)
      expect(comp1.status).toBe(200)
      const comp2 = await transitionOrder(order2.id, 'completed', order2Row.version)
      expect(comp2.status).toBe(200)
    })
  })

  describe('5. Visit Closure Lifecycle & Capability Revocation', () => {
    it('blocks closing visit when orders are not terminal (VISIT_HAS_ACTIVE_ORDERS)', async () => {
      // Create an active order in visit
      const order = await createDineInOrder('Chưa hoàn tất')
      const conf = await transitionOrder(order.id, 'confirmed', order.version)
      expect(conf.status).toBe(200)

      // Query current visit version
      const { rows: vRows } = await pool.query('SELECT version FROM public.table_visits WHERE id = $1', [testVisitId])
      const visitVersion = vRows[0].version

      // Try closing visit -> blocked!
      const closeRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}/close`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({ expected_version: visitVersion }),
        }),
        { pool, supabaseAdmin }
      )
      expect(closeRes.status).toBe(409)
      const closeBody = await closeRes.json()
      expect(closeBody.error.code).toBe('VISIT_HAS_ACTIVE_ORDERS')

      // Settle and complete this order so the visit can be closed
      const prep = await transitionOrder(order.id, 'preparing', conf.body.data.version)
      expect(prep.status).toBe(200)
      const served = await transitionOrder(order.id, 'served', prep.body.data.version)
      expect(served.status).toBe(200)

      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({
            expected_version: served.body.data.version,
            event: 'paid',
            method: 'cash',
            amount_vnd: order.total_vnd,
          }),
        }),
        { pool, supabaseAdmin }
      )
      const { rows: oRows } = await pool.query('SELECT version FROM public.orders WHERE id = $1', [order.id])
      const comp = await transitionOrder(order.id, 'completed', oRows[0].version)
      expect(comp.status).toBe(200)
    })

    it('closes visit and increments capability_epoch, invalidating customer QR capability', async () => {
      // Get current visit version
      const { rows: visitRowsBefore } = await pool.query(
        'SELECT version, capability_epoch FROM public.table_visits WHERE id = $1',
        [testVisitId]
      )
      const currentVersion = visitRowsBefore[0].version
      const epochBefore = visitRowsBefore[0].capability_epoch

      // Close visit
      const closeRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/visits/${testVisitId}/close`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.1',
          },
          body: JSON.stringify({ expected_version: currentVersion }),
        }),
        { pool, supabaseAdmin }
      )
      expect(closeRes.status).toBe(200)
      const closeBody = await closeRes.json()
      expect(closeBody.data.status).toBe('closed')
      expect(closeBody.data.closed_at).not.toBeNull()

      // Verify capability_epoch was incremented in DB
      const { rows: visitRowsAfter } = await pool.query(
        'SELECT status, closed_at, capability_epoch FROM public.table_visits WHERE id = $1',
        [testVisitId]
      )
      expect(visitRowsAfter[0].status).toBe('closed')
      expect(visitRowsAfter[0].capability_epoch).toBe(epochBefore + 1)

      // Customer tries to create order with previous testCapability -> rejected because visit is closed / capability invalid!
      const quoteRes = await handlePublicApi(
        new Request('http://localhost:54321/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.100',
          },
          body: JSON.stringify({
            order_type: 'dine_in',
            visit_capability: testCapability,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        }),
        { pool, supabaseAdmin }
      )
      // Because visit is closed, capability verification or table active visit check fails (VISIT_CLOSED 409 or invalid capability)
      expect([400, 403, 409]).toContain(quoteRes.status)
    })
  })
})
