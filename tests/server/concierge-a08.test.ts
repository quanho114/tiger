import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { performance } from 'node:perf_hooks'
import { applyDraftBatch, applyDraftTurnToSession } from '../../supabase/functions/_shared/concierge/draft-cart.ts'
import { createConciergeV2SessionStore, InMemoryConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { prepareCartHandoff } from '../../supabase/functions/_shared/concierge/cart-handoff.ts'
import { buildMealPlans, buildBoundedMealPlans, canonicalPlanKey, BOUNDED_PLANNER_LIMITS } from '../../supabase/functions/_shared/concierge/meal-planner.ts'
import { remainingMenuBudget } from '../../supabase/functions/_shared/concierge/budget.ts'
import { retrieveMenuCandidates } from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'
import { seedKnowledgeSnapshot } from '../../supabase/functions/_shared/concierge/knowledge.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { session, fixturePool, usage } from './concierge-a03-a05-fixture.ts'
import { evaluationCatalog } from './fixtures/a06-a08-fixture.ts'
import type { ConciergeV2DraftOperation, ConciergeV2TurnRequest } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const itemId = evaluationCatalog[0].id
const resolver = (id: string) => ({ id, name: 'Món fixture', price_vnd: 50000, is_available: true, safety_state: 'verified_safe' as const })
const add = (id = itemId, quantity = 1): ConciergeV2DraftOperation => ({ type: 'add_item', menu_item_id: id, quantity, note: '', pending_suggestion_id: crypto.randomUUID() })
async function draftWithItem() {
  const result = await applyDraftBatch(null, [add()], resolver)
  if (!result.ok) throw new Error(result.error)
  return result.draft
}
async function runtimeDraft(record: ReturnType<typeof session>, request: Partial<ConciergeV2TurnRequest>) {
  const { pool } = fixturePool(sql => sql.includes('FROM public.menu_items') ? { rows: evaluationCatalog.map(item => ({ ...item, price_vnd: 50000 })) } : undefined)
  return orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), ...request }, record, pool,
    new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Bạn xem thông tin ở thẻ nhé.', tool_calls: [], tokens_used: usage }) }))
}

