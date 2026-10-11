/**
 * Tiger Agent V3 Phase 5 — menu_item_ai_profiles persistence tests.
 * Runs against the disposable integration database (CI).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'
import {
  getAllergenProfile,
  getServingProfile,
  upsertAllergenProfile,
  upsertServingProfile,
} from '../../supabase/functions/_shared/concierge/menu/profile-repository.js'
import { getMenuSnapshot } from '../../supabase/functions/_shared/concierge/menu/domain.js'

const { Pool } = pg
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('menu_item_ai_profiles (Phase 5)', () => {
  let pool: pg.Pool
  let itemId: string

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)
    const menu = await pool.query(
      'SELECT id FROM public.menu_items WHERE published = true ORDER BY id LIMIT 1'
    )
    if (!menu.rows.length) throw new Error('No published menu items')
    itemId = menu.rows[0].id as string
  })

  afterAll(async () => {
    if (pool) {
      await pool.query('DELETE FROM public.menu_item_ai_profiles').catch(() => {})
      await pool.end()
    }
  })

  it('roundtrips a serving profile with audit log', async () => {
    const updated = await upsertServingProfile(pool, itemId, {
      serving_unit: 'phần', people_min: 2, people_max: 3, meal_role: 'main_protein',
      contributions: { protein: 0.8, carb: 0.1, vegetable: 0.1, soup: 0 },
    }, 'test-admin')
    expect(updated.people_min).toBe(2)
    expect(updated.provenance).toContain('admin_audit')
    const reloaded = await getServingProfile(pool, itemId)
    expect(reloaded.meal_role).toBe('main_protein')
    const audit = await pool.query(
      `SELECT action FROM public.audit_logs WHERE entity_type = 'serving_profile' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [itemId]
    )
    expect(audit.rows[0]?.action).toBe('update_serving_profile')
  })

  it('keeps demo estimates unverified and gates kitchen verification', async () => {
    const updated = await upsertAllergenProfile(pool, itemId, {
      allergens: { peanuts: 'may_contain' },
    }, 'test-admin')
    expect(updated.verified_by_kitchen).toBe(false)
    expect(updated.source).toBe('demo_estimate')
    await expect(upsertAllergenProfile(pool, itemId, {
      verified_by_kitchen: true, kitchen_notes: '',
    }, 'test-admin')).rejects.toThrowError(/Xác nhận an toàn bếp/)
    const verified = await upsertAllergenProfile(pool, itemId, {
      allergens: { peanuts: 'contains' }, verified_by_kitchen: true,
      kitchen_notes: 'Bếp đã kiểm nghiệm mẻ mới',
    }, 'test-admin')
    expect(verified.verified_by_kitchen).toBe(true)
    expect(verified.source).toBe('kitchen_audited')
    expect((await getAllergenProfile(pool, itemId)).verified_by_kitchen).toBe(true)
  })

  it('rejects invalid ranges at validation and constraint levels', async () => {
    await expect(upsertServingProfile(pool, itemId, {
      people_min: 5, people_max: 2,
    }, 'test-admin')).rejects.toThrowError(/Số người tối thiểu không được lớn hơn/)
    await expect(pool.query(
      `INSERT INTO public.menu_item_ai_profiles (menu_item_id, people_min, people_max)
       VALUES ($1, 4, 2) ON CONFLICT (menu_item_id) DO NOTHING`, [itemId]
    )).rejects.toThrow()
    await expect(upsertServingProfile(pool, 'not-a-uuid', { people_min: 1 }, 'test-admin'))
      .rejects.toThrowError(/UUID/)
  })

  it('exposes profiles through the menu snapshot', async () => {
    await upsertServingProfile(pool, itemId, {
      serving_unit: 'đĩa', people_min: 1, people_max: 2, meal_role: 'side',
    }, 'test-admin')
    const snapshot = await getMenuSnapshot(pool)
    const item = snapshot.items.find((i) => i.id === itemId)
    expect(item?.serving.mealRole).toBe('side')
    expect(item?.priceVnd).toBeGreaterThanOrEqual(0)
  })
})
