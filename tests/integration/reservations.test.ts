import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Reservation System End-to-End API (Task T12, Invariants V15, V16, V24)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  const createdReservationIds: string[] = []

  // Seating areas from seed:
  // 20000000-0000-0000-0000-000000000003: Phòng VIP Riêng Tư
  const AREA_VIP_ID = '20000000-0000-0000-0000-000000000003'

  // Reference test base date: 2026-09-20 (Sunday) 10:00 VN time (03:00 UTC)
  const BASE_TEST_NOW = '2026-09-20T03:00:00.000Z' // 10:00 VN time

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
         SET booking_enabled = true,
             reservation_min_notice_minutes = 30,
             reservation_max_days_ahead = 30,
             reservation_duration_minutes = 120,
             reservation_cancel_notice_minutes = 60,
             reservation_no_show_grace_minutes = 15
         WHERE id = 1`
      )

      // Clean up test reservations
      if (createdReservationIds.length > 0) {
        await pool.query('DELETE FROM public.audit_logs WHERE entity_id = ANY($1)', [
          createdReservationIds,
        ])
        await pool.query('DELETE FROM public.idempotency_requests WHERE result_id = ANY($1)', [
          createdReservationIds,
        ])
        await pool.query('DELETE FROM public.reservations WHERE id = ANY($1)', [
          createdReservationIds,
        ])
      }

      await pool.end()
    }
  })

  // --------------------------------------------------------------------------
  // 1. PUBLIC RESERVATION CREATION & TIMING VALIDATION (Invariant V15, V24)
  // --------------------------------------------------------------------------
  describe('Public Reservation Intake (Invariant V15)', () => {
    it('1.1. Rejects reservation when Idempotency-Key header is missing or too short', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'short',
        },
        body: JSON.stringify({
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          starts_at: '2026-09-20T05:00:00.000Z', // 12:00 VN
          guest_count: 4,
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error.code).toBe('VALIDATION_ERROR')
    })

    it('1.2. Rejects reservation when inputs are invalid (name, phone, guest_count bounds)', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-invalid-test-01',
        },
        body: JSON.stringify({
          customer_name: 'A', // too short (< 2)
          customer_phone: '123', // invalid phone
          starts_at: 'not-a-date',
          guest_count: 0, // invalid (< 1)
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error.code).toBe('VALIDATION_ERROR')
      expect(data.error.field_errors.customer_name).toBeDefined()
      expect(data.error.field_errors.customer_phone).toBeDefined()
      expect(data.error.field_errors.starts_at).toBeDefined()
      expect(data.error.field_errors.guest_count).toBeDefined()
    })

    it('1.3. Rejects reservation when booking notice is too short (< 30 minutes)', async () => {
      // Reference now: 10:00 VN (03:00 UTC)
      // Requested booking: 10:15 VN (03:15 UTC) -> only 15m notice < 30m min notice
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-notice-too-short-01',
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          customer_name: 'Nguyễn Văn B',
          customer_phone: '0902809929',
          starts_at: '2026-09-20T03:15:00.000Z',
          guest_count: 4,
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.error.code).toBe('RESERVATION_NOTICE_TOO_SHORT')
      expect(data.error.message).toContain('tối thiểu 30 phút')
    })

    it('1.4. Rejects reservation when booking is too far ahead (> 30 days)', async () => {
      // Reference now: 2026-09-20
      // Requested booking: 2026-10-25 (> 35 days ahead > 30 days limit)
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-too-far-ahead-01',
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          customer_name: 'Trần Thị C',
          customer_phone: '0902809929',
          starts_at: '2026-10-25T05:00:00.000Z',
          guest_count: 6,
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(422)
      const data = await res.json()
      expect(data.error.code).toBe('RESERVATION_TOO_FAR_AHEAD')
      expect(data.error.message).toContain('tối đa 30 ngày')
    })

    it('1.5. Rejects reservation on closed dates (business_closures)', async () => {
      // Insert test closure for 2026-09-22
      await pool.query(
        `INSERT INTO public.business_closures (date, service_type, reason)
         VALUES ('2026-09-22', 'reservation', 'TEST_Vệ sinh hệ thống định kỳ')`
      )

      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-closure-test-01',
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          customer_name: 'Lê Văn D',
          customer_phone: '0902809929',
          starts_at: '2026-09-22T05:00:00.000Z', // 12:00 VN on closed day
          guest_count: 4,
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('SERVICE_CLOSED')
      expect(data.error.message).toContain('TEST_Vệ sinh hệ thống')
    })

    it('1.6. Rejects reservation when outside reservation intake hours', async () => {
      // Sunday 08:00 VN time (01:00 UTC) is before reservation intake open time (10:30)
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-outside-hours-01',
          'X-Test-Now': '2026-09-20T00:00:00.000Z', // 07:00 VN
        },
        body: JSON.stringify({
          customer_name: 'Phạm Thị E',
          customer_phone: '0902809929',
          starts_at: '2026-09-20T01:00:00.000Z', // 08:00 VN
          guest_count: 4,
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('SERVICE_CLOSED')
      expect(data.error.message).toContain('ngoài khung giờ')
    })

    it('1.7. Creates valid reservation with honest pending status, code, area snapshot (Invariant V15, V24)', async () => {
      // 2026-09-20 18:00 VN time (11:00 UTC) is within 10:30-21:00 reservation intake
      const idempKey = 'idemp-resv-valid-booking-01'
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempKey,
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          customer_name: 'Hoàng Minh Quân',
          customer_phone: '0902809929',
          starts_at: '2026-09-20T11:00:00.000Z',
          guest_count: 8,
          seating_area_id: AREA_VIP_ID,
          note: 'Đặt sinh nhật, chuẩn bị bàn dài giúp em',
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)
      const data = await res.json()

      expect(data.data.id).toBeDefined()
      expect(data.data.code).toMatch(/^TG-RESV-260920-[A-Z0-9]{4}$/)
      expect(data.data.status).toBe('pending') // Honest initial status
      expect(data.data.customer_name).toBe('Hoàng Minh Quân')
      expect(data.data.customer_phone).toBe('0902809929')
      expect(data.data.guest_count).toBe(8)
      expect(data.data.seating_area_id).toBe(AREA_VIP_ID)
      expect(data.data.area_name_snapshot).toBe('Phòng VIP Riêng Tư')
      expect(data.data.version).toBe(1)

      createdReservationIds.push(data.data.id)

      // Verify audit log has no PII (phone number should not be in metadata)
      const auditRes = await pool.query(
        `SELECT metadata FROM public.audit_logs WHERE entity_id = $1 AND action = 'create_reservation'`,
        [data.data.id]
      )
      expect(auditRes.rows.length).toBe(1)
      const auditMeta = auditRes.rows[0].metadata
      expect(auditMeta.code).toBe(data.data.code)
      expect(JSON.stringify(auditMeta)).not.toContain('0902809929')
    })

    it('1.8. Safely replays committed reservation with exact same key & payload (Invariant V24)', async () => {
      const idempKey = 'idemp-resv-replay-test-01'
      const payload = {
        customer_name: 'Đặng Thanh Tùng',
        customer_phone: '0987654321',
        starts_at: '2026-09-20T12:00:00.000Z', // 19:00 VN
        guest_count: 5,
        note: 'Tiệc họp mặt bạn bè',
      }

      // 1. Initial create
      const req1 = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempKey,
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify(payload),
      })

      const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
      expect(res1.status).toBe(201)
      const data1 = await res1.json()
      createdReservationIds.push(data1.data.id)

      // 2. Replay with exact same key and payload
      const req2 = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempKey,
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify(payload),
      })

      const res2 = await handlePublicApi(req2, { pool, supabaseAdmin })
      expect(res2.status).toBe(200) // Replay returns 200
      const data2 = await res2.json()
      expect(data2.data.id).toBe(data1.data.id)
      expect(data2.data.code).toBe(data1.data.code)

      // 3. Same key with DIFFERENT payload throws 409 IDEMPOTENCY_CONFLICT
      const req3 = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempKey,
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          ...payload,
          guest_count: 10, // modified!
        }),
      })

      const res3 = await handlePublicApi(req3, { pool, supabaseAdmin })
      expect(res3.status).toBe(409)
      const data3 = await res3.json()
      expect(data3.error.code).toBe('IDEMPOTENCY_CONFLICT')
    })
  })

  // --------------------------------------------------------------------------
  // 2. ADMIN MANAGEMENT & STATE TRANSITION ENGINE (Invariant V16)
  // --------------------------------------------------------------------------
  describe('Admin Reservation Engine & State Transitions (Invariant V16)', () => {
    let testResvId: string
    let testResvVersion: number

    beforeAll(async () => {
      // Create a test reservation to run transitions against
      const req = new Request('http://localhost/functions/v1/public-api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idemp-resv-admin-transitions-fixture',
          'X-Test-Now': BASE_TEST_NOW,
        },
        body: JSON.stringify({
          customer_name: 'Khách Đặt Bàn VIP',
          customer_phone: '0912345678',
          starts_at: '2026-09-20T11:30:00.000Z', // 18:30 VN
          guest_count: 6,
          note: 'Cần bàn gần cửa sổ',
        }),
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      const data = await res.json()
      testResvId = data.data.id
      testResvVersion = data.data.version
      createdReservationIds.push(testResvId)
    })

    it('2.1. Admin lists reservations with date filter', async () => {
      const req = new Request(
        'http://localhost/functions/v1/admin-api/reservations?date=2026-09-20&limit=50',
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data.data.items)).toBe(true)
      const found = data.data.items.find((r: { id: string }) => r.id === testResvId)
      expect(found).toBeDefined()
      expect(found.customer_name).toBe('Khách Đặt Bàn VIP')
    })

    it('2.2. Admin gets single reservation detail', async () => {
      const req = new Request(`http://localhost/functions/v1/admin-api/reservations/${testResvId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.id).toBe(testResvId)
      expect(data.data.status).toBe('pending')
      expect(data.data.guest_count).toBe(6)
    })

    it('2.3. Admin records contact outcome with optimistic version lock', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/contact`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            outcome: 'Đã gọi xác nhận, khách xác nhận 6 người lớn',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.contact_outcome).toBe('Đã gọi xác nhận, khách xác nhận 6 người lớn')
      expect(data.data.version).toBe(testResvVersion + 1)
      testResvVersion = data.data.version
    })

    it('2.4. Admin updates internal note with optimistic version lock', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/note`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            internal_note: 'Bố trí Bàn số 5 view đẹp',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.internal_note).toBe('Bố trí Bàn số 5 view đẹp')
      expect(data.data.version).toBe(testResvVersion + 1)
      testResvVersion = data.data.version
    })

    it('2.5. Rejects transition when expected_version does not match (VERSION_CONFLICT)', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: 999, // Stale / incorrect version
            target_status: 'confirmed',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('VERSION_CONFLICT')
    })

    it('2.6. Admin confirms reservation (pending -> confirmed)', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            target_status: 'confirmed',
            reason: 'Đã chuẩn bị chỗ ngồi',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.status).toBe('confirmed')
      expect(data.data.version).toBe(testResvVersion + 1)
      testResvVersion = data.data.version
    })

    it('2.7. Transition to no_show is blocked before grace period expires (Invariant V16)', async () => {
      // Reservation starts_at: 18:30 VN (11:30 UTC)
      // Grace period: 15 minutes -> Cutoff is 18:45 VN (11:45 UTC)
      // Test time: 18:40 VN (11:40 UTC) -> 10 minutes past start, but grace active until 18:45!
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
            'X-Test-Now': '2026-09-20T11:40:00.000Z', // 18:40 VN
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            target_status: 'no_show',
            reason: 'Khách chưa đến',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('NO_SHOW_GRACE_ACTIVE')
      expect(data.error.message).toContain('Chưa qua thời gian ân hạn vắng mặt')
    })

    it('2.8. Admin marks guest seated (confirmed -> seated)', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            target_status: 'seated',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.status).toBe('seated')
      expect(data.data.version).toBe(testResvVersion + 1)
      testResvVersion = data.data.version
    })

    it('2.9. Admin marks seated reservation completed (seated -> completed)', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            target_status: 'completed',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.data.status).toBe('completed')
      expect(data.data.version).toBe(testResvVersion + 1)
      testResvVersion = data.data.version
    })

    it('2.10. Terminal state rejects further transitions (RESERVATION_TERMINAL)', async () => {
      const req = new Request(
        `http://localhost/functions/v1/admin-api/reservations/${testResvId}/transition`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            expected_version: testResvVersion,
            target_status: 'cancelled',
            reason: 'Thử hủy sau khi đã hoàn tất',
          }),
        }
      )

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const data = await res.json()
      expect(data.error.code).toBe('RESERVATION_TERMINAL')
    })
  })
})