describe('A08 final-draft subtotal semantics', () => {
  it('blocks a review-only session command above budget before CAS', async () => {
    const store = createConciergeV2SessionStore({ backend: new InMemoryConciergeV2SessionBackend() })
    const state = session()
    state.constraints.budget_vnd = 49999
    state.draft = await draftWithItem()
    const created = await store.create({ actor: state.actor, transcript: [], summary: '',
      constraints: state.constraints, draft: state.draft, pending_suggestion_ids: [] })
    if (!created.ok) throw new Error(created.error.code)
    const output = await applyDraftTurnToSession({ sessionStore: store, sessionRef: created.reference,
      actor: state.actor, expectedStateVersion: created.record.state_version, requestId: crypto.randomUUID(),
      operationHash: 'b'.repeat(64), catalogResolver: resolver, markReadyForReview: true,
      storedResult: { response_id: crypto.randomUUID(), phase: 'REVIEWING', message: 'Synthetic review', cards: [], warnings: [] } })
    expect(output).toMatchObject({ ok: false, error: { code: 'INVALID_HANDOFF' } })
    const saved = await store.read(created.reference, state.actor)
    expect(saved.ok && saved.record.state_version).toBe(created.record.state_version)
  })
  it('accepts the exact cap, rejects one VND more, including conservative soft budgets', async () => {
    const exact = await applyDraftBatch(null, [add()], resolver, undefined, [], 50000)
    expect(exact.ok && exact.draft.subtotal_vnd).toBe(50000)
    expect(await applyDraftBatch(null, [add()], resolver, undefined, [], 49999)).toMatchObject({ ok: false, error: 'BUDGET_EXCEEDED' })
    expect(remainingMenuBudget(50000, 50000)).toBe(0)
    expect(remainingMenuBudget(49999, 50000)).toBe(0)
  })
  it('checks replacement on the final draft without adding the old subtotal twice', async () => {
    const draft = await draftWithItem()
    const replacementId = evaluationCatalog[1].id
    const result = await applyDraftBatch(draft, [add(replacementId), { type: 'remove_item', line_id: draft.items[0].line_id }], resolver, undefined, [], 50000)
    expect(result.ok && result.draft.items.map(line => line.menu_item_id)).toEqual([replacementId])
    expect(result.ok && result.draft.subtotal_vnd).toBe(50000)
    expect(draft.items[0].menu_item_id).toBe(itemId)
  })
  it('sets final quantity, merges identical lines once, and never mutates the original on rejection', async () => {
    const draft = await draftWithItem()
    const quantity = await applyDraftBatch(draft, [{ type: 'set_quantity', line_id: draft.items[0].line_id, quantity: 2 }], resolver, undefined, [], 100000)
    expect(quantity.ok && quantity.draft.subtotal_vnd).toBe(100000)
    const merged = await applyDraftBatch(draft, [add()], resolver, undefined, [], 100000)
    expect(merged.ok && merged.draft.items).toHaveLength(1)
    expect(merged.ok && merged.draft.items[0].quantity).toBe(2)
    expect(await applyDraftBatch(draft, [add()], resolver, undefined, [], 99999)).toMatchObject({ ok: false, error: 'BUDGET_EXCEEDED' })
    expect(draft.subtotal_vnd).toBe(50000)
  })
  it('requires explicit new price acceptance and blocks unknown allergies', async () => {
    const draft = await draftWithItem()
    const price = (id: string) => ({ ...resolver(id), price_vnd: 50001 })
    expect(await applyDraftBatch(draft, [add()], price, undefined, [], 200000)).toMatchObject({ ok: false, error: 'PRICE_CHANGED' })
    expect(await applyDraftBatch(draft, [{ type: 'set_quantity', line_id: draft.items[0].line_id, quantity: 2 }], price, undefined, [], 200000)).toMatchObject({ ok: false, error: 'PRICE_CHANGED' })
    expect(await applyDraftBatch(null, [add()], id => ({ ...resolver(id), safety_state: 'allergen_unknown' }), undefined, ['seafood'], 50000)).toMatchObject({ ok: false, error: 'ALLERGY_UNVERIFIED' })
  })
  it('enforces the conservative cap on the actual quantity action and review/handoff path', async () => {
    for (const hard of [true, false]) {
      const record = session()
      record.draft = await draftWithItem()
      record.constraints.budget_vnd = 99999; record.constraints.is_hard_budget = hard
      const result = await runtimeDraft(record, { draft_operation: { type: 'set_quantity', line_id: record.draft.items[0].line_id, quantity: 2 } })
      expect(result.result.warnings).toContain('BUDGET_EXCEEDED')
      expect(result.next.draft?.items[0].quantity).toBe(1)
      record.constraints.budget_vnd = 49999
      const review = await runtimeDraft(record, { action: { type: 'review_draft' } })
      expect(review.result.warnings).toContain('BUDGET_EXCEEDED')
      expect(review.next.draft?.review_state).toBe('building')
      record.draft.review_state = 'ready_for_review'
      expect(() => prepareCartHandoff(record, { draft_id: record.draft!.draft_id, draft_version: record.draft!.version }, resolver)).toThrow('INVALID_HANDOFF')
    }
  })
  it('does not accept changed prices above the cap or change accepted draft prices silently', async () => {
    const record = session()
    record.draft = await draftWithItem()
    record.constraints.budget_vnd = 49999
    record.draft.items[0].unit_price_vnd = 40000; record.draft.subtotal_vnd = 40000
    record.draft.blocked_items = [{ line_id: record.draft.items[0].line_id, menu_item_id: itemId,
      reason: 'PRICE_CHANGED', current_unit_price_vnd: 50000, message: 'Synthetic price change' }]
    const result = await runtimeDraft(record, { action: { type: 'accept_prices', draft_version: record.draft.version } })
    expect(result.result.warnings).toContain('BUDGET_EXCEEDED')
    expect(result.next.draft?.subtotal_vnd).toBe(40000)
    expect(result.next.draft?.blocked_items).toHaveLength(1)
  })
})

