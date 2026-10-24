import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { FIXTURE_USERS, seedFixtureUsers } from '../fixtures/auth-users.ts'
import { emptyConciergeSession, processConciergeTurn, productionConciergeSessionStore } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.ts'
import { initializeMemoryContext, applyEffectiveMemory } from '../../supabase/functions/_shared/concierge/memory-state.ts'
import { withMemoryBarrier } from '../../supabase/functions/_shared/concierge/memory-barrier.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2SessionRecord, ConciergeV2SessionMutableState } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

describe('A03–A05 PostgreSQL persistence and account memory barrier', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  const store = productionConciergeSessionStore(pool)
  const userId = FIXTURE_USERS.customerA.id
  const actor = { authenticated_user_id: userId }
  const repo = createConciergeV2MemoryRepository(pool, { role: 'customer', userId })
  const ids: string[] = []
  let verified = false
  beforeAll(async () => {
    await assertIsolatedTestDatabase(pool)
    verified = true
    await seedFixtureUsers(pool)
    await ensureConciergePostgresSessionTable(pool)
  })
  afterAll(async () => {
    if (verified) {
      for (const id of ids) await pool.query('DELETE FROM public.concierge_v2_sessions WHERE session_id = $1', [id])
      await repo.forgetAll()
    }
    await pool.end()
  })
  it('reads legacy JSON and round-trips bounded structured state through real CAS', async () => {
    const created = await store.create({ ...emptyConciergeSession(), actor })
    if (!created.ok) throw new Error(created.error.code)
    ids.push(created.record.session_id)
    const next: ConciergeV2SessionMutableState = { ...emptyConciergeSession(), conversation_context: {
      schema_version: 1 as const, source: 'structured_state' as const, scope: 'session' as const, goal: 'reservation' as const,
      changed_fields: [], rejections: [], pending_question: { goal: 'reservation' as const, reason: 'missing_field' as const,
        missing_field: 'time' as const, source: 'handler' as const, scope: 'session' as const, state_version: 2 },
    } }
    initializeMemoryContext(next, userId)
    const committed = await store.compareAndSwap({ reference: created.reference, actor, expected_state_version: 1,
      request_id: crypto.randomUUID(), operation_hash: 'a'.repeat(64), next,
      result: { response_id: crypto.randomUUID(), phase: 'DISCOVERY', message: 'Bạn muốn đến lúc nào?', cards: [], warnings: [] } })
    expect(committed.ok).toBe(true)
    const read = await store.read(created.reference, actor)
    expect(read.ok && read.record.conversation_context).toEqual(next.conversation_context)
    expect(read.ok && read.record.memory_context).toEqual(next.memory_context)
  })
  it('waits for an admitted old turn, then removes imports and replay prose before another model call', async () => {
    expect((await repo.setEnabled({ enabled: true, consent_version: 1 })).ok).toBe(true)
    const settings = await repo.getSettings()
    const state = emptyConciergeSession()
    state.constraints.dislikes = ['Hành']
    initializeMemoryContext(state, userId)
    state.memory_context!.epoch = settings.memory_epoch
    applyEffectiveMemory(state, [{ memory_type: 'preference', memory_key: 'bi-do', food: 'Bí đỏ', source: 'explicit', confidence: 90,
      observed_at: new Date().toISOString(), expires_at: null, epoch: settings.memory_epoch }], settings.memory_epoch)
    const created = await store.create({ ...state, actor })
    if (!created.ok) throw new Error(created.error.code)
    ids.push(created.record.session_id)
    let entered!: () => void; let release!: () => void
    const admitted = new Promise<void>(resolve => { entered = resolve })
    const held = new Promise<void>(resolve => { release = resolve })
    const oldTurn = withMemoryBarrier(pool, userId, async () => {
      entered(); await held
      return store.compareAndSwap({ reference: created.reference, actor, expected_state_version: 1,
        request_id: crypto.randomUUID(), operation_hash: 'b'.repeat(64), next: state,
        result: { response_id: crypto.randomUUID(), phase: 'DISCOVERY', message: 'Bạn thích Bí đỏ.', cards: [], warnings: [] } })
    })
    await admitted
    const forgetting = repo.forgetAll()
    release()
    expect((await oldTurn).ok).toBe(true)
    expect((await forgetting).ok).toBe(true)
    const read = await store.read(created.reference, actor)
    if (!read.ok) throw new Error(read.error.code)
    expect(read.record.constraints.preferences).toEqual([])
    expect(read.record.constraints.dislikes).toEqual(['Hành'])
    expect(read.record.memory_context!.imported).toEqual([])
    expect(JSON.stringify(read.record.idempotency)).not.toContain('Bí đỏ')
    const contexts: string[] = []
    await processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session: created.reference,
      expected_state_version: read.record.state_version, message: 'Xin chào' }, actor, { pool, store,
      orchestrator: new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, context) => {
        contexts.push(JSON.stringify(context.bounded))
        return { reply_text: 'Chào bạn, mình giúp gì cho bữa này?', tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      } }) })
    expect(contexts.every(context => !context.includes('Bí đỏ'))).toBe(true)
    expect((await repo.listFacts()).length).toBe(0)
    const raw = await pool.query<{ record: string }>('SELECT record FROM public.concierge_v2_sessions WHERE session_id = $1', [created.record.session_id])
    expect((JSON.parse(raw.rows[0].record) as ConciergeV2SessionRecord).memory_context!.imported).toEqual([])
  })
})
