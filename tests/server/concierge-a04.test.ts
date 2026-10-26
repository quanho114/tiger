import { describe, expect, it } from 'vitest'
import { runTurn, session } from './concierge-a03-a05-fixture.ts'
import { summarizeSession, tokenUpperBound } from '../../supabase/functions/_shared/concierge/session-summary.ts'
import { buildConciergeContext, ContextBudgetError } from '../../supabase/functions/_shared/concierge/context.ts'
import { ConciergeV2SessionRecordSchema } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { InMemoryConciergeV2SessionBackend, createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import type pg from 'pg'

describe('A04 structured context, compaction boundaries and persistence', () => {
  it.each([9, 10, 11])('compacts at %i user messages, retaining four messages rather than four pairs', users => {
    const state = session()
    state.transcript = Array.from({ length: users * 2 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x' }))
    const next = summarizeSession(state)
    expect(next.transcript).toHaveLength(users < 10 ? users * 2 : 4)
  })
  it.each([2499, 2500, 2501])('uses UTF-8 bytes at the %i-byte boundary', bytes => {
    const state = session()
    state.transcript = [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'x' }, { role: 'user', content: 'x' },
      { role: 'assistant', content: 'x' }, { role: 'user', content: 'x' }]
    const initial = tokenUpperBound(JSON.stringify(state.transcript))
    state.transcript[0].content += 'ế' + 'a'.repeat(bytes - initial - tokenUpperBound('ế'))
    expect(tokenUpperBound(JSON.stringify(state.transcript))).toBe(bytes)
    expect(summarizeSession(state).transcript).toHaveLength(bytes < 2500 ? 5 : 4)
  })
  it('keeps a pending reservation goal through compaction and resumes the short answer', async () => {
    const first = await runTurn(session(), 'Đặt bàn ngày mai cho 4 người')
    const state = first.record
    state.transcript = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'hội thoại dài' }))
    const compacted = summarizeSession(state)
    expect(compacted.conversation_context?.pending_question?.missing_field).toBe('time')
    expect(compacted.summary).toContain('reservation')
    expect(tokenUpperBound(compacted.summary)).toBeLessThanOrEqual(400)
    const next = await runTurn({ ...state, ...compacted }, '19h')
    expect(next.result.cards[0]).toMatchObject({ type: 'reservation_option', guest_count: 4 })
  })
  it('retains changed constraints and user rejection reason when history and summary are trimmed', async () => {
    const first = await runTurn(session(), 'Gợi ý mâm cho 4 người ngân sách tối đa 500k không cay')
    const changed = await runTurn(first.record, 'Ngân sách còn 400k')
    const rejected = await runTurn(changed.record, 'Không thích hành')
    expect(rejected.next.constraints).toMatchObject({ adults: 4, budget_vnd: 400000, is_hard_budget: true, max_spice_level: 0 })
    expect(rejected.next.conversation_context?.rejections[0]).toMatchObject({ source: 'user', reason: 'Không thích hành' })
    const state = { ...rejected.next, transcript: Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, content: 'x'.repeat(1900) })) }
    const context = buildConciergeContext({ state, message: 'tiếp tục', tools: [] })
    expect(context.trimmed).toBe(true)
    expect(context.inputTokens).toBeLessThanOrEqual(6000)
    expect(context.system).toContain('400000')
    expect(context.system).toContain('Không thích hành')
    expect(context.system).toContain('max_spice_level')
  })
  it('fails closed when essential context cannot fit instead of dropping safety', () => {
    const state = session()
    state.constraints.allergies = Array.from({ length: 12 }, () => 'dị ứng '.repeat(100))
    expect(() => buildConciergeContext({ state, message: 'tiếp tục', tools: [] })).toThrow(ContextBudgetError)
  })
  it('trims optional history to the remaining turn allowance without raising the per-call cap', () => {
    const state = session()
    state.transcript = Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: 'x'.repeat(300) }))
    const context = buildConciergeContext({ state, message: 'tiếp tục', tools: [], maxInputTokens: 2600 })
    expect(context.trimmed).toBe(true)
    expect(context.inputTokens).toBeLessThanOrEqual(2600)
  })
  it('reads older records without new fields and rejects malformed new context', () => {
    const old = session()
    expect(ConciergeV2SessionRecordSchema.safeParse(old).success).toBe(true)
    expect(ConciergeV2SessionRecordSchema.safeParse({ ...old, conversation_context: { goal: 'fabricated' } }).success).toBe(false)
  })
  it('round-trips structured context and provenance through the session store and PostgreSQL adapter', async () => {
    const first = await runTurn(session(), 'Đặt bàn ngày mai')
    const backend = new InMemoryConciergeV2SessionBackend()
    const store = createConciergeV2SessionStore({ backend })
    const created = await store.create({ ...first.next, actor: { authenticated_user_id: null } })
    if (!created.ok) throw new Error(created.error.code)
    const read = await store.read(created.reference, { authenticated_user_id: null })
    expect(read.ok && read.record.conversation_context).toEqual(first.next.conversation_context)
    let raw = ''
    const pool = { query: async (sql: string, values: unknown[]) => {
      if (sql.startsWith('INSERT')) { raw = String(values[2]); return { rowCount: 1, rows: [] } }
      return { rows: [{ record: raw }] }
    } } as unknown as pg.Pool
    const postgres = new PostgresConciergeV2SessionBackend(pool)
    expect(await postgres.create(created.record, new Date())).toBe(true)
    const persisted = ConciergeV2SessionRecordSchema.parse(JSON.parse((await postgres.read(created.record.session_id))!))
    expect(persisted.memory_context).toEqual(first.next.memory_context)
    expect(persisted.conversation_context).toEqual(first.next.conversation_context)
  })
})
