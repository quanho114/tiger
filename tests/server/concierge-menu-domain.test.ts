import { describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  getMenuSnapshot,
  invalidateMenuSnapshot,
  snapshotAllergenProfiles,
  snapshotById,
  snapshotServingProfiles,
} from '../../supabase/functions/_shared/concierge/menu/domain.ts'
import { mapDomainItem } from '../../supabase/functions/_shared/concierge/menu/mapper.ts'
import type { MenuItemRow, MenuProfileRow } from '../../supabase/functions/_shared/concierge/menu/mapper.ts'
import { evaluateFoodSafety } from '../../supabase/functions/_shared/concierge/food-safety.ts'
import { SERVING_PROFILES, ALLERGEN_PROFILES } from '../../supabase/functions/_shared/concierge/knowledge.ts'

const baseItem: MenuItemRow = {
  id: '11111111-1111-4111-8111-111111111111',
  category_id: null, category_name: 'Món nướng', name: 'Gà nướng', description: 'Thơm',
  price_vnd: 200000, pricing_mode: 'fixed', price_min: null, price_max: null,
  is_available: true, allow_dine_in: true, allow_delivery: true,
  serving_size: null, pairing_note: null, spice_level: 1, tags: ['nướng'],
  is_signature: true, is_bestseller: false,
}

const profileRow: MenuProfileRow = {
  menu_item_id: baseItem.id, serving_unit: 'đĩa', serving_description: 'Nửa con',
  people_min: 2, people_max: 3, meal_role: 'main_protein', meal_context: 'shared',
  protein_score: 0.8, carb_score: 0.1, vegetable_score: 0.2, soup_score: 0,
  spice_level: 1, richness_level: 1, taste_tags: ['đậm đà'], dietary_tags: [],
  pairing_item_ids: [], allergens: { peanuts: 'may_contain' }, allergen_source: 'demo_estimate',
  allergen_verified: false, allergen_verified_at: null, allergen_verified_by: null,
  kitchen_notes: '', confidence: 'restaurant_defined', provenance: 'test',
  serving_source: 'restaurant_admin', taste_source: 'restaurant_admin',
}

describe('Phase 5 — mapper', () => {
  it('maps a fully profiled live item', () => {
    const item = mapDomainItem(baseItem, profileRow)
    expect(item.serving).toMatchObject({ unit: 'đĩa', peopleMin: 2, peopleMax: 3, mealRole: 'main_protein' })
    expect(item.contribution.protein).toBe(0.8)
    expect(item.taste.tags).toEqual(['đậm đà'])
    expect(item.allergens).toMatchObject({ verified: false, source: 'demo_estimate' })
    expect(item.allergens.states).toEqual({ peanuts: 'may_contain' })
    expect(item.isSignature).toBe(true)
    expect(item.confidence).toBe('restaurant_defined')
  })

  it('degrades unprofiled items safely without hiding them', () => {
    const item = mapDomainItem(baseItem, null)
    expect(item.name).toBe('Gà nướng')
    expect(item.priceVnd).toBe(200000)
    expect(item.serving.peopleMin).toBeNull()
    expect(item.allergens.verified).toBe(false)
    expect(item.allergens.states).toEqual({})
    expect(item.confidence).toBe('unknown')
    expect(item.provenance).toBe('menu:live_unprofiled')
  })

  it('filters invalid tags/pairings and clamps scores', () => {
    const item = mapDomainItem(
      { ...baseItem, tags: ['ok', 42, null] },
      { ...profileRow, protein_score: 9, taste_tags: ['a', 1], pairing_item_ids: ['not-a-uuid', baseItem.id] },
    )
    expect(item.tags).toEqual(['ok'])
    expect(item.contribution.protein).toBe(1.5)
    expect(item.taste.tags).toEqual(['a'])
    expect(item.pairingItemIds).toEqual([baseItem.id])
  })
})

