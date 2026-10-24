import { afterEach, describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import fixture from './fixtures/a09-response-v1.json'
import { fixturePool, menu, runTurn, session, usage } from './concierge-a03-a05-fixture.ts'
import { memoryFixture } from './concierge-a05-fixture.ts'
import { safeConversationReply, safeGroundedReply } from '../../supabase/functions/_shared/concierge/response-guard.ts'
import { processConciergeTurn, productionConciergeSessionStore } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { handleConciergeRoutes } from '../../supabase/functions/public-api/concierge-handlers.ts'
import type { RouteContext } from '../../supabase/functions/public-api/context.ts'
import { setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); setConciergeFeatureFlagsForTesting(null) })

function evidence(key?: string) {
  const status = key === 'mixed' ? 'unavailable' : key === 'menu' || !key ? 'known' : key
  const empty = { name: 'search_menu_items', status: 'empty', result: { candidates: [] } }
  const result = key === 'mixed' ? [empty, { name: 'lookup_restaurant_info', status: 'unavailable', result: {} }]
    : key === 'not_attempted' ? [] : key === 'empty' ? [empty]
      : [{ name: key === 'menu' ? 'search_menu_items' : 'lookup_restaurant_info', status,
        result: key === 'menu' ? { candidates: [{ name: 'Món mẫu', price_vnd: 100000, safety_state: 'allergen_unknown' }] } : { status } }]
  return { encoded: JSON.stringify(result), status: status as 'known' | 'empty' | 'unknown' | 'unavailable' | 'not_attempted' }
}

describe(`A09 development regression ${fixture.version}`, () => {
  it.each(fixture.development)('$id permits the intended meaning and rejects unsafe claims', entry => {
    const source = evidence('evidence' in entry ? entry.evidence : undefined)
    const reply = entry.mode === 'conversation' ? safeConversationReply(entry.text) : safeGroundedReply(entry.text, source.encoded, source.status)
    expect(Boolean(reply)).toBe(entry.allow)
  })

  it('keeps the character boundary, verified URLs and grounded numbers', () => {
    expect(safeConversationReply('a'.repeat(700))).toHaveLength(700)
    expect(safeConversationReply('a'.repeat(701))).toBeNull()
    expect(safeGroundedReply('a'.repeat(701), '[]')).toBeNull()
    const source = JSON.stringify([{ name: 'lookup_restaurant_info', status: 'known', result: { answer: 'Mở cửa 11:00; https://tiger.example.test/menu' } }])
    expect(safeGroundedReply('Mở cửa lúc 11:00.', source)).not.toBeNull()
    expect(safeGroundedReply('Mở cửa lúc 22:00.', source)).toBeNull()
    expect(safeGroundedReply('Xem https://tiger.example.test/menu', source)).not.toBeNull()
    expect(safeGroundedReply('Xem https://unverified.invalid/menu', source)).toBeNull()
  })

  it.each([
    'Mình chưa có dữ liệu nên đã đặt món cho bạn.',
    'Mình không biết khẩu phần và giỏ hàng đã được cập nhật.',
    'Nếu bạn đã đặt món thì mình đã thanh toán cho bạn.',
  ])('does not let an unrelated negation or condition authorize a transaction: %s', text => {
    expect(safeConversationReply(text)).toBeNull()
  })

  it('projects catalog serving text and missing fields without hidden prices or invented planner reasons', async () => {
    const pool = fixturePool(sql => sql.includes('FROM public.menu_items')
      ? { rows: menu.map(item => ({ ...item, serving_size: 'Dĩa dùng chung' })) } : undefined).pool
    const output = await runTurn(session(), 'Gà hấp gồm nguyên liệu gì?', { pool,
      adapter: async (_message, _history, context) => ({ reply_text: context.bounded!.exchanges.length
        ? 'Bạn xem mô tả đã xác minh trong thẻ món nhé.' : '', tool_calls: [], tokens_used: usage }) })
    const tool = output.contexts.at(-1)!.exchanges[0]
    expect(tool).toMatchObject({ name: 'get_menu_item', result: { item: { name: 'Gà hấp', serving_size: 'Dĩa dùng chung' } } })
    expect(JSON.stringify(tool.result)).not.toContain('price_vnd')
    expect(JSON.stringify(tool.result)).not.toContain('pairing')
    expect(output.result.cards[0]).toMatchObject({ type: 'menu_item_detail', item: { price_vnd: 50000 } })
    expect(output.contexts[0].system).toContain('1-3 useful sentences')
    expect(output.contexts[0].system).toContain('700 characters')
    expect(output.contexts[0].system).toContain('Proactively reason and choose tools')
    expect(output.next.draft).toBeNull()
  })

  it('repairs a claim matching a hidden catalog price and measures the single repair within existing budgets', async () => {
    let drafts = 0
    const output = await runTurn(session(), 'Cho xem menu', { adapter: async (_message, _history, context) => {
      if (!context.bounded!.exchanges.length) return { reply_text: '', tool_calls: [], tokens_used: usage }
      drafts++
      return { reply_text: drafts === 1 ? 'Món này giá 50000 đồng.' : 'Bạn xem lựa chọn và giá trong thẻ nhé.', tool_calls: [], tokens_used: usage }
    } })
    expect(output.metrics).toMatchObject({ model_calls: 3, tool_count: 1, guard_checks: 2, guard_rejections: 1, repair_attempts: 1, repair_successes: 1 })
    expect(output.metrics.input_tokens).toBeLessThanOrEqual(12000)
    expect(output.metrics.repair_latency_ms).toBeGreaterThanOrEqual(0)
    expect(output.contexts.every(context => context.inputTokens <= 6000)).toBe(true)
    expect(output.result.message).not.toContain('50000')
    expect(output.result.cards[0]).toMatchObject({ type: 'draft_suggestion', item: { price_vnd: 50000 } })
    expect(output.next.draft).toBeNull()
  })

  it('composes a warning plan without duplicate candidates or claiming sufficient portions', async () => {
    const output = await runTurn(session(), 'Gợi ý mâm cho 4 người', { adapter: async (_message, _history, context) => ({
      reply_text: context.bounded!.exchanges.length ? 'Khẩu phần còn cần xác nhận; bạn xem mâm tham khảo trong thẻ nhé.' : '', tool_calls: [], tokens_used: usage,
    }) })
    const projected = output.contexts.at(-1)!.exchanges[0].result as Record<string, unknown>
    expect(projected.candidates).toBeUndefined()
    expect(projected.advice_evidence).toContain('no pairing or portion guarantee')
    expect(projected.plans).toEqual(expect.arrayContaining([expect.objectContaining({ validation_status: 'WARNING', warnings: expect.any(Array) })]))
    expect(output.result.cards.some(card => card.type === 'meal_plan')).toBe(true)
    expect(output.next.draft).toBeNull()
  })

  it('uses a generated follow-up as a real next turn and keeps the accepted state explicit', async () => {
    const first = await runTurn(session(), 'Gợi ý mâm cho 4 người dưới 500k')
    const chip = first.result.suggested_actions?.find(action => action.includes('dưới'))
    expect(chip).toBeDefined()
    const second = await runTurn(first.record, chip!)
    expect(second.contexts[0].tools.map(tool => tool.name)).toContain('recommend_meal')
    expect(second.contexts.at(-1)!.exchanges[0].name).toBe('recommend_meal')
    expect(second.next.constraints.adults).toBe(4)
    expect(second.next.constraints.budget_vnd).toBeLessThan(500000)
    expect(second.result.cards.some(card => card.type === 'meal_plan')).toBe(true)
    expect(second.next.draft).toBeNull()
  })
})

