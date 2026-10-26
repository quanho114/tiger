import { checkedAdd, checkedMultiply, isMoney, normalizeRecommendationPrice } from './price.ts'
import {
  DYNAMIC_RECOMMENDATION_LIMITS as LIMITS,
  type DynamicRecommendationOptions,
  type RecommendationItem,
  type RecommendationLine,
  type RecommendationValidation,
} from './types.ts'

export function normalizeRecommendationText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function validateRecommendationOptions(options: DynamicRecommendationOptions): string | null {
  if (options.budget_vnd != null && !isMoney(options.budget_vnd)) return 'INVALID_BUDGET'
  if (!isMoney(options.existingSubtotal ?? 0)) return 'INVALID_EXISTING_SUBTOTAL'
  if (options.requestedDishCount !== undefined && (!Number.isSafeInteger(options.requestedDishCount) ||
      options.requestedDishCount < 1 || options.requestedDishCount > LIMITS.maxDishes)) return 'INVALID_DISH_COUNT'
  if (options.requestedCountScope !== undefined && !['new_additions', 'final_meal'].includes(options.requestedCountScope)) return 'INVALID_COUNT_SCOPE'
  if (options.existingItemIds && (options.existingItemIds.length > LIMITS.maxDishes ||
      options.existingItemIds.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(options.existingItemIds).size !== options.existingItemIds.length)) return 'INVALID_EXISTING_IDS'
  // Exact final count cannot be proven from a scalar draft subtotal alone.
  if (options.requestedDishCount !== undefined && options.requestedCountScope === 'final_meal' &&
      (options.existingSubtotal ?? 0) > 0 && !options.existingItemIds) return 'MISSING_EXISTING_IDS'
  if (options.feePolicy && (typeof options.feePolicy.complete !== 'boolean' ||
      !isMoney(options.feePolicy.known_min_vnd) || !isMoney(options.feePolicy.known_max_vnd) ||
      options.feePolicy.known_min_vnd > options.feePolicy.known_max_vnd)) return 'INVALID_FEE_POLICY'
  if (options.quantities && Object.values(options.quantities).some(quantity => !Number.isSafeInteger(quantity) ||
      quantity < 1 || quantity > LIMITS.maxQuantity)) return 'INVALID_QUANTITY'
  for (const [name, value, maximum] of [
    ['maxEvaluations', options.maxEvaluations, LIMITS.maxEvaluations],
    ['maxPool', options.maxPool, LIMITS.maxPool],
    ['maxPlans', options.maxPlans, LIMITS.maxPlans],
    ['beamWidth', options.beamWidth, 128],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > maximum)) return `INVALID_${name}`
  }
  if (options.preferences?.some(value => typeof value !== 'string') || options.dislikes?.some(value => typeof value !== 'string')) return 'INVALID_PREFERENCES'
  return null
}

export function itemEligibility(item: RecommendationItem, options: DynamicRecommendationOptions): string | null {
  if (!item.id?.trim() || !item.name?.trim()) return 'INVALID_ITEM'
  if (!item.is_available || item.published === false) return 'UNAVAILABLE'
  if (options.orderMode === 'delivery' && item.allow_delivery === false ||
      options.orderMode === 'dine_in' && item.allow_dine_in === false) return 'ORDER_MODE'
  if (options.requireVerifiedSafety && item.safety_state !== 'verified_safe') return 'UNVERIFIED_SAFETY'
  if (options.bestseller === 'required' && item.is_bestseller !== true) return 'NOT_VERIFIED_BESTSELLER'
  const text = normalizeRecommendationText(`${item.name} ${item.category_name ?? ''} ${(item.tags ?? []).join(' ')}`)
  if (options.dislikes?.some(dislike => {
    const normalized = normalizeRecommendationText(dislike)
    return normalized && ` ${text} `.includes(` ${normalized} `)
  })) return 'DISLIKED'
  const price = normalizeRecommendationPrice(item)
  return price.ok ? null : price.reason
}

/** Independent semantic validator: only IDs and quantities are trusted from a proposal.
 * Every name, price and status is resolved again from the supplied authoritative snapshot.
 * Fee bounds apply to the whole combined meal; callers must not pass per-line fees. */
