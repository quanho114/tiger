import type pg from 'pg'
import { vi } from 'vitest'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import { ConciergeLlmOrchestrator, type CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import type { BoundedContext } from '../../supabase/functions/_shared/concierge/context.ts'
import { computeEvidenceStatus } from '../../supabase/functions/_shared/concierge/orchestration/tool-runner.ts'

export const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
export const menu = ['Gà hấp', 'Rau xào', 'Cơm trắng'].map((name, index) => ({
  id: crypto.randomUUID(), name, category_name: ['Gà', 'Rau', 'Cơm'][index], price_vnd: 50000,
  is_available: true, is_signature: index === 0, pricing_mode: 'fixed', tags: [], description: 'Mô tả món từ thực đơn.',
}))
export function session(userId: string | null = null): ConciergeV2SessionRecord {
  return { ...emptyConciergeSession(), session_id: crypto.randomUUID(), actor: { authenticated_user_id: userId },
    capability_hash: 'a'.repeat(64), state_version: 1, created_at: new Date().toISOString(),
    idle_expires_at: new Date(Date.now() + 3600000).toISOString(), absolute_expires_at: new Date(Date.now() + 7200000).toISOString(), idempotency: [] }
}
export function fixturePool(extra?: (sql: string, values?: unknown[]) => unknown) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    const additional = await extra?.(sql, values)
    if (additional !== undefined) return additional
    if (sql.includes('FROM public.menu_items')) return { rows: menu }
    if (sql.includes('FROM public.restaurant_settings')) return { rows: [{ booking_enabled: true,
      reservation_min_notice_minutes: 30, reservation_max_days_ahead: 30, reservation_duration_minutes: 120 }] }
    if (sql.includes('AS intake_open')) return { rows: [{ closed: false, intake_open: true, service_open: true }] }
    if (sql.includes('AS suitable_table')) return { rows: [{ suitable_table: true }] }
    return { rows: [] }
  })
  return { query, pool: { query } as unknown as pg.Pool }
}
export async function runTurn(record: ConciergeV2SessionRecord, message: string, options: {
  pool?: pg.Pool; adapter?: CustomLlmAdapter; page?: { page: 'menu'; menu_item_id?: string }
} = {}) {
  const contexts: BoundedContext[] = []
  const adapter: CustomLlmAdapter = async (message, history, context) => {
    contexts.push(context.bounded!)
    if (options.adapter) return options.adapter(message, history, context)
    const exchanges = context.bounded!.exchanges
    return { reply_text: exchanges.length ? computeEvidenceStatus(exchanges) === 'known'
      ? 'Mình đã kiểm tra, bạn xem các thẻ chi tiết nhé.' : 'Mình chưa có thông tin xác minh đầy đủ cho yêu cầu này.'
      : 'Bạn cho mình biết thêm thông tin cần thiết nhé.',
      tool_calls: [], tokens_used: usage }
  }
  const output = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message,
    ...(options.page ? { page_context: options.page } : {}) }, record, options.pool ?? fixturePool().pool,
    new ConciergeLlmOrchestrator({ customAdapter: adapter }))
  return { ...output, contexts, record: { ...record, ...output.next, state_version: record.state_version + 1 } }
}
