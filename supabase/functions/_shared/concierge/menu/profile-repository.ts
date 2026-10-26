/**
 * Tiger Agent V3 — Phase 5: AI profile repository (admin writes).
 *
 * Serving/allergen metadata now persists in menu_item_ai_profiles.
 * Validation reuses the knowledge.ts admin validators (including the
 * kitchen-verification safety gate); writes audit to audit_logs and
 * invalidate the in-process menu snapshot in this isolate.
 */

import type pg from 'pg'
import { AppError } from '../../errors.ts'
import {
  adminUpdateAllergenProfile,
  adminUpdateServingProfile,
  type KnowledgeSnapshot,
} from '../knowledge.ts'
import type { ItemAllergenProfile, ServingProfile } from '../types.ts'
import { invalidateMenuSnapshot } from './domain.ts'
import { toLegacyAllergenProfile, toLegacyServingProfile, type MenuProfileRow } from './mapper.ts'
import type { MenuDomainItem } from './types.ts'

const emptySnapshot = (): KnowledgeSnapshot => ({
  config: {
    version: 1, adult_factor: 1, child_factor: 0.6,
    appetite_factors: { light: 0.85, normal: 1, heavy: 1.2 },
    ideal_macro_ratios: { protein: 0.9, carb: 0.8, vegetable: 0.7, soup: 0.5 },
    hard_budget_tolerance_percentage: 0, soft_budget_tolerance_percentage: 5,
    proposal_ttl_seconds: 1800,
  },
  servingProfiles: {},
  allergenProfiles: {},
  documents: [],
})

async function requireMenuItem(pool: pg.Pool, itemId: string): Promise<void> {
  const { rows } = await pool.query('SELECT 1 FROM public.menu_items WHERE id = $1', [itemId])
  if (!rows.length) throw new AppError('NOT_FOUND', `Không tìm thấy món ${itemId} trong thực đơn`, 404)
}

function rowToProfileRow(row: Record<string, unknown>): MenuProfileRow {
  return {
    menu_item_id: String(row.menu_item_id),
    serving_unit: (row.serving_unit as string) ?? null,
    serving_description: (row.serving_description as string) ?? null,
    people_min: row.people_min as number | null,
    people_max: row.people_max as number | null,
    meal_role: row.meal_role as MenuProfileRow['meal_role'],
    meal_context: (row.meal_context as MenuProfileRow['meal_context']) ?? 'shared',
    protein_score: Number(row.protein_score) || 0,
    carb_score: Number(row.carb_score) || 0,
    vegetable_score: Number(row.vegetable_score) || 0,
    soup_score: Number(row.soup_score) || 0,
    spice_level: row.spice_level as number | null,
    richness_level: row.richness_level as number | null,
    taste_tags: row.taste_tags ?? [],
    dietary_tags: row.dietary_tags ?? [],
    pairing_item_ids: row.pairing_item_ids ?? [],
    allergens: row.allergens ?? {},
    allergen_source: (row.allergen_source as MenuProfileRow['allergen_source']) ?? 'demo_estimate',
    allergen_verified: Boolean(row.allergen_verified),
    allergen_verified_at: row.allergen_verified_at ? new Date(row.allergen_verified_at as string).toISOString() : null,
    allergen_verified_by: (row.allergen_verified_by as string) ?? null,
    kitchen_notes: (row.kitchen_notes as string) ?? '',
    confidence: (row.confidence as MenuProfileRow['confidence']) ?? 'unknown',
    provenance: (row.provenance as string) ?? 'admin',
    serving_source: (row.serving_source as MenuProfileRow['serving_source']) ?? 'admin',
    taste_source: (row.taste_source as MenuProfileRow['taste_source']) ?? 'admin',
  }
}

async function readRow(pool: pg.Pool, itemId: string) {
  const { rows } = await pool.query('SELECT * FROM public.menu_item_ai_profiles WHERE menu_item_id = $1', [itemId])
  return rows[0] as Record<string, unknown> | undefined
}

async function audit(pool: pg.Pool, actorId: string | null, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await pool.query(`INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
    VALUES ($1, 'admin', $2, $3, $4, $5::jsonb)`,
  [actorId, action, entityType, entityId, JSON.stringify(metadata)])
}

