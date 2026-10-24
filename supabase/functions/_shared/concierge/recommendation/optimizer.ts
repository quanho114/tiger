import { scoreRecommendation } from './quality.ts'
import { itemEligibility, validateRecommendation, validateRecommendationOptions } from './validate.ts'
import {
  DYNAMIC_RECOMMENDATION_LIMITS as LIMITS,
  type DynamicRecommendationOptions,
  type DynamicRecommendationPlan,
  type DynamicRecommendationResult,
  type RecommendationItem,
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
  const provisionalOptions = { ...options, requestedDishCount: undefined }
  const byCount = new Map<number, DynamicRecommendationPlan<T>[]>()
  const finalists = new Map<string, DynamicRecommendationPlan<T>>()
  const compare = (a: DynamicRecommendationPlan<T>, b: DynamicRecommendationPlan<T>) =>
    b.score - a.score || a.totalMax - b.totalMax || a.key.localeCompare(b.key)
  const consider = (lines: readonly { item: T; quantity: number }[]) => {
    const validated = validateRecommendation(lines, catalog, options)
    if (!validated.ok) return
    const quality = scoreRecommendation(validated.plan, options)
    const key = dynamicRecommendationKey(validated.plan.lines)
    finalists.set(key, { ...validated.plan, ...quality, key })
    // Keep only the compact best alternatives; every generated state is still checked.
    if (finalists.size > maxPlans * 4) {
      const best = [...finalists.values()].sort(compare).slice(0, maxPlans * 2)
      finalists.clear()
      for (const plan of best) finalists.set(plan.key, plan)
    }
  }
  for (const item of pool) {
    if (stats.capped) break
    // Snapshot prevents choosing this same parent twice during one item decision.
    const previous = [...byCount.entries()].flatMap(([, states]) => states)
    const sources: (DynamicRecommendationPlan<T> | null)[] = [null, ...previous]
    for (const state of sources) {
      if (stats.evaluated >= maxEvaluations) { stats.capped = true; break }
      if ((state?.lines.length ?? 0) >= LIMITS.maxDishes) continue
      const quantity = options.quantities?.[item.id] ?? 1
      const proposed = [...(state?.lines ?? []), { item, quantity }]
      stats.evaluated++
      const validated = validateRecommendation(proposed, catalog, provisionalOptions)
      if (!validated.ok) continue
      const quality = scoreRecommendation(validated.plan, options)
      const key = dynamicRecommendationKey(validated.plan.lines)
      const next = { ...validated.plan, ...quality, key }
      const count = next.lines.length
      const bucket = byCount.get(count) ?? []
      if (!bucket.some(entry => entry.key === key)) bucket.push(next)
      bucket.sort(compare)
      if (bucket.length > beamWidth) { bucket.length = beamWidth; stats.truncated = true }
      byCount.set(count, bucket)
      consider(next.lines)
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
