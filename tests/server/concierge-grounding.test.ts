import { afterEach, it, expect, vi } from 'vitest'
import type pg from 'pg'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { buildConciergeContext } from '../../supabase/functions/_shared/concierge/context.ts'
import { V2_READ_TOOLS, validateV2Tool } from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { catalogResolver, orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import type { CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2SessionMutableState, ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { createInitialDraft } from '../../supabase/functions/_shared/concierge/draft-cart.ts'
import { classifyConciergeTurn } from '../../supabase/functions/_shared/concierge/turn-intent.ts'
import { suggestConciergeActions } from '../../supabase/functions/_shared/concierge/suggested-actions.ts'
afterEach(() => vi.unstubAllGlobals())
const menuPool = (items: object[]) => ({ query: async (sql: string) => ({
  rows: sql.includes('FROM public.concierge_knowledge') ? [] : items,
}) }) as unknown as pg.Pool
const testModel = (adapter: CustomLlmAdapter) => new ConciergeLlmOrchestrator({ customAdapter: async (message, history, context) => {
  const response = await adapter(message, history, context)
  if (response.reply_text.trim()) return response
  const exchanges = context.bounded?.exchanges ?? []
  const missing = exchanges.some(exchange => {
    const value = exchange.result as { status?: string; candidates?: unknown[]; item?: unknown; orders?: unknown[]; addresses?: unknown[] } | null
    return value?.status === 'unknown' || value?.status === 'unavailable' ||
      (Array.isArray(value?.candidates) && value.candidates.length === 0) ||
      ('item' in (value ?? {}) && value?.item === null) ||
      (Array.isArray(value?.orders) && value.orders.length === 0) ||
      (Array.isArray(value?.addresses) && value.addresses.length === 0)
  })
  return { ...response, reply_text: missing
    ? 'Mình chưa tìm thấy thông tin phù hợp trong dữ liệu hiện có. Bạn cho mình biết thêm chi tiết được không?'
    : /cay/i.test(message) ? 'Món này được đánh giá không cay theo dữ liệu của thực đơn.'
      : 'Mình đã kiểm tra thông tin phù hợp. Bạn xem chi tiết trong thẻ bên dưới nhé.' }
} })
it('answers an exact dish price question from the live catalog even for ranged pricing', async () => {
  const itemId = crypto.randomUUID()
  const pool = menuPool([{ id: itemId, name: 'Gà nướng muối ớt', price_vnd: 280000,
    pricing_mode: 'range', price_min: 280000, price_max: 300000, is_available: true, allow_dine_in: true }])
  const adapter = vi.fn(async (_message: string, _history: unknown, context: { bounded?: { exchanges: unknown[] } }) => ({
    reply_text: context.bounded?.exchanges.length
      ? 'Mình đã kiểm tra giá hiện tại. Khoảng giá được hiển thị trong thẻ món bên dưới.'
      : '',
    tool_calls: context.bounded?.exchanges.length ? [] : [{ id: 'menu_lookup', name: 'get_menu_item' as const, arguments: { item_id: itemId } }],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Gà nướng muối ớt giá bao nhiêu?' }, record, pool, new ConciergeLlmOrchestrator({ customAdapter: adapter }))
  expect(turn.result.cards).toEqual([expect.objectContaining({ type: 'menu_item_detail',
    item: expect.objectContaining({ id: itemId, price_vnd: 280000, price_min: 280000, price_max: 300000, pricing_mode: 'range' }) })])
  expect(adapter).toHaveBeenCalledTimes(2)
  expect((adapter.mock.calls[0][2] as { bounded?: { tools: { name: string }[] } }).bounded?.tools.map(tool => tool.name)).toContain('get_menu_item')
  expect(turn.next.draft).toBeNull()
})
it.each(['openai', 'anthropic', 'gemini'] as const)('%s sends canonical context and actual tool results with matching IDs', async provider => {
  const capture = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }], content: [], candidates: [{ content: { parts: [] } }] })))
  vi.stubGlobal('fetch', capture)
  const context = buildConciergeContext({ state: emptyConciergeSession(), message: 'unique-current-turn', tools: V2_READ_TOOLS,
    exchanges: [{ id: 'call_real_result', name: 'search_menu_items', arguments: { query: 'beef' }, result: { price_vnd: 123456 } }] })
  const llm = new ConciergeLlmOrchestrator({ provider, apiKey: 'synthetic-test-only' })
  await llm.orchestrateTurn('unique-current-turn', [], { bounded: context })
  const body = JSON.parse((capture.mock.calls as unknown as [string, RequestInit][])[0][1].body as string)
  const encoded = JSON.stringify(body)
  expect(encoded.match(/unique-current-turn/g)).toHaveLength(1)
  expect(encoded).toContain('123456')
  expect(encoded).toContain('call_real_result')
  expect(encoded).toContain('Canonical data')
  expect(encoded).not.toContain('create_order_quote')
  expect(encoded).not.toContain('customerUserId')
})
it('strict tool inputs reject mutations, invented keys, unbounded quantities', () => {
  expect(() => validateV2Tool('submit_order', {})).toThrow()
  expect(() => validateV2Tool('search_menu_items', { query: 'beef', accepted: true })).toThrow()
  expect(() => validateV2Tool('recommend_meal', { adults: 999 })).toThrow()
})
it('blocks cart drafts for dishes without a fixed verified price', () => {
  const id = crypto.randomUUID()
  const resolve = catalogResolver([{ id, name: 'Hải sản theo ngày', price_vnd: 0,
    pricing_mode: 'market', is_available: true }], emptyConciergeSession())
  expect(resolve(id)?.is_available).toBe(false)
})
it.each(['chào bạn', 'Xin chào!', 'hello'])('lets the model answer %s without menu lookup', async message => {
  const query = vi.fn()
  const pool = { query } as unknown as pg.Pool
  const adapter = vi.fn(async () => ({ reply_text: 'Chào bạn, mình là Tiger Concierge. Bạn muốn khám phá món nào?',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  const llm = new ConciergeLlmOrchestrator({ customAdapter: adapter })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, record, pool, llm)
  expect(turn.result.message).toBe('Chào bạn, mình là Tiger Concierge. Bạn muốn khám phá món nào?')
  expect(turn.result.cards).toEqual([])
  expect(turn.result.warnings).toEqual([])
  expect(turn.metrics.model_calls).toBe(1)
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(query).not.toHaveBeenCalled()
})
it.each(['Bạn là ai?', 'Bạn tên gì vậy?', 'Cảm ơn bạn', 'Thời tiết hôm nay thế nào?'])('answers %s with the model but without menu lookup', async message => {
  const query = vi.fn()
  const pool = { query } as unknown as pg.Pool
  const adapter = vi.fn(async () => ({ reply_text: 'Mình là trợ lý Tiger 345, giúp bạn chọn món.',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  const llm = new ConciergeLlmOrchestrator({ customAdapter: adapter })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, record, pool, llm)
  expect(turn.result.message).toContain('trợ lý Tiger 345')
  expect(turn.result.cards).toEqual([])
  expect(turn.metrics.model_calls).toBe(1)
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(query).not.toHaveBeenCalled()
})
it('composes opening text using verified page context', async () => {
  const pool = { query: vi.fn() } as unknown as pg.Pool
  const adapter = vi.fn(async (_message: string, _history: unknown, context: { bounded?: { system: string } }) => {
    expect(context.bounded?.system).toContain('"page":"menu"')
    return { reply_text: 'Bạn đang xem thực đơn. Mình giúp bạn chọn món theo số người nhé?',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
  })
  const llm = new ConciergeLlmOrchestrator({ customAdapter: adapter })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    action: { type: 'open_conversation' }, page_context: { page: 'menu' } }, record, pool, llm)
  expect(turn.result.message).toContain('thực đơn')
  expect(turn.next.transcript).toHaveLength(1)
  expect(adapter).toHaveBeenCalledTimes(1)
})
it('collects a family budget across turns without fetching menu cards', async () => {
  const query = vi.fn()
  const pool = { query } as unknown as pg.Pool
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Mình đã ghi nhận. Bạn muốn món kiểu nào?',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
  let record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  for (const message of ['4 người nha', 'khoảng 1 triệu', 'có bé 6 tuổi']) {
    const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, record, pool, llm)
    expect(turn.result.cards).toEqual([])
    record = { ...record, ...turn.next, state_version: record.state_version + 1 }
  }
  expect(record.constraints).toMatchObject({ adults: 3, children: 1, budget_vnd: 1_000_000 })
  expect(query).not.toHaveBeenCalled()
})
it('asks for a natural reservation clarification without promising a table', async () => {
  const pool = { query: vi.fn() } as unknown as pg.Pool
  const adapter = vi.fn(async () => ({ reply_text: 'Bạn muốn đặt bàn vào ngày nào?',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  const llm = new ConciergeLlmOrchestrator({ customAdapter: adapter })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Đặt bàn cho 4 người nhé' }, record, pool, llm)
  expect(turn.result.message).toContain('ngày nào')
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(turn.result.cards).toEqual([])
})
it('reads only the authenticated customer orders when asked, and never for a guest', async () => {
  const userId = crypto.randomUUID()
  const order = { id: crypto.randomUUID(), code: 'TG-ORDER-1', status: 'completed',
    order_type: 'takeaway', created_at: new Date().toISOString() }
  const query = vi.fn(async (sql: string, _params?: unknown[]) => ({ rows: sql.includes('FROM public.orders') ? [order] : [] }))
  const pool = { query } as unknown as pg.Pool
  const model = new ConciergeLlmOrchestrator({ customAdapter: async (message) => ({
    reply_text: message.startsWith('Explain naturally') ? 'Bạn cần đăng nhập để mình tra cứu đơn cũ.' : 'Mình đã kiểm tra đơn gần đây của bạn.',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
  const base = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), capability_hash: 'a'.repeat(64),
    state_version: 1, created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(),
    absolute_expires_at: new Date().toISOString(), idempotency: [] }
  const guest = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Cho mình xem đơn cũ' }, { ...base, actor: { authenticated_user_id: null } } as ConciergeV2SessionRecord, pool, model)
  expect(guest.result.cards).toEqual([])
  expect(guest.result.message).toContain('đăng nhập')
  expect(query).not.toHaveBeenCalled()
  const account = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Cho mình xem đơn cũ' }, { ...base, actor: { authenticated_user_id: userId } } as ConciergeV2SessionRecord, pool, model)
  expect(account.result.cards).toEqual([{ type: 'order_status', order_id: order.id, code: order.code,
    status: order.status, order_type: order.order_type, created_at: order.created_at }])
  expect(query.mock.calls.find(call => call[0].includes('FROM public.orders'))?.[1]).toEqual([userId])
})
it('reads saved addresses only on explicit authenticated requests', async () => {
  const userId = crypto.randomUUID()
  const address = { id: crypto.randomUUID(), label: 'Nhà', address_line: '12 Đường Hoa',
    ward: 'Phường 1', district: null, province: 'TP HCM', is_default: true }
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [address] }))
  const pool = { query } as unknown as pg.Pool
  const model = new ConciergeLlmOrchestrator({ customAdapter: async (message) => ({
    reply_text: message.startsWith('Explain naturally') ? 'Bạn cần đăng nhập để mình tra cứu địa chỉ đã lưu.'
      : 'Mình đã tìm thấy địa chỉ đã lưu. Chi tiết nằm trong thẻ bên dưới.', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }) })
  const base = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), capability_hash: 'a'.repeat(64),
    state_version: 1, created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(),
    absolute_expires_at: new Date().toISOString(), idempotency: [] }
  const request = { protocol_version: 'concierge-v2' as const, request_id: crypto.randomUUID(),
    message: 'Xem địa chỉ đã lưu của tôi' }
  const guest = await orchestrateGroundedTurn(request,
    { ...base, actor: { authenticated_user_id: null } } as ConciergeV2SessionRecord, pool, model)
  expect(guest.result.cards).toEqual([])
  expect(guest.result.message).toContain('đăng nhập')
  expect(query).not.toHaveBeenCalled()
  const account = await orchestrateGroundedTurn(request,
    { ...base, actor: { authenticated_user_id: userId } } as ConciergeV2SessionRecord, pool, model)
  expect(account.result.cards).toEqual([{ type: 'saved_address', address_id: address.id, label: address.label,
    address_line: address.address_line, ward: address.ward, district: address.district,
    province: address.province, is_default: true }])
  expect(account.result.message).toContain('địa chỉ đã lưu')
  expect(query.mock.calls[0][1]).toEqual([userId])
  expect(classifyConciergeTurn('Địa chỉ nhà hàng ở đâu?')).not.toBe('saved_address')
})
it('does not let a food turn read account data through a model tool call', async () => {
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] }))
  const pool = { query } as unknown as pg.Pool
  const model = testModel(async () => ({
    reply_text: '', tool_calls: [{ id: 'private_read', name: 'get_saved_addresses', arguments: {} }],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(),
    actor: { authenticated_user_id: crypto.randomUUID() }, capability_hash: 'a'.repeat(64),
    state_version: 1, created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(),
    absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Gợi ý món tối nay' }, record, pool, model)
  expect(query.mock.calls.some(call => call[0].includes('public.customer_addresses'))).toBe(false)
})
it('keeps a no-spice request in the food flow', () => {
  expect(classifyConciergeTurn('Không cay')).toBe('food')
  expect(classifyConciergeTurn('Gợi ý món không cay')).toBe('food')
  expect(classifyConciergeTurn('4 người ăn gì khoảng 800k?')).toBe('food')
})
it.each(['món này gồm gì?', 'món này cay không?'])('reads the viewed menu item for %s', async message => {
  const id = crypto.randomUUID()
  const pool = menuPool([{ id, name: 'Bò nướng', description: 'Bò nướng cùng rau thơm', price_vnd: 125000,
    pricing_mode: 'fixed', spice_level: 0, is_available: true, allow_delivery: true }])
  const model = testModel(async () => ({ reply_text: '', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message, page_context: { page: 'menu', menu_item_id: id } }, record, pool, model)
  if (message.includes('cay')) {
    expect(turn.result.cards).toEqual([])
    expect(turn.result.message).toContain('không cay')
  } else {
    expect(turn.result.cards).toMatchObject([{ type: 'menu_item_detail', item: { id, name: 'Bò nướng',
      price_vnd: 125000, spice_level: 0 }, description: 'Bò nướng cùng rau thơm' }])
  }
  expect(turn.result.suggested_actions).toEqual([])
})
it('changes follow-up chips with verified cards and current constraints', () => {
  const state: ConciergeV2SessionMutableState = emptyConciergeSession()
  const item = { id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 200000, pricing_mode: 'fixed' as const,
    safety_state: 'allergen_unknown' as const, provenance: 'catalog:live_menu', tags: [], is_signature: false, is_available: true }
  const result = { response_id: crypto.randomUUID(), phase: 'RECOMMENDATION' as const, message: '', warnings: [],
    cards: [{ type: 'draft_suggestion' as const, item, suggestion_id: crypto.randomUUID() }] }
  expect(suggestConciergeActions(result, state)).toEqual(['Gợi ý món không cay', 'Gợi ý món dưới 160k'])
  state.constraints.max_spice_level = 0
  expect(suggestConciergeActions(result, state)).toEqual(['Gợi ý món dưới 160k'])
  expect(suggestConciergeActions({ ...result, cards: [] }, state)).toEqual([])
})
it('does not substitute another dish when the viewed item is stale', async () => {
  const pool = menuPool([{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000, is_available: true }])
  const model = new ConciergeLlmOrchestrator({ customAdapter: async () => { throw new Error('model should not be called') } })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'món này gồm gì?', page_context: { page: 'menu', menu_item_id: crypto.randomUUID() } }, record, pool, model)
  expect(turn.result.cards).toEqual([])
  expect(turn.result.message).toContain('chưa kiểm tra được món')
})
it('reports unavailable menu data without inventing food results', async () => {
  const pool = { query: vi.fn(async (sql: string) => {
    if (sql.includes('FROM public.concierge_knowledge')) return { rows: [] }
    throw new Error('catalog offline')
  }) } as unknown as pg.Pool
  const model = new ConciergeLlmOrchestrator({ customAdapter: async () => { throw new Error('model should not be called') } })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Gợi ý món cho 4 người' }, record, pool, model)
  expect(turn.result.cards).toEqual([])
  expect(turn.result.message).toContain('chưa lấy được thông tin thực đơn')
})
it('preserves market pricing when reading a viewed dish', async () => {
  const id = crypto.randomUUID()
  const pool = menuPool([{ id, name: 'Cá theo ngày', description: 'Cá tươi theo ngày', price_vnd: 0,
    pricing_mode: 'market', is_available: true }])
  const model = testModel(async () => ({ reply_text: '', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'món này gồm gì?', page_context: { page: 'menu', menu_item_id: id } }, record, pool, model)
  expect(turn.result.cards).toMatchObject([{ type: 'menu_item_detail', item: { id, pricing_mode: 'market' } }])
})
it('gives a guest a priced meal set for a group budget without verified serving profiles', async () => {
  const pool = menuPool([
    { id: crypto.randomUUID(), name: 'Bò nướng', category_name: 'Heo & Bò', price_vnd: 250000, pricing_mode: 'fixed', is_available: true },
    { id: crypto.randomUUID(), name: 'Rau xào', category_name: 'Gỏi & Rau', price_vnd: 150000, pricing_mode: 'fixed', is_available: true },
    { id: crypto.randomUUID(), name: 'Cơm trắng', category_name: 'Cơm · Mì · Miến', price_vnd: 50000, pricing_mode: 'fixed', is_available: true },
  ])
  const model = testModel(async () => ({ reply_text: '', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: '4 người ăn gì khoảng 800k?' }, record, pool, model)
  expect(turn.result.cards).toMatchObject([{ type: 'meal_plan', subtotal_vnd: 450000,
    validation_status: 'WARNING' }])
  expect(turn.next.constraints).toMatchObject({ adults: 4, budget_vnd: 800000, party_size_confirmed: true })
  expect(turn.result.suggested_actions).toContain('Gợi ý mâm dưới 380k')
})
it('keeps group and spice context while replacing a rejected protein', async () => {
  const pool = menuPool([
    { id: crypto.randomUUID(), name: 'Bò nướng', category_name: 'Heo & Bò', price_vnd: 250000, spice_level: 0, is_available: true },
    { id: crypto.randomUUID(), name: 'Gà hấp', category_name: 'Gà', price_vnd: 230000, spice_level: 0, is_available: true },
    { id: crypto.randomUUID(), name: 'Rau xào', category_name: 'Gỏi & Rau', price_vnd: 150000, spice_level: 0, is_available: true },
    { id: crypto.randomUUID(), name: 'Cơm trắng', category_name: 'Cơm · Mì · Miến', price_vnd: 50000, spice_level: 0, is_available: true },
  ])
  const model = testModel(async () => ({ reply_text: '', tool_calls: [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }))
  let record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  for (const message of ['4 người ăn gì khoảng 800k?', 'không cay nha']) {
    const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, record, pool, model)
    record = { ...record, ...turn.next, state_version: record.state_version + 1 }
  }
  const replacement = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'đổi món bò đi' }, record, pool, model)
  expect(replacement.next.constraints).toMatchObject({ adults: 4, budget_vnd: 800000, max_spice_level: 0 })
  expect(replacement.next.constraints.dislikes).toContain('bo')
  expect(replacement.result.cards).toMatchObject([{ type: 'meal_plan' }])
  expect(JSON.stringify(replacement.result.cards)).toContain('Gà hấp')
  expect(JSON.stringify(replacement.result.cards)).not.toContain('Bò nướng')
})
it('ignores a menu tool call for a restaurant FAQ', async () => {
  const query = vi.fn(async () => ({ rows: [] }))
  const pool = { query } as unknown as pg.Pool
  const llm = testModel(async () => ({ reply_text: '',
    tool_calls: [{ id: 'wrong_route', name: 'search_menu_items', arguments: {} }],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Giờ mở cửa?', }, record, pool, llm)
  expect(turn.result.cards).toEqual([])
  expect(turn.result.phase).toBe('DISCOVERY')
  expect(query).toHaveBeenCalledTimes(1)
})
it('fails closed when the model invents a price, allergy guarantee, or completed order', async () => {
  const id = crypto.randomUUID()
  const pool = menuPool([{ id, name: 'Bò nướng', price_vnd: 125000, is_available: true, allow_delivery: true }])
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Đã đặt đơn. Giá 1 đồng, tuyệt đối an toàn dị ứng.', tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  await expect(orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Gợi ý món ăn' }, record, pool, llm))
    .rejects.toMatchObject({ code: 'UNSAFE_CONCIERGE_RESPONSE' })
})
it.each([
  { message: 'Có pizza không?', menu: [], modelText: 'Pizza Margherita vẫn còn, bạn thử nhé.' },
  { message: 'Có pizza không?', menu: [{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000,
    is_available: true }], modelText: 'Pizza vẫn còn, bạn thử nhé.' },
  { message: 'Có lasagna không?', menu: [{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000,
    is_available: true }], modelText: 'Lasagna đang có.' },
  { message: 'Bò nướng giá bao nhiêu?', menu: [{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000,
    is_available: true, allow_delivery: true }], modelText: 'Bò nướng giá 189000.' },
  { message: 'Bò lúc lắc bao nhiêu?', menu: [{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000,
    is_available: true }], modelText: 'Bò lúc lắc giá 189000.' },
])('does not let model text override grounded catalog: $message', async ({ message, menu, modelText }) => {
  const pool = menuPool(menu)
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: modelText,
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  await expect(orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, record, pool, llm))
    .rejects.toMatchObject({ code: 'UNSAFE_CONCIERGE_RESPONSE' })
})