export async function listServingProfiles(pool: pg.Pool): Promise<Record<string, ServingProfile>> {
  const { rows } = await pool.query('SELECT * FROM public.menu_item_ai_profiles WHERE people_min IS NOT NULL AND meal_role IS NOT NULL')
  const out: Record<string, ServingProfile> = {}
  for (const row of rows) {
    const mapped = toLegacyServingProfile(rowToDomainShim(row))
    if (mapped) out[String(row.menu_item_id)] = mapped
  }
  return out
}

// Minimal domain-shaped shim so the strict legacy mapper can be reused.
// Preserves stored allergen/taste/dietary/pairing data verbatim (unknown stays
// unknown; verified stays verified). Never fabricate or blank stored profiles.
const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

const asUuidArray = (value: unknown): string[] =>
  asStringArray(value).filter((v) => /^[0-9a-fA-F-]{36}$/.test(v))

function rowToDomainShim(row: Record<string, unknown>): MenuDomainItem {
  const profile = rowToProfileRow(row)
  const allergens = (profile.allergens && typeof profile.allergens === 'object' && !Array.isArray(profile.allergens)
    ? profile.allergens : {}) as MenuDomainItem['allergens']['states']
  return {
    id: profile.menu_item_id, name: '', description: null, categoryId: null, categoryName: null,
    priceVnd: 0, pricingMode: 'fixed', priceMin: null, priceMax: null, isAvailable: true,
    allowDineIn: true, allowDelivery: true,
    serving: { unit: profile.serving_unit, description: profile.serving_description, peopleMin: profile.people_min, peopleMax: profile.people_max, mealRole: profile.meal_role, mealContext: profile.meal_context },
    contribution: { protein: profile.protein_score, carb: profile.carb_score, vegetable: profile.vegetable_score, soup: profile.soup_score },
    taste: { spiceLevel: profile.spice_level, richnessLevel: profile.richness_level, tags: asStringArray(profile.taste_tags) },
    dietaryTags: asStringArray(profile.dietary_tags),
    allergens: { states: allergens, verified: profile.allergen_verified, source: profile.allergen_source, verifiedAt: profile.allergen_verified_at, verifiedBy: profile.allergen_verified_by, kitchenNotes: profile.kitchen_notes ?? '' },
    pairingItemIds: asUuidArray(profile.pairing_item_ids), pairingNote: null, isSignature: false, isBestseller: false, tags: [],
    confidence: profile.confidence, provenance: profile.provenance,
    sources: { serving: profile.serving_source ?? 'admin', taste: profile.taste_source ?? 'admin', allergen: profile.allergen_source },
  }
}

export async function getServingProfile(pool: pg.Pool, itemId: string): Promise<ServingProfile> {
  const row = await readRow(pool, itemId)
  const mapped = row ? toLegacyServingProfile(rowToDomainShim(row)) : null
  if (!mapped) throw new AppError('NOT_FOUND', `Không tìm thấy thông tin khẩu phần cho món ${itemId}`, 404)
  return mapped
}

export async function listAllergenProfiles(pool: pg.Pool): Promise<Record<string, ItemAllergenProfile>> {
  const { rows } = await pool.query('SELECT * FROM public.menu_item_ai_profiles')
  const out: Record<string, ItemAllergenProfile> = {}
  for (const row of rows) out[String(row.menu_item_id)] = toLegacyAllergenProfile(rowToDomainShim(row))
  return out
}

export async function getAllergenProfile(pool: pg.Pool, itemId: string): Promise<ItemAllergenProfile> {
  const row = await readRow(pool, itemId)
  if (!row) throw new AppError('NOT_FOUND', `Không tìm thấy thông tin dị ứng cho món ${itemId}`, 404)
  return toLegacyAllergenProfile(rowToDomainShim(row))
}

