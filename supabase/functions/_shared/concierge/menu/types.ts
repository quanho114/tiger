/**
 * Tiger Agent V3 — Phase 5: Menu domain types.
 *
 * menu_items = selling/availability truth (price, published, available,
 * is_signature, is_bestseller). menu_item_ai_profiles = serving/taste/
 * allergen/recommendation metadata. Never the reverse.
 */

import type { AllergenType, ConfidenceLevel, MealContext, MealRole } from '../types.ts'

export interface MenuServing {
  unit: string | null
  description: string | null
  peopleMin: number | null
  peopleMax: number | null
  mealRole: MealRole | null
  mealContext: MealContext
}

export interface MenuContribution {
  protein: number
  carb: number
  vegetable: number
  soup: number
}

export interface MenuTaste {
  spiceLevel: number | null
  richnessLevel: number | null
  tags: string[]
}

export type MenuAllergenStates = Partial<Record<AllergenType, 'contains' | 'may_contain' | 'absent' | 'unknown'>>

export interface MenuAllergens {
  states: MenuAllergenStates
  verified: boolean
  source: 'system_seed' | 'demo_estimate' | 'kitchen_audited'
  verifiedAt: string | null
  verifiedBy: string | null
  kitchenNotes: string
}

export type ProfileSource =
  | 'restaurant_admin'
  | 'kitchen'
  | 'ai_draft'
  | 'migration'
  | 'system_default'
  | 'admin'

export interface MenuDomainItem {
  sourceUpdatedAt?: string | null
  profileUpdatedAt?: string | null
  id: string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null

  priceVnd: number
  pricingMode: 'fixed' | 'range' | 'market' | 'unknown'
  priceMin: number | null
  priceMax: number | null
  isAvailable: boolean
  allowDineIn: boolean
  allowDelivery: boolean

  serving: MenuServing
  contribution: MenuContribution
  taste: MenuTaste
  dietaryTags: string[]

  allergens: MenuAllergens
  pairingItemIds: string[]
  pairingNote: string | null

  isSignature: boolean
  isBestseller: boolean
  tags: string[]

  /** restaurant_defined = profiled by staff; estimated/unknown degrade safely. */
  confidence: ConfidenceLevel
  provenance: string
  /** Per-section provenance: AI estimates must never read as confirmed truth. */
  sources: {
    serving: ProfileSource
    taste: ProfileSource
    allergen: MenuAllergens['source']
  }
}

export interface MenuSnapshot {
  version: string
  loadedAt: string
  items: MenuDomainItem[]
  expiresAt?: string
  freshness?: 'fresh' | 'stale'
}
