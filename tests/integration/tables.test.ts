import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { verifyVisitCapability } from '../../supabase/functions/_shared/capability.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Tables, Visits & Capability Integration (Task T06, Invariants V07, V08, V10)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  const createdTableIds: string[] = []

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
      for (const tableId of createdTableIds) {
        // Clean up visits, QR tokens, and tables
        await pool.query(
          'DELETE FROM public.orders WHERE table_visit_id IN (SELECT id FROM public.table_visits WHERE table_id = $1)',
          [tableId]
        )
        await pool.query('DELETE FROM public.table_visits WHERE table_id = $1', [tableId])
        await pool.query('DELETE FROM public.table_qr_tokens WHERE table_id = $1', [tableId])
        await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [tableId])
      }
      await pool.end()
    }
  })

  it('admin creates table: generates table + active QR token (raw token returned once)', async () => {
    const tableCode = `TB-TEST-${Date.now().toString().slice(-4)}`
    const req = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.10',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Test Integration 01',
        sort_order: 10,
      }),
    })

    const res = await handleAdminApi(req, { pool, supabaseAdmin })
    expect(res.status).toBe(201)

    const body = await res.json()
    expect(body.data.table).toBeDefined()
    expect(body.data.table.code).toBe(tableCode)
    expect(body.data.table.version).toBe(1)
    expect(body.data.table.active).toBe(true)
    expect(body.data.qr_token).toBeDefined()
    expect(typeof body.data.qr_token).toBe('string')
    expect(body.data.qr_url).toContain(`/table/${body.data.qr_token}`)

    const tableId = body.data.table.id
    createdTableIds.push(tableId)

    // Verify token in DB is hashed, not plaintext
    const qrDbRes = await pool.query(
      'SELECT id, token_hash, active FROM public.table_qr_tokens WHERE table_id = $1',
      [tableId]
    )
    expect(qrDbRes.rows.length).toBe(1)
    expect(qrDbRes.rows[0].active).toBe(true)
    expect(qrDbRes.rows[0].token_hash).not.toBe(body.data.qr_token)
  })

  it('rejects duplicate table code with 409 DUPLICATE_CODE', async () => {
    const tableCode = `DUP-${Date.now().toString().slice(-4)}`

    // First creation
    const req1 = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.11',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Trùng Mã 1',
      }),
    })
    const res1 = await handleAdminApi(req1, { pool, supabaseAdmin })
    expect(res1.status).toBe(201)
    const body1 = await res1.json()
    createdTableIds.push(body1.data.table.id)

    // Second creation with same code
    const req2 = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.12',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Trùng Mã 2',
      }),
    })
    const res2 = await handleAdminApi(req2, { pool, supabaseAdmin })
    expect(res2.status).toBe(409)
    const body2 = await res2.json()
    expect(body2.error.code).toBe('DUPLICATE_CODE')
  })

  it('resolves QR when no visit is open: returns 409 VISIT_CLOSED', async () => {
    // Create a table with no open visit
    const tableCode = `TB-NOVISIT-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.13',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Chưa Có Khách',
      }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const rawQr = createBody.data.qr_token
    createdTableIds.push(createBody.data.table.id)

    // Public QR resolve
    const resolveReq = new Request('http://localhost/functions/v1/public-api/tables/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.14',
      },
      body: JSON.stringify({ token: rawQr }),
    })
    const resolveRes = await handlePublicApi(resolveReq, { pool, supabaseAdmin })
    expect(resolveRes.status).toBe(409)
    const resolveBody = await resolveRes.json()
    expect(resolveBody.error.code).toBe('VISIT_CLOSED')
  })

  it('opens table visit, resolves QR, and verifies valid visit capability', async () => {
    const tableCode = `TB-VISIT-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.15',
      },
      body: JSON.stringify({
        code: tableCode,
        name: 'Bàn Sắp Mở Phiên',
      }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    const rawQr = createBody.data.qr_token
    createdTableIds.push(tableId)

    // Open visit via admin API
    const openVisitReq = new Request(
      `http://localhost/functions/v1/admin-api/tables/${tableId}/visits`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.16',
        },
        body: JSON.stringify({ expected_table_version: 1 }),
      }
    )
    const openVisitRes = await handleAdminApi(openVisitReq, { pool, supabaseAdmin })
    expect(openVisitRes.status).toBe(201)
    const openVisitBody = await openVisitRes.json()
    expect(openVisitBody.data.status).toBe('open')
    expect(openVisitBody.data.capability_epoch).toBe(1)
    const visitId = openVisitBody.data.id

    // Now resolve QR via Public API
    const resolveReq = new Request('http://localhost/functions/v1/public-api/tables/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.17',
      },
      body: JSON.stringify({ token: rawQr }),
    })
    const resolveRes = await handlePublicApi(resolveReq, { pool, supabaseAdmin })
    expect(resolveRes.status).toBe(200)
    const resolveBody = await resolveRes.json()

    expect(resolveBody.data.table_id).toBe(tableId)
    expect(resolveBody.data.table_code).toBe(tableCode)
    expect(resolveBody.data.visit_id).toBe(visitId)
    expect(resolveBody.data.visit_capability).toBeDefined()

    // Verify capability with capability engine
    const verified = await verifyVisitCapability(resolveBody.data.visit_capability, pool)
    expect(verified.table_id).toBe(tableId)
    expect(verified.visit_id).toBe(visitId)
    expect(verified.epoch).toBe(1)
  })

  it('prevents opening a second visit on the same table with 409 VISIT_ALREADY_OPEN', async () => {
    const tableCode = `TB-SINGLE-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.18',
      },
      body: JSON.stringify({ code: tableCode, name: 'Bàn Đơn Phiên' }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    createdTableIds.push(tableId)

    // Open first visit
    const open1 = new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.19',
      },
      body: JSON.stringify({}),
    })
    const res1 = await handleAdminApi(open1, { pool, supabaseAdmin })
    expect(res1.status).toBe(201)

    // Attempt second open visit
    const open2 = new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.20',
      },
      body: JSON.stringify({}),
    })
    const res2 = await handleAdminApi(open2, { pool, supabaseAdmin })
    expect(res2.status).toBe(409)
    const body2 = await res2.json()
    expect(body2.error.code).toBe('VISIT_ALREADY_OPEN')
  })

  it('concurrent open visit race condition: exactly one succeeds, one gets 409', async () => {
    const tableCode = `TB-RACE-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.21',
      },
      body: JSON.stringify({ code: tableCode, name: 'Bàn Đua Concurrency' }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    createdTableIds.push(tableId)

    // Send 2 concurrent requests
    const [resA, resB] = await Promise.all([
      handleAdminApi(
        new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.22',
          },
          body: JSON.stringify({}),
        }),
        { pool, supabaseAdmin }
      ),
      handleAdminApi(
        new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${adminToken}`,
            'Content-Type': 'application/json',
            'X-Forwarded-For': '192.168.1.23',
          },
          body: JSON.stringify({}),
        }),
        { pool, supabaseAdmin }
      ),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([201, 409])
  })

  it('table deactivation guard trigger: aborts deactivation if active visit exists with 409 TABLE_HAS_ACTIVE_VISIT', async () => {
    const tableCode = `TB-GUARD-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.24',
      },
      body: JSON.stringify({ code: tableCode, name: 'Bàn Test Trigger Guard' }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    createdTableIds.push(tableId)

    // Open visit
    await handleAdminApi(
      new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.25',
        },
        body: JSON.stringify({}),
      }),
      { pool, supabaseAdmin }
    )

    // Attempt to deactivate table (active: false)
    const patchReq = new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.26',
      },
      body: JSON.stringify({
        expected_version: 1,
        active: false,
      }),
    })
    const patchRes = await handleAdminApi(patchReq, { pool, supabaseAdmin })
    expect(patchRes.status).toBe(409)
    const patchBody = await patchRes.json()
    expect(patchBody.error.code).toBe('TABLE_HAS_ACTIVE_VISIT')
  })

  it('rotates QR token: invalidates old QR, bumps epoch, revokes existing capabilities', async () => {
    const tableCode = `TB-ROTATE-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.27',
      },
      body: JSON.stringify({ code: tableCode, name: 'Bàn Test Rotate QR' }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    const oldQr = createBody.data.qr_token
    createdTableIds.push(tableId)

    // Open visit
    await handleAdminApi(
      new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.28',
        },
        body: JSON.stringify({}),
      }),
      { pool, supabaseAdmin }
    )

    // Resolve old QR -> get capability
    const resolve1 = await handlePublicApi(
      new Request('http://localhost/functions/v1/public-api/tables/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.29' },
        body: JSON.stringify({ token: oldQr }),
      }),
      { pool, supabaseAdmin }
    )
    const oldCap = (await resolve1.json()).data.visit_capability

    // Admin rotates QR
    const rotateReq = new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/qr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.30',
      },
      body: JSON.stringify({}),
    })
    const rotateRes = await handleAdminApi(rotateReq, { pool, supabaseAdmin })
    expect(rotateRes.status).toBe(200)
    const rotateBody = await rotateRes.json()
    expect(rotateBody.data.epoch_bumped).toBe(true)
    const newQr = rotateBody.data.qr_token
    expect(newQr).not.toBe(oldQr)

    // 1. Old capability verification must fail with CAPABILITY_REVOKED or QR_REVOKED
    await expect(verifyVisitCapability(oldCap, pool)).rejects.toMatchObject({
      status: 401,
    })

    // 2. Old QR resolution must fail with 401 QR_REVOKED
    const resolveOld = await handlePublicApi(
      new Request('http://localhost/functions/v1/public-api/tables/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.31' },
        body: JSON.stringify({ token: oldQr }),
      }),
      { pool, supabaseAdmin }
    )
    expect(resolveOld.status).toBe(401)
    expect((await resolveOld.json()).error.code).toBe('QR_REVOKED')

    // 3. New QR resolution succeeds and produces new capability at epoch 2
    const resolveNew = await handlePublicApi(
      new Request('http://localhost/functions/v1/public-api/tables/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.32' },
        body: JSON.stringify({ token: newQr }),
      }),
      { pool, supabaseAdmin }
    )
    expect(resolveNew.status).toBe(200)
    const newCap = (await resolveNew.json()).data.visit_capability
    const verifiedNew = await verifyVisitCapability(newCap, pool)
    expect(verifiedNew.epoch).toBe(2)
  })

  it('visit closure prevents closing unsettled visit and allows closing settled visit', async () => {
    const tableCode = `TB-CLOSE-${Date.now().toString().slice(-4)}`
    const createReq = new Request('http://localhost/functions/v1/admin-api/tables', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
        'X-Forwarded-For': '192.168.1.33',
      },
      body: JSON.stringify({ code: tableCode, name: 'Bàn Test Đóng Phiên' }),
    })
    const createRes = await handleAdminApi(createReq, { pool, supabaseAdmin })
    const createBody = await createRes.json()
    const tableId = createBody.data.table.id
    createdTableIds.push(tableId)

    // Open visit
    const openRes = await handleAdminApi(
      new Request(`http://localhost/functions/v1/admin-api/tables/${tableId}/visits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.34',
        },
        body: JSON.stringify({}),
      }),
      { pool, supabaseAdmin }
    )
    const visitId = (await openRes.json()).data.id

    // Insert an active unpaid order attached to visit
    const orderRes = await pool.query(
      `INSERT INTO public.orders (
         code, order_type, table_id, table_visit_id, table_name_snapshot,
         status, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd
       ) VALUES (
         'ORD-TEST-99', 'dine_in', $1, $2, 'Bàn Test Đóng Phiên',
         'confirmed', 'unpaid', 150000, 0, 150000
       ) RETURNING id`,
      [tableId, visitId]
    )
    const orderId = orderRes.rows[0].id

    // Attempt to close visit with active (non-terminal) order -> must fail with 409 VISIT_HAS_ACTIVE_ORDERS
    const closeActiveFailReq = new Request(
      `http://localhost/functions/v1/admin-api/visits/${visitId}/close`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.35',
        },
        body: JSON.stringify({ expected_version: 1 }),
      }
    )
    const closeActiveFailRes = await handleAdminApi(closeActiveFailReq, { pool, supabaseAdmin })
    expect(closeActiveFailRes.status).toBe(409)
    expect((await closeActiveFailRes.json()).error.code).toBe('VISIT_HAS_ACTIVE_ORDERS')

    // Transition order to terminal status 'completed' but still unpaid -> must fail with 409 VISIT_NOT_SETTLED
    await pool.query(
      `UPDATE public.orders SET status = 'completed' WHERE id = $1`,
      [orderId]
    )

    const closeUnpaidFailReq = new Request(
      `http://localhost/functions/v1/admin-api/visits/${visitId}/close`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.35',
        },
        body: JSON.stringify({ expected_version: 1 }),
      }
    )
    const closeUnpaidFailRes = await handleAdminApi(closeUnpaidFailReq, { pool, supabaseAdmin })
    expect(closeUnpaidFailRes.status).toBe(409)
    expect((await closeUnpaidFailRes.json()).error.code).toBe('VISIT_NOT_SETTLED')

    // Settle the order: completed + paid
    await pool.query(
      `UPDATE public.orders SET payment_status = 'paid' WHERE id = $1`,
      [orderId]
    )

    // Attempt to close with incorrect version -> 409 VERSION_CONFLICT
    const wrongVersionReq = new Request(
      `http://localhost/functions/v1/admin-api/visits/${visitId}/close`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.36',
        },
        body: JSON.stringify({ expected_version: 999 }),
      }
    )
    const wrongVersionRes = await handleAdminApi(wrongVersionReq, { pool, supabaseAdmin })
    expect(wrongVersionRes.status).toBe(409)
    expect((await wrongVersionRes.json()).error.code).toBe('VERSION_CONFLICT')

    // Close with correct version -> 200 OK
    const closeOkReq = new Request(
      `http://localhost/functions/v1/admin-api/visits/${visitId}/close`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '192.168.1.37',
        },
        body: JSON.stringify({ expected_version: 1 }),
      }
    )
    const closeOkRes = await handleAdminApi(closeOkReq, { pool, supabaseAdmin })
    expect(closeOkRes.status).toBe(200)
    const closeOkBody = await closeOkRes.json()
    expect(closeOkBody.data.status).toBe('closed')
    expect(closeOkBody.data.closed_at).toBeDefined()
    expect(closeOkBody.data.capability_epoch).toBe(2) // Bumped on close to revoke all capabilities
  })
})
