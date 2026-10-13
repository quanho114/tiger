import { expect, it, vi } from 'vitest'
import type pg from 'pg'
import { checkReservationAvailability } from '../../supabase/functions/_shared/concierge/reservation-availability.ts'
import { classifyConciergeTurn } from '../../supabase/functions/_shared/concierge/turn-intent.ts'
import { resolveReservationDateTime } from '../../supabase/functions/_shared/concierge/date-resolver.ts'
import { orchestrateGroundedTurn } from '../../supabase/functions/_shared/concierge/orchestrator.ts'
import { ConciergeLlmOrchestrator, type CustomLlmAdapter } from '../../supabase/functions/_shared/concierge/llm.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionRecord } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const now = new Date('2026-09-23T10:00:00.000Z')
const startsAt = new Date('2026-09-24T12:00:00.000Z')

function poolFor(options: {
  booking?: boolean; closed?: boolean; intake?: boolean; service?: boolean;
  legacy?: boolean; unknown?: boolean; suitable?: boolean; openVisit?: boolean
} = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM public.restaurant_settings')) return { rows: [{
      booking_enabled: options.booking ?? true, reservation_min_notice_minutes: 30,
      reservation_max_days_ahead: 30, reservation_duration_minutes: 120,
    }] }
    if (sql.includes('FROM public.business_closures')) return { rows: [{
      closed: options.closed ?? false, intake_open: options.intake ?? true,
      service_open: options.service ?? true,
    }] }
    return { rows: [{ legacy_overlap: options.legacy ?? false,
      unknown_capacity: options.unknown ?? false, suitable_table: options.suitable ?? false,
      open_visit: options.openVisit ?? false }] }
  })
  return { pool: { query } as unknown as pg.Pool, query }
}

it('recognizes a casual availability question as a reservation request', () => {
  expect(classifyConciergeTurn('có bàn cho 6 người lúc 7h tối mai k')).toBe('reservation')
  expect(resolveReservationDateTime('có bàn cho 6 người lúc 7h tối mai k', now, true).startsAtIso)
    .toBe('2026-09-24T19:00:00+07:00')
  expect(resolveReservationDateTime('có bàn cho 6 người lúc 7h mai k', now, true).ambiguous).toBe(true)
})

it('reports an available request only with a free configured table and open service', async () => {
  const { pool, query } = poolFor({ suitable: true })
  const result = await checkReservationAvailability(pool, startsAt, 6, now)
  expect(result.status).toBe('available')
  expect(result.reason).toContain('gửi yêu cầu')
  expect(query).toHaveBeenCalledTimes(3)
})

it.each([
  [{ closed: true, suitable: true }, 'unavailable'],
  [{ intake: false, suitable: true }, 'unavailable'],
  [{ service: false, suitable: true }, 'unavailable'],
  [{ legacy: true, suitable: true }, 'unverified'],
  [{ unknown: true }, 'unverified'],
  [{ openVisit: true }, 'unverified'],
  [{}, 'unavailable'],
] as const)('never promises a table when the schedule or seating is uncertain', async (options, expected) => {
  const { pool } = poolFor(options)
  expect((await checkReservationAvailability(pool, startsAt, 6, now)).status).toBe(expected)
})

it('uses the live reservation notice and horizon instead of hard-coded hours', async () => {
  const { pool, query } = poolFor({ suitable: true })
  expect((await checkReservationAvailability(pool, new Date(now.getTime() + 5 * 60_000), 4, now)).status).toBe('unavailable')
  expect(query).toHaveBeenCalledTimes(1)
})

it('checks availability with a read tool and does not ask the model to guess seats', async () => {
  const { pool } = poolFor({ suitable: true })
  const record = { ...emptyConciergeSession(), session_id: crypto.randomUUID(),
    actor: { authenticated_user_id: null }, capability_hash: 'a'.repeat(64), state_version: 1,
    created_at: new Date().toISOString(), idle_expires_at: new Date().toISOString(),
    absolute_expires_at: new Date().toISOString(), idempotency: [] } as ConciergeV2SessionRecord
  const adapter: CustomLlmAdapter = vi.fn(async (_message: Parameters<CustomLlmAdapter>[0],
    _history: Parameters<CustomLlmAdapter>[1], context: Parameters<CustomLlmAdapter>[2]) => context.bounded?.exchanges.length
    ? { reply_text: 'Mình đã kiểm tra khả năng đặt bàn. Thẻ bên dưới ghi nhận trạng thái hiện tại; đây chưa phải xác nhận đặt chỗ.',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    : { reply_text: '', tool_calls: [{ id: 'availability', name: 'check_reservation_availability' as const, arguments: {} }],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  const turn = await orchestrateGroundedTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    message: 'có bàn cho 6 người lúc 7h tối mai k' }, record, pool, new ConciergeLlmOrchestrator({ customAdapter: adapter }))
  expect(turn.result.cards).toEqual([{ type: 'reservation_option',
    starts_at: expect.any(String), guest_count: 6, status: 'available' }])
  expect(turn.result.message).toContain('đây chưa phải xác nhận')
  expect(turn.metrics.model_calls).toBe(2)
  expect(adapter).toHaveBeenCalledTimes(2)
})
