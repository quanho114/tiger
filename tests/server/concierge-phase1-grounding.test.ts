import { expect, it, vi } from 'vitest'
import type pg from 'pg'
import { ConciergeLlmOrchestrator, type CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import { getRestaurantInfo } from '../../supabase/functions/_shared/concierge/restaurant-info.ts'
import { safeConversationReply } from '../../supabase/functions/_shared/concierge/response-guard.ts'
import type { ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

function session(): ConciergeV2SessionRecord {
  return { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date().toISOString(), absolute_expires_at: new Date().toISOString(), idempotency: [] }
}

function fixture() {
  const settings = { phone: '0902000100', zalo: 'https://zalo.me/new-contact', facebook: '',
    address: 'Địa chỉ mới từ cơ sở dữ liệu', accepting_delivery_orders: true, booking_enabled: true,
    reservation_min_notice_minutes: 60, reservation_max_days_ahead: 20, reservation_cancel_notice_minutes: 45 }
  const menu = [{ id: crypto.randomUUID(), name: 'Bò nướng', price_vnd: 125000, is_available: true }]
  const hours = { open_time: '11:00:00', close_time: '20:00:00' }
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('restaurant_settings') ? [settings] :
    sql.includes('business_closures') ? [{ closed: false }] :
    sql.includes('business_hours') ? [hours] :
    sql.includes('delivery_zones') ? [{ name: 'Vĩnh An' }] :
    sql.includes('menu_items') ? menu : [] }))
  return { pool: { query } as unknown as pg.Pool, query, settings, hours, menu }
}

