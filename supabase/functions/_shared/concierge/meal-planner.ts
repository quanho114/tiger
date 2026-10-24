import { z } from 'zod'
import { ConciergeV2MenuCandidateSchema, type ConciergeV2MenuCandidate, type ConciergeV2SessionConstraints } from '../contracts/concierge-v2.ts'
import type { KnowledgeSnapshot } from './knowledge.ts'
import { normalizeIntent } from './draft-intent.ts'
import { withinMenuBudget } from './budget.ts'
import { recommendDynamicMeals, validateRecommendation } from './recommendation/index.ts'

export const MealPlanSchema = z.object({
  lines: z.array(z.object({ item: ConciergeV2MenuCandidateSchema, quantity: z.number().int().min(1).max(99) }).strict()).min(1).max(30),
  subtotal_min_vnd: z.number().int().nonnegative().optional(),
  subtotal_max_vnd: z.number().int().nonnegative().optional(),
  total_min_vnd: z.number().int().nonnegative().optional(),
  total_max_vnd: z.number().int().nonnegative().optional(),
  budget_status: z.enum(['within', 'conditional']).optional(),
  orderable_exact: z.boolean().optional(),
  subtotal_vnd: z.number().int().nonnegative(),
  validation_status: z.enum(['PASS', 'WARNING']),
  warnings: z.array(z.string().max(200)).max(3),
}).strict()
export const MealPlansSchema = z.array(MealPlanSchema).max(2)
export type MealPlan = z.infer<typeof MealPlanSchema>

function categoryRole(category?: string): string | null {
  const name = normalizeIntent(category ?? '')
  if (/\b(?:goi|rau)\b/.test(name)) return 'vegetable'
  if (/\b(?:com|mi|mien)\b/.test(name)) return 'carb'
  if (/\blau\b/.test(name)) return 'soup_hotpot'
  if (/\b(?:ga|heo|bo|hai san|ca|ech|luon)\b/.test(name)) return 'main_protein'
  if (/\bmon phu\b/.test(name)) return 'side'
  return null
}

export function buildLegacyGreedyMealPlans(candidates: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints,
  knowledge: KnowledgeSnapshot, existingSubtotal = 0): MealPlan[] {
  const { config, servingProfiles } = knowledge
  const diners = (constraints.adults * config.adult_factor + constraints.children * config.child_factor)
    * config.appetite_factors[constraints.appetite]
  const eligible = candidates.filter(item => {
    const serving = servingProfiles[item.id]
    return serving?.confidence === 'restaurant_defined' && serving.people_max > 0 &&
      !['drink', 'alcohol', 'dessert'].includes(serving.meal_role) &&
      (!constraints.allergies.length || item.safety_state === 'verified_safe')
  })
  const variants = [eligible, [...eligible].reverse()]
  const plans: MealPlan[] = []
  for (const variant of variants) {
    const primary = variant.find(item => ['main_protein', 'soup_hotpot', 'set'].includes(servingProfiles[item.id].meal_role))
    if (!primary) continue
    const lines: MealPlan['lines'] = []
    const roles = new Set<string>()
    let subtotal = 0
    for (const item of [primary, ...variant.filter(item => item.id !== primary.id)]) {
      const serving = servingProfiles[item.id]
      if (!serving || roles.has(serving.meal_role)) continue
      const quantity = Math.min(99, Math.max(1, Math.ceil(diners / serving.people_max)))
      const price = item.price_vnd * quantity
      if (constraints.budget_vnd != null &&
          existingSubtotal + subtotal + price > constraints.budget_vnd) continue
      lines.push({ item, quantity })
      roles.add(serving.meal_role)
      subtotal += price
      if (lines.length === 3) break
    }
    if (lines.length < 2 || plans.some(plan => canonicalPlanKey(plan.lines) === canonicalPlanKey(lines))) continue
    const warnings: string[] = []
    if (!constraints.party_size_confirmed) warnings.push('Khẩu phần đang tính theo số khách mặc định; hãy xác nhận số người.')
    if (!roles.has('vegetable') && !roles.has('soup_hotpot') && !roles.has('set')) warnings.push('Mâm có thể cần thêm rau hoặc món phù hợp.')
    if (!constraints.is_hard_budget && constraints.budget_vnd != null && existingSubtotal + subtotal > constraints.budget_vnd)
      warnings.push('Tổng món vượt ngân sách tham khảo; chưa bao gồm phí giao hàng.')
    plans.push(MealPlanSchema.parse({ lines, subtotal_vnd: subtotal,
      validation_status: warnings.length ? 'WARNING' : 'PASS', warnings }))
  }
  if (plans.length) return plans

  // New menu items may not yet have restaurant-verified serving profiles.
  // Offer a priced set, but never claim that one portion feeds the whole party.
  const unprofiled = candidates.filter(item => (item.pricing_mode ?? 'fixed') === 'fixed' &&
    (!constraints.allergies.length || item.safety_state === 'verified_safe') &&
    categoryRole(item.category_name))
  const primary = unprofiled.find(item => categoryRole(item.category_name) === 'main_protein' ||
    categoryRole(item.category_name) === 'soup_hotpot')
  if (!primary) return plans
  const lines: MealPlan['lines'] = []
  const roles = new Set<string>()
  let subtotal = 0
  for (const item of [primary, ...unprofiled.filter(entry => entry.id !== primary.id)]) {
    const role = categoryRole(item.category_name)
    if (!role || roles.has(role)) continue
    if (constraints.budget_vnd != null && existingSubtotal + subtotal + item.price_vnd > constraints.budget_vnd) continue
    roles.add(role)
    lines.push({ item, quantity: 1 })
    subtotal += item.price_vnd
    if (lines.length === 3) break
  }
  if (lines.length < 2) return plans
  const warnings = ['Khẩu phần chưa được nhà hàng xác nhận cho số khách này; hãy kiểm tra trước khi chọn.']
  return [MealPlanSchema.parse({ lines, subtotal_vnd: subtotal, validation_status: 'WARNING', warnings })]
}

