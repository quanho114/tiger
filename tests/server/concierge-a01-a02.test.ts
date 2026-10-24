import { afterEach, describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import { understandTurn } from '../../supabase/functions/_shared/concierge/understanding/engine.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import { ConciergeLlmOrchestrator, type CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { TurnBudget, type ToolExchange, type BoundedContext } from '../../supabase/functions/_shared/concierge/context.ts'
import { ToolGateway } from '../../supabase/functions/_shared/concierge/tools/gateway.ts'
import { createAgentPrincipal } from '../../supabase/functions/_shared/concierge/policy/capabilities.ts'
import { createTurnGateway, selectToolCalls, runModelTools, computeEvidenceStatus, evidenceStatusFor } from '../../supabase/functions/_shared/concierge/orchestration/tool-runner.ts'
import type { TurnScope } from '../../supabase/functions/_shared/concierge/orchestration/turn-context.ts'
import { V2_READ_TOOLS, V2_TOOL_REGISTRY } from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { safeGroundedReply } from '../../supabase/functions/_shared/concierge/response-guard.ts'
import * as retrieval from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'

const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
const record = () => ({ ...emptyConciergeSession(), session_id: crypto.randomUUID(),
  capability_hash: 'a'.repeat(64), actor: { authenticated_user_id: null }, state_version: 1,
  created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(),
  absolute_expires_at: new Date().toISOString(), idempotency: [] }) as ConciergeV2SessionRecord
const fixture = () => [true, false].map((signature, index) => ({
  id: crypto.randomUUID(), name: index ? 'Rau xào' : 'Gà hấp', price_vnd: 100000,
  category_name: index ? 'Rau' : 'Gà',
  is_available: true, is_signature: signature, pricing_mode: 'fixed', tags: [],
}))
function poolFor(menu = fixture(), failMenu = false, phone: string | null = '0281234567') {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM public.menu_items')) {
      if (failMenu) throw new Error('synthetic catalog failure')
      return { rows: menu }
    }
    if (sql.includes('FROM public.restaurant_settings')) return { rows: [{ phone }] }
    return { rows: [] }
  })
  return { pool: { query } as unknown as pg.Pool, query }
}
async function turn(message: string, options: { menu?: ReturnType<typeof fixture>; failMenu?: boolean; phone?: string | null; saved?: boolean; plan?: CustomLlmAdapter } = {}) {
  const { pool, query } = poolFor(options.menu, options.failMenu, options.phone)
  const contexts: BoundedContext[] = []
  const adapter: CustomLlmAdapter = async (message, history, context) => {
    const bounded = context.bounded!
    contexts.push(bounded)
    if (!bounded.exchanges.length) return options.plan ? options.plan(message, history, context)
      : { reply_text: '', tool_calls: [], tokens_used: usage }
    const status = computeEvidenceStatus(bounded.exchanges)
    const reply_text = status === 'known' ? 'Mình đã kiểm tra, bạn xem các thẻ chi tiết nhé.'
      : status === 'empty' ? 'Không có món phù hợp với tiêu chí đã tra.'
        : status === 'unavailable' ? 'Mình chưa kiểm tra được phần thực đơn lúc này; phần thông tin đã xác minh vẫn được giữ.'
          : 'Mình chưa có thông tin xác minh cho phần yêu cầu còn thiếu.'
    return { reply_text, tool_calls: [], tokens_used: usage }
  }
  const state = record()
  if (options.saved) Object.assign(state.constraints, { adults: 4, party_size_confirmed: true, budget_vnd: 500000 })
  const output = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message },
    state, pool, new ConciergeLlmOrchestrator({ customAdapter: adapter }))
  return { ...output, contexts, query }
}
afterEach(() => vi.restoreAllMocks())

