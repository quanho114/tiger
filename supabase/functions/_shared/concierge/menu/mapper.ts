/**
 * Tiger Agent V3 — Phase 5: Row mapper.
 *
 * Maps (menu_items + ai_profile) rows to MenuDomainItems and back to the
 * legacy ServingProfile/ItemAllergenProfile shapes consumed by retrieval,
 * food safety, and the meal planner. Missing profiles degrade to
 * unknown/unverified — never fabricated, never hidden.
 */

import type { ItemAllergenProfile, ServingProfile } from '../types.ts'
import type { MenuAllergens, MenuDomainItem, ProfileSource } from './types.ts'

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []

const asUuidArray = (value: unknown): string[] =>
  asStringArray(value).filter((v) => /^[0-9a-fA-F-]{36}$/.test(v))

const clampScore = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1.5, Math.max(0, value)) : 0

export interface MenuProfileRow {
  menu_item_id: string
  serving_unit: string | null
  serving_description: string | null
  people_min: number | null
  people_max: number | null
  meal_role: MenuDomainItem['serving']['mealRole']
  meal_context: MenuDomainItem['serving']['mealContext']
  protein_score: number
  carb_score: number
  vegetable_score: number
  soup_score: number
  spice_level: number | null
  richness_level: number | null
  taste_tags: unknown
  dietary_tags: unknown
  pairing_item_ids: unknown
  allergens: unknown
  allergen_source: MenuAllergens['source']
  allergen_verified: boolean
  allergen_verified_at: string | null
  allergen_verified_by: string | null
  kitchen_notes: string | null
  confidence: MenuDomainItem['confidence']
  provenance: string
  serving_source: ProfileSource | null
  taste_source: ProfileSource | null
}

export interface MenuItemRow {
  id: string
  category_id: string | null
  category_name: string | null
  name: string
  description: string | null
  price_vnd: number
  pricing_mode: MenuDomainItem['pricingMode']
  price_min: number | null
  price_max: number | null
  is_available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
  serving_size: string | null
  pairing_note: string | null
  spice_level: number | null
  tags: unknown
  is_signature: boolean
  is_bestseller: boolean
}

export function mapDomainItem(item: MenuItemRow, profile: MenuProfileRow | null): MenuDomainItem {
  const hasProfile = Boolean(profile)
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    categoryId: item.category_id,
    categoryName: item.category_name,
    priceVnd: Number(item.price_vnd) || 0,
    pricingMode: item.pricing_mode ?? 'fixed',
    priceMin: item.price_min,
    priceMax: item.price_max,
    isAvailable: Boolean(item.is_available),
    allowDineIn: item.allow_dine_in !== false,
    allowDelivery: item.allow_delivery !== false,
    serving: {
      unit: profile?.serving_unit ?? null,
      description: profile?.serving_description ?? item.serving_size,
      peopleMin: profile?.people_min ?? null,
      peopleMax: profile?.people_max ?? null,
      mealRole: profile?.meal_role ?? null,
      mealContext: profile?.meal_context ?? 'shared',
    },
    contribution: {
      protein: clampScore(profile?.protein_score),
      carb: clampScore(profile?.carb_score),
      vegetable: clampScore(profile?.vegetable_score),
      soup: clampScore(profile?.soup_score),
    },
    taste: {
      spiceLevel: profile?.spice_level ?? item.spice_level,
      richnessLevel: profile?.richness_level ?? null,
      tags: profile ? asStringArray(profile.taste_tags) : [],
    },
    dietaryTags: profile ? asStringArray(profile.dietary_tags) : [],
    allergens: {
      states: (profile?.allergens && typeof profile.allergens === 'object' && !Array.isArray(profile.allergens)
        ? profile.allergens : {}) as MenuAllergens['states'],
      verified: profile?.allergen_verified ?? false,
      source: profile?.allergen_source ?? 'demo_estimate',
      verifiedAt: profile?.allergen_verified_at ?? null,
      verifiedBy: profile?.allergen_verified_by ?? null,
      kitchenNotes: profile?.kitchen_notes ?? '',
    },
    pairingItemIds: profile ? asUuidArray(profile.pairing_item_ids) : [],
    pairingNote: item.pairing_note,
    isSignature: Boolean(item.is_signature),
    isBestseller: Boolean(item.is_bestseller),
    tags: asStringArray(item.tags),
    confidence: hasProfile ? (profile!.confidence ?? 'unknown') : 'unknown',
    provenance: hasProfile ? (profile!.provenance || 'admin') : 'menu:live_unprofiled',
    sources: {
      serving: profile?.serving_source ?? 'system_default',
      taste: profile?.taste_source ?? 'system_default',
      allergen: profile?.allergen_source ?? 'demo_estimate',
    },
  }
}

/** Legacy shape for retrieval/planner/food-safety consumers. Null = unprofiled. */
export function toLegacyServingProfile(item: MenuDomainItem): ServingProfile | null {
  if (item.serving.peopleMin == null || item.serving.peopleMax == null || !item.serving.mealRole) return null
  return {
    item_id: item.id,
    serving_unit: (item.serving.unit ?? 'phần') as ServingProfile['serving_unit'],
    pieces_or_weight: item.serving.description ?? undefined,
    people_min: item.serving.peopleMin,
    people_max: item.serving.peopleMax,
    meal_role: item.serving.mealRole,
    contributions: { ...item.contribution },
    meal_context: item.serving.mealContext,
    confidence: item.confidence,
    provenance: item.provenance,
  }
}

/** Legacy shape. Unverified unless the kitchen explicitly audited. */
export function toLegacyAllergenProfile(item: MenuDomainItem): ItemAllergenProfile {
  return {
    item_id: item.id,
    allergens: { ...item.allergens.states },
    kitchen_notes: item.allergens.kitchenNotes || undefined,
    source: item.allergens.source,
    verified_by_kitchen: item.allergens.verified,
    verified_at: item.allergens.verifiedAt ?? undefined,
  }
}
