import { describe, expect, it } from 'vitest'
import {
  normalizeRecommendationPrice,
  recommendDynamicMeals,
  validateRecommendation,
  type DynamicRecommendationOptions,
  type RecommendationItem,
} from '../../supabase/functions/_shared/concierge/recommendation/index.ts'

const completeFees = { complete: true, known_min_vnd: 0, known_max_vnd: 0 }
const item = (id: string, price_vnd = 100, extra: Partial<RecommendationItem> = {}): RecommendationItem => ({
  id, name: `Dish ${id}`, price_vnd, pricing_mode: 'fixed', is_available: true,
  ...extra,
})
const options = (extra: DynamicRecommendationOptions = {}): DynamicRecommendationOptions => ({ budget_vnd: 1_000, feePolicy: completeFees, ...extra })

function validPlan(catalog: RecommendationItem[], selected: { item: { id: string }; quantity: number }[], opts = options()) {
  const result = validateRecommendation(selected, catalog, opts)
  if (!result.ok) throw new Error(result.reason)
  return result.plan
}

describe('pure dynamic recommendation cost normalization and independent validation', () => {
  it('normalizes fixed and ranges without creating a variant or order price', () => {
    expect(normalizeRecommendationPrice(item('fixed', 150))).toEqual({ ok: true, price: { min: 150, max: 150, kind: 'fixed', orderableExact: true } })
    expect(normalizeRecommendationPrice(item('range', 150, { pricing_mode: 'range', price_min: 150, price_max: 180 })))
      .toEqual({ ok: true, price: { min: 150, max: 180, kind: 'range', orderableExact: false } })
  })
  it.each([
    { pricing_mode: 'market' as const, price_vnd: 0 },
    { pricing_mode: 'unknown' as const, price_vnd: 0 },
    { pricing_mode: 'range' as const, price_min: 1, price_max: null },
    { pricing_mode: 'range' as const, price_min: 10, price_max: 1 },
    { pricing_mode: 'range' as const, price_min: -1, price_max: 10 },
    { price_vnd: Number.MAX_SAFE_INTEGER + 1 },
    { price_vnd: Number.NaN },
    { price_vnd: -1 },
  ])('does not guarantee an unbounded or invalid price: %j', extra => {
    expect(normalizeRecommendationPrice(item('bad', 10, extra)).ok).toBe(false)
    expect(recommendDynamicMeals([item('bad', 10, extra)], options()).plans).toEqual([])
  })
  it('uses authoritative prices and quantities, rejecting max-over-budget even when minimum fits', () => {
    const catalog = [item('r', 100, { pricing_mode: 'range', price_min: 100, price_max: 200 })]
    const forged = [{ item: { id: 'r', price_vnd: 1 }, quantity: 2 }]
    expect(validateRecommendation(forged, catalog, options({ budget_vnd: 300 }))).toEqual({ ok: false, reason: 'BUDGET_EXCEEDED' })
    const plan = validPlan(catalog, forged, options({ budget_vnd: 400 }))
    expect([plan.subtotalMin, plan.subtotalMax, plan.totalMax]).toEqual([200, 400, 400])
    expect(plan.orderableExact).toBe(false)
    expect(plan.budgetStatus).toBe('within')
  })
  it('sums mixed fixed/range, existing draft and known fees exactly once', () => {
    const catalog = [item('f', 100), item('r', 50, { pricing_mode: 'range', price_min: 50, price_max: 80 })]
    const plan = validPlan(catalog, catalog.map(value => ({ item: value, quantity: 2 })), options({
      budget_vnd: 420, existingSubtotal: 40, feePolicy: { complete: true, known_min_vnd: 10, known_max_vnd: 20 },
    }))
    expect([plan.subtotalMin, plan.subtotalMax, plan.totalMin, plan.totalMax]).toEqual([300, 360, 350, 420])
    expect(plan.budgetStatus).toBe('within')
    expect(validateRecommendation(plan.lines, catalog, options({ budget_vnd: 419, existingSubtotal: 40,
      feePolicy: { complete: true, known_min_vnd: 10, known_max_vnd: 20 } }))).toEqual({ ok: false, reason: 'BUDGET_EXCEEDED' })
  })
  it('unknown fees and missing budget are conditional, never a final-bill guarantee', () => {
    const catalog = [item('a', 100)]
    const proposal = [{ item: catalog[0], quantity: 1 }]
    expect(validPlan(catalog, proposal, { budget_vnd: 100 }).budgetStatus).toBe('conditional')
    expect(validPlan(catalog, proposal, options({ feePolicy: { complete: false, known_min_vnd: 0, known_max_vnd: 0 } })).warnings).toContain('MANDATORY_FEES_UNKNOWN')
    expect(validPlan(catalog, proposal, { feePolicy: completeFees }).budgetStatus).toBe('conditional')
  })
  it('safe fee upper bound cannot be omitted to fit a budget', () => {
    const catalog = [item('r', 450, { pricing_mode: 'range', price_min: 450, price_max: 500 })]
    expect(validateRecommendation([{ item: catalog[0], quantity: 1 }], catalog, options({ budget_vnd: 500,
      feePolicy: { complete: true, known_min_vnd: 0, known_max_vnd: 30 } }))).toEqual({ ok: false, reason: 'BUDGET_EXCEEDED' })
  })
  it('rejects duplicates, invented IDs, unsafe multiplication and fractional quantities', () => {
    const catalog = [item('a', 100), item('huge', Number.MAX_SAFE_INTEGER)]
    expect(validateRecommendation([{ item_id: 'missing', quantity: 1 }], catalog, options()).ok).toBe(false)
    expect(validateRecommendation([{ item_id: 'a', quantity: 1 }, { item_id: 'a', quantity: 1 }], catalog, options()).ok).toBe(false)
    expect(validateRecommendation([{ item_id: 'a', quantity: 0.5 }], catalog, options()).ok).toBe(false)
    expect(validateRecommendation([{ item_id: 'huge', quantity: 2 }], catalog, {}).ok).toBe(false)
  })
  it('counts final dish parents versus additions, independently from portions', () => {
    const catalog = [item('new', 100)]
    const opts = options({ existingSubtotal: 200, existingItemIds: ['one', 'two'], requestedDishCount: 3, requestedCountScope: 'final_meal' })
    expect(validPlan(catalog, [{ item: { id: 'new' }, quantity: 2 }], opts).finalDistinctCount).toBe(3)
    expect(validateRecommendation([{ item: catalog[0], quantity: 2 }], catalog, { ...opts, requestedCountScope: 'new_additions' }).ok).toBe(false)
    expect(validateRecommendation([{ item: catalog[0], quantity: 2 }], catalog, { ...opts, existingItemIds: undefined })).toEqual({ ok: false, reason: 'MISSING_EXISTING_IDS' })
  })
  it('checks availability, mode, authoritative bestseller and allergy verification', () => {
    for (const [entry, opt] of [
      [item('a', 100, { is_available: false }), {}],
      [item('a', 100, { allow_delivery: false }), { orderMode: 'delivery' }],
      [item('a', 100, { is_bestseller: false }), { bestseller: 'required' }],
      [item('a', 100, { safety_state: 'allergen_unknown' }), { requireVerifiedSafety: true }],
    ] as [RecommendationItem, DynamicRecommendationOptions][]) {
      expect(validateRecommendation([{ item: entry, quantity: 1 }], [entry], options(opt)).ok).toBe(false)
    }
  })
})

