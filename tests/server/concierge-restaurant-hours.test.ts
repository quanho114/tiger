import { expect, it, vi } from 'vitest'
import type pg from 'pg'
import { readRestaurantHours } from '../../supabase/functions/_shared/concierge/restaurant-hours.ts'
import { ConciergeLlmOrchestrator, type CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import type { ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const clock = new Date('2026-09-25T05:00:00.000Z')

function record(): ConciergeV2SessionRecord {
  return { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: null },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: clock.toISOString(),
    idle_expires_at: clock.toISOString(), absolute_expires_at: clock.toISOString(), idempotency: [] }
}

function model() {
  const adapter: CustomLlmAdapter = vi.fn(async (message: Parameters<CustomLlmAdapter>[0],
    _history: Parameters<CustomLlmAdapter>[1], context: Parameters<CustomLlmAdapter>[2]) => {
    const bounded = context.bounded!
    if (!bounded.exchanges.length && bounded.tools.some(tool => tool.name === 'lookup_restaurant_info'))
      return { reply_text: '', tool_calls: [{ id: 'lookup', name: 'lookup_restaurant_info' as const, arguments: { query: message } }],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    const value = bounded.exchanges[0]?.result as { status?: string; answer?: string } | undefined
    if (value?.status === 'unavailable') return { reply_text: /phí giao/i.test(message)
      ? 'Mình chưa kiểm tra được phí giao hàng từ nguồn hiện tại.'
      : 'Mình chưa kiểm tra được thông tin giờ hoạt động từ nguồn hiện tại.',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    if (!value || value.status !== 'known') return { reply_text: 'Mình chưa xác minh được phí giao cụ thể; mức phí phụ thuộc địa chỉ bạn nhập.',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    if (value.answer?.startsWith('Địa chỉ')) return { reply_text: `Địa chỉ hiện tại đã được xác minh: ${value.answer.split(':').slice(1).join(':').trim()}.`,
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    const times = value.answer?.match(/\d{1,2}:\d{2}/g)
    return { reply_text: times?.length ? `Nhà hàng hoạt động từ ${times[0]} đến ${times[1]}.`
      : 'Phí giao cụ thể phụ thuộc địa chỉ; bạn xem mức phí trong giỏ hàng nhé.',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
  })
  return { adapter, llm: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }
}

it('reads operational hours instead of the stale published FAQ', async () => {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('business_closures')
    ? [{ closed: false }] : [{ open_time: '11:00:00', close_time: '20:00:00' }] }))
  const pool = { query } as unknown as pg.Pool
  const answer = await readRestaurantHours(pool, 'mấy giờ đóng cửa?', clock)
  expect(answer).toContain('11:00–20:00')
  expect(answer).not.toContain('22:30')
  expect(query).toHaveBeenCalledWith(expect.stringContaining('business_hours'), [5])
})

it('honors tomorrow closure and never fills missing hours from static knowledge', async () => {
  const closed = { query: vi.fn(async () => ({ rows: [{ closed: true }] })) } as unknown as pg.Pool
  expect(await readRestaurantHours(closed, 'ngày mai mấy giờ mở cửa?', clock)).toContain('tạm nghỉ')
  expect(closed.query).toHaveBeenCalledWith(expect.stringContaining('business_closures'), ['2026-09-26'])
  const missing = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('business_closures')
    ? [{ closed: false }] : [] })) } as unknown as pg.Pool
  expect(await readRestaurantHours(missing, 'giờ mở cửa?', clock)).toContain('chưa xác minh')
})

it.each(['Mấy giờ đóng cửa?', 'Quán mở đến mấy giờ?', 'Giờ hoạt động ngày mai?', 'may gio dong cua?'])('uses the lookup tool for operational hours for %s', async message => {
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes('business_closures')
    ? [{ closed: false }] : [{ open_time: '11:00:00', close_time: '20:00:00' }] }))
  const pool = { query } as unknown as pg.Pool
  const { adapter, llm } = model()
  const hours = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message }, record(), pool, llm)
  expect(hours.result.message).toContain('11:00')
  expect(hours.result.message).toContain('20:00')
  expect(hours.result.message).not.toContain('22:30')
  expect(adapter).toHaveBeenCalledTimes(2)
})

it('checks delivery information, withholds an invented fee, and links to the cart for a quote', async () => {
  const { adapter, llm } = model()
  const fee = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Phí giao hàng bao nhiêu?' }, record(), { query: vi.fn() } as unknown as pg.Pool, llm)
  expect(fee.result.message).toContain('chưa kiểm tra được phí giao')
  expect(fee.result.cards).toEqual([{ type: 'service_link', destination: 'cart' }])
  expect(adapter).toHaveBeenCalledTimes(2)
})

it('fails closed on operational storage errors without returning seeded hours', async () => {
  const pool = { query: vi.fn(async () => { throw new Error('offline') }) } as unknown as pg.Pool
  const { llm } = model()
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Mấy giờ đóng cửa?' }, record(), pool, llm)
  expect(turn.result.message).toContain('chưa kiểm tra được')
  expect(turn.result.message).not.toContain('22:30')
})

it('reads the changed address instead of the seeded location and hours', async () => {
  const pool = { query: vi.fn(async () => ({ rows: [{ address: 'Địa chỉ mới từ cơ sở dữ liệu' }] })) } as unknown as pg.Pool
  const { adapter, llm } = model()
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'Địa chỉ nhà hàng ở đâu?' }, record(), pool, llm)
  expect(turn.result.message).toContain('Địa chỉ mới từ cơ sở dữ liệu')
  expect(turn.result.message).not.toContain('22:30')
  expect(turn.result.message).not.toContain('10:30')
  expect(adapter).toHaveBeenCalledTimes(2)
})
