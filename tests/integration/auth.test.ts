import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { seedFixtureUsers, getUserToken, FIXTURE_USERS } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Auth Gateways & Security Invariants Integration (V05, V25)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
  })

  afterAll(async () => {
    // Reset any modified test user flags
    await pool.query(
      `UPDATE customer_profiles SET deletion_requested_at = NULL WHERE user_id = $1`,
      [FIXTURE_USERS.customerB.id]
    )
    await pool.query(
      `UPDATE admin_profiles SET active = false WHERE user_id = $1`,
      [FIXTURE_USERS.disabledAdmin.id]
    )
    await pool.end()
  })

  describe('Public API Gateway (/public-api)', () => {
    it('allows guest access when no authorization header is present', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/health', {
        method: 'GET',
        headers: { 'X-Forwarded-For': '10.0.0.1' },
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.status).toBe('ok')
      expect(body.data.actor.role).toBe('guest')
      expect(body.data.actor.userId).toBeNull()
      expect(body.request_id).toBeDefined()
    })

    it('rejects invalid or expired token with 401 AUTH_REQUIRED (V05: never silently degrades to guest)', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/health', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid.token.signature123',
          'X-Forwarded-For': '10.0.0.2',
        },
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(401)

      const body = await res.json()
      expect(body.error.code).toBe('AUTH_REQUIRED')
      expect(body.error.message).toContain('Phiên đăng nhập không hợp lệ hoặc đã hết hạn')
      expect(body.request_id).toBeDefined()
    })

    it('resolves authenticated customer identity when valid token is passed to public api', async () => {
      const token = getUserToken('customerA')
      const req = new Request('http://localhost/functions/v1/public-api/health', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.3',
        },
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.actor.role).toBe('customer')
      expect(body.data.actor.userId).toBe(FIXTURE_USERS.customerA.id)
    })
  })

  describe('Customer API Gateway (/customer-api)', () => {
    it('rejects unauthenticated requests with 401 AUTH_REQUIRED', async () => {
      const req = new Request('http://localhost/functions/v1/customer-api/me', {
        method: 'GET',
        headers: { 'X-Forwarded-For': '10.0.0.4' },
      })

      const res = await handleCustomerApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(401)

      const body = await res.json()
      expect(body.error.code).toBe('AUTH_REQUIRED')
    })

    it('returns customer profile for valid authenticated customer', async () => {
      const token = getUserToken('customerA')
      const req = new Request('http://localhost/functions/v1/customer-api/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.5',
        },
      })

      const res = await handleCustomerApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.user_id).toBe(FIXTURE_USERS.customerA.id)
      expect(body.data.display_name).toBe(FIXTURE_USERS.customerA.displayName)
      expect(body.data.phone).toBe(FIXTURE_USERS.customerA.phone)
    })

    it('denies customer access with 403 FORBIDDEN if deletion_requested_at is set', async () => {
      // Mark customer B as deletion requested
      await pool.query(
        `UPDATE customer_profiles SET deletion_requested_at = now() WHERE user_id = $1`,
        [FIXTURE_USERS.customerB.id]
      )

      const token = getUserToken('customerB')
      const req = new Request('http://localhost/functions/v1/customer-api/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.6',
        },
      })

      const res = await handleCustomerApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(403)

      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.error.message).toContain('Tài khoản đang trong quá trình xóa hoặc đã bị khóa')
    })
  })

  describe('Admin API Gateway (/admin-api)', () => {
    it('allows active admin access to metrics dashboard', async () => {
      const token = getUserToken('admin')
      const req = new Request('http://localhost/functions/v1/admin-api/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.7',
        },
      })

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.active_tables_count).toBeGreaterThanOrEqual(1)
      expect(body.data.pending_orders_count).toBeDefined()
      expect(body.data.open_visits_count).toBeDefined()
    })

    it('immediately denies disabled admin with 403 FORBIDDEN (verifies active=true on every request)', async () => {
      const token = getUserToken('disabledAdmin')
      const req = new Request('http://localhost/functions/v1/admin-api/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.8',
        },
      })

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(403)

      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.error.message).toContain('Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa')
    })

    it('denies regular customer from accessing admin api with 403 FORBIDDEN', async () => {
      const token = getUserToken('customerA')
      const req = new Request('http://localhost/functions/v1/admin-api/dashboard', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '10.0.0.9',
        },
      })

      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(403)

      const body = await res.json()
      expect(body.error.code).toBe('FORBIDDEN')
      expect(body.error.message).toContain('Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa')
    })
  })

  describe('Rate Limiting & Abuse Prevention', () => {
    it('enforces 429 RATE_LIMITED when threshold is exceeded from the same IP', async () => {
      const ip = '198.51.100.99'
      const requests = Array.from({ length: 65 }).map((_, i) =>
        new Request(`http://localhost/functions/v1/public-api/health?r=${i}`, {
          method: 'GET',
          headers: { 'X-Forwarded-For': ip },
        })
      )

      // Send requests sequentially or batched
      let hitRateLimit = false
      let retryAfterHeader: string | null = null

      for (const req of requests) {
        const res = await handlePublicApi(req, { pool, supabaseAdmin })
        if (res.status === 429) {
          hitRateLimit = true
          retryAfterHeader = res.headers.get('Retry-After')
          const body = await res.json()
          expect(body.error.code).toBe('RATE_LIMITED')
          expect(body.request_id).toBeDefined()
          break
        }
      }

      expect(hitRateLimit).toBe(true)
      expect(retryAfterHeader).not.toBeNull()
      expect(Number(retryAfterHeader)).toBeGreaterThan(0)
    })
  })
})