describe('A01–A02 execution regression (offline)', () => {
  it.each(['Quán có đặc sản gì?', 'Quan co dac san gi', 'đặc sản của quán', 'món đặc sản của quán?', 'dac san cua quan'])('%s reaches signature retrieval and grounded cards through fallback', async message => {
    const retrieve = vi.spyOn(retrieval, 'retrieveMenuCandidates')
    const output = await turn(message)
    expect(understandTurn(message).requiresClarification).toBe(false)
    expect(output.contexts[0].tools.map(tool => tool.name)).toContain('search_menu_items')
    expect(output.contexts[1].exchanges.map(e => e.name)).toEqual(['search_menu_items'])
    expect(retrieve.mock.calls[0][1]).toMatchObject({ is_signature: true })
    expect(output.result.cards).toHaveLength(1)
    expect(output.result.cards[0]).toMatchObject({ type: 'draft_suggestion', item: { is_signature: true } })
    expect(output.next.draft).toBeNull()
    expect(output.metrics.tool_count).toBe(1)
  })

  it.each(['cho xem menu', 'cho xem thực đơn', 'bữa nay cho xem menu'])('keeps %s as browsing despite saved party/budget and a model meal call', async message => {
    const output = await turn(message, { saved: true, plan: async () => ({ reply_text: '',
      tool_calls: [{ id: 'wrong_goal', name: 'recommend_meal', arguments: {} }], tokens_used: usage }) })
    expect(output.contexts[1].exchanges[0].name).toBe('search_menu_items')
    expect(output.result.cards.every(card => card.type === 'draft_suggestion')).toBe(true)
    expect(output.next.draft).toBeNull()
  })

  it.each(['Gà hấp giá bao nhiêu?', 'chi tiết món Gà hấp', 'giá món Gà hấp'])('reads authoritative dish details for %s', async message => {
    const menu = fixture()
    const output = await turn(message, { menu })
    expect(output.contexts[1].exchanges[0]).toMatchObject({ name: 'get_menu_item', arguments: { item_id: menu[0].id } })
    expect(output.result.cards[0]).toMatchObject({ type: 'menu_item_detail', item: { id: menu[0].id, price_vnd: 100000 } })
  })

  it.each(['fallback', 'model search'] as const)('reads actual seeded menu IDs through %s without requiring RFC UUID version bits', async path => {
    const seededId = '10000000-0000-0001-0000-000000000001' as const
    const menu = fixture().map((item, index) => index ? item : {
      ...item, id: seededId, name: 'Gà nướng muối ớt', pricing_mode: 'range',
      price_vnd: 280000, price_min: 280000, price_max: 300000,
    })
    const output = await turn('Gà nướng muối ớt giá bao nhiêu?', {
      menu,
      ...(path === 'model search' ? { plan: async () => ({ reply_text: '',
        tool_calls: [{ id: 'menu_search', name: 'search_menu_items', arguments: {} }], tokens_used: usage }) } : {}),
    })
    expect(output.contexts[1].exchanges).toHaveLength(1)
    expect(output.contexts[1].exchanges[0]).toMatchObject({ name: 'get_menu_item', arguments: { item_id: seededId },
      result: { item: { name: 'Gà nướng muối ớt' }, evidence_status: 'known' } })
    expect(output.result.cards[0]).toMatchObject({ type: 'menu_item_detail', item: {
      id: seededId, price_vnd: 280000, pricing_mode: 'range', price_min: 280000, price_max: 300000,
    } })
    expect(output.metrics.tool_count).toBe(1)
    expect(output.next.draft).toBeNull()
  })

  it('keeps missing dish information unknown while preserving verified item cards', async () => {
    const output = await turn('Gà hấp gồm nguyên liệu gì?')
    expect(output.contexts[1].exchanges[0]).toMatchObject({ name: 'get_menu_item', result: {
      status: 'unknown', missing_fields: ['description'], item: { name: 'Gà hấp' },
    } })
    expect(output.result.message).toContain('chưa có thông tin')
    expect(output.result.cards[0]).toMatchObject({ type: 'menu_item_detail', description: null })
  })

  it.each(['món bán chạy', 'món mới'])('does not relabel %s as signature when authoritative metadata is absent', async message => {
    const retrieve = vi.spyOn(retrieval, 'retrieveMenuCandidates')
    const output = await turn(message)
    expect(retrieve.mock.calls[0][1].is_signature).not.toBe(true)
    expect(output.contexts[1].exchanges[0].result).toMatchObject({ status: 'unknown', unresolved_needs: expect.any(Array) })
    expect(output.result.cards).toEqual([])
    expect(output.result.suggested_actions).toEqual([])
  })

  it('executes both menu and restaurant reads even when the model only chooses menu', async () => {
    const output = await turn('Số điện thoại quán và cho xem menu', { plan: async () => ({ reply_text: '',
      tool_calls: [{ id: 'menu', name: 'search_menu_items', arguments: {} }], tokens_used: usage }) })
    expect(output.contexts[0].tools.map(t => t.name)).toContain('lookup_restaurant_info')
    expect(output.contexts[1].exchanges.map(e => e.name)).toEqual(['search_menu_items', 'lookup_restaurant_info'])
    expect(JSON.stringify(output.contexts[1].exchanges)).toContain('0281234567')
    expect(output.result.cards.length).toBeGreaterThan(0)
    expect(output.next.pending_items?.length).toBe(output.result.cards.length)
    expect(output.query.mock.calls.some(([sql]) => sql.includes('restaurant_settings'))).toBe(true)
  })

  it('keeps dish detail when the same message also asks for a restaurant fact', async () => {
    const output = await turn('Số điện thoại quán và Gà hấp giá bao nhiêu?')
    expect(output.contexts[1].exchanges.map(e => e.name)).toEqual(['get_menu_item', 'lookup_restaurant_info'])
    expect(output.result.cards[0]).toMatchObject({ type: 'menu_item_detail', item: { name: 'Gà hấp' } })
  })

  it('explicitly defers additional dish details rather than silently dropping them', async () => {
    const output = await turn('giá món Gà hấp và giá món Rau xào')
    expect(output.contexts[1].exchanges[0].name).toBe('get_menu_item')
    expect(output.contexts[0].system).toContain('deferred_reads')
    expect(output.contexts[0].system).toContain('rau xao')
    expect(output.result.warnings).toContain('UNPROCESSED_READ_NEEDS')
    expect(output.result.message).toContain('các món tiếp theo chưa được xử lý')
    expect(output.next.draft).toBeNull()
  })

  it('handles explicit browse plus meal advice without losing card acceptance references', async () => {
    const output = await turn('Cho xem menu và gợi ý mâm cho 4 người khoảng 500k')
    expect(output.contexts[1].exchanges.map(e => e.name)).toEqual(['search_menu_items', 'recommend_meal'])
    expect(output.result.cards.some(card => card.type === 'meal_plan')).toBe(true)
    expect(output.result.cards.some(card => card.type === 'draft_suggestion')).toBe(true)
    const ids = output.result.cards.flatMap(card => card.type === 'draft_suggestion' ? [card.suggestion_id]
      : card.type === 'meal_plan' ? card.lines.map(line => line.suggestion_id) : [])
    expect(output.next.pending_suggestion_ids).toEqual(ids)
    expect(ids.length).toBeLessThanOrEqual(8)
    expect(output.next.draft).toBeNull()
  })

  it('keeps a known fact and failed menu read separate in the actual model evidence', async () => {
    const output = await turn('Số điện thoại quán và cho xem menu', { failMenu: true })
    expect(output.contexts[1].exchanges.map(e => e.result)).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'known', answer: expect.stringContaining('0281234567') }),
      expect.objectContaining({ status: 'unavailable' }),
    ]))
    expect(output.result.cards).toEqual([])
    expect(output.result.suggested_actions).toEqual([])
    expect(output.result.warnings).toContain('EVIDENCE_UNAVAILABLE')
  })

  it('distinguishes successful no-match, missing metadata, and retrieval failure in final outcomes', async () => {
    const empty = await turn('đặc sản của quán', { menu: fixture().map(item => ({ ...item, is_signature: false })) })
    const unknown = await turn('món mới')
    const unavailable = await turn('cho xem menu', { failMenu: true })
    expect(empty.contexts[1].exchanges[0].result).toMatchObject({ status: 'empty' })
    expect(empty.result.message).toContain('Không có món phù hợp')
    expect(unknown.contexts[1].exchanges[0].result).toMatchObject({ status: 'unknown' })
    expect(unavailable.result.message).toContain('chưa lấy được')
    expect(unavailable.metrics.model_calls).toBe(0)
    for (const output of [empty, unknown, unavailable]) expect(output.result.cards).toEqual([])
  })

  it('smalltalk uses no read tools or database queries', async () => {
    const output = await turn('xin chào', { plan: async () => ({ reply_text: 'Chào bạn, mình có thể giúp gì?', tool_calls: [], tokens_used: usage }) })
    expect(output.contexts[0].tools).toEqual([])
    expect(output.query).not.toHaveBeenCalled()
    expect(output.metrics.tool_count).toBe(0)
  })

  it('filters invalid, mutation and inactive fallbacks before execution', () => {
    const active = V2_READ_TOOLS.filter(t => t.name === 'search_menu_items')
    expect(selectToolCalls(active, [{ name: 'get_menu_item', arguments: { item_id: 'invalid' } }], [
      { name: 'get_recent_orders', arguments: {} }, { name: 'execute_sql', arguments: {} },
      { name: 'add_draft_item', arguments: {} }, { name: 'search_menu_items', arguments: { limit: 99 } },
    ])).toEqual([])
    expect(selectToolCalls(active, [{ name: 'unknown', arguments: {} }], [{ name: 'search_menu_items', arguments: {} }])).toHaveLength(1)
  })

  it('accepts seeded catalog item/category IDs and still rejects malformed identifiers', () => {
    const itemId = '10000000-0000-0001-0000-000000000001'
    const categoryId = '00000000-0000-0001-0001-000000000001'
    const active = V2_READ_TOOLS.filter(tool => ['search_menu_items', 'get_menu_item'].includes(tool.name))
    expect(V2_TOOL_REGISTRY.get_menu_item.input.parse({ item_id: itemId })).toEqual({ item_id: itemId })
    expect(V2_TOOL_REGISTRY.search_menu_items.input.parse({ category_id: categoryId })).toEqual({ category_id: categoryId })
    expect(selectToolCalls(active, [], [{ name: 'get_menu_item', arguments: { item_id: itemId } }]))
      .toEqual([{ name: 'get_menu_item', arguments: { item_id: itemId } }])
    for (const invalid of ['invalid', '10000000-0000-0001-0000-00000000000g', `${itemId}-extra`]) {
      expect(V2_TOOL_REGISTRY.get_menu_item.input.safeParse({ item_id: invalid }).success).toBe(false)
      expect(V2_TOOL_REGISTRY.search_menu_items.input.safeParse({ category_id: invalid }).success).toBe(false)
      expect(selectToolCalls(active, [], [{ name: 'get_menu_item', arguments: { item_id: invalid } }])).toEqual([])
    }
  })

  it.each([
    { id: 'bad', name: 'search_menu_items', arguments: { limit: 99 } },
    { id: 'bad', name: 'execute_sql', arguments: {} },
    { id: 'bad', name: 'get_recent_orders', arguments: {} },
  ])('actually executes the menu fallback after an unusable model call: $name', async call => {
    const output = await turn('cho xem menu', { plan: async () => ({ reply_text: '', tool_calls: [call as never], tokens_used: usage }) })
    expect(output.contexts[1].exchanges.map(e => e.name)).toEqual(['search_menu_items'])
    expect(output.result.cards).toHaveLength(2)
    expect(output.query.mock.calls.some(([sql]) => sql.includes('public.orders'))).toBe(false)
    expect(output.next.draft).toBeNull()
  })

  it('does not turn provider failure into a successful or empty answer', async () => {
    await expect(turn('cho xem menu', { plan: async () => { throw new Error('synthetic provider failure') } }))
      .rejects.toThrow('synthetic provider failure')
  })

  it('keeps verified negative reservation availability distinct from retrieval unavailability', () => {
    expect(evidenceStatusFor({ id: 'capacity', name: 'check_reservation_availability', arguments: {},
      result: { status: 'unavailable', starts_at: new Date().toISOString(), guest_count: 4, reason: 'No capacity' } })).toBe('known')
    expect(evidenceStatusFor({ id: 'failure', name: 'check_reservation_availability', arguments: {},
      result: { status: 'unavailable', reason: 'TOOL_TIMEOUT' }, evidenceStatus: 'unavailable' })).toBe('unavailable')
  })

  it('fallback execution cannot bypass active set or gateway account authorization', async () => {
    const query = vi.fn()
    const scope = { budget: new TurnBudget(), toolEvents: [], helpers: {}, request: {},
      pool: { query }, capability: { principal: createAgentPrincipal({ actorType: 'guest', sessionId: 's' }) } } as unknown as TurnScope
    const gateway = createTurnGateway(scope)
    const account = V2_READ_TOOLS.filter(t => t.name === 'get_recent_orders')
    const calls = selectToolCalls(account, [], [{ name: 'get_recent_orders', arguments: {} }])
    await expect(runModelTools(scope, gateway, calls, [])).rejects.toThrow('INACTIVE_TOOL')
    await expect(runModelTools(scope, gateway, calls, account)).rejects.toThrow('CAPABILITY_DENIED')
    expect(query).not.toHaveBeenCalled()
    expect(scope.toolEvents).toEqual(expect.arrayContaining([expect.objectContaining({ success: false })]))
  })

  it('gateway timeout produces unavailable evidence, never empty', async () => {
    const gateway = new ToolGateway()
    gateway.register({ name: 'search_menu_items', kind: 'read', inputSchema: V2_TOOL_REGISTRY.search_menu_items.input,
      outputSchema: V2_TOOL_REGISTRY.search_menu_items.output, requiredCapabilities: [], ownershipScope: 'none',
      timeoutMs: 5, budgetCost: 1, modelVisible: true, execute: () => new Promise(() => {}) })
    const scope = { budget: new TurnBudget(), helpers: {}, capability: {
      principal: createAgentPrincipal({ actorType: 'guest', sessionId: 's' }) } } as unknown as TurnScope
    const exchanges = await runModelTools(scope, gateway, [{ name: 'search_menu_items', arguments: {} }], V2_READ_TOOLS)
    expect(exchanges[0]).toMatchObject({ result: { status: 'unavailable', reason: 'TOOL_TIMEOUT' } })
    expect(computeEvidenceStatus(exchanges)).toBe('unavailable')
  })

  it('zero and mixed evidence cannot falsely become known; guard rejects false no-results after failures', () => {
    const exchanges: ToolExchange[] = [
      { id: 'a', name: 'lookup_restaurant_info', arguments: {}, result: { status: 'known' } },
      { id: 'b', name: 'search_menu_items', arguments: {}, result: { status: 'unavailable' } },
    ]
    expect(computeEvidenceStatus([])).toBe('not_attempted')
    expect(exchanges.map(evidenceStatusFor)).toEqual(['known', 'unavailable'])
    expect(computeEvidenceStatus(exchanges)).toBe('unavailable')
    expect(safeGroundedReply('Không có món phù hợp.', JSON.stringify(exchanges), 'unavailable')).toBeNull()
    expect(safeGroundedReply('Mình chưa kiểm tra được thực đơn lúc này.', JSON.stringify(exchanges), 'unavailable')).not.toBeNull()
    expect(safeGroundedReply('Không có món phù hợp; mình chưa kiểm tra được thông tin liên hệ.', JSON.stringify([
      { name: 'search_menu_items', status: 'empty' }, { name: 'lookup_restaurant_info', status: 'unavailable' },
    ]), 'unavailable')).not.toBeNull()
    expect(safeGroundedReply('Mình đã kiểm tra nhưng chưa có thông tin.', '[]', 'not_attempted')).toBeNull()
  })
})
