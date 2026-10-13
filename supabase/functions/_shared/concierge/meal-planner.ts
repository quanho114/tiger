import { z } from 'zod'
import { ConciergeV2MenuCandidateSchema, type ConciergeV2MenuCandidate, type ConciergeV2SessionConstraints } from '../contracts/concierge-v2.ts'
import type { KnowledgeSnapshot } from './knowledge.ts'
import { normalizeIntent } from './draft-intent.ts'

export const MealPlanSchema = z.object({
  lines: z.array(z.object({ item: ConciergeV2MenuCandidateSchema, quantity: z.number().int().min(1).max(99) }).strict()).min(2).max(3),
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

export function buildMealPlans(candidates: ConciergeV2MenuCandidate[], constraints: ConciergeV2SessionConstraints,
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
    if (lines.length < 2 || plans.some(plan => plan.lines.map(line => line.item.id).join(',') === lines.map(line => line.item.id).join(','))) continue
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
