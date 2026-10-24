import type { DynamicRecommendationOptions, RecommendationItem, RecommendationQuality, ValidatedRecommendation } from './types.ts'
import { normalizeRecommendationText } from './validate.ts'

/** Profile role is scored only with explicit staff provenance. Catalog categories
 * support a coarse role hint, never a nutritional or serving-size assertion. */
export function recommendationRole(item: RecommendationItem): string | null {
  if (item.meal_role && ['restaurant_defined', 'restaurant_admin', 'kitchen', 'admin'].includes(item.role_source ?? '')) return item.meal_role
  const category = normalizeRecommendationText(item.category_name ?? '')
  if (/\b(?:goi|rau)\b/.test(category)) return 'vegetable'
  if (/\b(?:com|mi|mien)\b/.test(category)) return 'carb'
  if (/\blau\b/.test(category)) return 'soup_hotpot'
  if (/\b(?:ga|heo|bo|hai san|ca|ech|luon)\b/.test(category)) return 'main_protein'
  if (/\bmon phu\b/.test(category)) return 'side'
  return null
}

const itemTraitCache = new WeakMap<RecommendationItem, { paddedText: string; role: string | null }>()
const preferenceCache = new WeakMap< readonly string[], string[]>()

function getItemTraits(item: RecommendationItem): { paddedText: string; role: string | null } {
  const cached = itemTraitCache.get(item)
  if (cached) return cached
  const traits = {
    paddedText: ` ${normalizeRecommendationText(`${item.name} ${(item.tags ?? []).join(' ')} ${item.category_name ?? ''}`)} `,
    role: recommendationRole(item),
  }
  itemTraitCache.set(item, traits)
  return traits
}

function getNormalizedPreferences(raw?: readonly string[]): string[] {
  if (!raw?.length) return []
  const cached = preferenceCache.get(raw)
  if (cached) return cached
  const normalized = [...new Set(raw.map(normalizeRecommendationText).filter(Boolean))]
  preferenceCache.set(raw, normalized)
  return normalized
}

export function scoreRecommendation<T extends RecommendationItem>(
  plan: ValidatedRecommendation<T>, options: DynamicRecommendationOptions,
): RecommendationQuality {
  const items = plan.lines.map(line => line.item)
  const count = items.length
  const preferences = getNormalizedPreferences(options.preferences)
  const traits = items.map(getItemTraits)
  const matchedPreferences = preferences.filter(preference => {
    const token = ` ${preference} `
    return traits.some(entry => entry.paddedText.includes(token))
  }).length
  const matchingItems = preferences.length
    ? traits.filter(entry => preferences.some(preference => entry.paddedText.includes(` ${preference} `))).length
    : 0
  // Normalize ratios rather than accumulating one reward per added line.
  const preference = preferences.length ? Math.round(25 * (matchedPreferences / preferences.length) * (0.5 + 0.5 * matchingItems / count)) : 0
  const bestseller = options.bestseller && options.bestseller !== 'none'
    ? Math.round(25 * items.filter(item => item.is_bestseller === true).length / count) : 0
  const roles = traits.map(entry => entry.role).filter((role): role is string => role !== null)
  const uniqueRoles = new Set(roles)
  const primary = uniqueRoles.has('main_protein') || uniqueRoles.has('soup_hotpot') || uniqueRoles.has('set')
  const relevantRoles = ['main_protein', 'soup_hotpot', 'vegetable', 'carb', 'side', 'set']
  const covered = [...uniqueRoles].filter(role => relevantRoles.includes(role)).length
  const snack = options.mealContext === 'snack'
  const coherence = snack ? (roles.length ? 20 : 0) :
    (primary ? 8 : 0) + (uniqueRoles.has('vegetable') ? 4 : 0) +
    (uniqueRoles.has('carb') ? 4 : 0) + (uniqueRoles.has('soup_hotpot') ? 4 : 0)
  const diversity = snack ? 0 : Math.round(15 * Math.min(covered, 5) / 5)
  const repeatedRoles = roles.length - uniqueRoles.size
  const redundancyPenalty = Math.min(25, repeatedRoles * 8 + (snack ? Math.max(0, count - 1) * 6 : 0))
  const remaining = options.budget_vnd == null ? null : options.budget_vnd - plan.existingSubtotal - plan.knownFeesMax
  // With no grounded quality signal, spending more is not a reason to add dishes.
  const hasQualityEvidence = bestseller > 0 || preference > 0 || coherence > 0 || diversity > 0
  const utilization = hasQualityEvidence && remaining != null && remaining > 0
    ? Math.round(5 * Math.min(plan.subtotalMax / remaining, 0.7) / 0.7) : 0
  const components = { bestseller, preference, coherence, diversity, utilization, redundancyPenalty }
  const score = bestseller + preference + coherence + diversity + utilization - redundancyPenalty
  const reasons: string[] = []
  if (bestseller > 0) reasons.push('VERIFIED_BESTSELLER_FLAGS')
  if (preference > 0) reasons.push('EXPLICIT_PREFERENCE_MATCH')
  if (primary && !snack) reasons.push('MEAL_PRIMARY_ROLE')
  if (diversity > 0) reasons.push('CATALOG_ROLE_DIVERSITY')
  if (redundancyPenalty > 0) reasons.push('REDUNDANCY_PENALTY')
  // No portion/popularity score is synthesized from missing data.
  return { score, components, reasons }
}