describe('bounded variable-cardinality recommendation optimization', () => {
  const diverse = [
    item('a', 100, { category_name: 'Heo & Bò' }),
    item('b', 100, { category_name: 'Gỏi & Rau' }),
    item('c', 100, { category_name: 'Cơm · Mì · Miến' }),
    item('d', 100, { category_name: 'Lẩu' }),
    item('e', 100, { category_name: 'Món phụ' }),
    item('f', 100, { category_name: 'Heo & Bò' }),
  ]
  it.each([1, 2, 3, 4, 5, 6])('supports an exact requested %i dishes rather than hardcoded two/three', count => {
    const result = recommendDynamicMeals(diverse, options({ requestedDishCount: count }))
    expect(result.plans[0]?.distinctCount).toBe(count)
    expect(result.plans[0]?.totalMax).toBe(count * 100)
  })
  it('lets small budgets naturally select one and a fuller coherent meal select five', () => {
    expect(recommendDynamicMeals(diverse, options({ budget_vnd: 100 })).plans[0].lines).toHaveLength(1)
    expect(recommendDynamicMeals(diverse, options()).plans[0].lines).toHaveLength(5)
  })
  it('prefers fewer matching dishes over more redundant unmatched dishes', () => {
    const catalog = [item('a', 100, { name: 'Bò nướng', category_name: 'Heo & Bò', is_bestseller: true }),
      ...['b', 'c', 'd'].map(id => item(id, 100, { category_name: 'Heo & Bò' }))]
    const plan = recommendDynamicMeals(catalog, options({ preferences: ['bò nướng'], bestseller: 'preferred' })).plans[0]
    expect(plan.lines.map(line => line.item.id)).toEqual(['a'])
  })
  it('does not fabricate role provenance or claim sufficient portions for unknown serving', () => {
    const result = recommendDynamicMeals([item('a', 100, { meal_role: 'main_protein', role_source: 'ai_draft' })], options())
    expect(result.plans[0].components.coherence).toBe(0)
    expect(result.plans[0].portionStatus).toBe('unknown')
    expect(result.plans[0].lines[0].quantity).toBe(1)
  })
  it('does not spend more or add unknown-quality dishes merely to exhaust the budget', () => {
    const catalog = [item('a', 100), item('b', 200), item('c', 300)]
    const result = recommendDynamicMeals(catalog, options())
    expect(result.plans[0].lines.map(line => line.item.id)).toEqual(['a'])
    expect(result.plans[0].components.utilization).toBe(0)
  })
  it('keeps deterministic semantic winners with permuted catalog and same resource budget', () => {
    const forward = recommendDynamicMeals(diverse, options({ maxEvaluations: 20, beamWidth: 2 }))
    const reverse = recommendDynamicMeals([...diverse].reverse(), options({ maxEvaluations: 20, beamWidth: 2 }))
    expect(forward).toEqual(reverse)
    expect(forward.stats.evaluated).toBeLessThanOrEqual(20)
    expect(forward.searchStatus).toBe('bounded_best_found')
  })
  it('does not claim infeasibility when capped before reaching the requested count', () => {
    const result = recommendDynamicMeals(diverse, options({ maxEvaluations: 1, requestedDishCount: 5 }))
    expect(result.plans).toEqual([])
    expect(result.searchStatus).toBe('incomplete')
  })
  it('visits candidate parents after index thirty despite selected-count ceiling', () => {
    const catalog = Array.from({ length: 35 }, (_, index) => item(String(index).padStart(2, '0'), index === 34 ? 1 : 2_000))
    expect(recommendDynamicMeals(catalog, options({ budget_vnd: 10 })).plans[0].lines[0].item.id).toBe('34')
  })
  it('supports thirty requested distinct dishes and rejects larger resource requests honestly', () => {
    const catalog = Array.from({ length: 30 }, (_, index) => item(String(index).padStart(2, '0'), 1))
    const result = recommendDynamicMeals(catalog, options({ requestedDishCount: 30, beamWidth: 1 }))
    expect(result.plans[0]?.distinctCount).toBe(30)
    expect(recommendDynamicMeals(catalog, options({ requestedDishCount: 31 })).searchStatus).toBe('invalid_input')
  })
  it.each([
    { budget_vnd: -1 }, { budget_vnd: Number.NaN }, { existingSubtotal: 0.5 },
    { maxEvaluations: 0 }, { requestedDishCount: 1.5 },
    { feePolicy: { complete: true, known_min_vnd: 20, known_max_vnd: 10 } },
    { quantities: { a: 0 } },
  ])('rejects invalid options: %j', invalid => {
    expect(recommendDynamicMeals([item('a')], invalid).searchStatus).toBe('invalid_input')
  })
  it('every generated valid combination independently remains below the worst-case cap', () => {
    for (let budget = 0; budget <= 800; budget += 25) {
      const catalog = diverse.map((entry, index) => index % 2 ? { ...entry, pricing_mode: 'range' as const, price_min: 50, price_max: 120 } : entry)
      const opts = options({ budget_vnd: budget, existingSubtotal: 10, feePolicy: { complete: true, known_min_vnd: 5, known_max_vnd: 15 } })
      for (const plan of recommendDynamicMeals(catalog, opts).plans) {
        const validated = validateRecommendation(plan.lines, catalog, opts)
        expect(validated.ok).toBe(true)
        expect(plan.totalMax).toBeLessThanOrEqual(budget)
      }
    }
  })
})
