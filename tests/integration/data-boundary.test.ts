/**
 * Tiger 345 - Data Boundary & Sensitive Column Restrictions Integration Test Suite (F02 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * - Affected API:
 *   - PostgREST: GET /rest/v1/orders, GET /rest/v1/reservations, GET /rest/v1/order_status_history, GET /rest/v1/order_items
 *   - Supabase Edge Functions: GET /functions/v1/customer-api/customer/orders/:id
 * - Data Schemas:
 *   - public.orders (internal_note column restricted)
 *   - public.reservations (internal_note, contact_outcome, contacted_at columns restricted)
 *   - public.order_status_history (actor_admin_id, reason columns restricted)
 * - Verbatim Instructions:
 *   - "BƯỚC 5 — F02: DATA BOUNDARY & SENSITIVE COLUMNS"
 *   - "Kiểm tra toàn bộ privileges / policies trên orders, reservations, order_history."
 *   - "Khóa triệt để đường đọc direct PostgREST đối với internal_note, actor_admin_id, metadata nhạy cảm của nhân viên/hệ thống mà customer không được phép thấy."
 *   - "Tạo migration chuẩn hóa projection/grant hoặc RLS column security phù hợp."
 *   - "Viết integration test gửi request dạng REST table trực tiếp bằng customer JWT để chứng minh không thể đọc internal_note."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { seedFixtureUsers, FIXTURE_USERS, ANON_KEY } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'

describe('F02: Data Boundary & Sensitive Columns Security', () => {
  let pool: pg.Pool
  let customerToken: string
  let testOrderId: string
  let testReservationId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await seedFixtureUsers(pool)

    // 1. Authenticate Customer A to obtain real JWT
    const client = createClient(supabaseUrl, ANON_KEY, {
      auth: { persistSession: false },
    })
    const { data: authData, error: authError } = await client.auth.signInWithPassword({
      email: FIXTURE_USERS.customerA.email,
      password: 'TestPassword123!',
    })
    if (authError || !authData.session) {
      throw new Error(`Failed to sign in fixture customer: ${authError?.message}`)
    }
    customerToken = authData.session.access_token

    // 2. Provision test order with internal_note
    const testCode = `TG-ORD-${Date.now()}`
    const orderRes = await pool.query(
      `INSERT INTO public.orders (
        code, customer_user_id, order_type, status, customer_name, customer_phone,
        delivery_zone_id, address_snapshot, zone_name_snapshot,
        subtotal_vnd, shipping_fee_vnd, total_vnd, note, internal_note,
        payment_status, payment_method, version
      ) VALUES (
        $1, $2, 'delivery', 'pending', 'Khách A', '0911000001',
        '40000000-0000-0000-0000-000000000001', '17 Đường Số 1, Vĩnh An', 'Nội ô Thị trấn Vĩnh An (< 3km)',
        100000, 15000, 115000, 'Ghi chú của khách: ít cay', 'NHÂN VIÊN CHÚ Ý: KHÁCH VIP - NỘI BỘ',
        'unpaid', 'cash', 1
      ) RETURNING id`,
      [testCode, FIXTURE_USERS.customerA.id]
    )
    testOrderId = orderRes.rows[0].id

    // Add status history entry with sensitive actor_admin_id and internal reason
    await pool.query(
      `INSERT INTO public.order_status_history (
        order_id, from_status, to_status, actor_admin_id, reason
      ) VALUES (
        $1, 'pending', 'confirmed', $2, 'LÝ DO NỘI BỘ: TỰ ĐỘNG DUYỆT BỞI HỆ THỐNG'
      )`,
      [testOrderId, FIXTURE_USERS.admin.id]
    )

    // 3. Provision test reservation with internal_note, contact_outcome, contacted_at
    const resvCode = `TG-RES-${Date.now()}`
    const resvRes = await pool.query(
      `INSERT INTO public.reservations (
        code, customer_user_id, customer_name, customer_phone, starts_at, ends_at,
        guest_count, status, note, internal_note, contact_outcome, contacted_at, version
      ) VALUES (
        $1, $2, 'Khách A', '0911000001', now() + interval '2 hours', now() + interval '4 hours',
        4, 'confirmed', 'Bàn gần cửa sổ', 'GHI CHÚ NỘI BỘ BẾP: KHÁCH DỊ ỨNG HẢI SẢN', 'confirmed_via_phone', now(), 1
      ) RETURNING id`,
      [resvCode, FIXTURE_USERS.customerA.id]
    )
    testReservationId = resvRes.rows[0].id
  })

  afterAll(async () => {
    // Clean up test records
    if (testOrderId) {
      await pool.query('DELETE FROM public.order_status_history WHERE order_id = $1', [testOrderId])
      await pool.query('DELETE FROM public.orders WHERE id = $1', [testOrderId])
    }
    if (testReservationId) {
      await pool.query('DELETE FROM public.reservations WHERE id = $1', [testReservationId])
    }
    await pool.end()
  })

  describe('Direct PostgREST Table Queries on public.orders', () => {
    it('blocks customer from reading internal_note on orders (HTTP 403 permission denied)', async () => {
      const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${testOrderId}&select=id,internal_note`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${customerToken}`,
        },
      })

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table orders')
    })

    it('blocks customer wildcard select=* on orders because internal_note is ungranted (HTTP 403)', async () => {
      const res = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${testOrderId}&select=*`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${customerToken}`,
        },
      })

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table orders')
    })

    it('allows customer to read permitted non-sensitive fields on own order (HTTP 200)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/orders?id=eq.${testOrderId}&select=id,customer_name,customer_phone,status,total_vnd,note`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data).toHaveLength(1)
      expect(data[0].id).toBe(testOrderId)
      expect(data[0].customer_name).toBe('Khách A')
      expect(data[0].total_vnd).toBe(115000)
      expect(data[0].note).toBe('Ghi chú của khách: ít cay')
      expect(data[0].internal_note).toBeUndefined()
    })

    it('blocks anonymous access to orders table entirely', async () => {
      const res = await fetch(`${supabaseUrl}/rest/v1/orders?select=id,total_vnd`, {
        headers: {
          apikey: ANON_KEY,
        },
      })

      // Anon has no grants on orders table
      expect([401, 403]).toContain(res.status)
      const body = await res.json()
      expect(body.code).toMatch(/42501|PGRST301/)
    })
  })

  describe('Direct PostgREST Table Queries on public.reservations', () => {
    it('blocks customer from reading internal_note on reservations (HTTP 403 permission denied)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/reservations?id=eq.${testReservationId}&select=id,internal_note`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table reservations')
    })

    it('blocks customer from reading contact_outcome and contacted_at on reservations (HTTP 403)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/reservations?id=eq.${testReservationId}&select=id,contact_outcome,contacted_at`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table reservations')
    })

    it('allows customer to read permitted fields on own reservation (HTTP 200)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/reservations?id=eq.${testReservationId}&select=id,customer_name,guest_count,status,note`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data).toHaveLength(1)
      expect(data[0].id).toBe(testReservationId)
      expect(data[0].guest_count).toBe(4)
      expect(data[0].status).toBe('confirmed')
      expect(data[0].note).toBe('Bàn gần cửa sổ')
      expect(data[0].internal_note).toBeUndefined()
      expect(data[0].contact_outcome).toBeUndefined()
    })
  })

  describe('Direct PostgREST Table Queries on public.order_status_history', () => {
    it('blocks customer from reading actor_admin_id on order_status_history (HTTP 403)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/order_status_history?order_id=eq.${testOrderId}&select=id,actor_admin_id`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table order_status_history')
    })

    it('blocks customer from reading internal reason on order_status_history (HTTP 403)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/order_status_history?order_id=eq.${testOrderId}&select=id,reason`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(403)
      const body = await res.json()
      expect(body.code).toBe('42501')
      expect(body.message).toContain('permission denied for table order_status_history')
    })

    it('allows customer to read safe transition history (from_status, to_status, created_at) (HTTP 200)', async () => {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/order_status_history?order_id=eq.${testOrderId}&select=id,order_id,from_status,to_status,created_at`,
        {
          headers: {
            apikey: ANON_KEY,
            Authorization: `Bearer ${customerToken}`,
          },
        }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThanOrEqual(1)
      expect(data[0].from_status).toBe('pending')
      expect(data[0].to_status).toBe('confirmed')
      expect(data[0].actor_admin_id).toBeUndefined()
      expect(data[0].reason).toBeUndefined()
    })
  })
})
