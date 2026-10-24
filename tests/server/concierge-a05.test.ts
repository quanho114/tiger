import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryFact, memoryFixture, userId } from './concierge-a05-fixture.ts'
import { runTurn, session, usage } from './concierge-a03-a05-fixture.ts'
import { createConciergeV2MemoryRepository } from '../../supabase/functions/_shared/concierge/memory-repository.ts'
import { processAndPersistExplicitMemory } from '../../supabase/functions/_shared/concierge/memory-extractor.ts'
import { initializeMemoryContext } from '../../supabase/functions/_shared/concierge/memory-state.ts'
import { processConciergeTurn, productionConciergeSessionStore } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { safeConversationReply } from '../../supabase/functions/_shared/concierge/response-guard.ts'
import { retrieveSelectiveMemory } from '../../supabase/functions/_shared/concierge/memory-retrieval.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
const repository = (fixture: ReturnType<typeof memoryFixture>) => createConciergeV2MemoryRepository(fixture.pool, { role: 'customer', userId })
const personal = () => session(userId)
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes }); return { promise, resolve } }

describe('A05 provenance, consent and deletion lifecycle', () => {
  it('keeps imported metadata separate from independently supplied meal constraints', async () => {
    const fixture = memoryFixture()
    const output = await runTurn(personal(), 'Xem menu', { pool: fixture.pool })
    expect(output.next.constraints.preferences).toEqual(['Bí đỏ'])
    expect(output.next.memory_context?.current.preferences).toEqual([])
    expect(output.next.memory_context?.imported[0]).toMatchObject({ source: 'explicit', scope: 'personal', epoch: 1, observed_at: expect.any(String), expires_at: null })
    expect(output.contexts[0].system).toContain('memory_sources')
    expect(output.contexts[0].system).toContain('Bí đỏ')
  })
  it.each(['guest', 'opt_out', 'global_off'])('%s never reads or writes durable facts', async mode => {
    const fixture = memoryFixture()
    if (mode === 'opt_out') fixture.settings.enabled = false
    if (mode === 'global_off') vi.stubEnv('CONCIERGE_MEMORY_DISABLED', 'true')
    const output = await runTurn(mode === 'guest' ? session() : personal(), 'Xem menu', { pool: fixture.pool })
    expect(output.next.memory_context?.imported).toEqual([])
    expect(fixture.query.mock.calls.some(([sql]) => sql.includes('FROM public.user_ai_memories') || sql.includes('concierge_v2_write_memory_fact'))).toBe(false)
  })
  it('current preference defeats a historical dislike, while allergy and explicit dislike defeat inferred favorites', async () => {
    const fixture = memoryFixture([
      memoryFact({ memory_type: 'dislike' }),
      memoryFact({ memory_key: 'hanh', value: { food: 'Hành' }, source: 'order_history', confidence: 75 }),
      memoryFact({ memory_type: 'allergy', memory_key: 'seafood', value: { food: 'Tôm' } }),
      memoryFact({ memory_key: 'tom', value: { food: 'Tôm' }, source: 'order_history', confidence: 75 }),
    ])
    const first = await runTurn(personal(), 'Tôi thích bí đỏ', { pool: fixture.pool })
    const next = await runTurn(first.record, 'Tôi không thích hành', { pool: fixture.pool })
    expect(next.next.constraints.preferences.map(value => value.toLowerCase())).toContain('bí đỏ')
    expect(next.next.constraints.dislikes.map(value => value.toLowerCase())).not.toContain('bí đỏ')
    expect(next.next.constraints.preferences.map(value => value.toLowerCase())).not.toContain('hành')
    expect(next.next.constraints.preferences.map(value => value.toLowerCase())).not.toContain('tôm')
    expect(next.next.constraints.allergies).toContain('Tôm')
  })
  it.each(['delete', 'forget', 'disable'])('%s purges active sessions and subsequent model inputs while preserving meal facts', async action => {
    const fixture = memoryFixture()
    const first = await runTurn(personal(), 'Bữa này không thích hành', { pool: fixture.pool })
    fixture.records.set(first.record.session_id, first.record)
    expect(first.next.memory_context?.imported.length).toBeGreaterThan(0)
    const repo = repository(fixture)
    const result = action === 'delete' ? await repo.deleteFact({ memory_type: 'preference', memory_key: 'bi-do', source: 'explicit', expected_memory_epoch: 1 })
      : action === 'forget' ? await repo.forgetAll() : await repo.setEnabled({ enabled: false, consent_version: 1 })
    expect(result.ok).toBe(true)
    const cleaned = fixture.records.get(first.record.session_id)!
    expect(cleaned.memory_context?.imported).toEqual([])
    expect(cleaned.constraints.dislikes).toContain('Hành')
    expect(cleaned.constraints.preferences).not.toContain('Bí đỏ')
    expect(cleaned.transcript).toEqual([])
    const next = await runTurn(cleaned, 'Xem menu', { pool: fixture.pool })
    expect(next.contexts.every(context => !JSON.stringify(context).includes('Bí đỏ'))).toBe(true)
    expect(next.next.constraints.dislikes).toContain('Hành')
  })
  it('expires imported facts, removing historical paraphrases from the next model payload', async () => {
    const fact = memoryFact({ expires_at: new Date(Date.now() + 60000).toISOString() })
    const fixture = memoryFixture([fact])
    const first = await runTurn(personal(), 'Xem menu', { pool: fixture.pool })
    first.record.transcript.push({ role: 'assistant', content: 'Bạn thường thích Bí đỏ.' })
    fact.expires_at = new Date(Date.now() - 1).toISOString()
    fixture.facts()[0].expires_at = fact.expires_at
    const next = await runTurn(first.record, 'Xem menu', { pool: fixture.pool })
    expect(next.next.memory_context?.imported).toEqual([])
    expect(next.contexts.every(context => !JSON.stringify(context).includes('Bí đỏ'))).toBe(true)
  })
  it('keeps a freshly supplied meal preference even when an identical durable fact is forgotten', async () => {
    const fixture = memoryFixture()
    const first = await runTurn(personal(), 'Bữa này thích bí đỏ', { pool: fixture.pool })
    fixture.records.set(first.record.session_id, first.record)
    expect((await repository(fixture).forgetAll()).ok).toBe(true)
    const cleaned = fixture.records.get(first.record.session_id)!
    expect(cleaned.memory_context?.imported).toEqual([])
    expect(cleaned.memory_context?.current.preferences).toContain('Bí đỏ')
    expect(cleaned.constraints.preferences).toContain('Bí đỏ')
  })
  it('suppression prevents behavioral relearning until explicit restore', async () => {
    const fact = memoryFact({ source: 'order_history', confidence: 75 })
    const fixture = memoryFixture([fact]); const repo = repository(fixture)
    expect((await repo.deleteFact({ memory_type: fact.memory_type, memory_key: fact.memory_key, source: fact.source, expected_memory_epoch: 1 })).ok).toBe(true)
    const { id: _id, updated_at: _updated, ...input } = fact
    expect(await repo.writeFact({ expected_memory_epoch: 2, fact: input })).toEqual({ ok: false, reason: 'MEMORY_SUPPRESSED' })
    expect(await repo.restoreBehavioralFact({ memory_type: fact.memory_type, memory_key: fact.memory_key })).toEqual({ ok: true, restored: true })
    expect((await repo.writeFact({ expected_memory_epoch: 2, fact: input })).ok).toBe(true)
    const output = await runTurn(personal(), 'Xem menu', { pool: fixture.pool })
    expect(output.next.memory_context?.imported[0]).toMatchObject({ source: 'order_history', epoch: 2 })
  })
  it('does not remove allergy protection based on a natural-language correction', async () => {
    const fixture = memoryFixture([memoryFact({ memory_type: 'allergy', memory_key: 'seafood', value: { food: 'Tôm' } })])
    const first = await runTurn(personal(), 'Xem menu', { pool: fixture.pool })
    const next = await runTurn(first.record, 'Tôi hết dị ứng tôm rồi', { pool: fixture.pool })
    expect(next.next.constraints.allergies).toContain('Tôm')
    expect(next.next.conversation_context?.pending_question?.reason).toBe('allergy_correction')
    const persisted = await processAndPersistExplicitMemory({ message: 'Tôi hết dị ứng tôm rồi', actor: { authenticated_user_id: userId }, repository: repository(fixture) })
    expect(persisted.rejection_reason).toBe('ALLERGY_CORRECTION_REQUIRES_REVIEW')
    expect(fixture.facts()).toHaveLength(1)
  })
  it('refreshes behavior once after a greeting and not on every food turn', async () => {
    const fixture = memoryFixture()
    const hello = await runTurn(personal(), 'Xin chào', { pool: fixture.pool })
    expect(fixture.query.mock.calls.some(([sql]) => sql.includes('AS total_orders'))).toBe(false)
    const food = await runTurn(hello.record, 'Xem menu', { pool: fixture.pool })
    await runTurn(food.record, 'Có đặc sản gì', { pool: fixture.pool })
    expect(fixture.query.mock.calls.filter(([sql]) => sql.includes('AS total_orders'))).toHaveLength(1)
  })
  it('does not convert temporary or third-party declarations into durable personal facts', async () => {
    const fixture = memoryFixture([]); const repo = repository(fixture)
    for (const message of ['Bữa này không thích hành', 'Bạn tôi dị ứng tôm']) {
      const result = await processAndPersistExplicitMemory({ message, actor: { authenticated_user_id: userId }, repository: repo })
      expect(result.persisted).toBe(0)
    }
    const output = await runTurn(personal(), 'Bạn tôi dị ứng tôm', { pool: fixture.pool })
    expect(output.next.memory_context?.current.allergies).toContain('Tôm')
    expect(fixture.facts()).toHaveLength(0)
  })
  it('preserves guest meal constraints on claim and removes imports on account switch', () => {
    const state = session()
    initializeMemoryContext(state)
    state.memory_context!.current.dislikes = ['Hành']
    initializeMemoryContext(state, userId)
    expect(state.constraints.dislikes).toEqual(['Hành'])
    initializeMemoryContext(state, crypto.randomUUID())
    expect(state.memory_context?.imported).toEqual([])
  })
  it('rejects unsupported claims that durable memory was already saved', () => {
    expect(safeConversationReply('Mình đã ghi nhớ sở thích của bạn.')).toBeNull()
    expect(safeConversationReply('Mình sẽ áp dụng sở thích này cho bữa hiện tại.')).not.toBeNull()
  })
})