export function validateRecommendation<T extends RecommendationItem>(
  proposed: readonly { item_id?: string; item?: { id: string }; quantity: number }[],
  catalog: readonly T[],
  options: DynamicRecommendationOptions = {},
): RecommendationValidation<T> {
  const invalidOptions = validateRecommendationOptions(options)
  if (invalidOptions) return { ok: false, reason: invalidOptions }
  if (!proposed.length || proposed.length > LIMITS.maxDishes) return { ok: false, reason: 'INVALID_LINE_COUNT' }
  const byId = new Map<string, T>()
  for (const item of catalog) {
    if (byId.has(item.id)) return { ok: false, reason: 'DUPLICATE_CATALOG_ID' }
    byId.set(item.id, item)
  }
  const seen = new Set<string>()
  const lines: RecommendationLine<T>[] = []
  let subtotalMin = 0, subtotalMax = 0
  for (const raw of proposed) {
    const id = raw.item_id ?? raw.item?.id
    if (!id || seen.has(id)) return { ok: false, reason: 'INVALID_OR_DUPLICATE_ID' }
    seen.add(id)
    if (!Number.isSafeInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > LIMITS.maxQuantity)
      return { ok: false, reason: 'INVALID_QUANTITY' }
    if (options.quantities?.[id] !== undefined && options.quantities[id] !== raw.quantity)
      return { ok: false, reason: 'REQUIRED_QUANTITY_MISMATCH' }
    const item = byId.get(id)
    if (!item) return { ok: false, reason: 'ITEM_NOT_FOUND' }
    const ineligible = itemEligibility(item, options)
    if (ineligible) return { ok: false, reason: ineligible }
    const normalized = normalizeRecommendationPrice(item)
    if (!normalized.ok) return { ok: false, reason: normalized.reason }
    const lineMin = checkedMultiply(normalized.price.min, raw.quantity)
    const lineMax = checkedMultiply(normalized.price.max, raw.quantity)
    if (lineMin === null || lineMax === null) return { ok: false, reason: 'COST_OVERFLOW' }
    const nextMin = checkedAdd(subtotalMin, lineMin), nextMax = checkedAdd(subtotalMax, lineMax)
    if (nextMin === null || nextMax === null) return { ok: false, reason: 'COST_OVERFLOW' }
    subtotalMin = nextMin; subtotalMax = nextMax
    lines.push({ item, quantity: raw.quantity, unitMin: normalized.price.min, unitMax: normalized.price.max, lineMin, lineMax })
  }
  const finalDistinctCount = new Set([...(options.existingItemIds ?? []), ...seen]).size
  if (finalDistinctCount > LIMITS.maxDishes) return { ok: false, reason: 'INVALID_FINAL_DISH_COUNT' }
  const count = options.requestedCountScope === 'final_meal' ? finalDistinctCount : lines.length
  if (options.requestedDishCount !== undefined && count !== options.requestedDishCount)
    return { ok: false, reason: 'DISH_COUNT_MISMATCH' }
  const existingSubtotal = options.existingSubtotal ?? 0
  const feeMin = options.feePolicy?.known_min_vnd ?? 0
  const feeMax = options.feePolicy?.known_max_vnd ?? 0
  const combinedMin = checkedAdd(subtotalMin, existingSubtotal), combinedMax = checkedAdd(subtotalMax, existingSubtotal)
  const totalMin = combinedMin === null ? null : checkedAdd(combinedMin, feeMin)
  const totalMax = combinedMax === null ? null : checkedAdd(combinedMax, feeMax)
  if (totalMin === null || totalMax === null) return { ok: false, reason: 'COST_OVERFLOW' }
  if (options.budget_vnd != null && totalMax > options.budget_vnd) return { ok: false, reason: 'BUDGET_EXCEEDED' }
  const feeComplete = options.feePolicy?.complete === true
  const within = options.budget_vnd != null && feeComplete
  const warnings = ['PORTIONS_NOT_VERIFIED']
  if (!feeComplete) warnings.push('MANDATORY_FEES_UNKNOWN')
  if (options.budget_vnd == null) warnings.push('BUDGET_NOT_PROVIDED')
  const orderableExact = lines.every(line => (line.item.pricing_mode ?? 'fixed') === 'fixed')
  if (!orderableExact) warnings.push('RANGE_ESTIMATE_NOT_ORDER_PRICE')
  return { ok: true, plan: {
    lines, subtotalMin, subtotalMax, existingSubtotal, totalMin, totalMax,
    knownFeesMin: feeMin, knownFeesMax: feeMax, feeComplete,
    budgetStatus: within ? 'within' : 'conditional', portionStatus: 'unknown', orderableExact,
    distinctCount: lines.length, finalDistinctCount, warnings,
  } }
}
