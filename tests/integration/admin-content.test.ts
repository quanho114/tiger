import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Admin Content, Settings, Storage & QR Integration (Task T13, Invariants V17, V07, V24)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  let customerToken: string

  const createdCategoryIds: string[] = []
  const createdMenuItemIds: string[] = []
  const createdAreaIds: string[] = []
  const createdZoneIds: string[] = []
  const createdTableIds: string[] = []

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
    customerToken = getUserToken('customerA')
  })

  afterAll(async () => {
    if (pool) {
      // Clean up test data
      for (const id of createdMenuItemIds) {
        await pool.query('DELETE FROM public.menu_items WHERE id = $1', [id]).catch(() => {})
      }
      for (const id of createdCategoryIds) {
        await pool.query('DELETE FROM public.categories WHERE id = $1', [id]).catch(() => {})
      }
      for (const id of createdAreaIds) {
        await pool.query('DELETE FROM public.seating_areas WHERE id = $1', [id]).catch(() => {})
      }
      for (const id of createdZoneIds) {
        await pool.query('DELETE FROM public.delivery_zones WHERE id = $1', [id]).catch(() => {})
      }
      for (const id of createdTableIds) {
        await pool.query('DELETE FROM public.table_qr_tokens WHERE table_id = $1', [id]).catch(() => {})
        await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [id]).catch(() => {})
      }

      // Restore seed business hours
      await pool.query(`
        DELETE FROM public.business_hours;
        INSERT INTO public.business_hours (weekday, service_type, open_time, close_time, active)
        VALUES
            (0, 'restaurant', '10:00:00', '22:30:00', true),
            (1, 'restaurant', '10:00:00', '22:30:00', true),
            (2, 'restaurant', '10:00:00', '22:30:00', true),
            (3, 'restaurant', '10:00:00', '22:30:00', true),
            (4, 'restaurant', '10:00:00', '22:30:00', true),
            (5, 'restaurant', '10:00:00', '22:30:00', true),
            (6, 'restaurant', '10:00:00', '22:30:00', true),
            (0, 'delivery', '10:30:00', '21:30:00', true),
            (1, 'delivery', '10:30:00', '21:30:00', true),
            (2, 'delivery', '10:30:00', '21:30:00', true),
            (3, 'delivery', '10:30:00', '21:30:00', true),
            (4, 'delivery', '10:30:00', '21:30:00', true),
            (5, 'delivery', '10:30:00', '21:30:00', true),
            (6, 'delivery', '10:30:00', '21:30:00', true),
            (0, 'reservation', '10:30:00', '21:00:00', true),
            (1, 'reservation', '10:30:00', '21:00:00', true),
            (2, 'reservation', '10:30:00', '21:00:00', true),
            (3, 'reservation', '10:30:00', '21:00:00', true),
            (4, 'reservation', '10:30:00', '21:00:00', true),
            (5, 'reservation', '10:30:00', '21:00:00', true),
            (6, 'reservation', '10:30:00', '21:00:00', true);
      `).catch(() => {})

      await pool.end()
    }
  })

  // --------------------------------------------------------------------------
  // 1. Category Lifecycle & OCC (Invariant V24)
  // --------------------------------------------------------------------------
  describe('Category Lifecycle & OCC', () => {
    let testCatId: string
    let catVersion: number

    it('denies customer or unauthenticated access with 401/403', async () => {
      const req = new Request('http://localhost/functions/v1/admin-api/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Hải Sản Tươi' }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(403)
    })

    it('creates new category with slug and version 1', async () => {
      const req = new Request('http://localhost/functions/v1/admin-api/categories', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          name: 'Hải Sản Tươi Sống',
          sort_order: 10,
          active: true,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.data.name).toBe('Hải Sản Tươi Sống')
      expect(body.data.slug).toContain('hai-san-tuoi-song')
      expect(body.data.version).toBe(1)
      expect(body.data.active).toBe(true)

      testCatId = body.data.id
      catVersion = body.data.version
      createdCategoryIds.push(testCatId)
    })

    it('updates category successfully with matching expected_version', async () => {
      const req = new Request(`http://localhost/functions/v1/admin-api/categories/${testCatId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_version: catVersion,
          name: 'Hải Sản Biển Sâu',
          sort_order: 15,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.name).toBe('Hải Sản Biển Sâu')
      expect(body.data.version).toBe(2)
      catVersion = body.data.version
    })

    it('rejects update with 409 VERSION_CONFLICT on outdated version', async () => {
      const staleVersion = catVersion - 1
      const req = new Request(`http://localhost/functions/v1/admin-api/categories/${testCatId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_version: staleVersion,
          name: 'Hải Sản Bị Xung Đột',
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)

      const body = await res.json()
      expect(body.error.code).toBe('VERSION_CONFLICT')
    })
  })

  // --------------------------------------------------------------------------
  // 2. Menu Items Lifecycle & Service Flags (Invariant V24)
  // --------------------------------------------------------------------------
  describe('Menu Items Lifecycle & OCC', () => {
    let testItemId: string
    let itemVersion: number

    it('creates new menu item with pricing and delivery flags', async () => {
      expect(createdCategoryIds.length).toBeGreaterThan(0)
      const categoryId = createdCategoryIds[0]

      const req = new Request('http://localhost/functions/v1/admin-api/menu-items', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          category_id: categoryId,
          name: 'Cua Tuyết Hấp Muối',
          description: 'Cua tươi hấp muối ớt đặc biệt',
          price_vnd: 350000,
          allow_dine_in: true,
          allow_delivery: true,
          published: true,
          available: true,
          is_signature: true,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.data.name).toBe('Cua Tuyết Hấp Muối')
      expect(body.data.price_vnd).toBe(350000)
      expect(body.data.version).toBe(1)
      expect(body.data.is_signature).toBe(true)

      testItemId = body.data.id
      itemVersion = body.data.version
      createdMenuItemIds.push(testItemId)
    })

    it('toggles item availability and updates price with OCC', async () => {
      const req = new Request(`http://localhost/functions/v1/admin-api/menu-items/${testItemId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_version: itemVersion,
          price_vnd: 380000,
          available: false,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.price_vnd).toBe(380000)
      expect(body.data.available).toBe(false)
      expect(body.data.version).toBe(2)
      itemVersion = body.data.version
    })

    it('rejects price update with 409 VERSION_CONFLICT on stale version', async () => {
      const req = new Request(`http://localhost/functions/v1/admin-api/menu-items/${testItemId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_version: 1, // Stale! Current is 2
          price_vnd: 400000,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.code).toBe('VERSION_CONFLICT')
    })
  })

  // --------------------------------------------------------------------------
  // 3. Operational Settings & Atomic Business Hours
  // --------------------------------------------------------------------------
  describe('Operational Settings & Business Hours Replacement', () => {
    it('fetches current restaurant settings', async () => {
      const req = new Request('http://localhost/functions/v1/admin-api/settings', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data.version).toBeGreaterThanOrEqual(1)
      expect(typeof body.data.accepting_orders).toBe('boolean')
    })

    it('atomically replaces business hours under expected_settings_version', async () => {
      const getReq = new Request('http://localhost/functions/v1/admin-api/settings', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const getRes = await handleAdminApi(getReq, { pool, supabaseAdmin })
      const settings = (await getRes.json()).data

      const putReq = new Request('http://localhost/functions/v1/admin-api/settings/hours', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_settings_version: settings.version,
          hours: [
            {
              weekday: 1,
              service_type: 'restaurant',
              open_time: '10:00',
              close_time: '22:00',
              active: true,
            },
            {
              weekday: 2,
              service_type: 'restaurant',
              open_time: '10:00',
              close_time: '22:00',
              active: true,
            },
          ],
        }),
      })

      const putRes = await handleAdminApi(putReq, { pool, supabaseAdmin })
      expect(putRes.status).toBe(200)

      const body = await putRes.json()
      expect(body.data.success).toBe(true)
      expect(body.data.rows_inserted).toBe(2)
      expect(body.data.new_settings_version).toBe(settings.version + 1)
    })

    it('rejects overlapping hours intervals for the same weekday and service type', async () => {
      const getReq = new Request('http://localhost/functions/v1/admin-api/settings', {
        method: 'GET',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const getRes = await handleAdminApi(getReq, { pool, supabaseAdmin })
      const settings = (await getRes.json()).data

      const overlapReq = new Request('http://localhost/functions/v1/admin-api/settings/hours', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_settings_version: settings.version,
          hours: [
            {
              weekday: 3,
              service_type: 'restaurant',
              open_time: '10:00',
              close_time: '15:00',
              active: true,
            },
            {
              weekday: 3,
              service_type: 'restaurant',
              open_time: '14:00', // Overlaps with 10:00 - 15:00!
              close_time: '22:00',
              active: true,
            },
          ],
        }),
      })

      const overlapRes = await handleAdminApi(overlapReq, { pool, supabaseAdmin })
      expect(overlapRes.status).toBe(409)
      const body = await overlapRes.json()
      expect(body.error.code).toBe('HOURS_OVERLAP')
    })
  })

  // --------------------------------------------------------------------------
  // 4. Seating Areas & Delivery Zones
  // --------------------------------------------------------------------------
  describe('Seating Areas & Delivery Zones', () => {
    let testAreaId: string
    let testZoneId: string

    it('creates seating area with unique code', async () => {
      const areaCode = `VIP-${Date.now().toString().slice(-4)}`
      const req = new Request('http://localhost/functions/v1/admin-api/seating-areas', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          code: areaCode,
          name: 'Phòng VIP Lầu 1',
          sort_order: 1,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.data.code).toBe(areaCode)
      expect(body.data.version).toBe(1)
      testAreaId = body.data.id
      createdAreaIds.push(testAreaId)
    })

    it('creates delivery zone with shipping fee and free threshold', async () => {
      const req = new Request('http://localhost/functions/v1/admin-api/delivery-zones', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          name: 'Quận Ninh Kiều (Nội Thành)',
          description: 'Giao nhanh 30 phút',
          fee_vnd: 20000,
          free_threshold_vnd: 300000,
          sort_order: 1,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.data.fee_vnd).toBe(20000)
      expect(body.data.free_threshold_vnd).toBe(300000)
      testZoneId = body.data.id
      createdZoneIds.push(testZoneId)
    })
  })

  // --------------------------------------------------------------------------
  // 5. Storage & Media Upload Validation (Invariant V17)
  // --------------------------------------------------------------------------
  describe('Media Upload & Magic-Bytes Validation (Invariant V17)', () => {
    it('rejects uploads exceeding 5MB with 413 or 422', async () => {
      // 6MB buffer
      const largeBuffer = new Uint8Array(6 * 1024 * 1024)
      const formData = new FormData()
      formData.append('file', new Blob([largeBuffer], { type: 'image/jpeg' }), 'large.jpg')

      const req = new Request('http://localhost/functions/v1/admin-api/media/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'X-Forwarded-For': '127.0.0.1',
        },
        body: formData,
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect([413, 422]).toContain(res.status)
      const body = await res.json()
      expect(body.error.code).toBe('FILE_TOO_LARGE')
    })

    it('rejects SVG files with XML/script injection patterns with 422 VALIDATION_ERROR', async () => {
      const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
      const formData = new FormData()
      formData.append('file', new Blob([svgContent], { type: 'image/svg+xml' }), 'malicious.svg')

      const req = new Request('http://localhost/functions/v1/admin-api/media/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'X-Forwarded-For': '127.0.0.1',
        },
        body: formData,
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(['INVALID_FILE_TYPE', 'VALIDATION_ERROR']).toContain(body.error.code)
    })

    it('rejects fake/spoofed images with wrong magic bytes', async () => {
      // Plain text claiming to be a PNG
      const fakePng = new TextEncoder().encode('THIS IS NOT A PNG IMAGE FILE')
      const formData = new FormData()
      formData.append('file', new Blob([fakePng], { type: 'image/png' }), 'fake.png')

      const req = new Request('http://localhost/functions/v1/admin-api/media/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'X-Forwarded-For': '127.0.0.1',
        },
        body: formData,
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.code).toBe('INVALID_FILE_TYPE')
    })
  })

  // --------------------------------------------------------------------------
  // 6. Table QR Token Rotation (Invariant V07)
  // --------------------------------------------------------------------------
  describe('Table QR Token Lifecycle & Rotation (Invariant V07)', () => {
    let testTableId: string
    let originalToken: string

    it('creates a table, generating active token hash and returning raw token once', async () => {
      const code = `TB-QR-${Date.now().toString().slice(-4)}`
      const req = new Request('http://localhost/functions/v1/admin-api/tables', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          code,
          name: 'Bàn Test QR',
          sort_order: 1,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(201)

      const body = await res.json()
      expect(body.data.table.version).toBe(1)
      expect(body.data.qr_token).toBeDefined()
      expect(body.data.qr_url).toContain(`/table/${body.data.qr_token}`)

      testTableId = body.data.table.id
      originalToken = body.data.qr_token
      createdTableIds.push(testTableId)
    })

    it('rotates QR token, invalidating old token and incrementing table version', async () => {
      const req = new Request(`http://localhost/functions/v1/admin-api/tables/${testTableId}/qr/rotate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1',
        },
        body: JSON.stringify({
          expected_version: 1,
        }),
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.data.table.version).toBe(2)
      expect(body.data.qr_token).toBeDefined()
      expect(body.data.qr_token).not.toBe(originalToken)

      // Verify in DB that old token is deactivated
      const tokensRes = await pool.query(
        'SELECT id, active FROM public.table_qr_tokens WHERE table_id = $1 ORDER BY created_at ASC',
        [testTableId]
      )
      expect(tokensRes.rows.length).toBe(2)
      expect(tokensRes.rows[0].active).toBe(false) // old token deactivated
      expect(tokensRes.rows[1].active).toBe(true)  // new token active
    })
  })

  // --------------------------------------------------------------------------
  // 7. Audit Log Verification
  // --------------------------------------------------------------------------
  describe('Audit Log Pipeline', () => {
    it('retrieves audit logs recorded by admin content operations', async () => {
      const req = new Request('http://localhost/functions/v1/admin-api/audit', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      })
      const res = await handleAdminApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(Array.isArray(body.data.items)).toBe(true)
      expect(body.data.items.length).toBeGreaterThan(0)

      const actions = body.data.items.map((log: { action: string }) => log.action)
      expect(actions.some((a: string) => a.includes('category') || a.includes('menu_item') || a.includes('table'))).toBe(true)
    })
  })
})
