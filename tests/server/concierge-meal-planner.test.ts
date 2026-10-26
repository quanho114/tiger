import { expect, it } from 'vitest'
import { buildMealPlans } from '../../supabase/functions/_shared/concierge/meal-planner.ts'
import { seedKnowledgeSnapshot } from '../../supabase/functions/_shared/concierge/knowledge.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2MenuCandidate, ConciergeV2SessionMutableState } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

it('builds a budgeted sample set from current categories without claiming verified portions', () => {
  const state: ConciergeV2SessionMutableState = emptyConciergeSession()
  state.constraints.adults = 4
  state.constraints.party_size_confirmed = true
  state.constraints.budget_vnd = 800_000
  state.constraints.is_hard_budget = true
  const item = (name: string, category_name: string, price_vnd: number): ConciergeV2MenuCandidate => ({
    id: crypto.randomUUID(), name, category_name, price_vnd, pricing_mode: 'fixed',
    is_available: true, is_signature: false, safety_state: 'allergen_unknown',
    provenance: 'catalog:live_menu', tags: [],
  })
  const candidates = [item('Bò nướng', 'Heo & Bò', 250_000), item('Rau xào', 'Gỏi & Rau', 150_000),
    item('Cơm trắng', 'Cơm · Mì · Miến', 50_000), { ...item('Tôm giá thị trường', 'Hải sản', 0), pricing_mode: 'market' as const }]
  const plans = buildMealPlans(candidates, state.constraints, seedKnowledgeSnapshot())
  expect(plans).toHaveLength(2)
  expect(plans[0].lines.map(line => line.item.name).sort()).toEqual(['Bò nướng', 'Rau xào', 'Cơm trắng'].sort())
  expect(plans.every(plan => plan.subtotal_max_vnd! <= 800_000 && plan.budget_status === 'conditional')).toBe(true)
  expect(plans.every(plan => plan.lines.every(line => line.item.pricing_mode === 'fixed'))).toBe(true)
  expect(plans[0].subtotal_vnd).toBe(450_000)
  expect(plans[0].validation_status).toBe('WARNING')
  expect(plans[0].warnings.join(' ')).toContain('Khẩu phần chưa được nhà hàng xác nhận')
})
