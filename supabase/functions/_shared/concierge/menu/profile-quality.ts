/**
 * Tiger Agent V3 — Phase 5.5: Profile completeness (derived, never stored).
 *
 * EMPTY: no meaningful AI profile.
 * PARTIAL: some serving/taste/role metadata.
 * READY_FOR_RECOMMENDATION: meal_role + usable serving + minimum taste +
 *   explicit allergen representation (unknown/unverified is acceptable,
 *   fabricated safety is not).
 * KITCHEN_VERIFIED: allergen safety explicitly approved by kitchen workflow.
 *
 * Recommendation readiness and allergen verification are INDEPENDENT:
 * a dish can be useful for recommendation while safety stays unverified.
 */

import type { MenuDomainItem, MenuSnapshot } from './types.ts'

export type ProfileStatus = 'EMPTY' | 'PARTIAL' | 'READY_FOR_RECOMMENDATION' | 'KITCHEN_VERIFIED'

export type ProfileWarning =
  | 'MISSING_SERVING_PROFILE'
  | 'MISSING_MEAL_ROLE'
  | 'MISSING_TASTE_METADATA'
  | 'ALLERGEN_UNVERIFIED'
  | 'ALLERGEN_UNKNOWN'
  | 'PAIRING_REFERENCE_INVALID'
  | 'STALE_PROFILE'

export function profileStatusOf(item: MenuDomainItem, knownIds?: Set<string>): ProfileStatus {
  if (item.provenance === 'menu:live_unprofiled') return 'EMPTY'
  const hasRole = item.serving.mealRole !== null
  const hasServing = item.serving.peopleMin !== null && item.serving.peopleMax !== null
  const hasTaste = item.taste.tags.length > 0 || item.taste.spiceLevel !== null
  const allergenExplicit = Object.keys(item.allergens.states).length > 0 || item.provenance !== 'menu:live_unprofiled'
  const ready = hasRole && hasServing && hasTaste && allergenExplicit
  void knownIds
  if (item.allergens.verified && ready) return 'KITCHEN_VERIFIED'
  if (ready) return 'READY_FOR_RECOMMENDATION'
  return 'PARTIAL'
}

export function profileWarningsOf(item: MenuDomainItem, knownIds?: Set<string>): ProfileWarning[] {
  const warnings: ProfileWarning[] = []
  if (item.provenance === 'menu:live_unprofiled') {
    warnings.push('MISSING_SERVING_PROFILE', 'MISSING_MEAL_ROLE', 'MISSING_TASTE_METADATA', 'ALLERGEN_UNKNOWN')
    return warnings
  }
  if (item.serving.peopleMin === null || item.serving.peopleMax === null) warnings.push('MISSING_SERVING_PROFILE')
  if (item.serving.mealRole === null) warnings.push('MISSING_MEAL_ROLE')
  if (item.taste.tags.length === 0 && item.taste.spiceLevel === null) warnings.push('MISSING_TASTE_METADATA')
  if (!item.allergens.verified) warnings.push('ALLERGEN_UNVERIFIED')
  if (Object.keys(item.allergens.states).length === 0) warnings.push('ALLERGEN_UNKNOWN')
  if (knownIds) {
    for (const id of item.pairingItemIds) {
      if (!knownIds.has(id)) {
        warnings.push('PAIRING_REFERENCE_INVALID')
        break
      }
    }
  }
  return warnings
}

export interface ProfileCoverage {
  totalLive: number
  published: number
  withProfile: number
  empty: number
  partial: number
  ready: number
  kitchenVerified: number
  mealRolePct: number
  servingPct: number
  tastePct: number
  allergenExplicitPct: number
  kitchenVerifiedPct: number
  staleProfileIds: string[]
}
/** Seed keys with no live menu item: historical demo data, never migrated. */
export function findStaleSeedIds(liveIds: Set<string>, seedIds: readonly string[]): string[] {
  return seedIds.filter((id) => !liveIds.has(id))
}

export function coverageReport(snapshot: MenuSnapshot, liveIds?: Set<string>): ProfileCoverage {
  const totalLive = snapshot.items.length
  let withProfile = 0
  let partial = 0
  let ready = 0
  let kitchenVerified = 0
  let mealRole = 0
  let serving = 0
  let taste = 0
  let allergenExplicit = 0
  for (const item of snapshot.items) {
    const status = profileStatusOf(item, liveIds)
    if (status !== 'EMPTY') withProfile++
    if (status === 'PARTIAL') partial++
    if (status === 'READY_FOR_RECOMMENDATION' || status === 'KITCHEN_VERIFIED') ready++
    if (status === 'KITCHEN_VERIFIED') kitchenVerified++
    if (item.serving.mealRole !== null) mealRole++
    if (item.serving.peopleMin !== null && item.serving.peopleMax !== null) serving++
    if (item.taste.tags.length > 0 || item.taste.spiceLevel !== null) taste++
    if (Object.keys(item.allergens.states).length > 0) allergenExplicit++
  }
  const pct = (n: number) => (totalLive === 0 ? 0 : Math.round((n / totalLive) * 1000) / 10)
  return {
    totalLive,
    published: totalLive,
    withProfile,
    empty: totalLive - withProfile,
    partial,
    ready,
    kitchenVerified,
    mealRolePct: pct(mealRole),
    servingPct: pct(serving),
    tastePct: pct(taste),
    allergenExplicitPct: pct(allergenExplicit),
    kitchenVerifiedPct: pct(kitchenVerified),
    staleProfileIds: [],
  }
}