describe('A05 controlled races and actual runtime postcommit gates', () => {
  it('drops a retrieval snapshot if its epoch changed during listFacts', async () => {
    const fixture = memoryFixture(); const repo = repository(fixture)
    const list = repo.listFacts.bind(repo)
    repo.listFacts = async () => { const facts = await list(); fixture.settings.memory_epoch++; return facts }
    const result = await retrieveSelectiveMemory({ message: 'Xem menu', actor: { authenticated_user_id: userId }, repository: repo })
    expect(result.facts).toEqual([])
  })
  it('rejects writes admitted with a stale epoch after forget', async () => {
    const fixture = memoryFixture(); const repo = repository(fixture)
    await repo.forgetAll()
    await repo.setEnabled({ enabled: true, consent_version: 1 })
    const result = await processAndPersistExplicitMemory({ message: 'Tôi thích bí đỏ', actor: { authenticated_user_id: userId }, expectedMemoryEpoch: 1, repository: repo })
    expect(result.rejection_reason).toBe('MEMORY_EPOCH_MISMATCH')
    expect(fixture.facts()).toHaveLength(0)
  })
  it('serializes forget behind an admitted turn, then scrubs its commit before the next model ingestion', async () => {
    const fixture = memoryFixture(); const entered = deferred(); const resume = deferred()
    const store = productionConciergeSessionStore(fixture.pool)
    const running = processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xem menu' },
      { authenticated_user_id: userId }, { pool: fixture.pool, store,
      orchestrator: new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, context) => {
        if (!context.bounded!.exchanges.length) { entered.resolve(); await resume.promise }
        return { reply_text: context.bounded!.exchanges.length ? 'Bạn xem các lựa chọn đã kiểm tra nhé.' : '', tool_calls: [], tokens_used: usage }
      } }), onSafeText: () => fixture.events.push('turn_emitted'),
    })
    await entered.promise
    const forgetting = repository(fixture).forgetAll()
    await Promise.resolve()
    expect(fixture.events).not.toContain('forget')
    resume.resolve(); const completed = await running
    expect((await forgetting).ok).toBe(true)
    expect(fixture.events.indexOf('turn_emitted')).toBeLessThan(fixture.events.indexOf('forget'))
    const next = await runTurn(fixture.records.get(completed.session.session_id)!, 'Xem menu', { pool: fixture.pool })
    expect(next.contexts.every(context => !JSON.stringify(context).includes('Bí đỏ'))).toBe(true)
  })
  it('persists a nonfood preference only after CAS and never again on replay', async () => {
    const fixture = memoryFixture([])
    const store = productionConciergeSessionStore(fixture.pool)
    const adapter = vi.fn(async () => ({ reply_text: 'Mình sẽ áp dụng sở thích này cho bữa hiện tại.', tool_calls: [], tokens_used: usage }))
    const dependencies = { pool: fixture.pool, store, orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }
    const request = { protocol_version: 'concierge-v2' as const, request_id: crypto.randomUUID(), message: 'Tôi thích bí đỏ' }
    const response = await processConciergeTurn(request, { authenticated_user_id: userId }, dependencies)
    expect(fixture.facts()[0]).toMatchObject({ memory_key: 'bi-do', source: 'explicit' })
    const updateIndex = fixture.query.mock.calls.findIndex(([sql]) => sql.includes('UPDATE public.concierge_v2_sessions'))
    const writeIndex = fixture.query.mock.calls.findIndex(([sql]) => sql.includes('concierge_v2_write_memory_fact'))
    expect(updateIndex).toBeLessThan(writeIndex)
    const replay = await processConciergeTurn({ ...request, session: { session_id: response.session.session_id, session_capability: response.session.session_capability } },
      { authenticated_user_id: userId }, dependencies)
    expect(replay.response_id).toBe(response.response_id)
    expect(fixture.events.filter(event => event === 'write')).toHaveLength(1)
    expect(adapter).toHaveBeenCalledOnce()
    await repository(fixture).forgetAll()
    const replayAfterForget = await processConciergeTurn({ ...request, session: { session_id: response.session.session_id, session_capability: response.session.session_capability } },
      { authenticated_user_id: userId }, dependencies)
    expect(replayAfterForget.message).not.toContain('bí đỏ')
    expect(fixture.events.filter(event => event === 'write')).toHaveLength(1)
  })
  it('rejects a concurrent account turn before model execution instead of queueing beyond the turn budget', async () => {
    const fixture = memoryFixture([]); const entered = deferred(); const resume = deferred()
    const store = productionConciergeSessionStore(fixture.pool)
    const adapter = vi.fn(async () => { entered.resolve(); await resume.promise
      return { reply_text: 'Chào bạn, mình giúp gì cho bữa này?', tool_calls: [], tokens_used: usage } })
    const dependencies = { pool: fixture.pool, store, orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }) }
    const first = processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào' },
      { authenticated_user_id: userId }, dependencies)
    await entered.promise
    try {
      await expect(processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào' },
        { authenticated_user_id: userId }, dependencies)).rejects.toMatchObject({ detail: { code: 'STATE_CONFLICT' } })
      expect(adapter).toHaveBeenCalledOnce()
    } finally { resume.resolve(); await first }
  })
  it('reuses reset_conversation CAS/delete/create without deleting durable memory', async () => {
    const fixture = memoryFixture(); const store = productionConciergeSessionStore(fixture.pool)
    const dependencies = { pool: fixture.pool, store, orchestrator: new ConciergeLlmOrchestrator({ customAdapter: async () => ({
      reply_text: 'Chào bạn, mình giúp gì cho bữa này?', tool_calls: [], tokens_used: usage,
    }) }) }
    const first = await processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào' },
      { authenticated_user_id: userId }, dependencies)
    const reset = await processConciergeTurn({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
      session: { session_id: first.session.session_id, session_capability: first.session.session_capability },
      expected_state_version: first.session.state_version, action: { type: 'reset_conversation' } }, { authenticated_user_id: userId }, dependencies)
    expect(reset.session.session_id).not.toBe(first.session.session_id)
    expect(reset.session.state_version).toBe(1)
    expect(fixture.records.has(first.session.session_id)).toBe(false)
    expect(fixture.records.get(reset.session.session_id)?.transcript).toEqual([])
    expect(fixture.facts()).toHaveLength(1)
  })
})