describe('A08 bounded planner comparison, not a production promotion', () => {
  it('canonicalizes IDs and summed quantities independently of order', async () => {
    const { candidates } = await retrieveMenuCandidates(evaluationCatalog.slice(0, 2), {})
    const a = { item: candidates[0], quantity: 1 }, b = { item: candidates[1], quantity: 2 }
    expect(canonicalPlanKey([a, b])).toBe(canonicalPlanKey([b, a]))
    expect(canonicalPlanKey([a, a, b])).toBe(canonicalPlanKey([{ ...a, quantity: 2 }, b]))
  })
  it('bounds the largest quantity search and compares feasibility against greedy', async () => {
    const state = session()
    Object.assign(state.constraints, { adults: 4, party_size_confirmed: true, budget_vnd: 1000000 })
    const knowledge = seedKnowledgeSnapshot(); knowledge.servingProfiles = {}; knowledge.allergenProfiles = {}
    const { candidates } = await retrieveMenuCandidates(evaluationCatalog.slice(0, 8), {})
    const roles = ['main_protein', 'vegetable', 'carb', 'soup_hotpot', 'side', 'main_protein', 'vegetable', 'carb'] as const
    candidates.forEach((item, index) => {
      knowledge.servingProfiles[item.id] = { item_id: item.id, serving_unit: 'đĩa', people_min: 2, people_max: 4,
        confidence: 'restaurant_defined', meal_role: roles[index], meal_context: 'shared', provenance: 'synthetic',
        contributions: { protein: 0, carb: 0, vegetable: 0, soup: 0 } }
    })
    const start = performance.now()
    const greedy = buildMealPlans(candidates, state.constraints, knowledge)
    const greedyMs = performance.now() - start
    const measured = buildBoundedMealPlans(candidates, state.constraints, knowledge)
    const bounded = buildBoundedMealPlans(candidates, state.constraints, knowledge, 0, () => 0)
    expect(bounded.stats.evaluated).toBeLessThanOrEqual(BOUNDED_PLANNER_LIMITS.maxEvaluations)
    expect(bounded.stats.evaluated).toBe(560)
    expect(bounded.plans.length).toBeGreaterThan(0)
    for (const plan of [...greedy, ...bounded.plans]) {
      expect(plan.lines.length).toBeGreaterThanOrEqual(1)
      expect(plan.lines.length).toBeLessThanOrEqual(30)
      expect(plan.subtotal_vnd).toBe(plan.lines.reduce((sum, line) => sum + line.item.price_vnd * line.quantity, 0))
      expect(plan.subtotal_vnd).toBeLessThanOrEqual(1000000)
    }
    expect(new Set(bounded.plans.map(plan => canonicalPlanKey(plan.lines))).size).toBe(bounded.plans.length)
    expect(buildMealPlans(candidates, state.constraints, knowledge)).toEqual(greedy)
    const capped = buildBoundedMealPlans(candidates, state.constraints, knowledge, 0, (() => { let n = 0; return () => n += 20 })())
    expect(capped.stats.capped).toBe(true)
    expect(capped.stats.evaluated).toBeLessThanOrEqual(2)
    if (process.env.A08_EVAL_OUTPUT === '1') fs.writeFileSync('../tiger-a06-a08-baseline/planner-comparison.json', JSON.stringify({
      fixture: 'a06-a08-synthetic-v1:worse-quantity-pool8', greedy: { count: greedy.length, milliseconds: greedyMs, plans: greedy.map(plan => ({ key: canonicalPlanKey(plan.lines), subtotal: plan.subtotal_vnd })) },
      bounded: measured, exhaustiveWithInjectedClock: { evaluated: bounded.stats.evaluated, plans: bounded.plans.length },
      default: 'greedy', limitation: 'No independent restaurant usefulness rating or runtime p95; synthetic feasibility only; 50ms checked cooperatively between evaluations',
    }, null, 2))
  })
  it('keeps missing serving WARNING, refuses insufficient/safety-invalid candidates and accounts for existing draft', async () => {
    const state = session(), knowledge = seedKnowledgeSnapshot()
    knowledge.servingProfiles = {}; knowledge.allergenProfiles = {}
    const { candidates } = await retrieveMenuCandidates(evaluationCatalog, {})
    const single = buildMealPlans(candidates.slice(0, 1), state.constraints, knowledge)
    expect(single).toHaveLength(1)
    expect(single[0].lines).toHaveLength(1)
    expect(single[0].budget_status).toBe('conditional')
    const plans = buildMealPlans(candidates, state.constraints, knowledge)
    expect(plans.length).toBeGreaterThan(0)
    expect(plans.every(plan => plan.validation_status === 'WARNING' && plan.warnings.some(warning => warning.includes('Khẩu phần chưa')))).toBe(true)
    state.constraints.allergies = ['seafood']
    expect(buildMealPlans(candidates, state.constraints, knowledge)).toEqual([])
    state.constraints.allergies = []; state.constraints.budget_vnd = 1
    expect(buildMealPlans(candidates, state.constraints, knowledge, 1)).toEqual([])
    expect(buildMealPlans(candidates, state.constraints, knowledge, 2)).toEqual([])
    expect(buildBoundedMealPlans(candidates, state.constraints, knowledge, 2).plans).toEqual([])
  })
})