const model = () => {
  const adapter: CustomLlmAdapter = vi.fn(async (message: Parameters<CustomLlmAdapter>[0],
    _history: Parameters<CustomLlmAdapter>[1], context: Parameters<CustomLlmAdapter>[2]) => {
    const bounded = context.bounded!
    const lookup = bounded.tools.find(tool => tool.name === 'lookup_restaurant_info')
    if (!bounded.exchanges.length && lookup) return { reply_text: '', tool_calls: [{ id: 'lookup', name: 'lookup_restaurant_info' as const, arguments: { query: message } }],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    if (!bounded.exchanges.length && bounded.tools.length) return { reply_text: '', tool_calls: [{ id: 'menu', name: 'search_menu_items' as const, arguments: { query: message } }],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    if (bounded.exchanges.length) {
      const value = bounded.exchanges[0].result as { status?: string; answer?: string; candidates?: unknown[] }
      const text = value.answer ?? ''
      if (value.status === 'unknown' || value.status === 'unavailable' || value.candidates?.length === 0)
        return { reply_text: 'Mình chưa xác minh được thông tin phù hợp trong dữ liệu hiện có.', tool_calls: [],
          tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      if (/số điện thoại/i.test(text)) {
        const phone = text.match(/\d[\d\s]{7,}\d/)?.[0].trim()
        return { reply_text: `Bạn có thể gọi nhà hàng theo số ${phone}.`, tool_calls: [],
          tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      }
      if (/zalo/i.test(text)) {
        const url = text.match(/https?:\/\/\S+/)?.[0]
        return { reply_text: `Bạn có thể nhắn qua Zalo tại ${url}.`, tool_calls: [],
          tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      }
      if (/địa chỉ/i.test(text)) return { reply_text: `Địa chỉ hiện tại: ${text.split(':').slice(1).join(':').trim()}.`, tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      const times = text.match(/\d{1,2}:\d{2}/g)
      if (times?.length) return { reply_text: `Giờ hoạt động đã xác minh: ${times[0]}–${times[1] ?? times[0]}.`, tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      if (/dị ứng thực phẩm/i.test(text)) return { reply_text: 'Bạn nên báo nhân viên về dị ứng thực phẩm để bếp kiểm tra thành phần và nguy cơ nhiễm chéo; mình không thể cam kết an toàn khi chưa xác minh.',
        tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      if (/phút.*ngày/i.test(text)) {
        const numbers = text.match(/\d+/g) ?? []
        return { reply_text: `Yêu cầu cần gửi trước ${numbers[0]} phút, có thể đặt trước ${numbers[1]} ngày và hủy trước ${numbers[2]} phút.`,
          tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      }
      return { reply_text: 'Mình đã kiểm tra thông tin thực đơn. Bạn xem chi tiết trong thẻ bên dưới nhé.', tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    }
    return { reply_text: 'Chào bạn, mình có thể giúp bạn chọn món hoặc tra cứu thông tin nhà hàng.', tool_calls: [],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
  })
  return { adapter, llm: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }
}

it('uses restaurant lookup tools and current structured facts instead of stale seed text', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  for (const [message, expected] of [
    ['Số điện thoại nhà hàng?', '0902000100'], ['Hotline đặt bàn?', '0902000100'], ['Zalo nhà hàng?', 'new-contact'],
    ['Địa chỉ nhà hàng ở đâu?', 'Địa chỉ mới từ cơ sở dữ liệu'], ['Mấy giờ đóng cửa?', '11:00–20:00'],
  ]) {
    const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }, session(), data.pool, llm)
    expect(turn.result.message).toContain(expected)
    expect(turn.result.message).not.toContain('0901 345 345')
    expect(turn.result.message).not.toContain('22:30')
    expect(turn.metrics.model_calls).toBe(2)
  }
  data.settings.phone = '0902000200'
  const updated = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Hotline của quán là gì?' }, session(), data.pool, llm)
  expect(updated.result.message).toContain('0902000200')
  data.hours.close_time = '21:00:00'
  const changedHours = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Mấy giờ đóng cửa?' }, session(), data.pool, llm)
  expect(changedHours.result.message).toContain('11:00–21:00')
  expect(adapter).toHaveBeenCalled()
})

it('abstains on missing or unavailable restaurant data without seed substitution', async () => {
  const data = fixture()
  data.settings.facebook = ''
  expect((await getRestaurantInfo(data.pool, 'facebook')).status).toBe('unknown')
  const { llm } = model()
  const missing = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Facebook nhà hàng là gì?' }, session(), data.pool, llm)
  expect(missing.result.message).toContain('chưa xác minh')
  const uncertain = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Nhà hàng có wifi không?' }, session(), data.pool, llm)
  expect(uncertain.result.message).toContain('chưa xác minh')
  expect(uncertain.metrics.model_calls).toBe(2)
  const unavailable = await getRestaurantInfo({ query: vi.fn(async () => { throw new Error('offline') }) } as unknown as pg.Pool, 'phone')
  expect(unavailable.status).toBe('unavailable')
})

it('does not assert delivery to an unmatched area', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  const answer = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Có giao Quận 1 không?' }, session(), data.pool, llm)
  expect(answer.result.message).toContain('chưa xác minh')
  expect(answer.result.message).not.toContain('Vĩnh An')
  expect(adapter).toHaveBeenCalled()
})

it('reads reservation notice windows from settings rather than the mixed seed policy', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  const answer = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Chính sách đặt bàn?' }, session(), data.pool, llm)
  expect(answer.result.message).toContain('60 phút')
  expect(answer.result.message).toContain('20 ngày')
  expect(answer.result.message).toContain('45 phút')
  expect(answer.result.message).not.toContain('0901 345 345')
  expect(adapter).toHaveBeenCalled()
})

it('retains keyword policy retrieval without admitting stale operational seed documents', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  const policy = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Chính sách dị ứng thực phẩm như thế nào?' }, session(), data.pool, llm)
  expect(policy.result.message).toContain('dị ứng thực phẩm')
  expect(policy.result.message).not.toContain('0901 345 345')
  expect(policy.metrics.model_calls).toBe(2)
  expect(adapter).toHaveBeenCalled()
})

it('keeps menu prices database-authoritative while using a menu tool', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  const menu = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Bò nướng giá bao nhiêu?' }, session(), data.pool, llm)
  expect(menu.result.cards).toMatchObject([{ item: { price_vnd: 125000 } }])
  expect(JSON.stringify(menu.result)).not.toContain('999000')
  expect(menu.metrics.model_calls).toBe(2)
  expect(adapter).toHaveBeenCalled()
})

it('allows greetings but never streams or returns invented restaurant facts', async () => {
  const data = fixture()
  const { llm, adapter } = model()
  const streamed = vi.fn()
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Xin chào!' }, session(), data.pool, llm, undefined, streamed)
  expect(adapter).toHaveBeenCalledTimes(1)
  expect(turn.result.message).not.toContain('0999999999')
  expect(streamed).toHaveBeenCalledWith(turn.result.message)
  expect(data.query).not.toHaveBeenCalled()
})

it('blocks unsupported claims using the restaurant brand while allowing identity prose', () => {
  expect(safeConversationReply('Tiger 345 có bàn trống.')).toBeNull()
  expect(safeConversationReply('Tiger 345 nhận đặt bàn.')).toBeNull()
  expect(safeConversationReply('Chúng tôi có phòng riêng.')).toBeNull()
  expect(safeConversationReply('Mình là trợ lý Tiger 345, giúp bạn chọn món.')).not.toBeNull()
})
