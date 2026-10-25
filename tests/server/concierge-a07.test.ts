import { describe, it, expect, vi } from 'vitest'
import { retrieveMenuCandidates } from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'
import { evaluationCatalog, databaseRow } from './fixtures/a06-a08-fixture.ts'
import { session, runTurn, fixturePool, usage } from './concierge-a03-a05-fixture.ts'
import * as retrieval from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'

describe('A07 retrieval behavior and runtime wiring', () => {
  it.each([['ga hap la chanh', 8], ['GÀ HẤP LÁ CHANH?', 8], ['salad', 10], ['hotpot', 11], ['tofu', 2]])('%s keeps lexical meaning and authoritative identity', async (query, index) => {
    const output = await retrieveMenuCandidates(evaluationCatalog, { query: String(query) }, { servingProfiles: {}, allergenProfiles: {} })
    expect(output.candidates[0]).toMatchObject({ id: evaluationCatalog[Number(index)].id, price_vnd: evaluationCatalog[Number(index)].price_vnd })
    expect(output.candidates.length).toBeLessThanOrEqual(8)
  })
  it('pins exact items through diversification and preferences cannot outrank exact relevance', async () => {
    const output = await retrieveMenuCandidates(evaluationCatalog, { query: 'nam xao', diversify_categories: true },
      { servingProfiles: {}, allergenProfiles: {} }, [{ text: 'gà', source: 'current' }])
    expect(output.candidates[0].id).toBe(evaluationCatalog[6].id)
  })
  it('uses current preferences more strongly than inferred preferences without bypassing dislikes or budget', async () => {
    const menu = evaluationCatalog.slice(0, 3).map(item => ({ ...item, price_vnd: 20000 }))
    const output = await retrieveMenuCandidates(menu, { dislikes: ['cơm'], max_budget_vnd: 20000 },
      { servingProfiles: {}, allergenProfiles: {} }, [{ text: 'cơm', source: 'current' }, { text: 'rau', source: 'inferred' }, { text: 'đậu hũ', source: 'current' }])
    expect(output.candidates.map(item => item.id)).toEqual([menu[2].id, menu[1].id])
    const aliasDislike = await retrieveMenuCandidates(menu, { dislikes: ['tofu'] },
      { servingProfiles: {}, allergenProfiles: {} }, [{ text: 'đậu hũ', source: 'current' }])
    expect(aliasDislike.candidates.map(item => item.id)).not.toContain(menu[2].id)
    expect((await retrieveMenuCandidates(menu, { max_budget_vnd: 19999 }, undefined, [{ text: 'rau', source: 'current' }])).candidates).toEqual([])
    expect((await retrieveMenuCandidates(menu, { allergies: ['peanuts'] }, { servingProfiles: {}, allergenProfiles: {} }, [{ text: 'rau', source: 'current' }])).candidates).toEqual([])
  })
  it('keeps signature a strict filter and excludes unavailable/unpublished/invalid-price items', async () => {
    const output = await retrieveMenuCandidates([...evaluationCatalog,
      { ...evaluationCatalog[0], is_signature: true, is_available: false },
      { ...evaluationCatalog[1], is_signature: true, published: false },
      { ...evaluationCatalog[2], is_signature: true, price_vnd: 1.5 }], { is_signature: true })
    expect(output.candidates.map(item => item.id).sort()).toEqual([evaluationCatalog[8].id, evaluationCatalog[11].id].sort())
  })
  it('passes model-selected query through understanding, gateway, retrieval and cards without forced party questions', async () => {
    const spy = vi.spyOn(retrieval, 'retrieveMenuCandidates')
    try {
      const { pool } = fixturePool(sql => sql.includes('FROM public.menu_items') ? { rows: evaluationCatalog } : undefined)
      const output = await runTurn(session(), 'Cho mình nghía những lựa chọn bên bạn nhé', { pool,
        adapter: async (_message, _history, context) => ({ reply_text: context.bounded!.exchanges.length ? 'Bạn xem các lựa chọn ở thẻ nhé.' : '',
          tool_calls: context.bounded!.exchanges.length ? [] : [{ id: 'synthetic-read', name: 'search_menu_items', arguments: { query: 'salad' } }], tokens_used: usage }) })
      expect(spy.mock.calls[0][1]).toMatchObject({ query: 'salad' })
      expect(output.result.cards[0]).toMatchObject({ type: 'draft_suggestion', item: { id: evaluationCatalog[10].id } })
      expect(output.next.conversation_context?.pending_question).toBeUndefined()
      expect(output.next.draft).toBeNull()
      expect(output.metrics.model_calls).toBeLessThanOrEqual(3)
    } finally { spy.mockRestore() }
  })
  it('carries meal preferences with provenance and remaining budget into retrieval', async () => {
    const spy = vi.spyOn(retrieval, 'retrieveMenuCandidates')
    try {
      const record = session()
      Object.assign(record.constraints, { adults: 4, party_size_confirmed: true, budget_vnd: 100000, preferences: ['rau'] })
      const { pool } = fixturePool(sql => sql.includes('FROM public.menu_items') ? { rows: [databaseRow(), ...evaluationCatalog] } : undefined)
      await runTurn(record, 'Gợi ý mâm giúp mình', { pool })
      expect(spy.mock.calls[0][1]).toMatchObject({ max_budget_vnd: 100000, diversify_categories: true })
      expect(spy.mock.calls[0][3]).toContainEqual({ text: 'rau', source: 'current' })
    } finally { spy.mockRestore() }
  })
  it('does not discard a recognized named synonym before retrieval', async () => {
    const { pool } = fixturePool(sql => sql.includes('FROM public.menu_items') ? { rows: evaluationCatalog } : undefined)
    const output = await runTurn(session(), 'chi tiết món tofu', { pool })
    expect(output.result.cards.some(card => (card.type === 'draft_suggestion' || card.type === 'menu_item_detail') && card.item.id === evaluationCatalog[2].id)).toBe(true)
  })
  it('persists consultation dish preferences across clarification turns and handles dish replacements', async () => {
    const frogAndEelCatalog = [
      ...evaluationCatalog,
      { id: '60000000-0000-4000-8000-000000000091', name: 'Ếch xào mướp hương', category_name: 'Các món ếch', category_id: '61000000-0000-4000-8000-000000000091', price_vnd: 165000, tags: ['ếch'], is_signature: false, is_available: true, published: true, pricing_mode: 'fixed' as const },
      { id: '60000000-0000-4000-8000-000000000092', name: 'Lươn um chuối chát', category_name: 'Các món lươn', category_id: '61000000-0000-4000-8000-000000000092', price_vnd: 185000, tags: ['lươn'], is_signature: false, is_available: true, published: true, pricing_mode: 'fixed' as const },
    ]
    const { pool } = fixturePool(sql => sql.includes('FROM public.menu_items') ? { rows: frogAndEelCatalog } : undefined)
    const turn1 = await runTurn(session(), 'tư vấn cho tôi mấy món ếch và lươn', { pool })
    expect(turn1.next.constraints.preferences).toEqual(['Ếch', 'Lươn'])
    expect(turn1.next.conversation_context?.pending_question?.missing_field).toBe('guests')

    const turn2 = await runTurn(turn1.record, '4 người 4 món', { pool })
    expect(turn2.next.constraints.preferences).toEqual(['Ếch', 'Lươn'])
    const planCard = turn2.result.cards.find(card => card.type === 'meal_plan')
    expect(planCard?.type).toBe('meal_plan')
    if (planCard?.type === 'meal_plan') {
      expect(planCard.lines).toHaveLength(4)
      const names = planCard.lines.map(line => line.item.name)
      expect(names).toContain('Ếch xào mướp hương')
      expect(names).toContain('Lươn um chuối chát')
    }

    const turn3 = await runTurn(turn2.record, 'đổi món ếch sang món gà', { pool })
    expect(turn3.next.constraints.dislikes).toContain('Ếch')
    expect(turn3.next.constraints.preferences).not.toContain('Ếch')
    expect(turn3.next.constraints.preferences).toContain('Gà')
  })
})