/** Quantities are summed per authoritative ID; line order carries no identity. */
export function canonicalPlanKey(lines: MealPlan['lines']): string {
  const quantities = new Map<string, number>()
  for (const line of lines) quantities.set(line.item.id, (quantities.get(line.item.id) ?? 0) + line.quantity)
  return [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([id, quantity]) => `${id}:${quantity}`).join('|')
}

function eligiblePool(candidates: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints) {
  const seen = new Set<string>()
  return candidates.slice(0, 8).filter(item => {
    if (seen.has(item.id) || !item.is_available || (item.pricing_mode ?? 'fixed') !== 'fixed' ||
        !Number.isSafeInteger(item.price_vnd) || item.price_vnd < 0 ||
        constraints.allergies.length && item.safety_state !== 'verified_safe') return false
    seen.add(item.id)
    return true
  })
}

/** Production advice uses independent worst-case validation. Unknown mandatory fees
 * remain conditional; range estimates never become exact draft/order prices. */
export function buildMealPlans(candidates: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints,
  knowledge: KnowledgeSnapshot, existingSubtotal = 0, existingItemIds: string[] = []): MealPlan[] {
  const pool = candidates.filter(item => !constraints.allergies.length || item.safety_state === 'verified_safe')
    .map(item => ({ ...item, role_source: knowledge.servingProfiles[item.id]?.confidence === 'restaurant_defined'
      ? 'restaurant_defined' : undefined }))
  const quantities: Record<string, number> = {}
  if (constraints.party_size_confirmed) {
    const diners = (constraints.adults * knowledge.config.adult_factor + constraints.children * knowledge.config.child_factor)
      * knowledge.config.appetite_factors[constraints.appetite]
    for (const item of pool) {
      const serving = knowledge.servingProfiles[item.id]
      if (serving?.confidence === 'restaurant_defined' && serving.people_max > 0) {
        quantities[item.id] = Math.max(1, Math.ceil(diners / serving.people_max))
      }
    }
  }
  const result = recommendDynamicMeals(pool, {
    quantities,
    budget_vnd: constraints.budget_vnd, existingSubtotal, existingItemIds: [...new Set(existingItemIds)],
    requestedDishCount: constraints.requested_dish_count,
    requestedCountScope: constraints.requested_dish_count_scope ?? 'final_meal',
    preferences: constraints.preferences, dislikes: constraints.dislikes,
    bestseller: constraints.merchandising?.includes('bestseller') ? 'required' : 'none',
    orderMode: constraints.order_mode, requireVerifiedSafety: constraints.allergies.length > 0,
    partyConfirmed: constraints.party_size_confirmed,
    mealContext: /(?:an nhe|snack)/.test(normalizeIntent(constraints.meal_purpose ?? '')) ? 'snack' : 'meal',
  })
  return result.plans.flatMap(plan => {
    const validated = validateMealPlanForDisplay(plan.lines, candidates, constraints, existingSubtotal, existingItemIds)
    return validated ? [validated] : []
  })
}