describe('A09 runtime boundaries with injected provider and synthetic SQL (not live acceptance)', () => {
  it('fails closed after one unsuccessful repair, without commit/presentation, and emits sanitized counters', async () => {
    const database = memoryFixture([])
    const store = productionConciergeSessionStore(database.pool)
    const commit = vi.spyOn(store, 'compareAndSwap')
    const safeText = vi.fn()
    const metric = vi.spyOn(console, 'info').mockImplementation(() => {})
    const adapter = vi.fn(async (_message, _history, context) => ({
      reply_text: context.bounded!.exchanges.length ? 'Giỏ hàng đã được cập nhật thành công.' : '', tool_calls: [], tokens_used: usage,
    }))
    await expect(processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Cho xem menu' },
      { authenticated_user_id: null }, { pool: database.pool, store, onSafeText: safeText,
        orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }) })).rejects.toMatchObject({ detail: { code: 'INTERNAL_SAFE_FAILURE' } })
    expect(adapter).toHaveBeenCalledTimes(3)
    expect(commit).not.toHaveBeenCalled()
    expect(safeText).not.toHaveBeenCalled()
    expect(metric).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'rejected', guard_checks: 2, guard_rejections: 2, repair_attempts: 1, repair_successes: 0 }))
    expect(JSON.stringify(metric.mock.calls)).not.toContain('Giỏ hàng')
  })

  it('publishes only after CAS, keeps canonical completion and replays without another model call', async () => {
    const database = memoryFixture([])
    const store = productionConciergeSessionStore(database.pool)
    const commit = vi.spyOn(store, 'compareAndSwap')
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const adapter = vi.fn(async () => ({ reply_text: 'Chào bạn, mình giúp bạn chọn món nhé?', tool_calls: [], tokens_used: usage }))
    const safeText = vi.fn(() => expect(commit).toHaveBeenCalledOnce())
    const request = { protocol_version: 'concierge-v2' as const, request_id: crypto.randomUUID(), message: 'Xin chào' }
    const dependencies = { pool: database.pool, store, onSafeText: safeText, orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }
    const first = await processConciergeTurn(request, { authenticated_user_id: null }, dependencies)
    expect(safeText).toHaveBeenCalledWith(first.message)
    const replay = await processConciergeTurn({ ...request, session: { session_id: first.session.session_id, session_capability: first.session.session_capability } },
      { authenticated_user_id: null }, dependencies)
    expect(replay).toEqual(first)
    expect(adapter).toHaveBeenCalledOnce()
  })

  it.each(['/concierge/chat', '/concierge/action', '/concierge/feedback'])('checks the persisted global kill switch in the actual %s request path before model execution', async path => {
    const query = vi.fn(async () => ({ rows: [{ key: 'concierge_disabled', value: true }] }))
    const adapter = vi.fn()
    const url = new URL('http://test.invalid' + path)
    const req = new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào' }) })
    const response = await handleConciergeRoutes({ req, path, url, actor: { userId: null }, pool: { query } as unknown as pg.Pool,
      ctx: { orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }, clientIp: '127.0.0.1' } as unknown as RouteContext)
    expect(response!.status).toBe(503)
    expect(await response!.json()).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]).toEqual([expect.stringContaining('FROM public.system_settings')])
    expect(adapter).not.toHaveBeenCalled()
  })
})