export async function upsertServingProfile(
  pool: pg.Pool,
  itemId: string,
  updates: Partial<ServingProfile>,
  actorId: string | null,
  source: 'restaurant_admin' | 'ai_draft' = 'restaurant_admin',
): Promise<ServingProfile> {
  if (!itemId || !/^[0-9a-fA-F-]{36}$/.test(itemId)) {
    throw new AppError('VALIDATION_ERROR', 'Mã món ăn không hợp lệ (yêu cầu UUID)', 422)
  }
  await requireMenuItem(pool, itemId)
  const existing = await readRow(pool, itemId)
  const snapshot = emptySnapshot()
  if (existing) {
    const mapped = toLegacyServingProfile(rowToDomainShim(existing))
    if (mapped) snapshot.servingProfiles[itemId] = mapped
  }
  const updated = adminUpdateServingProfile(itemId, updates, actorId ?? undefined, snapshot)
  await pool.query(
    `INSERT INTO public.menu_item_ai_profiles
      (menu_item_id, serving_unit, serving_description, people_min, people_max, meal_role, meal_context,
       protein_score, carb_score, vegetable_score, soup_score, confidence, provenance, serving_source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (menu_item_id) DO UPDATE SET
       serving_unit = EXCLUDED.serving_unit, serving_description = EXCLUDED.serving_description,
       people_min = EXCLUDED.people_min, people_max = EXCLUDED.people_max,
       meal_role = EXCLUDED.meal_role, meal_context = EXCLUDED.meal_context,
       protein_score = EXCLUDED.protein_score, carb_score = EXCLUDED.carb_score,
       vegetable_score = EXCLUDED.vegetable_score, soup_score = EXCLUDED.soup_score,
       confidence = EXCLUDED.confidence, provenance = EXCLUDED.provenance,
       serving_source = EXCLUDED.serving_source, updated_at = now()`,
    [itemId, updated.serving_unit, updated.pieces_or_weight ?? null, updated.people_min, updated.people_max,
      updated.meal_role, updated.meal_context, updated.contributions.protein, updated.contributions.carb,
      updated.contributions.vegetable, updated.contributions.soup, updated.confidence, updated.provenance, source],
  )
  invalidateMenuSnapshot()
  await audit(pool, actorId, 'update_serving_profile', 'serving_profile', itemId, updates as Record<string, unknown>)
  return updated
}

export async function upsertAllergenProfile(
  pool: pg.Pool,
  itemId: string,
  updates: Partial<ItemAllergenProfile>,
  actorId: string | null,
): Promise<ItemAllergenProfile> {
  if (!itemId || !/^[0-9a-fA-F-]{36}$/.test(itemId)) {
    throw new AppError('VALIDATION_ERROR', 'Mã món ăn không hợp lệ (yêu cầu UUID)', 422)
  }
  await requireMenuItem(pool, itemId)
  const existing = await readRow(pool, itemId)
  const snapshot = emptySnapshot()
  if (existing) snapshot.allergenProfiles[itemId] = toLegacyAllergenProfile(rowToDomainShim(existing))
  const updated = adminUpdateAllergenProfile(itemId, updates, actorId ?? undefined, snapshot)
  await pool.query(
    `INSERT INTO public.menu_item_ai_profiles
      (menu_item_id, allergens, allergen_source, allergen_verified, allergen_verified_at, allergen_verified_by,
       kitchen_notes, provenance, updated_at)
     VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (menu_item_id) DO UPDATE SET
       allergens = EXCLUDED.allergens, allergen_source = EXCLUDED.allergen_source,
       allergen_verified = EXCLUDED.allergen_verified, allergen_verified_at = EXCLUDED.allergen_verified_at,
       allergen_verified_by = EXCLUDED.allergen_verified_by, kitchen_notes = EXCLUDED.kitchen_notes,
       provenance = EXCLUDED.provenance, updated_at = now()`,
    [itemId, JSON.stringify(updated.allergens), updated.source ?? 'demo_estimate', updated.verified_by_kitchen,
      updated.verified_at ?? null, updated.verified_by_kitchen ? (updated.updated_by ?? null) : null,
      updated.kitchen_notes ?? '', `admin_audit:${actorId ?? 'kitchen_staff'}`],
  )
  invalidateMenuSnapshot()
  await audit(pool, actorId, 'update_allergen_profile', 'allergen_profile', itemId, updates as Record<string, unknown>)
  return updated
}
