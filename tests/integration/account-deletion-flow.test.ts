/**
 * Tiger 345 - Account Deletion, Tombstones & Retry Worker Integration Tests (F05 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * - Affected API:
 *   - DELETE /functions/v1/customer-api/me
 *   - POST /functions/v1/admin-api/retention/retry-deletions
 *   - POST /functions/v1/public-api/order-quotes
 *   - handleCustomerApi, handleAdminApi, handlePublicApi
 * - Data Schemas:
 *   - public.customer_tombstones (user_id, email_hash, deletion_requested_at, db_cleaned_at, auth_deleted_at)
 *   - public.account_deletion_jobs (user_id, status, step, retry_count, last_error_code, error_message)
 *   - public.customer_profiles (user_id, deletion_requested_at)
 *   - public.orders (customer_user_id, customer_name, customer_phone, address_snapshot)
 * - Verbatim Instructions:
 *   - "BƯỚC 7 — F05: ACCOUNT DELETION AN TOÀN VÀ RETRY THẬT"
 *   - "Xem xét cơ chế xử lý khi xóa tài khoản customer (customer-api/customer-handlers.ts, customer_tombstones, queue retry)."
 *   - "Đảm bảo: nếu Supabase Auth admin delete thất bại, không để lại trạng thái nửa vời làm hỏng tính toàn vẹn hoặc không retry được."
 *   - "Có cơ chế retry rõ ràng (hàng đợi / scheduled job / admin trigger) thay vì chỉ log lỗi rồi bỏ qua."
 *   - "Viết integration test cho luồng xóa tài khoản: thành công, thất bại có ghi nhận retry, và cơ chế retry xử lý lại."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { processDeletionRetries } from '../../supabase/functions/_shared/account-deletion-worker.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('F05: Account Deletion, Tombstones & Retry Worker Integration Tests', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)

    // Create a real active admin user in GoTrue + admin_profiles
    const adminEmail = `admin-active-${Date.now()}@tiger345.vn`
    const { data: adminCreated, error: adminCreateErr } =
      await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: { display_name: 'Bếp Trưởng Admin' },
      })
    if (adminCreateErr || !adminCreated.user) {
      throw new Error(`Failed to create test admin in GoTrue: ${adminCreateErr?.message}`)
    }
    const adminUserId = adminCreated.user.id

    await pool.query(
      `INSERT INTO public.admin_profiles (user_id, display_name, active)
       VALUES ($1, 'Bếp Trưởng Admin', true)
       ON CONFLICT (user_id) DO UPDATE SET active = true`,
      [adminUserId]
    )
    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Bếp Trưởng Admin')
       ON CONFLICT (user_id) DO NOTHING`,
      [adminUserId]
    )

    const { data: adminLogin, error: adminLoginErr } =
      await supabaseAdmin.auth.signInWithPassword({
        email: adminEmail,
        password: 'Password123!',
      })
    if (adminLoginErr || !adminLogin.session) {
      throw new Error(`Admin login failed: ${adminLoginErr?.message}`)
    }
    adminToken = adminLogin.session.access_token
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('Scenario 1: Happy path deletion - cleans data, detaches orders, removes Auth user, records tombstone', async () => {
    // 1. Create a dedicated customer user
    const email = `test-delete-happy-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Xóa Thành Công' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    // Ensure customer profile exists
    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Xóa Thành Công')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    // Add address and order
    await pool.query(
      `INSERT INTO public.customer_addresses (user_id, label, recipient_name, phone, address_line)
       VALUES ($1, 'Nhà riêng', 'Khách Xóa', '0912345678', '123 Test')`,
      [userId]
    )

    const orderId = `50000000-0000-0000-0000-${Date.now().toString().slice(-12)}`
    await pool.query(
      `INSERT INTO public.orders (
         id, code, order_type, status, customer_user_id, customer_name, customer_phone,
         address_snapshot, delivery_zone_id, zone_name_snapshot,
         subtotal_vnd, shipping_fee_vnd, total_vnd
       ) VALUES (
         $1, $2, 'delivery', 'completed', $3, 'Khách Xóa', '0912345678',
         '123 Đường Test, Quận 1', '40000000-0000-0000-0000-000000000001', 'Quận 1',
         100000, 0, 100000
       )`,
      [orderId, `DEL-${Date.now().toString().slice(-6)}`, userId]
    )

    // Sign in as this customer
    const { data: login, error: loginErr } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: 'Password123!',
    })
    expect(loginErr).toBeNull()
    const customerToken = login.session!.access_token

    // 2. Execute DELETE /me
    const delReq = new Request('http://localhost/functions/v1/customer-api/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ confirmation: 'XÓA TÀI KHOẢN' }),
    })

    const delRes = await handleCustomerApi(delReq, { pool, supabaseAdmin })
    expect(delRes.status).toBe(200)
    const delData = await delRes.json()
    expect(delData.data.status).toBe('completed')

    // 3. Verify Database state:
    // a. customer_tombstones has record with db_cleaned_at and auth_deleted_at
    const tombstoneRes = await pool.query(
      `SELECT user_id, db_cleaned_at, auth_deleted_at FROM public.customer_tombstones WHERE user_id = $1`,
      [userId]
    )
    expect(tombstoneRes.rows.length).toBe(1)
    expect(tombstoneRes.rows[0].db_cleaned_at).toBeTruthy()
    expect(tombstoneRes.rows[0].auth_deleted_at).toBeTruthy()

    // b. customer_profiles and customer_addresses deleted
    const profileRes = await pool.query(
      `SELECT * FROM public.customer_profiles WHERE user_id = $1`,
      [userId]
    )
    expect(profileRes.rows.length).toBe(0)

    const addrRes = await pool.query(
      `SELECT * FROM public.customer_addresses WHERE user_id = $1`,
      [userId]
    )
    expect(addrRes.rows.length).toBe(0)

    // c. Order detached and anonymized
    const orderRes = await pool.query(
      `SELECT customer_user_id, customer_name, customer_phone, total_vnd FROM public.orders WHERE id = $1`,
      [orderId]
    )
    expect(orderRes.rows[0].customer_user_id).toBeNull()
    expect(orderRes.rows[0].customer_name).toBe('Khách Hàng (Đã Xóa)')
    expect(orderRes.rows[0].customer_phone).toBe('0000000000')
    expect(Number(orderRes.rows[0].total_vnd)).toBe(100000)

    // d. Auth user deleted from GoTrue
    const { data: getUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    expect(getUser.user).toBeNull()
  })

  it('Scenario 2: Failure during Auth Provider deletion - records failure, blocks token reuse, and retry worker succeeds', async () => {
    // 1. Create a customer user
    const email = `test-delete-retry-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Lỗi Auth' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Lỗi Auth')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    const { data: login, error: loginErr } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password: 'Password123!',
    })
    expect(loginErr).toBeNull()
    const customerToken = login.session!.access_token

    // 2. Simulate Auth Provider delete failure by using a custom supabaseAdmin proxy for the deletion step
    const failingAuthAdmin = new Proxy(supabaseAdmin, {
      get(target, prop, receiver) {
        if (prop === 'auth') {
          return new Proxy(target.auth, {
            get(authTarget, authProp, authReceiver) {
              if (authProp === 'admin') {
                return new Proxy(authTarget.admin, {
                  get(adminTarget, adminProp) {
                    if (adminProp === 'deleteUser') {
                      return async () => ({
                        data: null,
                        error: {
                          name: 'AUTH_GATEWAY_TIMEOUT',
                          message: 'GoTrue service temporarily unreachable',
                          status: 504,
                        },
                      })
                    }
                    return Reflect.get(adminTarget, adminProp)
                  },
                })
              }
              return Reflect.get(authTarget, authProp, authReceiver)
            },
          })
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as SupabaseClient

    const delReq = new Request('http://localhost/functions/v1/customer-api/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ confirmation: 'XÓA TÀI KHOẢN' }),
    })

    // Execute deletion with failing Auth client
    const delRes = await handleCustomerApi(delReq, { pool, supabaseAdmin: failingAuthAdmin })
    // Handler MUST return 202 Accepted ('processing' / 'auth_delete_pending')
    expect(delRes.status).toBe(202)
    const delData = await delRes.json()
    expect(delData.data.status).toBe('processing')
    expect(delData.data.step).toBe('auth_delete_pending')

    // 3. Verify Database state during partial failure:
    // a. customer_tombstones exists with db_cleaned_at set, auth_deleted_at is NULL
    const tombstoneRes = await pool.query(
      `SELECT user_id, db_cleaned_at, auth_deleted_at FROM public.customer_tombstones WHERE user_id = $1`,
      [userId]
    )
    expect(tombstoneRes.rows.length).toBe(1)
    expect(tombstoneRes.rows[0].db_cleaned_at).toBeTruthy()
    expect(tombstoneRes.rows[0].auth_deleted_at).toBeNull()

    // b. account_deletion_jobs is in failed state with retry_count = 1
    const jobRes = await pool.query(
      `SELECT status, step, retry_count, last_error_code FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(jobRes.rows.length).toBe(1)
    expect(jobRes.rows[0].status).toBe('failed')
    expect(jobRes.rows[0].step).toBe('auth_delete')
    expect(jobRes.rows[0].retry_count).toBe(1)
    expect(jobRes.rows[0].last_error_code).toBe('AUTH_GATEWAY_TIMEOUT')

    // 4. VERIFY INDEPENDENT TOMBSTONE GATE:
    // Even though Auth user still exists in Supabase GoTrue, customer JWT MUST BE BLOCKED!
    // a. Customer API request with this token -> MUST THROW 403 FORBIDDEN
    const testReqCustomer = new Request('http://localhost/functions/v1/customer-api/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    })
    const resCustomer = await handleCustomerApi(testReqCustomer, { pool, supabaseAdmin })
    expect(resCustomer.status).toBe(403)
    const errCustomer = await resCustomer.json()
    expect(errCustomer.error.message).toContain('Tài khoản đã bị xóa')

    // b. Public API request with this token -> MUST THROW 403 FORBIDDEN (No token reuse!)
    const testReqPublic = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        order_type: 'delivery',
        delivery_zone_id: '40000000-0000-0000-0000-000000000001',
        items: [{ menu_item_id: '10000000-0000-0000-0000-000000000001', quantity: 1 }],
      }),
    })
    const resPublic = await handlePublicApi(testReqPublic, { pool, supabaseAdmin })
    expect(resPublic.status).toBe(403)
    const errPublic = await resPublic.json()
    expect(errPublic.error.message).toContain('Tài khoản đã bị xóa')

    // 5. RETRY WORKER EXECUTION:
    // Call retry endpoint via admin-api: POST /admin-api/retention/retry-deletions
    const retryReq = new Request('http://localhost/functions/v1/admin-api/retention/retry-deletions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ limit: 10, max_retries: 5 }),
    })

    const retryRes = await handleAdminApi(retryReq, { pool, supabaseAdmin })
    expect(retryRes.status).toBe(200)
    const retryData = await retryRes.json()
    expect(retryData.data.processed).toBeGreaterThanOrEqual(1)
    expect(retryData.data.succeeded).toBeGreaterThanOrEqual(1)

    // 6. Verify post-retry state:
    // a. account_deletion_jobs status is now 'completed'
    const finalJobRes = await pool.query(
      `SELECT status, step, last_error_code FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(finalJobRes.rows[0].status).toBe('completed')
    expect(finalJobRes.rows[0].step).toBe('completed')
    expect(finalJobRes.rows[0].last_error_code).toBeNull()

    // b. customer_tombstones auth_deleted_at is now populated
    const finalTombstoneRes = await pool.query(
      `SELECT auth_deleted_at FROM public.customer_tombstones WHERE user_id = $1`,
      [userId]
    )
    expect(finalTombstoneRes.rows[0].auth_deleted_at).toBeTruthy()

    // c. Auth user is now actually deleted from GoTrue
    const { data: finalUser } = await supabaseAdmin.auth.admin.getUserById(userId)
    expect(finalUser.user).toBeNull()
  })

  it('Scenario 3: Active Admin cannot self-delete via customer portal', async () => {
    // Use active admin token on DELETE /customer-api/me
    const delReq = new Request('http://localhost/functions/v1/customer-api/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ confirmation: 'XÓA TÀI KHOẢN' }),
    })

    const delRes = await handleCustomerApi(delReq, { pool, supabaseAdmin })
    expect(delRes.status).toBe(403)
    const err = await delRes.json()
    expect(err.error.code).toBe('ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN')
    expect(err.error.message).toContain('Tài khoản quản trị viên')
  })

  it('Scenario 4: Step Resumption - Retries DB cleanup before Auth delete and prevents orphan accounts', async () => {
    // 1. Create a customer user
    const email = `test-resume-step-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Thử Nghiệm Step' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Thử Nghiệm Step')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    // Request deletion manually into 'failed' state at step 'db_cleanup'
    await pool.query(
      `INSERT INTO public.account_deletion_jobs (user_id, status, step, retry_count, last_error_code, error_message)
       VALUES ($1, 'failed', 'db_cleanup', 1, 'DB_CLEANUP_FAILED', 'Simulated lock error')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'failed',
         step = 'db_cleanup',
         retry_count = 1,
         last_error_code = 'DB_CLEANUP_FAILED'`,
      [userId]
    )
    await pool.query(
      `INSERT INTO public.customer_tombstones (user_id, email_hash, deletion_requested_at)
       VALUES ($1, digest($2, 'sha256'), now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email.toLowerCase()]
    )

    // 2. Run worker
    let authDeleteCalled = false
    const trackingAuthAdmin = new Proxy(supabaseAdmin, {
      get(target, prop, receiver) {
        if (prop === 'auth') {
          return new Proxy(target.auth, {
            get(authTarget, authProp, authReceiver) {
              if (authProp === 'admin') {
                return new Proxy(authTarget.admin, {
                  get(adminTarget, adminProp) {
                    if (adminProp === 'deleteUser') {
                      return async (...args: unknown[]) => {
                        // Verify that DB cleanup HAS ALREADY HAPPENED before deleteUser is called!
                        const checkProfile = await pool.query(
                          `SELECT * FROM public.customer_profiles WHERE user_id = $1`,
                          [userId]
                        )
                        expect(checkProfile.rows.length).toBe(0) // Must be cleaned from DB!
                        authDeleteCalled = true
                        return (adminTarget.deleteUser as Function).apply(adminTarget, args)
                      }
                    }
                    return Reflect.get(adminTarget, adminProp, adminTarget)
                  },
                })
              }
              return Reflect.get(authTarget, authProp, authReceiver)
            },
          })
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as SupabaseClient

    const workerResult = await processDeletionRetries(pool, trackingAuthAdmin, { limit: 10, maxRetries: 5 })
    expect(workerResult.succeeded).toBeGreaterThanOrEqual(1)
    expect(authDeleteCalled).toBe(true)

    // Verify final state
    const jobRes = await pool.query(
      `SELECT status, step, retry_count, lease_expires_at, claimed_by FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(jobRes.rows[0].status).toBe('completed')
    expect(jobRes.rows[0].step).toBe('completed')
    expect(jobRes.rows[0].lease_expires_at).toBeNull()
  })

  it('Scenario 5: Hung Job Reclamation with Lease Timeout', async () => {
    // 1. Create a customer user
    const email = `test-hung-lease-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Treo Job' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Treo Job')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )

    // Simulate a hung job that crashed 10 minutes ago with an expired lease
    const pastLease = new Date(Date.now() - 10 * 60 * 1000)
    await pool.query(
      `INSERT INTO public.account_deletion_jobs (
         user_id, status, step, retry_count, lease_expires_at, claimed_by
       ) VALUES ($1, 'processing', 'db_cleanup', 1, $2, 'dead-worker-pid-9999')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'processing',
         step = 'db_cleanup',
         lease_expires_at = $2,
         claimed_by = 'dead-worker-pid-9999'`,
      [userId, pastLease]
    )
    await pool.query(
      `INSERT INTO public.customer_tombstones (user_id, email_hash, deletion_requested_at)
       VALUES ($1, digest($2, 'sha256'), now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email.toLowerCase()]
    )

    // 2. Process retries - should reclaim this expired lease job and complete it
    const workerResult = await processDeletionRetries(pool, supabaseAdmin, { limit: 10, maxRetries: 5 })
    const matched = workerResult.results.find((r) => r.userId === userId)
    expect(matched?.success).toBe(true)

    // Verify job completed and lease released
    const jobRes = await pool.query(
      `SELECT status, step, lease_expires_at, claimed_by FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(jobRes.rows[0].status).toBe('completed')
    expect(jobRes.rows[0].lease_expires_at).toBeNull()
    expect(jobRes.rows[0].claimed_by).toBeNull()
  })

  it('Scenario 6: Terminal Retry State (exhausted) when retry limit is reached', async () => {
    // 1. Create a customer user
    const email = `test-exhausted-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Kiệt Retry' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    // Job already at retry_count = 4 with maxRetries = 5
    await pool.query(
      `INSERT INTO public.account_deletion_jobs (user_id, status, step, retry_count, last_error_code, error_message)
       VALUES ($1, 'failed', 'auth_delete', 4, 'AUTH_ERROR', 'Persistent failure')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'failed',
         step = 'auth_delete',
         retry_count = 4,
         last_error_code = 'AUTH_ERROR'`,
      [userId]
    )

    // Mock failing deleteUser
    const failingAuthAdmin = new Proxy(supabaseAdmin, {
      get(target, prop, receiver) {
        if (prop === 'auth') {
          return new Proxy(target.auth, {
            get(authTarget, authProp, authReceiver) {
              if (authProp === 'admin') {
                return new Proxy(authTarget.admin, {
                  get(adminTarget, adminProp) {
                    if (adminProp === 'deleteUser') {
                      return async () => ({
                        data: null,
                        error: {
                          name: 'AUTH_FATAL_ERROR',
                          message: 'Persistent server error from GoTrue',
                          status: 500,
                        },
                      })
                    }
                    return Reflect.get(adminTarget, adminProp)
                  },
                })
              }
              return Reflect.get(authTarget, authProp, authReceiver)
            },
          })
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as SupabaseClient

    // Run worker with maxRetries: 5. This 5th attempt must mark job as 'exhausted'
    const workerResult = await processDeletionRetries(pool, failingAuthAdmin, { limit: 10, maxRetries: 5 })
    const matched = workerResult.results.find((r) => r.userId === userId)
    expect(matched?.success).toBe(false)

    // Verify job is now terminal 'exhausted' with full error details for admin audit
    const jobRes = await pool.query(
      `SELECT status, step, retry_count, last_error_code, error_message FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(jobRes.rows[0].status).toBe('exhausted')
    expect(jobRes.rows[0].retry_count).toBe(5)
    expect(jobRes.rows[0].last_error_code).toBe('AUTH_FATAL_ERROR')
    expect(jobRes.rows[0].error_message).toContain('Persistent server error')

    // Clean up created user in GoTrue
    await supabaseAdmin.auth.admin.deleteUser(userId)
  })

  it('Scenario 7: Worker Lease Ownership Fencing - Expired or preempted worker cannot overwrite status', async () => {
    // 1. Create a customer user
    const email = `test-lease-fencing-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Kiểm Tra Lease' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Kiểm Tra Lease')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )
    await pool.query(
      `INSERT INTO public.customer_tombstones (user_id, email_hash, deletion_requested_at)
       VALUES ($1, digest($2, 'sha256'), now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email.toLowerCase()]
    )

    // 2. Worker A initially claimed the job, but its lease expired
    const expiredLease = new Date(Date.now() - 5 * 60 * 1000)
    await pool.query(
      `INSERT INTO public.account_deletion_jobs (
         user_id, status, step, retry_count, lease_expires_at, claimed_by
       ) VALUES ($1, 'processing', 'auth_delete', 1, $2, 'worker-A')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'processing',
         step = 'auth_delete',
         lease_expires_at = $2,
         claimed_by = 'worker-A'`,
      [userId, expiredLease]
    )

    // 3. Worker B reclaims the job via claim_account_deletion_jobs
    const claimRes = await pool.query(
      `SELECT user_id, status
       FROM public.claim_account_deletion_jobs(10, 300, 5, 'worker-B')
       WHERE user_id = $1`,
      [userId]
    )
    expect(claimRes.rows.length).toBe(1)
    expect(claimRes.rows[0].status).toBe('processing')

    // 4. Worker A (stale) attempts to report a failure while Worker B holds the active claim
    const staleAttemptRes1 = await pool.query(
      `SELECT public.complete_account_deletion_job(
         $1, false, 'WORKER_A_TIMEOUT', 'Worker A delayed execution', 'auth_delete', 5, 'worker-A'
       ) as completed`,
      [userId]
    )
    // Stale worker call MUST be rejected
    expect(staleAttemptRes1.rows[0].completed).toBe(false)

    // Verify Worker B's active processing lease is completely untouched
    const checkMidJob = await pool.query(
      `SELECT status, claimed_by, last_error_code FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(checkMidJob.rows[0].status).toBe('processing')
    expect(checkMidJob.rows[0].claimed_by).toBe('worker-B')
    expect(checkMidJob.rows[0].last_error_code).toBeNull()

    // 5. Worker B successfully completes the job
    const workerBSuccessRes = await pool.query(
      `SELECT public.complete_account_deletion_job(
         $1, true, NULL, NULL, 'completed', 5, 'worker-B'
       ) as completed`,
      [userId]
    )
    expect(workerBSuccessRes.rows[0].completed).toBe(true)

    // 6. Worker A attempts to report failure on an already completed job
    const staleAttemptRes2 = await pool.query(
      `SELECT public.complete_account_deletion_job(
         $1, false, 'WORKER_A_POST_SUCCESS_OVERWRITE', 'Worker A late overwrite attempt', 'auth_delete', 5, 'worker-A'
       ) as completed`,
      [userId]
    )
    expect(staleAttemptRes2.rows[0].completed).toBe(false)

    // 7. Verify final database state remains strictly 'completed'
    const finalJobRes = await pool.query(
      `SELECT status, step, last_error_code FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(finalJobRes.rows[0].status).toBe('completed')
    expect(finalJobRes.rows[0].step).toBe('completed')
    expect(finalJobRes.rows[0].last_error_code).toBeNull()

    // Clean up
    await supabaseAdmin.auth.admin.deleteUser(userId)
  })

  it('Scenario 8: Stale Worker DB Cleanup Fencing - Worker cannot run DB cleanup or revert step after job is completed by newer worker', async () => {
    // 1. Create customer user with active profile
    const email = `test-cleanup-fencing-${Date.now()}@example.com`
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: 'Password123!',
      email_confirm: true,
      user_metadata: { display_name: 'Khách Cleanup Fencing' },
    })
    expect(createErr).toBeNull()
    const userId = created.user!.id

    await pool.query(
      `INSERT INTO public.customer_profiles (user_id, display_name)
       VALUES ($1, 'Khách Cleanup Fencing')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    )
    await pool.query(
      `INSERT INTO public.customer_tombstones (user_id, email_hash, deletion_requested_at)
       VALUES ($1, digest($2, 'sha256'), now())
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, email.toLowerCase()]
    )

    // 2. Worker A claimed the job initially at step 'db_cleanup', but its lease expired
    const expiredLease = new Date(Date.now() - 5 * 60 * 1000)
    await pool.query(
      `INSERT INTO public.account_deletion_jobs (
         user_id, status, step, retry_count, lease_expires_at, claimed_by
       ) VALUES ($1, 'processing', 'db_cleanup', 1, $2, 'worker-A')
       ON CONFLICT (user_id) DO UPDATE SET
         status = 'processing',
         step = 'db_cleanup',
         lease_expires_at = $2,
         claimed_by = 'worker-A'`,
      [userId, expiredLease]
    )

    // 3. Worker B reclaims the job via claim_account_deletion_jobs
    const claimRes = await pool.query(
      `SELECT user_id, status
       FROM public.claim_account_deletion_jobs(10, 300, 5, 'worker-B')
       WHERE user_id = $1`,
      [userId]
    )
    expect(claimRes.rows.length).toBe(1)
    expect(claimRes.rows[0].status).toBe('processing')

    // 4. Worker B performs DB cleanup and completes the entire job
    const workerBCleanupRes = await pool.query(
      `SELECT public.process_account_deletion_db($1, 'worker-B') as success`,
      [userId]
    )
    expect(workerBCleanupRes.rows[0].success).toBe(true)

    const workerBCompleteRes = await pool.query(
      `SELECT public.complete_account_deletion_job($1, true, NULL, NULL, 'completed', 5, 'worker-B') as completed`,
      [userId]
    )
    expect(workerBCompleteRes.rows[0].completed).toBe(true)

    // Verify job is fully completed by Worker B
    const completedJobRes = await pool.query(
      `SELECT status, step, completed_at, claimed_by FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(completedJobRes.rows[0].status).toBe('completed')
    expect(completedJobRes.rows[0].step).toBe('completed')
    expect(completedJobRes.rows[0].completed_at).not.toBeNull()
    const originalCompletedAt = completedJobRes.rows[0].completed_at

    // 5. Worker A wakes up late and attempts to run process_account_deletion_db
    const staleCleanupAttempt = await pool.query(
      `SELECT public.process_account_deletion_db($1, 'worker-A') as success`,
      [userId]
    )
    // Stale cleanup MUST be rejected with false
    expect(staleCleanupAttempt.rows[0].success).toBe(false)

    // 6. Verify job status was NOT corrupted back to 'processing' or 'db_cleanup'
    const postAttackJobRes = await pool.query(
      `SELECT status, step, completed_at, claimed_by FROM public.account_deletion_jobs WHERE user_id = $1`,
      [userId]
    )
    expect(postAttackJobRes.rows[0].status).toBe('completed')
    expect(postAttackJobRes.rows[0].step).toBe('completed')
    expect(postAttackJobRes.rows[0].completed_at.getTime()).toBe(originalCompletedAt.getTime())
    expect(postAttackJobRes.rows[0].claimed_by).toBeNull()

    // Clean up
    await supabaseAdmin.auth.admin.deleteUser(userId)
  })
})