it('falls back to canonical budget planning when a model proposes unsupported read-tool arguments', async () => {
  const pool = menuPool([{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000, is_available: true }])
  const llm = testModel(async () => ({ reply_text: '', tool_calls: [
    { id: crypto.randomUUID(), name: 'recommend_meal', arguments: { budget: 1 } },
  ], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: '4 người 800k' }, record, pool, llm)
  expect(turn.next.constraints).toMatchObject({ adults: 4, budget_vnd: 800000 })
  expect(turn.result.cards.length).toBeGreaterThan(0)
  expect(turn.next.draft).toBeNull()
})

it('keeps a budget revision when the model echoes an unsupported price in a constraint reply', async () => {
  const pool = { query: vi.fn() } as unknown as pg.Pool
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Mình ghi nhận mức ngân sách bạn vừa cập nhật.',
    tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'budget còn 700k' }, record, pool, llm)
  expect(turn.next.constraints.budget_vnd).toBe(700000)
  expect(turn.result.message).toContain('ghi nhận')
  expect(turn.result.message).not.toContain('700k')
  expect(pool.query).not.toHaveBeenCalled()
})

it('requires a new explicit acceptance when the displayed changed price changes again', async () => {
  const id = crypto.randomUUID()
  const line = crypto.randomUUID()
  const pool = menuPool([{ id, name: 'Bò nướng', price_vnd: 150000, is_available: true }])
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [],
    draft: { ...createInitialDraft(), subtotal_vnd: 100000, items: [{ line_id: line, menu_item_id: id, quantity: 1, note: '', unit_price_vnd: 100000 }],
      blocked_items: [{ line_id: line, menu_item_id: id, reason: 'PRICE_CHANGED', message: 'Giá đã thay đổi.', current_unit_price_vnd: 125000 }] } } as ConciergeV2SessionRecord
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), action: { type: 'accept_prices', draft_version: record.draft!.version } }, record, pool)
  expect(turn.next.draft?.items[0].unit_price_vnd).toBe(100000)
  expect(turn.next.draft?.blocked_items[0].current_unit_price_vnd).toBe(150000)
  expect(turn.result.handoff).toBeUndefined()
})