describe('Phase 5 — legacy profile maps', () => {
  it('includes only profiled items; unverified stays unverified', async () => {
    const { toLegacyServingProfile, toLegacyAllergenProfile } = await import(
      '../../supabase/functions/_shared/concierge/menu/mapper.ts')
    const profiled = mapDomainItem(baseItem, profileRow)
    const unprofiled = mapDomainItem({ ...baseItem, id: '22222222-2222-4222-8222-222222222222' }, null)
    expect(toLegacyServingProfile(profiled)).toMatchObject({ people_min: 2, meal_role: 'main_protein' })
    expect(toLegacyServingProfile(unprofiled)).toBeNull()
    expect(toLegacyAllergenProfile(profiled)).toMatchObject({ verified_by_kitchen: false, source: 'demo_estimate' })
    // Fail-closed: demo estimates never verify through mapping.
    const safety = evaluateFoodSafety(
      { id: profiled.id, name: profiled.name } as never, ['peanuts'], toLegacyAllergenProfile(profiled))
    expect(safety.safety_state).not.toBe('verified_safe')
  })
})

describe('Phase 5 — snapshot cache', () => {
  it('hits cache per pool, reloads after invalidate, recovers from failure', async () => {
    let calls = 0
    const rows = [{ ...baseItem, id: baseItem.id, name: baseItem.name, category_name: 'Món nướng', row_version: new Date().toISOString() }]
    const pool = { query: async () => { calls++; return { rows } } } as unknown as pg.Pool
    invalidateMenuSnapshot()
    const first = await getMenuSnapshot(pool)
    const second = await getMenuSnapshot(pool)
    expect(second).toBe(first)
    expect(calls).toBe(1)
    expect(first.items).toHaveLength(1)

    invalidateMenuSnapshot()
    await getMenuSnapshot(pool)
    expect(calls).toBe(2)

    const failing = { query: async () => { throw new Error('DOWN') } } as unknown as pg.Pool
    await expect(getMenuSnapshot(failing)).rejects.toThrow('DOWN')

    // Stale served when refresh fails after a good load.
    invalidateMenuSnapshot()
    const flip = { query: async () => { calls++; if (calls > 3) throw new Error('DOWN'); return { rows } } } as unknown as pg.Pool
    const good = await getMenuSnapshot(flip)
    expect((await getMenuSnapshot(flip)).version).toBe(good.version)
  })

  it('isolates pools from each other', async () => {
    invalidateMenuSnapshot()
    const mk = (name: string) => ({ query: async () => ({ rows: [{ ...baseItem, name, row_version: new Date().toISOString() }] }) }) as unknown as pg.Pool
    const a = await getMenuSnapshot(mk('A'))
    const b = await getMenuSnapshot(mk('B'))
    expect(a.items[0].name).toBe('A')
    expect(b.items[0].name).toBe('B')
  })
})

describe('Phase 5 — seed audit', () => {
  it('reports all 13 hardcoded seed profiles as orphan data', async () => {
    const { loadMenuSnapshot } = await import('../../supabase/functions/_shared/concierge/menu/repository.ts')
    const liveIds = new Set(['live-1'])
    const pool = { query: async () => ({ rows: [{ ...baseItem, id: 'live-1', name: 'Live', row_version: new Date().toISOString() }] }) } as unknown as pg.Pool
    const snapshot = await loadMenuSnapshot(pool)
    const seedIds = [...Object.keys(SERVING_PROFILES), ...Object.keys(ALLERGEN_PROFILES)]
    expect(seedIds.length).toBeGreaterThan(0)
    const matched = seedIds.filter((id) => liveIds.has(id))
    const stale = seedIds.filter((id) => !liveIds.has(id))
    expect(matched).toEqual([])
    expect(stale.length).toBe(seedIds.length)
    // Snapshot path never consults seeds: unprofiled live item has no serving map entry.
    expect(snapshotServingProfiles(snapshot)).toEqual({})
    expect(snapshotAllergenProfiles(snapshot)).toEqual({})
    expect(snapshotById(snapshot, 'live-1')?.confidence).toBe('unknown')
  })

  it('no production signature UUID sets remain outside seed fixtures', async () => {
    const { readFileSync } = await import('node:fs')
    const prodFiles = [
      'supabase/functions/_shared/concierge/menu/domain.ts',
      'supabase/functions/_shared/concierge/menu/repository.ts',
      'supabase/functions/_shared/concierge/menu/mapper.ts',
      'supabase/functions/_shared/concierge/orchestration/tool-runner.ts',
      'supabase/functions/_shared/concierge/menu-retrieval.ts',
    ]
    for (const file of prodFiles) {
      const content = readFileSync(file, 'utf8')
      expect(content, file).not.toContain('10000000-0000-0000')
    }
  })
})
