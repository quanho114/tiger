import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Public Catalog & Settings Integration (V06, V17)', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let tempCategoryId: string | null = null
  let tempUnpublishedItemId: string | null = null
  let tempUnavailableItemId: string | null = null

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    // Create an inactive category with an item to verify exclusion
    const catRes = await pool.query(
      `INSERT INTO categories (name, slug, sort_order, active)
       VALUES ('Inactive Test Category', 'inactive-cat-test', 99, false)
       RETURNING id`
    )
    tempCategoryId = catRes.rows[0].id

    // Create an item in the inactive category
    await pool.query(
      `INSERT INTO menu_items (category_id, slug, name, description, price_vnd, published, available, allow_dine_in, allow_delivery)
       VALUES ($1, 'item-in-inactive-cat', 'Item In Inactive Cat', 'Should not show', 50000, true, true, true, true)`,
      [tempCategoryId]
    )

    // Get an active category
    const activeCatRes = await pool.query(
      `SELECT id FROM categories WHERE active = true LIMIT 1`
    )
    const activeCatId = activeCatRes.rows[0].id

    // Create an unpublished item in an active category
    const unpubRes = await pool.query(
      `INSERT INTO menu_items (category_id, slug, name, description, price_vnd, published, available, allow_dine_in, allow_delivery)
       VALUES ($1, 'unpub-item-test', 'Unpublished Item Test', 'Should not show', 80000, false, true, true, true)
       RETURNING id`,
      [activeCatId]
    )
    tempUnpublishedItemId = unpubRes.rows[0].id

    // Create an unavailable item (available = false) in an active category
    const unavailRes = await pool.query(
      `INSERT INTO menu_items (category_id, slug, name, description, price_vnd, published, available, allow_dine_in, allow_delivery)
       VALUES ($1, 'unavail-item-test', 'Unavailable Item Test (Tam Het)', 'Should show disabled', 95000, true, false, true, true)
       RETURNING id`,
      [activeCatId]
    )
    tempUnavailableItemId = unavailRes.rows[0].id
  })

  afterAll(async () => {
    if (tempUnavailableItemId) {
      await pool.query(`DELETE FROM menu_items WHERE id = $1`, [tempUnavailableItemId])
    }
    if (tempUnpublishedItemId) {
      await pool.query(`DELETE FROM menu_items WHERE id = $1`, [tempUnpublishedItemId])
    }
    if (tempCategoryId) {
      await pool.query(`DELETE FROM menu_items WHERE category_id = $1`, [tempCategoryId])
      await pool.query(`DELETE FROM categories WHERE id = $1`, [tempCategoryId])
    }
    await pool.end()
  })

  describe('GET /public-api/menu', () => {
    it('returns active categories and published items with 30s cache header', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/menu', {
        method: 'GET',
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toContain('max-age=30')
      expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=60')

      const body = await res.json()
      expect(body.data).toBeDefined()
      expect(Array.isArray(body.data.categories)).toBe(true)
      expect(Array.isArray(body.data.items)).toBe(true)
      expect(body.data.categories.length).toBeGreaterThan(0)
      expect(body.data.items.length).toBeGreaterThan(0)

      // All returned categories are active (inactive category excluded by backend query)
      for (const cat of body.data.categories) {
        expect(cat.id).not.toBe(tempCategoryId)
      }

      // Items must not contain unpublished items or items in inactive categories
      const itemIds = body.data.items.map((i: { id: string }) => i.id)
      expect(itemIds).not.toContain(tempUnpublishedItemId)

      // Unavailable item MUST be included so UI can render "Tạm hết"
      expect(itemIds).toContain(tempUnavailableItemId)
      const unavailItem = body.data.items.find((i: { id: string }) => i.id === tempUnavailableItemId)
      expect(unavailItem).toBeDefined()
      expect(unavailItem.available).toBe(false)
      expect(unavailItem.is_available).toBe(false)
    })

    it('filters items correctly by mode=dine_in', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/menu?mode=dine_in', {
        method: 'GET',
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      for (const item of body.data.items) {
        expect(item.allow_dine_in).toBe(true)
      }
    })

    it('filters items correctly by mode=delivery', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/menu?mode=delivery', {
        method: 'GET',
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      for (const item of body.data.items) {
        expect(item.allow_delivery).toBe(true)
      }
    })

    it('filters items by category slug', async () => {
      const catRes = await pool.query(
        `SELECT id, slug FROM categories WHERE active = true LIMIT 1`
      )
      const targetSlug = catRes.rows[0].slug
      const targetId = catRes.rows[0].id

      const req = new Request(`http://localhost/functions/v1/public-api/menu?category=${targetSlug}`, {
        method: 'GET',
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)

      const body = await res.json()
      for (const item of body.data.items) {
        expect(item.category_id).toBe(targetId)
      }
    })
  })

  describe('GET /public-api/settings', () => {
    it('returns full restaurant settings, hours, delivery zones and seating areas', async () => {
      const req = new Request('http://localhost/functions/v1/public-api/settings', {
        method: 'GET',
      })

      const res = await handlePublicApi(req, { pool, supabaseAdmin })
      expect(res.status).toBe(200)
      expect(res.headers.get('Cache-Control')).toContain('max-age=30')

      const body = await res.json()
      const settings = body.data
      expect(settings).toBeDefined()
      expect(settings.name).toBe('Tiger 345')
      expect(settings.phone).toBeDefined()
      expect(settings.address).toBeDefined()
      expect(typeof settings.accepting_delivery_orders).toBe('boolean')
      expect(typeof settings.booking_enabled).toBe('boolean')
      expect(typeof settings.min_delivery_order_vnd).toBe('number')

      expect(Array.isArray(settings.business_hours)).toBe(true)
      expect(settings.business_hours.length).toBeGreaterThan(0)

      expect(Array.isArray(settings.delivery_zones)).toBe(true)
      expect(settings.delivery_zones.length).toBeGreaterThan(0)

      expect(Array.isArray(settings.seating_areas)).toBe(true)
      expect(settings.seating_areas.length).toBeGreaterThan(0)
    })
  })
})
