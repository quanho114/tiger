import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import pg from 'pg'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { processConciergeTurn } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2TurnRequest, ConciergeV2CompletionPayload } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
describe('full draft conversation using real PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  const backend = new PostgresConciergeV2SessionBackend(pool)
  const store = createConciergeV2SessionStore({ backend })
  const ids: string[] = []
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'UNTRUSTED: order confirmed', tool_calls: [], tokens_used: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }) })
  beforeAll(() => ensureConciergePostgresSessionTable(pool))
  afterAll(async () => { for (const id of ids) await backend.delete(id); await pool.end() })
  it('suggestion, explicit acceptance, quantity edit, removal, FAQ interruption and chot preserve exact draft', async () => {
    let current: ConciergeV2CompletionPayload | undefined
    const send = async (body: Partial<ConciergeV2TurnRequest>) => {
      current = await processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
        ...(current ? { session: { session_id: current.session.session_id, session_capability: current.session.session_capability }, expected_state_version: current.session.state_version } : {}), ...body },
      { authenticated_user_id: null }, { pool, store, orchestrator: llm })
      ids.push(current.session.session_id); return current
    }
    const first = await send({ message: 'Gợi ý món ăn' })
    expect(first.draft).toBeUndefined()
    const card = first.cards?.[0] as { type: string; lines?: { suggestion_id: string; item: { id: string; name: string } }[] } | undefined
    const suggestions = card?.type === 'meal_plan' && card.lines
      ? card.lines
      : (first.cards as { type: string; suggestion_id: string; item: { id: string; name: string } }[])
    expect(suggestions.length).toBeGreaterThan(1)
    const ambiguous = await send({ message: 'ok' })
    expect(ambiguous.draft).toBeUndefined()
    const added = await send({ message: `Lấy ${suggestions[0].item.name} 2 phần` })
    expect(added.draft?.items).toHaveLength(1)
    expect(added.draft?.items[0].quantity).toBe(2)
    const second = await send({ message: `Thêm ${suggestions[1].item.name}` })
    expect(second.draft?.items).toHaveLength(2)
    const changed = await send({ message: `Đổi ${suggestions[0].item.name} 3 phần` })
    expect(changed.draft?.items[0].quantity).toBe(3)
    const removed = await send({ message: `Bỏ ${suggestions[1].item.name}` })
    expect(removed.draft?.items).toHaveLength(1)
    const faq = await send({ message: 'Giờ mở cửa' })
    expect(faq.draft).toEqual(removed.draft)
    const ok = await send({ message: 'ok' })
    expect(ok.draft).toEqual(removed.draft)
    const review = await send({ message: 'chốt' })
    expect(review.draft?.review_state).toBe('ready_for_review')
    expect(review.handoff).toBeUndefined()
    expect(review.message).not.toContain('UNTRUSTED')
  })
})
