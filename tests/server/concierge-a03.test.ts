import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixturePool, runTurn, session, usage } from './concierge-a03-a05-fixture.ts'
import { understandTurn } from '../../supabase/functions/_shared/concierge/understanding/engine.ts'

afterEach(() => vi.restoreAllMocks())
describe('A03 domain clarification and natural-language tool autonomy', () => {
  it.each(['Cho xem menu', 'Có đặc sản gì', 'Xem thực đơn giúp mình'])('%s browses without party/budget questions', async message => {
    const output = await runTurn(session(), message)
    expect(output.contexts.at(-1)?.exchanges[0].name).toBe('search_menu_items')
    expect(output.result.cards.length).toBeGreaterThan(0)
    expect(output.next.conversation_context?.pending_question).toBeUndefined()
  })
  it('offers budget-only advice without inventing party size, then reuses constraints when supplied', async () => {
    const first = await runTurn(session(), 'Gợi ý mâm, ngân sách tối đa 500k, không cay')
    expect(first.next.conversation_context?.pending_question).toBeUndefined()
    expect(first.next.constraints.party_size_confirmed).not.toBe(true)
    expect(first.metrics.tool_count).toBeGreaterThan(0)
    expect(first.result.cards.filter(card => card.type === 'meal_plan').every(card =>
      card.budget_status === 'conditional' && card.warnings.some(warning => warning.includes('Khẩu phần chưa')))).toBe(true)
    const second = await runTurn(first.record, '4 người')
    expect(second.next.constraints).toMatchObject({ adults: 4, budget_vnd: 500000, is_hard_budget: true, max_spice_level: 0 })
    expect(second.contexts.at(-1)?.exchanges.some(exchange => exchange.name === 'recommend_meal')).toBe(true)
    expect(second.next.conversation_context?.pending_question).toBeUndefined()
  })
  it('collects reservation date, short time and bare guest answer in separate turns', async () => {
    const { pool, query } = fixturePool()
    const first = await runTurn(session(), 'Đặt bàn ngày mai', { pool })
    expect(first.next.conversation_context?.pending_question?.missing_field).toBe('time')
    const date = first.next.conversation_context?.reservation?.date
    const second = await runTurn(first.record, '19h', { pool })
    expect(second.next.conversation_context?.reservation).toEqual({ date, time: '19h' })
    expect(second.next.conversation_context?.pending_question?.missing_field).toBe('guests')
    const third = await runTurn(second.record, '4', { pool })
    expect(third.result.cards).toEqual([expect.objectContaining({ type: 'reservation_option', guest_count: 4 })])
    expect(third.next.conversation_context?.pending_question).toBeUndefined()
    expect(query.mock.calls.find(([sql]) => sql.includes('AS suitable_table'))?.[1]?.[2]).toBe(4)
    expect(query.mock.calls.every(([sql]) => !/INSERT|UPDATE|DELETE/.test(sql))).toBe(true)
  })
  it('does not guess an ambiguous reservation time', async () => {
    const first = await runTurn(session(), 'Đặt bàn ngày mai 7h cho 4 người')
    expect(first.next.conversation_context?.pending_question).toMatchObject({ reason: 'invalid_value', missing_field: 'time' })
    expect(first.metrics.tool_count).toBe(0)
    const second = await runTurn(first.record, 'buổi tối')
    expect(second.contexts.at(-1)?.exchanges[0]).toMatchObject({ name: 'check_reservation_availability' })
  })
  it.each(['bốn người', '4'])('resumes a meal with the contextual guest answer %s', async answer => {
    const first = await runTurn(session(), 'Tư vấn mâm giúp mình')
    const next = await runTurn(first.record, answer)
    expect(next.next.constraints).toMatchObject({ adults: 4, party_size_confirmed: true })
    expect(next.contexts.at(-1)?.exchanges[0].name).toBe('recommend_meal')
  })
  it('keeps an already supplied time when the customer answers the missing date', async () => {
    const first = await runTurn(session(), 'Đặt bàn lúc 19h cho 4 người')
    expect(first.next.conversation_context?.pending_question?.missing_field).toBe('date')
    const next = await runTurn(first.record, 'ngày mai')
    expect(next.result.cards[0]).toMatchObject({ type: 'reservation_option', guest_count: 4 })
    expect(next.next.conversation_context?.reservation?.time).toBe('19h')
  })
  it('resolves the actual displayed second dish and ignores a model-selected wrong ID', async () => {
    const first = await runTurn(session(), 'Xem menu')
    const expected = first.next.conversation_context!.displayed!.items[1].menu_item_id
    const second = await runTurn(first.record, 'Món thứ hai có giá thế nào?', { adapter: async (_message, _history, context) => ({
      reply_text: context.bounded!.exchanges.length ? 'Bạn xem thông tin đã kiểm tra ở thẻ nhé.' : '',
      tool_calls: context.bounded!.exchanges.length ? [] : [{ id: 'read', name: 'get_menu_item', arguments: { item_id: crypto.randomUUID() } }], tokens_used: usage,
    }) })
    expect(second.result.cards).toEqual([expect.objectContaining({ type: 'menu_item_detail', item: expect.objectContaining({ id: expected }) })])
    expect(second.next.draft).toBeNull()
  })
  it('accepts a specific ordinal imperative but asks for ambiguous ok', async () => {
    const first = await runTurn(session(), 'Xem menu')
    const ambiguous = await runTurn(first.record, 'ok')
    expect(ambiguous.next.draft).toBeNull()
    expect(ambiguous.next.conversation_context?.pending_question?.reason).toBe('ambiguous_referent')
    const accepted = await runTurn(ambiguous.record, 'Lấy món thứ hai')
    expect(accepted.next.draft?.items[0].menu_item_id).toBe(first.next.conversation_context!.displayed!.items[1].menu_item_id)
  })
  it.each(['Nghe ngon', 'Để xem'])('%s is not acceptance and does not silently reject the displayed choices', async message => {
    const first = await runTurn(session(), 'Xem menu')
    const second = await runTurn(first.record, message)
    expect(second.next.draft).toBeNull()
    expect(second.next.pending_suggestion_ids).toEqual(first.next.pending_suggestion_ids)
  })
  it('rejects stale list versions and changed page scopes', async () => {
    const first = await runTurn(session(), 'Xem menu', { page: { page: 'menu' } })
    const stale = await runTurn({ ...first.record, state_version: first.record.state_version + 1 }, 'Món thứ hai')
    expect(stale.next.conversation_context?.pending_question?.reason).toBe('stale_referent')
    const changed = await runTurn(first.record, 'Món thứ hai', { page: { page: 'menu', menu_item_id: crypto.randomUUID() } })
    expect(changed.next.conversation_context?.pending_question?.reason).toBe('stale_referent')
    expect(changed.metrics.tool_count).toBe(0)
  })
  it('lets the model discover a useful read for an unrecognized paraphrase', async () => {
    const message = 'Cho mình nghía những lựa chọn bên bạn nhé'
    expect(understandTurn(message).intent).toBe('other')
    const output = await runTurn(session(), message, { adapter: async (_message, _history, context) => ({
      reply_text: context.bounded!.exchanges.length ? 'Mình đã kiểm tra các lựa chọn, bạn xem thẻ nhé.' : '',
      tool_calls: context.bounded!.exchanges.length ? [] : [{ id: 'browse', name: 'search_menu_items', arguments: {} }], tokens_used: usage,
    }) })
    expect(output.metrics).toMatchObject({ model_calls: 2, tool_count: 1 })
    expect(output.result.cards.length).toBeGreaterThan(0)
    expect(output.next.conversation_context?.pending_question).toBeUndefined()
  })
  it('executes a model-discovered restaurant read instead of sending it back to smalltalk', async () => {
    const message = 'Mình muốn rõ chuyện bên bạn'
    expect(understandTurn(message).intent).toBe('other')
    const output = await runTurn(session(), message, { adapter: async (_message, _history, context) => ({
      reply_text: context.bounded!.exchanges.length ? 'Mình chưa có thông tin xác minh cho phần này.' : '',
      tool_calls: context.bounded!.exchanges.length ? [] : [{ id: 'lookup', name: 'lookup_restaurant_info', arguments: { query: 'số điện thoại nhà hàng' } }], tokens_used: usage,
    }) })
    expect(output.contexts.at(-1)?.exchanges[0].name).toBe('lookup_restaurant_info')
    expect(output.metrics).toMatchObject({ model_calls: 2, tool_count: 1 })
  })
})
