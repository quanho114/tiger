import type { ConciergeV2SessionMutableState, ConciergeV2StoredTurnResult } from '../contracts/concierge-v2.ts'

// Follow-ups are grounded in the current result; selecting one submits ordinary user text to the agent.
export function suggestConciergeActions(result: ConciergeV2StoredTurnResult, state: ConciergeV2SessionMutableState): string[] {
  const plan = result.cards.find(card => card.type === 'meal_plan')
  if (plan?.type === 'meal_plan') {
    const actions: string[] = []
    const currentCeiling = Math.min(state.constraints.budget_vnd ?? plan.subtotal_vnd, plan.subtotal_vnd)
    if (currentCeiling > 100_000) {
      const lowerBudget = Math.floor(currentCeiling * 0.85 / 10_000) * 10
      actions.push(`Gợi ý mâm dưới ${lowerBudget}k`)
    }
    if (state.constraints.max_spice_level !== 0) actions.push('Gợi ý mâm không cay')
    return actions.slice(0, 3)
  }
  const detail = result.cards.find(card => card.type === 'menu_item_detail')
  if (detail?.type === 'menu_item_detail') {
    if (detail.item.spice_level && state.constraints.max_spice_level !== 0) return ['Gợi ý món không cay']
    return []
  }
  const suggestion = result.cards.find(card => card.type === 'draft_suggestion')
  if (suggestion?.type === 'draft_suggestion') {
    const actions: string[] = []
    if (state.constraints.max_spice_level !== 0) actions.push('Gợi ý món không cay')
    if (suggestion.item.price_vnd > 100_000) actions.push(`Gợi ý món dưới ${Math.floor(suggestion.item.price_vnd * 0.8 / 10_000) * 10}k`)
    return actions
  }
  return []
}
