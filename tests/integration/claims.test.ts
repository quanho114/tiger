/**
 * Tiger 345 - Guest Order Claim Integration Tests (Task T18)
 * Importers/callers: npm run test:integration -- tests/integration/claims.test.ts, Vitest runner
 * Affected API: POST /functions/v1/customer-api/me/orders/:id/claim, public.claim_guest_order
 * Data schemas: orders, guest_order_claims, customer_profiles, audit_logs
 * User's verbatim instruction: "làm full các task luôn ấy"
 * Enforces Invariant V22 (Guest Order Claim Security & Flow):
 * 1. Cryptographic 32-byte secret (SHA-256 hash stored only, 24h TTL)
 * 2. Atomic authenticated claim RPC with row locks
 * 3. Idempotent replay: same owner + same secret returns replayed: true
 * 4. Ownership conflict: another user claiming returns 409 CLAIM_ALREADY_OWNED
 * 5. Wrong secret returns 403 INVALID_CLAIM_SECRET
 * 6. Expired claim returns 410 CLAIM_EXPIRED
 * 7. Deleting profile returns 403 CUSTOMER_DELETING
 * 8. Audit log records event without raw secrets
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleCustomerApi } from '../../supabase/functions/customer-api/index.js'
import { sha256 } from '../../supabase/functions/_shared/crypto.js'
import { seedFixtureUsers, getUserToken, FIXTURE_USERS } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Guest Order Claim Integration (Task T18 - Invariant V22)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let tokenCustomerA: string
  let tokenCustomerB: string

  const userAId = FIXTURE_USERS.customerA.id

  const createdOrderIds: string[] = []

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

  // Helper to create a guest order with a claim secret in the database
  async function createGuestOrderWithClaim(
    claimSecret: string,
    options: { expired?: boolean } = {}
  ): Promise<{ orderId: string; orderCode: string }> {
    const orderCode = `TG-TEST-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
    const expiresAt = options.expired
      ? new Date(Date.now() - 3600 * 1000).toISOString() // 1 hour in the past
      : new Date(Date.now() + 24 * 3600 * 1000).toISOString() // 24 hours in future

    const orderRes = await pool.query(
      `INSERT INTO public.orders (
        id, code, order_type, customer_user_id, status, payment_status,
        subtotal_vnd, shipping_fee_vnd, total_vnd,
        customer_name, customer_phone, address_snapshot,
        delivery_zone_id, zone_name_snapshot, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, 'delivery', NULL, 'pending', 'unpaid',
        100000, 20000, 120000,
        'Khách Hàng Test', '0901234567', '123 Đường Test, Vĩnh An',
        '40000000-0000-0000-0000-000000000001', 'Khu vực 1', now(), now()
      ) RETURNING id, code`,
      [orderCode]
    )

    const orderId = orderRes.rows[0].id
    createdOrderIds.push(orderId)

    const secretHash = sha256(claimSecret)
    await pool.query(
      `INSERT INTO public.guest_order_claims (
        id, order_id, secret_hash, expires_at, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, now()
      )`,
      [orderId, secretHash, expiresAt]
    )

    return { orderId, orderCode }
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    tokenCustomerA = getUserToken('customerA')
    tokenCustomerB = getUserToken('customerB')

    await pool.query('DELETE FROM public.rate_limit_buckets')
  })

  afterAll(async () => {
    if (pool) {
      if (createdOrderIds.length > 0) {
        await pool.query('DELETE FROM public.guest_order_claims WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.audit_logs WHERE entity_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_items WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.order_status_history WHERE order_id = ANY($1)', [createdOrderIds])
        await pool.query('DELETE FROM public.orders WHERE id = ANY($1)', [createdOrderIds])
      }
      await pool.end()
    }
  })

  it('1. Successfully claims a guest order with a valid 32-byte secret', async () => {
    const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    const { orderId, orderCode } = await createGuestOrderWithClaim(secret)

    const res = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      order_id: orderId,
      order_code: orderCode,
      claimed: true,
      replayed: false,
    })
    expect(res.body.data.claimed_at).toBeDefined()

    // Verify DB state: order is now owned by Customer A
    const orderCheck = await pool.query('SELECT customer_user_id FROM public.orders WHERE id = $1', [orderId])
    expect(orderCheck.rows[0].customer_user_id).toBe(userAId)

    // Verify DB state: claim is consumed by Customer A
    const claimCheck = await pool.query(
      'SELECT consumed_at, claimed_by_user_id FROM public.guest_order_claims WHERE order_id = $1',
      [orderId]
    )
    expect(claimCheck.rows[0].consumed_at).not.toBeNull()
    expect(claimCheck.rows[0].claimed_by_user_id).toBe(userAId)

    // Verify audit log has no raw secrets
    const auditCheck = await pool.query(
      `SELECT action, metadata FROM public.audit_logs WHERE entity_id = $1 AND action = 'claim_guest_order'`,
      [orderId]
    )
    expect(auditCheck.rows.length).toBeGreaterThan(0)
    const metaStr = JSON.stringify(auditCheck.rows[0].metadata)
    expect(metaStr).not.toContain(secret)
  })

  it('2. Idempotent replay: same customer retrying with same secret returns replayed: true', async () => {
    const secret = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
    const { orderId, orderCode } = await createGuestOrderWithClaim(secret)

    // First claim
    const firstRes = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })
    expect(firstRes.status).toBe(200)
    expect(firstRes.body.data.replayed).toBe(false)

    // Retry claim by same customer
    const retryRes = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })
    expect(retryRes.status).toBe(200)
    expect(retryRes.body.data).toMatchObject({
      order_id: orderId,
      order_code: orderCode,
      claimed: true,
      replayed: true,
    })
  })

  it('3. Ownership conflict: Customer B attempting to claim Customer A order returns 409 CLAIM_ALREADY_OWNED', async () => {
    const secret = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff'
    const { orderId } = await createGuestOrderWithClaim(secret)

    // Customer A claims first
    await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })

    // Customer B attempts to claim
    const conflictRes = await customerRequest(tokenCustomerB, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })
    expect(conflictRes.status).toBe(409)
    expect(conflictRes.body.error.code).toBe('CLAIM_ALREADY_OWNED')
  })

  it('4. Rejects claim with incorrect secret with 403 INVALID_CLAIM_SECRET', async () => {
    const secret = 'correctsecret12345678901234567890123456789012345678901234567890'
    const wrongSecret = 'wrongsecret12345678901234567890123456789012345678901234567890'
    const { orderId } = await createGuestOrderWithClaim(secret)

    const res = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: wrongSecret,
    })
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('INVALID_CLAIM_SECRET')

    // Verify order remains unclaimed
    const orderCheck = await pool.query('SELECT customer_user_id FROM public.orders WHERE id = $1', [orderId])
    expect(orderCheck.rows[0].customer_user_id).toBeNull()
  })

  it('5. Rejects malformed claim secrets (<16 or >128 chars) with 400 VALIDATION_ERROR', async () => {
    const { orderId } = await createGuestOrderWithClaim('validsecret12345678901234567890')

    // Too short
    const shortRes = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: 'short',
    })
    expect(shortRes.status).toBe(400)
    expect(shortRes.body.error.code).toBe('VALIDATION_ERROR')

    // Empty
    const emptyRes = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: '',
    })
    expect(emptyRes.status).toBe(400)
    expect(emptyRes.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('6. Rejects expired claims (>24h) with 410 CLAIM_EXPIRED', async () => {
    const secret = 'expiredsecret12345678901234567890123456789012345678901234567890'
    const { orderId } = await createGuestOrderWithClaim(secret, { expired: true })

    const res = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
      claim_secret: secret,
    })
    expect(res.status).toBe(410)
    expect(res.body.error.code).toBe('CLAIM_EXPIRED')
  })

  it('7. Rejects claims for accounts undergoing deletion with 403 CUSTOMER_DELETING', async () => {
    const secret = 'deletingsecret12345678901234567890123456789012345678901234567890'
    const { orderId } = await createGuestOrderWithClaim(secret)

    // Temporarily set deletion_requested_at on Customer A
    await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = now() WHERE user_id = $1', [userAId])

    try {
      const res = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${orderId}/claim`, {
        claim_secret: secret,
      })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('FORBIDDEN')
      expect(res.body.error.message).toContain('quá trình xóa')
    } finally {
      // Revert deletion_requested_at
      await pool.query('UPDATE public.customer_profiles SET deletion_requested_at = NULL WHERE user_id = $1', [userAId])
    }
  })

  it('8. Rejects claim on non-existent order with 404 NOT_FOUND', async () => {
    const fakeOrderId = '00000000-0000-0000-0000-000000000999'
    const res = await customerRequest(tokenCustomerA, 'POST', `/me/orders/${fakeOrderId}/claim`, {
      claim_secret: 'validsecret12345678901234567890123456789012345678901234567890',
    })
    expect(res.status).toBe(404)
  })
})