it('keeps a no-spice constraint through a later recommendation', async () => {
  const pool = menuPool([{ id: crypto.randomUUID(), name: 'Món cay', price_vnd: 100000, is_available: true, spice_level: 2 }])
  const llm = testModel(async () => ({ reply_text: '', tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 } }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const first = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Gợi ý món không cay cho 3 người' }, record, pool, llm)
  expect(first.next.constraints).toMatchObject({ max_spice_level: 0, adults: 3, party_size_confirmed: true })
  const later = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Gợi ý món khác' }, { ...record, ...first.next }, pool, llm)
  expect(later.result.cards).toEqual([])
})

it('builds a priced meal plan and applies it only after explicit acceptance', async () => {
  const mainId = '10000000-0000-0000-0000-000000000001'
  const sideId = '10000000-0000-0000-0000-000000000002'
  const items = [
    { id: mainId, name: 'Sườn nướng', price_vnd: 150000, is_available: true, allow_dine_in: true },
    { id: sideId, name: 'Gỏi cuốn', price_vnd: 60000, is_available: true, allow_dine_in: true },
  ]
  // Phase 5: serving metadata comes from menu_item_ai_profiles (mocked here),
  // not hardcoded seeds. Values mirror the retired demo profiles.
  const profileRows = [
    { ...items[0], serving_unit: 'đĩa', serving_description: 'Khoảng 550g sườn non',
      people_min: 2, people_max: 3, meal_role: 'main_protein', meal_context: 'shared',
      protein_score: 0.85, carb_score: 0, vegetable_score: 0.1, soup_score: 0,
      confidence: 'restaurant_defined', provenance: 'test' },
    { ...items[1], serving_unit: 'phần', serving_description: '4 cuốn lớn cắt đôi',
      people_min: 2, people_max: 4, meal_role: 'side', meal_context: 'shared',
      protein_score: 0.35, carb_score: 0.25, vegetable_score: 0.45, soup_score: 0,
      confidence: 'restaurant_defined', provenance: 'test' },
  ]
  const pool = { query: async (sql: string) => ({
    rows: sql.includes('FROM public.concierge_knowledge') ? []
      : sql.includes('menu_item_ai_profiles') ? profileRows : items,
  }) } as unknown as pg.Pool
  let calls = 0
  const llm = testModel(async () => ({ reply_text: '',
    tool_calls: calls++ === 0 ? [{ id: 'plan_call', name: 'recommend_meal', arguments: {} }] : [],
    tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const suggestion = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Gợi ý mâm cho 4 người ngân sách 400k' }, record, pool, llm)
  const card = suggestion.result.cards.find(value => value.type === 'meal_plan')
  expect(card).toBeDefined()
  expect(card?.subtotal_vnd).toBe(360000)
  expect(card?.lines.map(line => line.quantity)).toEqual([2, 1])
  expect(suggestion.next.draft).toBeNull()

  const current = { ...record, ...suggestion.next, state_version: 2 }
  const accepted = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    action: { type: 'accept_meal_plan', plan_id: card!.plan_id, suggestion_ids: card!.lines.map(line => line.suggestion_id) } }, current, pool)
  expect(accepted.next.draft?.items.map(item => item.quantity)).toEqual([2, 1])
  expect(accepted.next.draft?.subtotal_vnd).toBe(360000)

  items[0].price_vnd = 200000
  const changed = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    action: { type: 'accept_meal_plan', plan_id: card!.plan_id, suggestion_ids: card!.lines.map(line => line.suggestion_id) } }, current, pool)
  expect(changed.result.warnings).toContain('BUDGET_EXCEEDED')
  expect(changed.next.draft).toBeNull()
})
