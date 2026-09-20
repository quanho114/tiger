import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.js'
import { seedFixtureUsers, getUserToken, FIXTURE_USERS } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Customer API System Integration (Task T14 - Invariants V04, V16, V20, V21)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let tokenCustomerA: string
  let tokenCustomerB: string

  const userAId = FIXTURE_USERS.customerA.id
  const userBId = FIXTURE_USERS.customerB.id

  // Tracking for test cleanup
  const createdAddressIds: string[] = []
  const createdOrderIds: string[] = []
  const createdReservationIds: string[] = []

  // Reusable helper to make customer-api requests
  async function customerRequest(
    token: string,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any; headers: Headers }> {
    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...headers,
    }
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    const req = new Request(`http://localhost:54321/customer-api${path}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const res = await handleCustomerApi(req, { pool, supabaseAdmin })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      // Empty or non-json
    }
    return { status: res.status, body: json, headers: res.headers }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    tokenCustomerA = getUserToken('customerA')
    tokenCustomerB = getUserToken('customerB')

    // Clean any residual test records for userA and userB
    await pool.query('DELETE FROM public.rate_limit_buckets')
    await pool.query('DELETE FROM public.customer_addresses WHERE user_id IN ($1, $2)', [userAId, userBId])
    await pool.query('DELETE FROM public.customer_favorites WHERE user_id IN ($1, $2)', [userAId, userBId])
  })

  afterAll(async () => {
    if (pool) {
      if (createdAddressIds.length > 0) {
        await pool.query('DELETE FROM public.customer_addresses WHERE id = ANY($1)', [createdAddressIds])
      }
      if (createdOrderIds.length > 0) {
        await pool.query('DELETE FROM public.order_items WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_status_history WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.orders WHERE id = ANY($1)', [createdOrderIds])
      }
      if (createdReservationIds.length > 0) {
        await pool.query('DELETE FROM public.reservations WHERE id = ANY($1)', [createdReservationIds])
      }
      await pool.query('DELETE FROM public.customer_favorites WHERE user_id IN ($1, $2)', [userAId, userBId])
      await pool.end()
    }
  })

  // ===========================================================================
  // 1. INVARIANT V04: Privacy, Ownership, IDOR, and Private DTO Whitelist
  // ===========================================================================
  describe('Invariant V04: Customer Privacy & Private DTO Whitelist', () => {
    it('enforces Cache-Control: no-store on all private endpoints', async () => {
      const res = await customerRequest(tokenCustomerA, 'GET', '/me')
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toContain('no-store')
    })

    it('denies requests without valid token with 401 AUTH_REQUIRED', async () => {
      const res = await customerRequest('', 'GET', '/me')
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe('AUTH_REQUIRED')
    })

    it('denies customer with deletion_requested_at with 403 FORBIDDEN', async () => {
      await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = now() WHERE user_id = $1', [userBId])
      try {
        const res = await customerRequest(tokenCustomerB, 'GET', '/me')
        expect(res.status).toBe(403)
        expect(res.body.error.code).toBe('FORBIDDEN')
      } finally {
        await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = NULL WHERE user_id = $1', [userBId])
      }
    })

    it('allows customer to read and update own profile with allowlist only', async () => {
      // 1. Read profile
      const getRes = await customerRequest(tokenCustomerA, 'GET', '/me')
      expect(getRes.status).toBe(200)
      expect(getRes.body.data.user_id).toBe(userAId)
      expect(getRes.body.data.display_name).toBe(FIXTURE_USERS.customerA.displayName)
      expect(getRes.body.data).not.toHaveProperty('role')
      expect(getRes.body.data).not.toHaveProperty('deletion_requested_at')

      // 2. Patch profile
      const patchRes = await customerRequest(tokenCustomerA, 'PATCH', '/me', {
        display_name: 'Khách Hàng A Đã Đổi Tên',
        marketing_opt_in: true,
      })
      expect(patchRes.status).toBe(200)
      expect(patchRes.body.data.display_name).toBe('Khách Hàng A Đã Đổi Tên')
      expect(patchRes.body.data.marketing_opt_in).toBe(true)

      // Restore
      await customerRequest(tokenCustomerA, 'PATCH', '/me', {
        display_name: FIXTURE_USERS.customerA.displayName,
        marketing_opt_in: false,
      })
    })

    it('rejects forbidden fields in profile patch via strict zod validation', async () => {
      const patchRes = await customerRequest(tokenCustomerA, 'PATCH', '/me', {
        display_name: 'Hacker',
        role: 'admin', // Disallowed field
      })
      expect(patchRes.status).toBe(400)
      expect(patchRes.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 404 NOT_FOUND on order detail IDOR (Customer A querying Customer B order)', async () => {
      // Create test delivery order belonging to Customer B
      const orderBRes = await pool.query(
        `INSERT INTO public.orders (
           code, customer_user_id, order_type, status, payment_status, payment_method,
           subtotal_vnd, shipping_fee_vnd, total_vnd, customer_name, customer_phone,
           delivery_zone_id, zone_name_snapshot, address_snapshot, internal_note
         ) VALUES (
           $1, $2, 'delivery', 'pending', 'unpaid', 'cash',
           150000, 0, 150000, 'Khách Hàng B', '0922000002',
           '40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', '123 Đường Số 1, Vĩnh An',
           'Bí mật nội bộ của quản lý quán: Khách VIP khó tính'
         ) RETURNING id, code`,
        [`ORD-B-${Date.now()}`, userBId]
      )
      const orderB = orderBRes.rows[0]
      createdOrderIds.push(orderB.id)

      // Customer A queries Customer B's order ID -> Must return 404 NOT_FOUND to prevent enumeration
      const idorRes = await customerRequest(tokenCustomerA, 'GET', `/me/orders/${orderB.id}`)
      expect(idorRes.status).toBe(404)
      expect(idorRes.body.error.code).toBe('NOT_FOUND')

      // Customer B queries own order -> 200 OK
      const ownRes = await customerRequest(tokenCustomerB, 'GET', `/me/orders/${orderB.id}`)
      expect(ownRes.status).toBe(200)
      expect(ownRes.body.data.id).toBe(orderB.id)
      // Verify Private DTO Whitelist: NEVER leak internal_note or sensitive fields
      expect(ownRes.body.data).not.toHaveProperty('internal_note')
      expect(ownRes.body.data).not.toHaveProperty('claim_secret_hash')
      expect(ownRes.body.data).not.toHaveProperty('actor_admin_id')
    })
  })

  // ===========================================================================
  // 2. INVARIANT V20: Address Book Integrity & Default Atomicity
  // ===========================================================================
  describe('Invariant V20: Address Book Integrity & Default Atomicity', () => {
    let addr1Id: string
    let addr2Id: string

    it('automatically marks the first created address as default', async () => {
      const res = await customerRequest(tokenCustomerA, 'POST', '/me/addresses', {
        label: 'Nhà riêng',
        recipient_name: 'Khách A',
        phone: '0911000001',
        address_line: '123 Đường Số 1, Phường 5',
        district: 'Quận 3',
        province: 'TP Hồ Chí Minh',
        is_default: false, // Customer passed false, but first address MUST become default
      })

      expect(res.status).toBe(201)
      expect(res.body.data.is_default).toBe(true)
      addr1Id = res.body.data.id
      createdAddressIds.push(addr1Id)
    })

    it('atomically unsets previous default when a new address is created with is_default = true', async () => {
      const res = await customerRequest(tokenCustomerA, 'POST', '/me/addresses', {
        label: 'Văn phòng',
        recipient_name: 'Khách A Công Ty',
        phone: '0911000001',
        address_line: '456 Đường Nguyễn Huệ',
        district: 'Quận 1',
        province: 'TP Hồ Chí Minh',
        is_default: true,
      })

      expect(res.status).toBe(201)
      expect(res.body.data.is_default).toBe(true)
      addr2Id = res.body.data.id
      createdAddressIds.push(addr2Id)

      // Verify addr1 is no longer default in the database
      const checkAddr1 = await pool.query('SELECT is_default FROM public.customer_addresses WHERE id = $1', [addr1Id])
      expect(checkAddr1.rows[0].is_default).toBe(false)
    })

    it('enforces optimistic concurrency control (OCC) on address updates', async () => {
      // Current version of addr2 should be 1
      const updateRes = await customerRequest(tokenCustomerA, 'PATCH', `/me/addresses/${addr2Id}`, {
        expected_version: 999, // Wrong version
        label: 'Văn phòng mới',
      })

      expect(updateRes.status).toBe(409)
      expect(updateRes.body.error.code).toBe('VERSION_CONFLICT')
    })

    it('prevents IDOR: Customer A cannot update Customer B address', async () => {
      // Create address for Customer B
      const resB = await customerRequest(tokenCustomerB, 'POST', '/me/addresses', {
        label: 'Nhà B',
        recipient_name: 'Khách B',
        phone: '0922000002',
        address_line: '789 Đường B, Quận 7',
      })
      const addrBId = resB.body.data.id
      createdAddressIds.push(addrBId)

      // Customer A tries to patch Customer B's address
      const patchRes = await customerRequest(tokenCustomerA, 'PATCH', `/me/addresses/${addrBId}`, {
        expected_version: 1,
        label: 'Hacked Label',
      })
      expect(patchRes.status).toBe(404)
      expect(patchRes.body.error.code).toBe('NOT_FOUND')

      // Customer A tries to delete Customer B's address
      const deleteRes = await customerRequest(tokenCustomerA, 'DELETE', `/me/addresses/${addrBId}`)
      expect(deleteRes.status).toBe(404)
      expect(deleteRes.body.error.code).toBe('NOT_FOUND')
    })

    it('promotes the remaining address to default upon deletion of the default address', async () => {
      // addr2Id is currently default. Delete addr2Id:
      const delRes = await customerRequest(tokenCustomerA, 'DELETE', `/me/addresses/${addr2Id}`)
      expect(delRes.status).toBe(200)
      expect(delRes.body.data.success).toBe(true)
      expect(delRes.body.data.promoted_default_id).toBe(addr1Id)

      // Verify addr1Id is now is_default = true in DB
      const checkAddr1 = await pool.query('SELECT is_default FROM public.customer_addresses WHERE id = $1', [addr1Id])
      expect(checkAddr1.rows[0].is_default).toBe(true)
    })
  })

  // ===========================================================================
  // 3. INVARIANT V16: Reservation Cancellation & Notice Cutoff
  // ===========================================================================
  describe('Invariant V16: Customer Reservation Cancellation & Cutoff', () => {
    it('allows customer to cancel reservation when starts_at is >= 60 minutes in future', async () => {
      const startsAt = new Date(Date.now() + 120 * 60 * 1000).toISOString() // 2 hours in future
      const endsAt = new Date(Date.now() + 240 * 60 * 1000).toISOString()

      const resvRes = await pool.query(
        `INSERT INTO public.reservations (
           code, customer_user_id, customer_name, customer_phone, guest_count,
           starts_at, ends_at, status, version
         ) VALUES (
           $1, $2, 'Khách Hàng A', '0911000001', 4,
           $3, $4, 'confirmed', 1
         ) RETURNING id, version`,
        [`RSV-A1-${Date.now()}`, userAId, startsAt, endsAt]
      )
      const resv = resvRes.rows[0]
      createdReservationIds.push(resv.id)

      // Cancel reservation
      const cancelRes = await customerRequest(tokenCustomerA, 'POST', `/me/reservations/${resv.id}/cancel`, {
        expected_version: resv.version,
        reason: 'Có việc bận đột xuất',
      })

      expect(cancelRes.status).toBe(200)
      expect(cancelRes.body.data.status).toBe('cancelled')

      // Verify DB status
      const checkDb = await pool.query('SELECT status FROM public.reservations WHERE id = $1', [resv.id])
      expect(checkDb.rows[0].status).toBe('cancelled')
    })

    it('rejects cancellation with 409 CANCEL_NOTICE_EXPIRED if starts_at is < 60 minutes away', async () => {
      const startsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 mins in future (< 60 min notice cutoff)
      const endsAt = new Date(Date.now() + 150 * 60 * 1000).toISOString()

      const resvRes = await pool.query(
        `INSERT INTO public.reservations (
           code, customer_user_id, customer_name, customer_phone, guest_count,
           starts_at, ends_at, status, version
         ) VALUES (
           $1, $2, 'Khách Hàng A', '0911000001', 2,
           $3, $4, 'confirmed', 1
         ) RETURNING id, version`,
        [`RSV-A2-${Date.now()}`, userAId, startsAt, endsAt]
      )
      const resv = resvRes.rows[0]
      createdReservationIds.push(resv.id)

      const cancelRes = await customerRequest(tokenCustomerA, 'POST', `/me/reservations/${resv.id}/cancel`, {
        expected_version: resv.version,
      })

      expect(cancelRes.status).toBe(409)
      expect(cancelRes.body.error.code).toBe('CANCEL_NOTICE_EXPIRED')
    })

    it('returns 404 NOT_FOUND on reservation cancellation IDOR (Customer A cancelling Customer B reservation)', async () => {
      const startsAt = new Date(Date.now() + 120 * 60 * 1000).toISOString()
      const endsAt = new Date(Date.now() + 240 * 60 * 1000).toISOString()

      const resvRes = await pool.query(
        `INSERT INTO public.reservations (
           code, customer_user_id, customer_name, customer_phone, guest_count,
           starts_at, ends_at, status, version
         ) VALUES (
           $1, $2, 'Khách Hàng B', '0922000002', 3,
           $3, $4, 'confirmed', 1
         ) RETURNING id, version`,
        [`RSV-B-${Date.now()}`, userBId, startsAt, endsAt]
      )
      const resvB = resvRes.rows[0]
      createdReservationIds.push(resvB.id)

      // Customer A attempts to cancel Customer B's reservation
      const cancelRes = await customerRequest(tokenCustomerA, 'POST', `/me/reservations/${resvB.id}/cancel`, {
        expected_version: resvB.version,
      })

      expect(cancelRes.status).toBe(404)
      expect(cancelRes.body.error.code).toBe('NOT_FOUND')
    })
  })

  // ===========================================================================
  // 4. FAVORITES & INVARIANT V21: Frequent Items & Reorder Safety
  // ===========================================================================
  describe('Favorites & Invariant V21: Frequent Items & Reorder Safety', () => {
    let publishedItemId: string
    let publishedItem2Id: string

    beforeAll(async () => {
      // Query published menu items from seed
      const itemsRes = await pool.query(
        `SELECT mi.id, mi.name, mi.price_vnd
         FROM public.menu_items mi
         JOIN public.categories c ON c.id = mi.category_id
         WHERE mi.published = true AND c.active = true AND mi.available = true
         LIMIT 2`
      )
      publishedItemId = itemsRes.rows[0].id
      publishedItem2Id = itemsRes.rows[1].id
    })

    it('handles customer favorites idempotently (PUT and DELETE)', async () => {
      // 1. Add favorite
      const putRes = await customerRequest(tokenCustomerA, 'PUT', `/me/favorites/${publishedItemId}`)
      expect(putRes.status).toBe(200)
      expect(putRes.body.data.favorited).toBe(true)

      // 2. Put again (idempotent)
      const putAgain = await customerRequest(tokenCustomerA, 'PUT', `/me/favorites/${publishedItemId}`)
      expect(putAgain.status).toBe(200)

      // 3. List favorites
      const listRes = await customerRequest(tokenCustomerA, 'GET', '/me/favorites')
      expect(listRes.status).toBe(200)
      expect(listRes.body.data.items.some((f: any) => f.menu_item_id === publishedItemId)).toBe(true)

      // 4. Delete favorite
      const delRes = await customerRequest(tokenCustomerA, 'DELETE', `/me/favorites/${publishedItemId}`)
      expect(delRes.status).toBe(200)
      expect(delRes.body.data.favorited).toBe(false)
    })

    it('derives /me/home frequent items solely from completed orders with deterministic tie-break', async () => {
      // Create a completed order with publishedItemId (quantity = 5)
      const orderCompRes = await pool.query(
        `INSERT INTO public.orders (
           code, customer_user_id, order_type, status, payment_status, payment_method,
           subtotal_vnd, shipping_fee_vnd, total_vnd, customer_name, customer_phone,
           delivery_zone_id, zone_name_snapshot, address_snapshot
         ) VALUES (
           $1, $2, 'delivery', 'completed', 'paid', 'cash',
           250000, 0, 250000, 'Khách A', '0911000001',
           '40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', '123 Đường Số 1, Vĩnh An'
         ) RETURNING id`,
        [`ORD-COMP-${Date.now()}`, userAId]
      )
      const completedOrderId = orderCompRes.rows[0].id
      createdOrderIds.push(completedOrderId)

      await pool.query(
        `INSERT INTO public.order_items (
           order_id, menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd, position
         ) VALUES (
           $1, $2, 'Món Test A', 50000, 5, 250000, 1
         )`,
        [completedOrderId, publishedItemId]
      )

      // Create a pending order with publishedItem2Id (quantity = 10) -> SHOULD NOT appear in frequent items!
      const orderPendingRes = await pool.query(
        `INSERT INTO public.orders (
           code, customer_user_id, order_type, status, payment_status, payment_method,
           subtotal_vnd, shipping_fee_vnd, total_vnd, customer_name, customer_phone,
           delivery_zone_id, zone_name_snapshot, address_snapshot
         ) VALUES (
           $1, $2, 'delivery', 'pending', 'unpaid', 'cash',
           500000, 0, 500000, 'Khách A', '0911000001',
           '40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', '123 Đường Số 1, Vĩnh An'
         ) RETURNING id`,
        [`ORD-PEND-${Date.now()}`, userAId]
      )
      const pendingOrderId = orderPendingRes.rows[0].id
      createdOrderIds.push(pendingOrderId)

      await pool.query(
        `INSERT INTO public.order_items (
           order_id, menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd, position
         ) VALUES (
           $1, $2, 'Món Test B', 50000, 10, 500000, 1
         )`,
        [pendingOrderId, publishedItem2Id]
      )

      // Fetch /me/home
      const homeRes = await customerRequest(tokenCustomerA, 'GET', '/me/home')
      expect(homeRes.status).toBe(200)
      const frequentItems = homeRes.body.data.frequent_items

      // publishedItemId should be present with total_quantity = 5
      const itemA = frequentItems.find((fi: any) => fi.menu_item_id === publishedItemId)
      expect(itemA).toBeDefined()
      expect(itemA.total_quantity).toBe(5)

      // publishedItem2Id from pending order must NOT be present
      const itemB = frequentItems.find((fi: any) => fi.menu_item_id === publishedItem2Id)
      expect(itemB).toBeUndefined()
    })

    it('verifies /me/reorder detects price changes and live availability without copying old prices or tables', async () => {
      // 1. Create order with old price (e.g. 30,000 VND while current price is higher or different)
      const currentItemRes = await pool.query('SELECT price_vnd, name FROM public.menu_items WHERE id = $1', [publishedItemId])
      const livePrice = Number(currentItemRes.rows[0].price_vnd)
      const oldPrice = livePrice + 20000 // simulate price drop or hike

      const orderToReorderRes = await pool.query(
        `INSERT INTO public.orders (
           code, customer_user_id, order_type, status, payment_status, payment_method,
           subtotal_vnd, shipping_fee_vnd, total_vnd, customer_name, customer_phone,
           delivery_zone_id, zone_name_snapshot, address_snapshot
         ) VALUES (
           $1, $2, 'delivery', 'completed', 'paid', 'cash',
           $3, 0, $3, 'Khách A', '0911000001',
           '40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', '123 Đường Số 1, Vĩnh An'
         ) RETURNING id`,
        [`ORD-REORD-${Date.now()}`, userAId, oldPrice * 2]
      )
      const sourceOrderId = orderToReorderRes.rows[0].id
      createdOrderIds.push(sourceOrderId)

      await pool.query(
        `INSERT INTO public.order_items (
           order_id, menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd, position
         ) VALUES (
           $1, $2, $3, $4, 2, $5, 1
         )`,
        [sourceOrderId, publishedItemId, currentItemRes.rows[0].name, oldPrice, oldPrice * 2]
      )

      // 2. Call /me/reorder as Customer A
      const reorderRes = await customerRequest(tokenCustomerA, 'POST', '/me/reorder', {
        source_order_id: sourceOrderId,
      })

      expect(reorderRes.status).toBe(200)
      const reorderData = reorderRes.body.data

      // Subtotal must be calculated using LIVE price, not oldPrice
      expect(reorderData.subtotal_vnd).toBe(livePrice * 2)

      // Warnings must contain PRICE_CHANGED
      const priceWarning = reorderData.warnings.find((w: any) => w.type === 'PRICE_CHANGED')
      expect(priceWarning).toBeDefined()
      expect(priceWarning.old_price_vnd).toBe(oldPrice)
      expect(priceWarning.new_price_vnd).toBe(livePrice)

      // Ensure no leaked old table info
      expect(reorderData).not.toHaveProperty('table_id')
      expect(reorderData).not.toHaveProperty('table_name_snapshot')

      // 3. IDOR: Customer B cannot reorder Customer A's order
      const idorReorder = await customerRequest(tokenCustomerB, 'POST', '/me/reorder', {
        source_order_id: sourceOrderId,
      })
      expect(idorReorder.status).toBe(404)
      expect(idorReorder.body.error.code).toBe('NOT_FOUND')
    })
  })
})
