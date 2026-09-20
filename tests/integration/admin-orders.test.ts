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

describe('Admin Queue, Orders, Tables & Transitions Integration (Task T08, Invariants V11, V24)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  let customerToken: string
  let disabledAdminToken: string

  const createdTableIds: string[] = []
  const createdOrderIds: string[] = []

  let testTableId: string
  let _testVisitId: string
  let testCapability: string

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng (245,000)

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
    customerToken = getUserToken('customerA')
    disabledAdminToken = getUserToken('disabledAdmin')

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
          code: `T_ADM_${Date.now().toString().slice(-4)}`,
          name: 'Bàn Test Admin',
          sort_order: 999,
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
    _testVisitId = visitData.data.id

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

  // Helper to create an order via public-api
  async function createTestDineInOrder(note = ''): Promise<{ id: string; code: string; version: number }> {
    const randomIp = `10.99.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200) + 1}`
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

    const idemKey = `idem_admin_${Date.now()}_${Math.random()}`
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
    const orderJson = await orderRes.json()
    if (!orderRes.ok) {
      throw new Error(`Order creation failed: ${orderRes.status} ${JSON.stringify(orderJson)}`)
    }
    const order = orderJson.data
    createdOrderIds.push(order.id)
    return { id: order.id, code: order.code, version: 1 }
  }

  describe('1. Authentication & Role Boundaries', () => {
    it('rejects unauthenticated request with 401', async () => {
      const res = await handleAdminApi(
        new Request('http://localhost:54321/functions/v1/admin-api/dashboard', {
          method: 'GET',
        }),
        { pool, supabaseAdmin }
      )
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error.code).toBe('AUTH_REQUIRED')
    })

    it('rejects customer token with 403 FORBIDDEN', async () => {
      const res = await handleAdminApi(
        new Request('http://localhost:54321/functions/v1/admin-api/dashboard', {
          method: 'GET',
          headers: { Authorization: `Bearer ${customerToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('rejects disabled admin token with 403 FORBIDDEN', async () => {
      const res = await handleAdminApi(
        new Request('http://localhost:54321/functions/v1/admin-api/dashboard', {
          method: 'GET',
          headers: { Authorization: `Bearer ${disabledAdminToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error.code).toBe('FORBIDDEN')
    })

    it('accepts active admin token with 200 OK', async () => {
      const res = await handleAdminApi(
        new Request('http://localhost:54321/functions/v1/admin-api/dashboard', {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.pending_orders_count).toBeGreaterThanOrEqual(0)
      expect(data.data.active_tables_count).toBeGreaterThanOrEqual(1)
    })
  })

  describe('2. State Machine Transitions & Concurrency (V11)', () => {
    it('successfully progresses dine-in order through pending -> confirmed -> preparing -> served', async () => {
      const order = await createTestDineInOrder('Dine in flow test')

      // pending -> confirmed
      const confirmRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: order.version,
            target_status: 'confirmed',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(confirmRes.status).toBe(200)
      const confirmData = await confirmRes.json()
      expect(confirmData.data.status).toBe('confirmed')
      expect(confirmData.data.version).toBe(order.version + 1)
      expect(confirmData.data.confirmed_at).toBeDefined()

      // confirmed -> preparing
      const preparingRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: confirmData.data.version,
            target_status: 'preparing',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(preparingRes.status).toBe(200)
      const preparingData = await preparingRes.json()
      expect(preparingData.data.status).toBe('preparing')
      expect(preparingData.data.version).toBe(confirmData.data.version + 1)

      // preparing -> served
      const servedRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: preparingData.data.version,
            target_status: 'served',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(servedRes.status).toBe(200)
      const servedData = await servedRes.json()
      expect(servedData.data.status).toBe('served')
    })

    it('rejects transitioning served dine-in order to completed when unpaid with 409 PAYMENT_REQUIRED', async () => {
      const order = await createTestDineInOrder('Payment required test')

      // Move to served
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 1, target_status: 'confirmed' }),
        }),
        { pool, supabaseAdmin }
      )
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 2, target_status: 'preparing' }),
        }),
        { pool, supabaseAdmin }
      )
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 3, target_status: 'served' }),
        }),
        { pool, supabaseAdmin }
      )

      // served -> completed should fail because payment_status is 'unpaid'
      const completeRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 4, target_status: 'completed' }),
        }),
        { pool, supabaseAdmin }
      )
      expect(completeRes.status).toBe(409)
      const completeData = await completeRes.json()
      expect(completeData.error.code).toBe('PAYMENT_REQUIRED')

      // Now simulate payment settlement directly
      await pool.query(
        `UPDATE public.orders SET payment_status = 'paid', paid_at = now() WHERE id = $1`,
        [order.id]
      )

      // Now served -> completed should succeed
      const paidCompleteRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 4, target_status: 'completed' }),
        }),
        { pool, supabaseAdmin }
      )
      expect(paidCompleteRes.status).toBe(200)
      const paidCompleteData = await paidCompleteRes.json()
      expect(paidCompleteData.data.status).toBe('completed')
      expect(paidCompleteData.data.completed_at).toBeDefined()

      // Terminal state check: completed order cannot transition further
      const terminalRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 5, target_status: 'cancelled' }),
        }),
        { pool, supabaseAdmin }
      )
      expect(terminalRes.status).toBe(409)
      const terminalData = await terminalRes.json()
      expect(terminalData.error.code).toBe('ORDER_TERMINAL')
    })

    it('rejects invalid state transitions according to order_type with 422', async () => {
      const order = await createTestDineInOrder('Invalid transition test')

      // pending cannot jump directly to served
      const invalidRes1 = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 1, target_status: 'served' }),
        }),
        { pool, supabaseAdmin }
      )
      expect(invalidRes1.status).toBe(422)
      const err1 = await invalidRes1.json()
      expect(err1.error.code).toBe('INVALID_TRANSITION')

      // Dine-in order cannot transition to delivering
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 1, target_status: 'confirmed' }),
        }),
        { pool, supabaseAdmin }
      )
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 2, target_status: 'preparing' }),
        }),
        { pool, supabaseAdmin }
      )

      const deliveringRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 3, target_status: 'delivering' }),
        }),
        { pool, supabaseAdmin }
      )
      expect(deliveringRes.status).toBe(422)
      const deliveringErr = await deliveringRes.json()
      expect(deliveringErr.error.code).toBe('INVALID_TRANSITION')
    })

    it('V11 Concurrency Race: two tabs transitioning same version -> one 200, one 409 VERSION_CONFLICT', async () => {
      const order = await createTestDineInOrder('Concurrent tabs race test')

      // Two concurrent transition requests from version 1
      const [res1, res2] = await Promise.all([
        handleAdminApi(
          new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({ expected_version: 1, target_status: 'confirmed' }),
          }),
          { pool, supabaseAdmin }
        ),
        handleAdminApi(
          new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
            body: JSON.stringify({
              expected_version: 1,
              target_status: 'rejected',
              reason: 'Bàn hết chỗ',
            }),
          }),
          { pool, supabaseAdmin }
        ),
      ])

      const statuses = [res1.status, res2.status].sort()
      expect(statuses).toEqual([200, 409])

      const conflictRes = res1.status === 409 ? res1 : res2
      const conflictData = await conflictRes.json()
      expect(conflictData.error.code).toBe('VERSION_CONFLICT')
    })
  })

  describe('3. Internal Notes & Optimistic Locking', () => {
    it('updates internal note and increments version', async () => {
      const order = await createTestDineInOrder('Internal note test')

      const noteRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            expected_version: order.version,
            internal_note: 'Khách yêu cầu làm nhanh, chuẩn bị đi sân bay',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(noteRes.status).toBe(200)
      const noteData = await noteRes.json()
      expect(noteData.data.internal_note).toBe('Khách yêu cầu làm nhanh, chuẩn bị đi sân bay')
      expect(noteData.data.version).toBe(order.version + 1)

      // Second update with stale version fails with 409
      const staleRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({
            expected_version: order.version, // stale version
            internal_note: 'Ghi chú ghi đè',
          }),
        }),
        { pool, supabaseAdmin }
      )
      expect(staleRes.status).toBe(409)
      const staleData = await staleRes.json()
      expect(staleData.error.code).toBe('VERSION_CONFLICT')
    })
  })

  describe('4. Orders Listing & Detail API', () => {
    it('returns full order detail with items and status timeline', async () => {
      const order = await createTestDineInOrder('Timeline detail test')

      // Transition once so status_history has entries
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}/transition`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ expected_version: 1, target_status: 'confirmed' }),
        }),
        { pool, supabaseAdmin }
      )

      const detailRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders/${order.id}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(detailRes.status).toBe(200)
      const detailData = await detailRes.json()
      expect(detailData.data.order.id).toBe(order.id)
      expect(detailData.data.order.status).toBe('confirmed')
      expect(detailData.data.items).toHaveLength(1)
      expect(detailData.data.items[0].menu_item_id).toBe(ITEM_1_ID)
      expect(detailData.data.status_history.length).toBeGreaterThanOrEqual(1)
      expect(detailData.data.status_history[0].actor_name).toBeDefined()
    })

    it('filters orders by order_type and status', async () => {
      const listRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/orders?order_type=dine_in&limit=10`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(listRes.status).toBe(200)
      const listData = await listRes.json()
      expect(Array.isArray(listData.data.items)).toBe(true)
      expect(listData.data.total).toBeGreaterThanOrEqual(1)
      for (const item of listData.data.items) {
        expect(item.order_type).toBe('dine_in')
      }
    })
  })

  describe('5. Settings & Menu Availability Toggles', () => {
    it('fetches and updates restaurant settings with audit log', async () => {
      const getRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/settings`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        { pool, supabaseAdmin }
      )
      expect(getRes.status).toBe(200)
      const getData = await getRes.json()
      expect(getData.data.accepting_orders).toBeDefined()

      const patchRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ accepting_delivery_orders: false }),
        }),
        { pool, supabaseAdmin }
      )
      expect(patchRes.status).toBe(200)
      const patchData = await patchRes.json()
      expect(patchData.data.accepting_delivery_orders).toBe(false)

      // Restore
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ accepting_delivery_orders: true }),
        }),
        { pool, supabaseAdmin }
      )
    })

    it('toggles menu item availability', async () => {
      const toggleRes = await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/menu-items/${ITEM_1_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ is_available: false }),
        }),
        { pool, supabaseAdmin }
      )
      expect(toggleRes.status).toBe(200)
      const toggleData = await toggleRes.json()
      expect(toggleData.data.is_available).toBe(false)

      // Restore
      await handleAdminApi(
        new Request(`http://localhost:54321/functions/v1/admin-api/menu-items/${ITEM_1_ID}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ is_available: true }),
        }),
        { pool, supabaseAdmin }
      )
    })
  })
})
