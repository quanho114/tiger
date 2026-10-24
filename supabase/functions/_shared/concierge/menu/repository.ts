/**
 * Tiger Agent V3 — Phase 5: Menu snapshot repository.
 *
 * Single parameterized read: published menu_items LEFT JOIN ai_profiles.
 * Price/availability/signature come from menu_items only. Unprofiled
 * items stay in the snapshot with safe unknown metadata.
 */

import type pg from 'pg'
import { createHash } from 'node:crypto'
import { mapDomainItem, type MenuItemRow, type MenuProfileRow } from './mapper.ts'
import type { MenuSnapshot } from './types.ts'

const MAX_SNAPSHOT_ITEMS = 2000

export async function loadMenuSnapshot(db: pg.Pool | pg.PoolClient): Promise<MenuSnapshot> {
  const { rows } = await db.query(
    `SELECT m.id, m.category_id, c.name AS category_name, m.name, m.description,
       m.price_vnd, m.pricing_mode, m.price_min, m.price_max,
       m.available AS is_available, m.allow_dine_in, m.allow_delivery,
       m.serving_size, m.pairing_note, m.spice_level, m.tags,
       m.is_signature, m.is_bestseller,
       m.updated_at AS item_updated_at,
       p.serving_unit, p.serving_description, p.people_min, p.people_max,
       p.meal_role, p.meal_context, p.protein_score, p.carb_score,
       p.vegetable_score, p.soup_score, p.spice_level AS profile_spice,
       p.richness_level, p.taste_tags, p.dietary_tags, p.pairing_item_ids,
       p.allergens, p.allergen_source, p.allergen_verified,
       p.allergen_verified_at, p.allergen_verified_by, p.kitchen_notes,
       p.confidence, p.provenance, p.serving_source, p.taste_source,
       p.updated_at AS profile_updated_at,
       GREATEST(m.updated_at, COALESCE(p.updated_at, m.updated_at)) AS row_version
     FROM public.menu_items m
     LEFT JOIN public.categories c ON c.id = m.category_id
     LEFT JOIN public.menu_item_ai_profiles p ON p.menu_item_id = m.id
     WHERE m.published = true
     ORDER BY m.id
     LIMIT ${MAX_SNAPSHOT_ITEMS}`,
  )
  let version = ''
  const items = rows.map((row) => {
    const itemRow: MenuItemRow = {
      id: String(row.id),
      category_id: row.category_id ? String(row.category_id) : null,
      category_name: row.category_name ?? null,
      name: String(row.name),
      description: row.description ?? null,
      price_vnd: Number(row.price_vnd) || 0,
      pricing_mode: row.pricing_mode ?? 'fixed',
      price_min: row.price_min == null ? null : Number(row.price_min),
      price_max: row.price_max == null ? null : Number(row.price_max),
      is_available: Boolean(row.is_available),
      allow_dine_in: row.allow_dine_in !== false,
      allow_delivery: row.allow_delivery !== false,
      serving_size: row.serving_size ?? null,
      pairing_note: row.pairing_note ?? null,
      spice_level: row.spice_level,
      tags: row.tags ?? [],
      is_signature: Boolean(row.is_signature),
      is_bestseller: Boolean(row.is_bestseller),
    }
    // pg returns NULL for missing LEFT JOIN rows; tolerate undefined in tests.
    const hasProfile = row.serving_unit != null || row.people_min != null || row.meal_role != null ||
      row.allergens != null || row.confidence != null
    const profile: MenuProfileRow | null = !hasProfile ? null : {
      menu_item_id: String(row.id),
      serving_unit: row.serving_unit,
      serving_description: row.serving_description,
      people_min: row.people_min,
      people_max: row.people_max,
      meal_role: row.meal_role,
      meal_context: row.meal_context ?? 'shared',
      protein_score: Number(row.protein_score) || 0,
      carb_score: Number(row.carb_score) || 0,
      vegetable_score: Number(row.vegetable_score) || 0,
      soup_score: Number(row.soup_score) || 0,
      spice_level: row.profile_spice,
      richness_level: row.richness_level,
      taste_tags: row.taste_tags ?? [],
      dietary_tags: row.dietary_tags ?? [],
      pairing_item_ids: row.pairing_item_ids ?? [],
      allergens: row.allergens ?? {},
      allergen_source: row.allergen_source ?? 'demo_estimate',
      allergen_verified: Boolean(row.allergen_verified),
      allergen_verified_at: row.allergen_verified_at ? new Date(row.allergen_verified_at).toISOString() : null,
      allergen_verified_by: row.allergen_verified_by,
      kitchen_notes: row.kitchen_notes ?? '',
      confidence: row.confidence ?? 'unknown',
      provenance: row.provenance ?? 'admin',
      serving_source: row.serving_source ?? 'admin',
      taste_source: row.taste_source ?? 'admin',
    }
    const versionIso = row.row_version ? new Date(row.row_version).toISOString() : ''
    if (versionIso > version) version = versionIso
    return { ...mapDomainItem(itemRow, profile),
      sourceUpdatedAt: row.item_updated_at ? new Date(row.item_updated_at).toISOString() : null,
      profileUpdatedAt: row.profile_updated_at ? new Date(row.profile_updated_at).toISOString() : null }
  })
  const loadedAt = new Date().toISOString()
  // Content identity also detects deletions and changes below the maximum timestamp.
  const digest = createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 20)
  return { version: `${version || 'undated'}:${digest}`, loadedAt, items }
}