/** Validate a proposed composition without reoptimizing or trusting tool prices. */
export function validateMealPlanForDisplay(proposed: { item: { id: string }; quantity: number }[],
  catalog: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints,
  existingSubtotal = 0, existingItemIds: string[] = []): MealPlan | null {
  const checked = validateRecommendation(proposed, catalog, {
    budget_vnd: constraints.budget_vnd, existingSubtotal, existingItemIds: [...new Set(existingItemIds)],
    requestedDishCount: constraints.requested_dish_count,
    requestedCountScope: constraints.requested_dish_count_scope ?? 'final_meal',
    dislikes: constraints.dislikes, orderMode: constraints.order_mode,
    bestseller: constraints.merchandising?.includes('bestseller') ? 'required' : 'none',
    requireVerifiedSafety: constraints.allergies.length > 0,
  })
  if (!checked.ok) return null
  const plan = checked.plan
  return MealPlanSchema.parse({
    lines: plan.lines.map(line => ({ item: line.item, quantity: line.quantity })),
    subtotal_vnd: plan.subtotalMax, subtotal_min_vnd: plan.subtotalMin, subtotal_max_vnd: plan.subtotalMax,
    total_min_vnd: plan.totalMin, total_max_vnd: plan.totalMax,
    budget_status: plan.budgetStatus, orderable_exact: plan.orderableExact,
    validation_status: 'WARNING', warnings: [
      'Khẩu phần chưa được nhà hàng xác nhận cho số khách này; hãy kiểm tra trước khi chọn.',
      'Chưa xác định đầy đủ phí bắt buộc; chưa bảo đảm tổng hóa đơn cuối cùng.',
      ...(!plan.orderableExact ? ['Giá khoảng chỉ dùng để dự toán, cần xác nhận trước khi đặt.'] : []),
    ].slice(0, 3),
  })
}

export const BOUNDED_PLANNER_LIMITS = { pool: 8, maxEvaluations: 560, maxMilliseconds: 50 } as const

