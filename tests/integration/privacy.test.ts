/**
 * Tiger 345 - Privacy, Account Deletion & Retention Integration Tests
 * Task: T19 (Invariant V23, Decision D04)
 *
 * Importers/Callers:
 * - vitest runner (npm run test:integration -- tests/integration/privacy.test.ts)
 *
 * Affected API:
 * - DELETE /customer-api/me
 * - GET /admin-api/retention/dry-run
 * - POST /admin-api/retention/run
 * - RPCs: public.request_account_deletion, public.process_account_deletion_db, public.complete_account_deletion_job, public.run_retention_cleanup
 *
 * Data Schemas:
 * - public.account_deletion_jobs, public.customer_profiles, public.orders, public.reservations, public.customer_addresses, public.customer_favorites
 *
 * Verbatim Instruction:
 * "làm full các task luôn ấy" (T19 Privacy & Retention)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Privacy, Account Deletion & Data Retention Integration (T19 - Invariant V23, Decision D04)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string

  const userTestId = 'c0000000-0000-0000-0000-000000000099'
  let userTestToken: string

  const createdOrderIds: string[] = []
  const createdReservationIds: string[] = []

  async function customerReq(
    token: string,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any }> {
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
      // Empty
    }
    return { status: res.status, body: json }
  }

  async function adminReq(
    token: string | null,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {}
  ): Promise<{ status: number; body: any }> {
    const reqHeaders: Record<string, string> = {
      ...headers,
    }
    if (token) {
      reqHeaders['Authorization'] = `Bearer ${token}`
    }
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json'
    }

    const req = new Request(`http://localhost:54321/admin-api${path}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    const res = await handleAdminApi(req, { pool, supabaseAdmin })
    let json: any = null
    try {
      json = await res.json()
    } catch {
      // Empty
    }
    return { status: res.status, body: json }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Clean any prior state for userTestId
    await pool.query('DELETE FROM public.customer_tombstones WHERE user_id = $1', [userTestId])
    await pool.query('DELETE FROM public.account_deletion_jobs WHERE user_id = $1', [userTestId])
    await pool.query('DELETE FROM public.customer_addresses WHERE user_id = $1', [userTestId])
    await pool.query('DELETE FROM public.customer_favorites WHERE user_id = $1', [userTestId])
    await pool.query('DELETE FROM public.customer_profiles WHERE user_id = $1', [userTestId])
    await pool.query('DELETE FROM auth.users WHERE id = $1', [userTestId])

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
    userTestToken = getUserToken('customerDelete')

    // Ensure last_sign_in_at is set to now()
    await pool.query(
      `UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`,
      [userTestId]
    )

    await pool.query(
      `UPDATE public.customer_profiles
       SET deletion_requested_at = NULL,
           updated_at = now()
       WHERE user_id = $1`,
      [userTestId]
    )
  })

  afterAll(async () => {
    if (pool) {
      if (createdOrderIds.length > 0) {
        await pool.query('DELETE FROM public.order_items WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_status_history WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.orders WHERE id = ANY($1)', [createdOrderIds])
      }
      if (createdReservationIds.length > 0) {
        await pool.query('DELETE FROM public.reservations WHERE id = ANY($1)', [createdReservationIds])
      }
      await pool.query('DELETE FROM public.customer_tombstones WHERE user_id = $1', [userTestId])
      await pool.query('DELETE FROM public.account_deletion_jobs WHERE user_id = $1', [userTestId])
      await pool.query('DELETE FROM public.customer_addresses WHERE user_id = $1', [userTestId])
      await pool.query('DELETE FROM public.customer_favorites WHERE user_id = $1', [userTestId])
      await pool.query('DELETE FROM public.customer_profiles WHERE user_id = $1', [userTestId])
      await pool.query('DELETE FROM auth.users WHERE id = $1', [userTestId])
      await pool.end()
    }
  })

  // -------------------------------------------------------------------------
  // 1. Validation and Guard Gates
  // -------------------------------------------------------------------------
  describe('1. Deletion Request Validation & Authentication Gates', () => {
    it('rejects deletion with invalid confirmation phrase with 400 VALIDATION_ERROR', async () => {
      const res = await customerReq(userTestToken, 'DELETE', '/me', { confirmation: 'wrong' })
      expect(res.status).toBe(400)
      expect(res.body.error?.code).toBe('VALIDATION_ERROR')
    })

    it('rejects deletion when last_sign_in_at is stale (>10 minutes) with 401 AUTH_RECENT_REQUIRED', async () => {
      // Set last_sign_in_at to 15 minutes ago
      await pool.query(
        `UPDATE auth.users SET last_sign_in_at = now() - interval '15 minutes' WHERE id = $1`,
        [userTestId]
      )

      const res = await customerReq(userTestToken, 'DELETE', '/me', { confirmation: 'XÓA TÀI KHOẢN' })
      expect(res.status).toBe(401)
      expect(res.body.error?.code).toBe('AUTH_RECENT_REQUIRED')

      // Restore last_sign_in_at to now()
      await pool.query(
        `UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`,
        [userTestId]
      )
    })

    it('rejects active admin self-deletion via customer endpoint with 403 ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN', async () => {
      const res = await customerReq(adminToken, 'DELETE', '/me', { confirmation: 'XÓA TÀI KHOẢN' })
      expect(res.status).toBe(403)
      expect(res.body.error?.code).toBe('ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN')
    })

    it('locks out customer via API gate with 403 FORBIDDEN when deletion_requested_at is set', async () => {
      await pool.query(
        `UPDATE public.customer_profiles SET deletion_requested_at = now() WHERE user_id = $1`,
        [userTestId]
      )

      const res = await customerReq(userTestToken, 'GET', '/me')
      expect(res.status).toBe(403)
      expect(res.body.error?.code).toBe('FORBIDDEN')

      // Reset deletion_requested_at for subsequent tests
      await pool.query(
        `UPDATE public.customer_profiles SET deletion_requested_at = NULL WHERE user_id = $1`,
        [userTestId]
      )
    })
  })

  // -------------------------------------------------------------------------
  // 2. Full Account Deletion Workflow & PII Anonymization (Zero Financial Loss)
  // -------------------------------------------------------------------------
  describe('2. Multi-phase Account Deletion & PII Sanitization', () => {
    let orderId: string
    let reservationId: string

    beforeAll(async () => {
      // Add address and favorite for userTestId
      await pool.query(
        `INSERT INTO public.customer_addresses (user_id, label, recipient_name, phone, address_line)
         VALUES ($1, 'Nhà', 'Người Nhận Test', '0988776655', '123 Đường Test, Quận 1')`,
        [userTestId]
      )

      const itemRes = await pool.query('SELECT id FROM public.menu_items LIMIT 1')
      const menuItemId = itemRes.rows[0].id
      await pool.query(
        `INSERT INTO public.customer_favorites (user_id, menu_item_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userTestId, menuItemId]
      )

      // Create a completed order for userTestId
      const orderRes = await pool.query(
        `INSERT INTO public.orders (
          code, customer_user_id, order_type, status, payment_status, payment_method,
          subtotal_vnd, shipping_fee_vnd, total_vnd, customer_name, customer_phone,
          delivery_zone_id, zone_name_snapshot, address_snapshot, internal_note
        ) VALUES (
          $1, $2, 'delivery', 'completed', 'paid', 'cash',
          250000, 30000, 280000, 'Khách Hàng Xóa Test', '0988776655',
          '40000000-0000-0000-0000-000000000001', 'Nội ô Thị trấn Vĩnh An (< 3km)', '123 Đường Test, Phường Bến Nghé',
          ''
        ) RETURNING id`,
        [`ORD_DEL_${Date.now().toString().slice(-6)}`, userTestId]
      )
      orderId = orderRes.rows[0].id
      createdOrderIds.push(orderId)

      await pool.query(
        `INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd)
         VALUES ($1, $2, 'Món Test', 250000, 1, 250000)`,
        [orderId, menuItemId]
      )

      // Create a completed reservation for userTestId
      const resvRes = await pool.query(
        `INSERT INTO public.reservations (
          code, status, customer_user_id, customer_name, customer_phone,
          guest_count, starts_at, ends_at
        ) VALUES (
          $1, 'completed', $2, 'Khách Hàng Xóa Test', '0988776655',
          4, now() - interval '1 day', now() - interval '22 hours'
        ) RETURNING id`,
        [`RES_DEL_${Date.now().toString().slice(-6)}`, userTestId]
      )
      reservationId = resvRes.rows[0].id
      createdReservationIds.push(reservationId)
    })

    it('executes account deletion, detaches orders and anonymizes PII snapshots', async () => {
      const res = await customerReq(userTestToken, 'DELETE', '/me', { confirmation: 'XÓA TÀI KHOẢN' })
      expect(res.status).toBe(200)
      expect(res.body.data?.deleted).toBe(true)

      // 1. Private assets deleted
      const addrCheck = await pool.query('SELECT 1 FROM public.customer_addresses WHERE user_id = $1', [userTestId])
      expect(addrCheck.rows.length).toBe(0)

      const favCheck = await pool.query('SELECT 1 FROM public.customer_favorites WHERE user_id = $1', [userTestId])
      expect(favCheck.rows.length).toBe(0)

      const profileCheck = await pool.query('SELECT 1 FROM public.customer_profiles WHERE user_id = $1', [userTestId])
      expect(profileCheck.rows.length).toBe(0)

      // 2. Order detached and PII anonymized
      const orderCheck = await pool.query(
        'SELECT customer_user_id, customer_name, customer_phone, address_snapshot, total_vnd FROM public.orders WHERE id = $1',
        [orderId]
      )
      expect(orderCheck.rows[0].customer_user_id).toBeNull()
      expect(orderCheck.rows[0].customer_name).toBe('Khách Hàng (Đã Xóa)')
      expect(orderCheck.rows[0].customer_phone).toBe('0000000000')
      expect(orderCheck.rows[0].address_snapshot).toContain('[Địa chỉ đã ẩn danh')
      // Financial snapshot is preserved!
      expect(Number(orderCheck.rows[0].total_vnd)).toBe(280000)

      // 3. Reservation detached and PII sanitized
      const resvCheck = await pool.query(
        'SELECT customer_user_id, customer_name, customer_phone FROM public.reservations WHERE id = $1',
        [reservationId]
      )
      expect(resvCheck.rows[0].customer_user_id).toBeNull()
      expect(resvCheck.rows[0].customer_name).toBe('Khách Hàng (Đã Xóa)')
      expect(resvCheck.rows[0].customer_phone).toBe('0000000000')

      // 4. Job status recorded
      const jobCheck = await pool.query(
        'SELECT status, step FROM public.account_deletion_jobs WHERE user_id = $1',
        [userTestId]
      )
      expect(jobCheck.rows.length).toBeGreaterThan(0)
      expect(jobCheck.rows[0].status).toBe('completed')
    })

    it('denies any subsequent request from a deleted user with 401 AUTH_REQUIRED', async () => {
      // User has been deleted from auth.users by the full deletion test
      const res = await customerReq(userTestToken, 'GET', '/me')
      expect(res.status).toBe(401)
      expect(res.body.error?.code).toBe('AUTH_REQUIRED')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Retention Cleanup Scheduler & Safeguards (Decision D04)
  // -------------------------------------------------------------------------
  describe('3. Retention Cleanup & D04 Safeguards', () => {
    it('rejects unauthenticated calls to retention endpoints with 401', async () => {
      const dryRes = await adminReq(null, 'GET', '/retention/dry-run')
      expect(dryRes.status).toBe(401)

      const runRes = await adminReq(null, 'POST', '/retention/run')
      expect(runRes.status).toBe(401)
    })

    it('allows verified admin to perform retention dry-run', async () => {
      const res = await adminReq(adminToken, 'GET', '/retention/dry-run')
      expect(res.status).toBe(200)
      expect(res.body.data?.dry_run).toBe(true)
      expect(res.body.data?.idempotency_purged).toBeDefined()
    })

    it('allows execution of retention cleanup with verified admin credentials or cron secret', async () => {
      const res = await adminReq(adminToken, 'POST', '/retention/run', {
        confirm_production_cleanup: true,
      })
      expect(res.status).toBe(200)
      expect(res.body.data?.dry_run).toBe(false)
      expect(res.body.data?.idempotency_purged).toBeDefined()
    })
  })
})
