import { checkedAdd, checkedMultiply, normalizeRecommendationPrice } from './price.ts'
import { scoreRecommendation } from './quality.ts'
import { itemEligibility, validateRecommendation, validateRecommendationOptions } from './validate.ts'
import {
  DYNAMIC_RECOMMENDATION_LIMITS as LIMITS,
  type DynamicRecommendationOptions,
  type DynamicRecommendationPlan,
  type DynamicRecommendationResult,
  type RecommendationItem,
  type RecommendationLine,
  type ValidatedRecommendation,
} from './types.ts'

export function dynamicRecommendationKey(lines: readonly { item: { id: string }; quantity: number }[]): string {
  return [...lines].sort((a, b) => a.item.id.localeCompare(b.item.id)).map(line => `${line.item.id}:${line.quantity}`).join('|')
}

/** Server-owned, resource-bounded search. All parent decisions are visited unless
 * the explicit work cap is reached. A beam cut is reported, never a feasibility proof.
 * Quantity defaults to one: this milestone does not invent serving profiles/variants. */
export function recommendDynamicMeals<T extends RecommendationItem>(
  catalog: readonly T[], options: DynamicRecommendationOptions = {},
): DynamicRecommendationResult<T> {
  const stats = { evaluated: 0, eligible: 0, pool: 0, capped: false, truncated: false }
  const exclusions: Record<string, number> = {}
  const fail = (reason: string): DynamicRecommendationResult<T> => ({ plans: [], searchStatus: 'invalid_input', stats, exclusions, errors: [reason] })
  const invalidOptions = validateRecommendationOptions(options)
  if (invalidOptions) return fail(invalidOptions)
  if (new Set(catalog.map(item => item.id)).size !== catalog.length) return fail('DUPLICATE_CATALOG_ID')
  const eligible = [...catalog].sort((a, b) => a.id.localeCompare(b.id)).filter(item => {
    const reason = itemEligibility(item, options)
    if (reason) { exclusions[reason] = (exclusions[reason] ?? 0) + 1; return false }
    return true
  })
  stats.eligible = eligible.length
  const pool = eligible.slice(0, options.maxPool ?? LIMITS.maxPool)
  stats.pool = pool.length
  stats.truncated = pool.length !== eligible.length
  const maxEvaluations = options.maxEvaluations ?? LIMITS.maxEvaluations
  const beamWidth = options.beamWidth ?? LIMITS.beamWidth
  const maxPlans = options.maxPlans ?? LIMITS.maxPlans
  const maxSearchDishes = options.requestedDishCount !== undefined
    ? (options.requestedCountScope === 'final_meal' ? LIMITS.maxDishes : options.requestedDishCount)
    : LIMITS.defaultMaxDishes
  const existingIdSet = new Set(options.existingItemIds ?? [])
  const existingSubtotal = options.existingSubtotal ?? 0
  const feeMin = options.feePolicy?.known_min_vnd ?? 0
  const feeMax = options.feePolicy?.known_max_vnd ?? 0
  const feeComplete = options.feePolicy?.complete === true
  const budgetStatus: 'within' | 'conditional' = options.budget_vnd != null && feeComplete ? 'within' : 'conditional'
  const baseWarnings = [
    'PORTIONS_NOT_VERIFIED',
    ...(!feeComplete ? ['MANDATORY_FEES_UNKNOWN'] : []),
    ...(options.budget_vnd == null ? ['BUDGET_NOT_PROVIDED'] : []),
  ]
  const rangeWarnings = [...baseWarnings, 'RANGE_ESTIMATE_NOT_ORDER_PRICE']
  const preparedPool = pool.map(item => {
    const quantity = options.quantities?.[item.id] ?? 1
    const normalized = normalizeRecommendationPrice(item)
    const lineMin = normalized.ok ? checkedMultiply(normalized.price.min, quantity) : null
    const lineMax = normalized.ok ? checkedMultiply(normalized.price.max, quantity) : null
    const line: RecommendationLine<T> | null = normalized.ok && lineMin !== null && lineMax !== null
      ? { item, quantity, unitMin: normalized.price.min, unitMax: normalized.price.max, lineMin, lineMax }
      : null
    return {
      line,
      keyPart: `${item.id}:${quantity}`,
      inExisting: existingIdSet.has(item.id),
      isFixed: (item.pricing_mode ?? 'fixed') === 'fixed',
    }
  })
  const byCount = new Map<number, DynamicRecommendationPlan<T>[]>()
  const finalists = new Map<string, DynamicRecommendationPlan<T>>()
  const compare = (a: DynamicRecommendationPlan<T>, b: DynamicRecommendationPlan<T>) =>
    b.score - a.score || a.totalMax - b.totalMax || a.key.localeCompare(b.key)
  const consider = (plan: DynamicRecommendationPlan<T>) => {
    const count = options.requestedCountScope === 'final_meal' ? plan.finalDistinctCount : plan.distinctCount
    if (options.requestedDishCount !== undefined && count !== options.requestedDishCount) return
    finalists.set(plan.key, plan)
    // Keep only the compact best alternatives; every generated state is still checked.
    if (finalists.size > maxPlans * 4) {
      const best = [...finalists.values()].sort(compare).slice(0, maxPlans * 2)
      finalists.clear()
      for (const entry of best) finalists.set(entry.key, entry)
    }
  }
  for (const prepared of preparedPool) {
    if (stats.capped) break
    // Snapshot prevents choosing this same parent twice during one item decision.
    const previous = [...byCount.entries()].flatMap(([, states]) => states)
    const sources: (DynamicRecommendationPlan<T> | null)[] = [null, ...previous]
    for (const state of sources) {
      if (stats.evaluated >= maxEvaluations) { stats.capped = true; break }
      if ((state?.lines.length ?? 0) >= maxSearchDishes) continue
      stats.evaluated++
      if (!prepared.line) continue
      const finalDistinctCount = (state?.finalDistinctCount ?? existingIdSet.size) + (prepared.inExisting ? 0 : 1)
      if (finalDistinctCount > LIMITS.maxDishes) continue
      if (options.requestedDishCount !== undefined && options.requestedCountScope === 'final_meal' &&
          finalDistinctCount > options.requestedDishCount) continue
      const subtotalMin = checkedAdd(state?.subtotalMin ?? 0, prepared.line.lineMin)
      const subtotalMax = checkedAdd(state?.subtotalMax ?? 0, prepared.line.lineMax)
      if (subtotalMin === null || subtotalMax === null) continue
      const combinedMin = checkedAdd(subtotalMin, existingSubtotal)
      const combinedMax = checkedAdd(subtotalMax, existingSubtotal)
      const totalMin = combinedMin === null ? null : checkedAdd(combinedMin, feeMin)
      const totalMax = combinedMax === null ? null : checkedAdd(combinedMax, feeMax)
      if (totalMin === null || totalMax === null) continue
      if (options.budget_vnd != null && totalMax > options.budget_vnd) continue
      const lines = state ? [...state.lines, prepared.line] : [prepared.line]
      const orderableExact = (state?.orderableExact ?? true) && prepared.isFixed
      const validatedPlan: ValidatedRecommendation<T> = {
        lines, subtotalMin, subtotalMax, existingSubtotal, totalMin, totalMax,
        knownFeesMin: feeMin, knownFeesMax: feeMax, feeComplete, budgetStatus,
        portionStatus: 'unknown', orderableExact,
        distinctCount: lines.length, finalDistinctCount,
        warnings: orderableExact ? baseWarnings : rangeWarnings,
      }
      const quality = scoreRecommendation(validatedPlan, options)
      const key = state ? `${state.key}|${prepared.keyPart}` : prepared.keyPart
      const next: DynamicRecommendationPlan<T> = { ...validatedPlan, ...quality, key }
      const count = lines.length
      const bucket = byCount.get(count) ?? []
      if (!bucket.some(entry => entry.key === key)) bucket.push(next)
      bucket.sort(compare)
      if (bucket.length > beamWidth) { bucket.length = beamWidth; stats.truncated = true }
      byCount.set(count, bucket)
      consider(next)
    }
  }
  // Revalidate the final selection independently, not just intermediate arithmetic.
  const plans = [...finalists.values()].sort(compare).slice(0, maxPlans).flatMap(plan => {
    const validated = validateRecommendation(plan.lines, catalog, options)
    return validated.ok ? [{ ...validated.plan, ...scoreRecommendation(validated.plan, options), key: plan.key }] : []
  })
  const incomplete = stats.capped || stats.truncated
  return {
    plans,
    searchStatus: incomplete ? (plans.length ? 'bounded_best_found' : 'incomplete') :
      plans.length ? 'complete' : 'no_feasible_proven',
    stats, exclusions, errors: [],
  }
}
