/**
 * Tiger 345 - Trusted Clock & Operating Schedule Integration Tests (F04 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * - Affected API:
 *   - Real HTTP (Kong Gateway): POST /functions/v1/public-api/order-quotes, POST /functions/v1/public-api/reservations
 *   - Direct Function Handler: handlePublicApi (with trustedNow dependency injection)
 *   - PostgreSQL RPC: public.create_order
 * - Data Schemas:
 *   - public.business_closures (date date, service_type text, reason text)
 *   - public.business_hours (weekday int, service_type text, open_time time, close_time time, active boolean)
 *   - public.orders (order_type, status, subtotal_vnd, total_vnd)
 *   - public.reservations (starts_at, ends_at, guest_count, status)
 * - Verbatim Instructions:
 *   - "BƯỚC 6 — F04: TRUSTED CLOCK VÀ LỊCH PHỤC VỤ"
 *   - "Xóa bỏ việc tin cậy X-Test-Now tùy tiện từ HTTP header trong production/Edge logic."
 *   - "Nếu cần inject time cho test, đóng gói qua trusted context/dependency injection nội bộ hoặc mock có kiểm soát môi trường test rõ ràng, không mở cửa cho client bất kỳ gửi header này."
 *   - "Kiểm tra lại logic lịch: validate business hours / closures một cách atomic / transaction-safe khi tạo order/reservation, không để lọt trường hợp restaurant closure phủ nhận delivery service (all vs restaurant scope)."
 *   - "Viết integration test chứng minh client không thể bypass giờ đóng cửa bằng X-Test-Now."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { assertServiceOperating } from '../../supabase/functions/_shared/schedule.js'
import { seedFixtureUsers, ANON_KEY } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('F04: Trusted Clock & Operating Schedule Validation', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient

  const TEST_DATE_CLOSURE = '2026-10-15'
  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng (245,000 đ)
  const ZONE_ID = '40000000-0000-0000-0000-000000000001' // Vĩnh An (< 3km)

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)

    // Ensure clean state for test closure date
    await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
  })

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
      await pool.end()
    }
  })

  describe('1. Production / Real HTTP Gateway Header Immunity (Client Cannot Bypass Closures via X-Test-Now)', () => {
    it('rejects client X-Test-Now header over real Edge HTTP gateway when restaurant is closed on server clock', async () => {
      // 1. Insert a closure for TODAY so server clock considers it closed
      const vnToday = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10)
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ($1, 'delivery', 'Nghỉ lễ đột xuất kiểm thử')
         ON CONFLICT (date, service_type) DO UPDATE SET reason = EXCLUDED.reason`,
        [vnToday]
      )

      try {
        // 2. Client attempts to bypass today's closure by forging an X-Test-Now header to tomorrow at 12:00
        const res = await fetch(`${supabaseUrl}/functions/v1/public-api/order-quotes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON_KEY,
            'X-Test-Now': '2026-10-20T05:00:00.000Z', // 12:00 VN time on an open day
          },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_context: {
              delivery_zone_id: ZONE_ID,
              customer_name: 'Khách Test Clock',
              customer_phone: '0912345678',
              address: '123 Đường Test, Vĩnh An',
            },
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        })

        // Edge function running in production mode MUST NOT trust client X-Test-Now header
        expect(res.status).toBe(409)
        const json = await res.json()
        expect(json.error.code).toBe('SERVICE_CLOSED')
        expect(json.error.message).toContain('Nghỉ lễ đột xuất kiểm thử')
      } finally {
        await pool.query(
          `DELETE FROM public.business_closures WHERE date = $1 AND service_type = 'delivery'`,
          [vnToday]
        )
      }
    })
  })

  describe('2. Closure Scope Hierarchy (restaurant vs delivery vs reservation vs all)', () => {
    it('service_type = restaurant closure closes ALL services (dine-in, delivery, and reservation)', async () => {
      // 1. Clean and insert closure for restaurant
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ($1, 'restaurant', 'Sửa chữa toàn bộ mặt bằng quán')
         ON CONFLICT (date, service_type) DO UPDATE SET reason = EXCLUDED.reason`,
        [TEST_DATE_CLOSURE]
      )

      // Test time: 12:00 VN time on 2026-10-15 (Thursday) -> 2026-10-15T05:00:00Z
      const testNow = new Date('2026-10-15T05:00:00.000Z')

      // Case A: Delivery quote -> MUST FAIL (409 SERVICE_CLOSED) because restaurant closure blocks ALL services
      const deliveryReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const deliveryRes = await handlePublicApi(deliveryReq, {
        pool,
        supabaseAdmin,
        trustedNow: testNow,
      })
      expect(deliveryRes.status).toBe(409)
      const deliveryData = await deliveryRes.json()
      expect(deliveryData.error.code).toBe('SERVICE_CLOSED')
      expect(deliveryData.error.message).toContain('giao hàng')

      // Case B: Dine-in quote -> MUST FAIL (409 SERVICE_CLOSED)
      const dineInReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'dine_in',
          visit_capability: 'dummy-cap',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const dineInRes = await handlePublicApi(dineInReq, {
        pool,
        supabaseAdmin,
        trustedNow: testNow,
      })
      expect(dineInRes.status).toBe(409)
      const dineInData = await dineInRes.json()
      expect(dineInData.error.code).toBe('SERVICE_CLOSED')
      expect(dineInData.error.message).toContain('phục vụ tại quán')

      // Case C: Reservation RPC -> MUST FAIL (P0011 SERVICE_CLOSED)
      let caughtResErr: unknown
      try {
        await pool.query(
          `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            `idemp-res-${Date.now()}-rest-closed`,
            'req-hash',
            'guest:test',
            'Khách Đặt Bàn',
            '0912345678',
            '2026-10-15T12:00:00+07:00',
            4,
            null,
            'Ghi chú',
            null,
            '2026-10-15T08:00:00+07:00',
          ]
        )
      } catch (err) {
        caughtResErr = err
      }
      expect(caughtResErr).toBeDefined()
      const pgResErr = caughtResErr as { code?: string; message?: string }
      expect(pgResErr.code).toBe('P0011')
      expect(pgResErr.message).toContain('SERVICE_CLOSED')

      // Clean up
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
    })

    it('service_type = delivery closure closes delivery but keeps restaurant dine-in and reservations OPEN', async () => {
      // 1. Clean and insert closure for delivery only
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ($1, 'delivery', 'Bảo trì xe giao hàng')
         ON CONFLICT (date, service_type) DO UPDATE SET reason = EXCLUDED.reason`,
        [TEST_DATE_CLOSURE]
      )

      const testNow = new Date('2026-10-15T05:00:00.000Z')

      // Case A: Delivery quote -> MUST FAIL (409 SERVICE_CLOSED)
      const deliveryReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const deliveryRes = await handlePublicApi(deliveryReq, {
        pool,
        supabaseAdmin,
        trustedNow: testNow,
      })
      expect(deliveryRes.status).toBe(409)
      const deliveryData = await deliveryRes.json()
      expect(deliveryData.error.code).toBe('SERVICE_CLOSED')
      expect(deliveryData.error.message).toContain('giao hàng')

      // Case B: Dine-in operating check -> MUST SUCCEED (delivery closure does NOT affect dine-in / restaurant!)
      await expect(
        assertServiceOperating(pool, 'restaurant', { trustedNow: testNow })
      ).resolves.toBeDefined()

      // Case C: Reservation RPC -> MUST SUCCEED (delivery closure does NOT affect reservations!)
      const resvRes = await pool.query(
        `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
        [
          `idemp-res-${Date.now()}-delivery-closure`,
          'req-hash',
          'guest:test',
          'Khách Ăn Tại Quán',
          '0912345678',
          '2026-10-15T11:30:00+07:00',
          2,
          null,
          'Ăn trưa khi xe giao hàng bảo trì',
          null,
          '2026-10-15T08:00:00+07:00',
        ]
      )
      expect(resvRes.rows[0].result.receipt.code).toBeTruthy()

      // Clean up
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
    })

    it('service_type = all closure closes both delivery and restaurant dine-in', async () => {
      // 1. Clean and insert closure for ALL services
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ($1, 'all', 'Nghỉ Tết Nguyên Đán')
         ON CONFLICT (date, service_type) DO UPDATE SET reason = EXCLUDED.reason`,
        [TEST_DATE_CLOSURE]
      )

      const testNow = new Date('2026-10-15T05:00:00.000Z')

      // Case A: Delivery quote -> MUST FAIL (409 SERVICE_CLOSED)
      const deliveryReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const deliveryRes = await handlePublicApi(deliveryReq, {
        pool,
        supabaseAdmin,
        trustedNow: testNow,
      })
      expect(deliveryRes.status).toBe(409)
      const deliveryData = await deliveryRes.json()
      expect(deliveryData.error.code).toBe('SERVICE_CLOSED')

      // Case B: Dine-in quote -> MUST FAIL (409 SERVICE_CLOSED)
      const dineInReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'dine_in',
          visit_capability: 'dummy-cap',
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const dineInRes = await handlePublicApi(dineInReq, {
        pool,
        supabaseAdmin,
        trustedNow: testNow,
      })
      expect(dineInRes.status).toBe(409)
      const dineInData = await dineInRes.json()
      expect(dineInData.error.code).toBe('SERVICE_CLOSED')

      // Clean up
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
    })
  })

  describe('3. Atomic PostgreSQL RPC Schedule Validation (public.create_order)', () => {
    it('rejects create_order directly inside PostgreSQL transaction when closed on reference time', async () => {
      // 1. Clean and insert closure
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ($1, 'delivery', 'Đóng cửa kiểm kê kho')
         ON CONFLICT (date, service_type) DO UPDATE SET reason = EXCLUDED.reason`,
        [TEST_DATE_CLOSURE]
      )

      const testNow = new Date('2026-10-15T05:00:00.000Z') // 12:00 VN time on closure date
      const idempotencyKeyHash = `test-idemp-atomic-${Date.now()}`
      const deliveryContext = {
        delivery_zone_id: ZONE_ID,
        customer_name: 'Khách Kiểm Thử',
        customer_phone: '0912345678',
        address: '123 Đường Test, Vĩnh An',
        expected_shipping_fee_vnd: 15000,
      }
      const items = [
        {
          menu_item_id: ITEM_1_ID,
          item_name: 'Sườn nướng',
          unit_price_vnd: 245000,
          quantity: 1,
        },
      ]

      // Execute atomic RPC public.create_order passing reference_now
      let caughtError: unknown
      try {
        await pool.query(
          `SELECT public.create_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            idempotencyKeyHash,
            'guest:test',
            'req-hash',
            'delivery',
            null,
            null,
            JSON.stringify(deliveryContext),
            JSON.stringify(items),
            'Note',
            null,
            testNow.toISOString(),
          ]
        )
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      const pgErr = caughtError as { code?: string; message?: string }
      expect(pgErr.code).toBe('P0011')
      expect(pgErr.message).toContain('SERVICE_CLOSED')
      expect(pgErr.message).toContain('Đóng cửa kiểm kê kho')

      // Clean up
      await pool.query('DELETE FROM public.business_closures WHERE date = $1', [TEST_DATE_CLOSURE])
    })

    it('rejects create_order directly inside PostgreSQL transaction when outside business hours', async () => {
      // Reference time: 02:00 AM VN time (closed) -> 2026-10-15T19:00:00Z previous day
      const testNightTime = new Date('2026-10-15T19:00:00.000Z') // 02:00 VN time on Friday
      const idempotencyKeyHash = `test-idemp-night-${Date.now()}`
      const deliveryContext = {
        delivery_zone_id: ZONE_ID,
        customer_name: 'Khách Đêm',
        customer_phone: '0912345678',
        address: '123 Đường Test, Vĩnh An',
        expected_shipping_fee_vnd: 15000,
      }
      const items = [
        {
          menu_item_id: ITEM_1_ID,
          item_name: 'Sườn nướng',
          unit_price_vnd: 245000,
          quantity: 1,
        },
      ]

      let caughtError: unknown
      try {
        await pool.query(
          `SELECT public.create_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            idempotencyKeyHash,
            'guest:test',
            'req-hash',
            'delivery',
            null,
            null,
            JSON.stringify(deliveryContext),
            JSON.stringify(items),
            'Note',
            null,
            testNightTime.toISOString(),
          ]
        )
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      const pgErr = caughtError as { code?: string; message?: string }
      expect(pgErr.code).toBe('P0011')
      expect(pgErr.message).toContain('SERVICE_CLOSED')
      expect(pgErr.message).toContain('Ngoài khung giờ phục vụ')
    })
  })

  describe('4. Multi-Shift Operating Hours & Interval Boundaries', () => {
    // We set up Thursday (weekday = 4) with two distinct shifts:
    // Shift 1: 10:00 - 14:00
    // Shift 2: 17:00 - 22:00
    beforeAll(async () => {
      await pool.query(
        `DELETE FROM public.business_hours WHERE weekday = 4 AND service_type IN ('restaurant', 'delivery', 'reservation')`
      )
      // Insert multi-shift for restaurant
      await pool.query(`
        INSERT INTO public.business_hours (weekday, service_type, open_time, close_time, active)
        VALUES
          (4, 'restaurant', '10:00:00', '14:00:00', true),
          (4, 'restaurant', '17:00:00', '22:00:00', true),
          (4, 'delivery', '10:00:00', '14:00:00', true),
          (4, 'delivery', '17:00:00', '22:00:00', true),
          (4, 'reservation', '10:00:00', '14:00:00', true),
          (4, 'reservation', '17:00:00', '22:00:00', true);
      `)
    })

    afterAll(async () => {
      // Restore standard single shift for weekday 4
      await pool.query(
        `DELETE FROM public.business_hours WHERE weekday = 4 AND service_type IN ('restaurant', 'delivery', 'reservation')`
      )
      await pool.query(`
        INSERT INTO public.business_hours (weekday, service_type, open_time, close_time, active)
        VALUES
          (4, 'restaurant', '08:00:00', '22:00:00', true),
          (4, 'delivery', '08:00:00', '21:30:00', true),
          (4, 'reservation', '08:00:00', '21:00:00', true);
      `)
    })

    it('accepts order at 12:00 (inside shift 1: 10:00 - 14:00)', async () => {
      // 2026-10-15 is Thursday. 12:00 VN = 05:00 UTC
      const testNow = new Date('2026-10-15T05:00:00.000Z')
      const req = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin, trustedNow: testNow })
      expect(res.status).toBe(200)
    })

    it('accepts order at 18:00 (inside shift 2: 17:00 - 22:00)', async () => {
      // 18:00 VN = 11:00 UTC
      const testNow = new Date('2026-10-15T11:00:00.000Z')
      const req = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin, trustedNow: testNow })
      expect(res.status).toBe(200)
    })

    it('rejects order at 15:00 (in break between shifts: 14:00 - 17:00)', async () => {
      // 15:00 VN = 08:00 UTC
      const testNow = new Date('2026-10-15T08:00:00.000Z')
      const req = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin, trustedNow: testNow })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('SERVICE_CLOSED')
      expect(data.error.message).toContain('Ngoài khung giờ')
    })

    it('strictly checks boundaries: 10:00:00 and 14:00:00 accepted, 09:59:59 and 14:00:01 rejected', async () => {
      // 10:00:00 VN = 03:00:00 UTC -> ACCEPTED
      const t1000 = new Date('2026-10-15T03:00:00.000Z')
      const r1 = await handlePublicApi(
        new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        }),
        { pool, supabaseAdmin, trustedNow: t1000 }
      )
      expect(r1.status).toBe(200)

      // 14:00:00 VN = 07:00:00 UTC -> ACCEPTED
      const t1400 = new Date('2026-10-15T07:00:00.000Z')
      const r2 = await handlePublicApi(
        new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        }),
        { pool, supabaseAdmin, trustedNow: t1400 }
      )
      expect(r2.status).toBe(200)

      // 09:59:59 VN = 02:59:59 UTC -> REJECTED
      const t0959 = new Date('2026-10-15T02:59:59.000Z')
      const r3 = await handlePublicApi(
        new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        }),
        { pool, supabaseAdmin, trustedNow: t0959 }
      )
      expect(r3.status).toBe(409)

      // 14:00:01 VN = 07:00:01 UTC -> REJECTED
      const t140001 = new Date('2026-10-15T07:00:01.000Z')
      const r4 = await handlePublicApi(
        new Request('http://localhost/functions/v1/public-api/order-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_type: 'delivery',
            delivery_zone_id: ZONE_ID,
            items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
          }),
        }),
        { pool, supabaseAdmin, trustedNow: t140001 }
      )
      expect(r4.status).toBe(409)
    })

    it('validates reservation multi-shift span: 11:00 accepted, 13:00 rejected (exceeds shift 1 end at 14:00)', async () => {
      // Reservation slot is 90 minutes.
      // Case 1: starts_at = 11:00 VN -> ends_at = 12:30 VN.
      // Both start and end are within shift 1 (10:00 - 14:00) -> ACCEPTED
      const res1 = await pool.query(
        `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
        [
          `idemp-res-${Date.now()}-shift1-valid`,
          'req-hash',
          'guest:test',
          'Khách Ca Trưa',
          '0912345678',
          '2026-10-15T11:00:00+07:00',
          2,
          null,
          'Đặt bàn ca trưa',
          null,
          '2026-10-15T08:00:00+07:00', // 3 hours advance notice
        ]
      )
      expect(res1.rows[0].result.receipt.code).toBeTruthy()

      // Case 2: starts_at = 13:00 VN -> ends_at = 14:30 VN.
      // ends_at (14:30) exceeds shift 1 closing time (14:00) -> MUST FAIL P0011
      let caughtExceedErr: unknown
      try {
        await pool.query(
          `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            `idemp-res-${Date.now()}-shift1-exceed`,
            'req-hash',
            'guest:test',
            'Khách Quá Giờ Ca',
            '0912345678',
            '2026-10-15T13:00:00+07:00',
            2,
            null,
            'Đặt bàn muộn ca trưa',
            null,
            '2026-10-15T08:00:00+07:00',
          ]
        )
      } catch (err) {
        caughtExceedErr = err
      }
      expect(caughtExceedErr).toBeDefined()
      const pgErr = caughtExceedErr as { code?: string; message?: string }
      expect(pgErr.code).toBe('P0011')
      expect(pgErr.message).toContain('SERVICE_CLOSED')
    })
  })
})