/** Offline candidate for comparison. Not selected by model or an environment flag. */
export function buildBoundedMealPlans(candidates: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints,
  knowledge: KnowledgeSnapshot, existingSubtotal = 0, clock: () => number = () => performance.now()) {
  const start = clock()
  const stats = { evaluated: 0, capped: false, elapsedMs: 0, maxEvaluations: BOUNDED_PLANNER_LIMITS.maxEvaluations }
  const scored: { plan: MealPlan; score: number; reasons: Record<string, number> }[] = []
  const diners = (constraints.adults * knowledge.config.adult_factor + constraints.children * knowledge.config.child_factor)
    * knowledge.config.appetite_factors[constraints.appetite]
  const pool = eligiblePool(candidates, constraints).filter(item => {
    const profile = knowledge.servingProfiles[item.id]
    return profile?.confidence === 'restaurant_defined' && profile.people_min > 0 && profile.people_max >= profile.people_min &&
      !['drink', 'alcohol', 'dessert'].includes(profile.meal_role)
  }).sort((a, b) => a.id.localeCompare(b.id))
  const usableBudget = withinMenuBudget(existingSubtotal, constraints.budget_vnd)
  const evaluate = (lines: MealPlan['lines']) => {
    if (stats.capped) return
    if (stats.evaluated >= BOUNDED_PLANNER_LIMITS.maxEvaluations || clock() - start >= BOUNDED_PLANNER_LIMITS.maxMilliseconds) {
      stats.capped = true; return
    }
    stats.evaluated++
    const subtotal = lines.reduce((sum, line) => sum + line.item.price_vnd * line.quantity, 0)
    if (!withinMenuBudget(existingSubtotal + subtotal, constraints.budget_vnd)) return
    const roles = new Set(lines.map(line => knowledge.servingProfiles[line.item.id].meal_role))
    if (![...roles].some(role => ['main_protein', 'soup_hotpot', 'set'].includes(role))) return
    const serving = lines.reduce((sum, line) => sum + Math.min(1, knowledge.servingProfiles[line.item.id].people_max * line.quantity / Math.max(1, diners)), 0) / lines.length
    const ids = new Set(lines.map(line => line.item.id))
    const data = (knowledge.menuItems ?? []).filter(item => ids.has(item.id))
    const taste = data.filter(item => !['ai_draft', 'system_default'].includes(item.sources.taste) &&
      constraints.preferences.some(preference => normalizeIntent(preference) && normalizeIntent(item.taste.tags.join(' ')).includes(normalizeIntent(preference)))).length
    const pairing = data.filter(item => !['ai_draft', 'system_default'].includes(item.sources.taste))
      .reduce((sum, item) => sum + item.pairingItemIds.filter(id => ids.has(id)).length, 0)
    const remaining = constraints.budget_vnd == null ? null : constraints.budget_vnd - existingSubtotal
    const reasons = { roleCoverage: roles.size * 20, primary: 20,
      vegetable: roles.has('vegetable') ? 12 : 0, carb: roles.has('carb') ? 10 : 0,
      serving: serving * 20, budget: remaining && remaining > 0 ? subtotal / remaining * 5 : 0,
      taste: Math.min(6, taste * 3), pairing: Math.min(6, pairing * 3) }
    const warnings = constraints.party_size_confirmed ? [] : ['Khẩu phần đang tính theo số khách mặc định; hãy xác nhận số người.']
    scored.push({ plan: MealPlanSchema.parse({ lines, subtotal_vnd: subtotal,
      validation_status: warnings.length ? 'WARNING' : 'PASS', warnings }),
      score: Object.values(reasons).reduce((sum, value) => sum + value, 0), reasons })
  }
  const quantities = (items: ConciergeV2MenuCandidate[], index = 0, lines: MealPlan['lines'] = []) => {
    if (stats.capped) return
    if (index === items.length) { evaluate(lines); return }
    const item = items[index], serving = knowledge.servingProfiles[item.id]
    const options = [...new Set([Math.ceil(diners / serving.people_max), Math.ceil(diners / serving.people_min)])]
      .map(quantity => Math.max(1, quantity)).filter(quantity => quantity <= 99)
    for (const quantity of options) quantities(items, index + 1, [...lines, { item, quantity }])
  }
  if (usableBudget) for (let a = 0; a < pool.length && !stats.capped; a++) for (let b = a + 1; b < pool.length && !stats.capped; b++) {
    quantities([pool[a], pool[b]])
    for (let c = b + 1; c < pool.length && !stats.capped; c++) quantities([pool[a], pool[b], pool[c]])
  }
  scored.sort((a, b) => b.score - a.score || canonicalPlanKey(a.plan.lines).localeCompare(canonicalPlanKey(b.plan.lines)))
  const chosen: typeof scored = [], keys = new Set<string>()
  for (const entry of scored) {
    const key = canonicalPlanKey(entry.plan.lines)
    if (keys.has(key) || chosen.some(other => other.plan.lines.length === entry.plan.lines.length &&
      other.plan.lines.every(line => entry.plan.lines.some(next => next.item.id === line.item.id)))) continue
    keys.add(key); chosen.push(entry)
    if (chosen.length === 2) break
  }
  stats.elapsedMs = Math.max(0, clock() - start)
  return { plans: chosen.map(entry => entry.plan), scores: chosen.map(({ score, reasons }) => ({ score, reasons })), stats }
}
