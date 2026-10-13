import { describe, it, expect } from 'vitest'
import { buildConciergeContext, TurnBudget, ContextBudgetError } from '../../supabase/functions/_shared/concierge/context.ts'
import { summarizeSession } from '../../supabase/functions/_shared/concierge/session-summary.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionMutableState } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { V2_READ_TOOLS } from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { createInitialDraft } from '../../supabase/functions/_shared/concierge/draft-cart.ts'

describe('bounded context across long sessions', () => {
  it('retains allergies and canonical draft through 50 turns without duplicating the current instruction', () => {
    const itemId = crypto.randomUUID()
    const draft = { ...createInitialDraft(), items: [{ line_id: crypto.randomUUID(), menu_item_id: itemId, quantity: 2, note: '', unit_price_vnd: 100000 }], subtotal_vnd: 200000 }
    let state: ConciergeV2SessionMutableState = { ...emptyConciergeSession(), draft, constraints: { ...emptyConciergeSession().constraints, allergies: ['đậu phộng'], budget_vnd: 300000 } }
    for (let i = 0; i < 50; i++) {
      const message = `Lượt ${i}: Hãy gợi ý món ăn`
      const context = buildConciergeContext({ state, message, tools: V2_READ_TOOLS })
      expect(context.inputTokens).toBeLessThanOrEqual(6000)
      expect(context.messages.filter(m => m.content === message)).toHaveLength(1)
      expect(context.system).toContain('đậu phộng')
      expect(context.system).toContain('300000')
      expect(context.system).toContain(itemId)
      expect(state.draft).toEqual(draft)
      expect(context.system).not.toContain('csc_')
      state = summarizeSession({ ...state, transcript: [...state.transcript, { role: 'user', content: message }, { role: 'assistant', content: 'Gợi ý từ thực đơn.' }] })
    }
    expect(state.transcript.length).toBeLessThan(20)
    expect(state.summary).not.toContain('Lượt')
  })
  it('never drops essential safety constraints to fit the cap', () => {
    const state = emptyConciergeSession() as ConciergeV2SessionMutableState
    state.constraints.allergies = Array.from({ length: 12 }, () => 'dị ứng '.repeat(100))
    expect(() => buildConciergeContext({ state, message: 'món ăn', tools: V2_READ_TOOLS })).toThrow(ContextBudgetError)
  })
  it('limits total model input, calls and tool rounds', () => {
    const budget = new TurnBudget()
    budget.consume(6000); budget.consume(6000)
    expect(() => budget.consume(1)).toThrow(ContextBudgetError)
    for (let i = 0; i < 6; i++) budget.consumeTool()
    expect(() => budget.consumeTool()).toThrow(ContextBudgetError)
  })
})
