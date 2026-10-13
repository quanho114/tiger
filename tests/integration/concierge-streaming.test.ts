import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import pg from 'pg'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { createConciergeV2SessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { readConciergeStream } from '../../src/features/concierge/stream.ts'
import { emptyConciergeSession, processConciergeTurn } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionReference, ConciergeV2SessionStore, ConciergeV2TurnRequest } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
const backend = new PostgresConciergeV2SessionBackend(pool)
const store = createConciergeV2SessionStore({ backend })
const ids = new Set<string>()
const actor = { authenticated_user_id: null }
const adapter = vi.fn(async () => ({ reply_text: 'Chào bạn, mình có thể giúp chọn món. Bạn muốn ăn gì?', tool_calls: [],
  tokens_used: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }))
beforeAll(async () => { await ensureConciergePostgresSessionTable(pool); setConciergeFeatureFlagsForTesting({}) })
afterEach(() => { adapter.mockClear() })
afterAll(async () => {
  setConciergeFeatureFlagsForTesting(null)
  for (const id of ids) await backend.delete(id)
  await pool.end()
})
function request(extra: Partial<ConciergeV2TurnRequest> = {}): ConciergeV2TurnRequest {
  return { protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào', ...extra }
}
function send(body: ConciergeV2TurnRequest, customStore = store, llm = new ConciergeLlmOrchestrator({ customAdapter: adapter })) {
  return handlePublicApi(new Request(`http://localhost/public-api/concierge/${body.message ? 'chat' : 'action'}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-Concierge-Stream-Version': '2' },
    body: JSON.stringify(body) }), { pool, conciergeSessionStore: customStore, orchestrator: llm })
}
function ready(reference: ConciergeV2SessionReference) { ids.add(reference.session_id) }

it('uses the real request path and publishes only a committed completion', async () => {
  const body = request()
  const response = await send(body)
  let reference!: ConciergeV2SessionReference
  const text = vi.fn()
  const completion = await readConciergeStream(response, vi.fn(), text, body.request_id, value => { reference = value; ready(value) })
  const stored = await store.read(reference, actor)
  expect(stored).toMatchObject({ ok: true, record: { state_version: completion.session.state_version,
    idempotency: [{ request_id: body.request_id }] } })
  expect(text).toHaveBeenCalled()
  expect(text.mock.calls.at(-1)?.[0]).toBe(completion.message)
  expect(adapter).toHaveBeenCalledOnce()
})

it('replays a lost first-turn response using the receipt without calling the model again', async () => {
  const body = request()
  const response = await send(body)
  const lostWire = await response.text()
  const start = JSON.parse(lostWire.split('\n\n')[0].split('data: ')[1])
  const reference = start.data.session
  ready(reference)
  const recoveredResponse = await send({ ...body, resume_session: reference, recover_only: true })
  const completion = await readConciergeStream(recoveredResponse, vi.fn(), undefined, body.request_id)
  expect(completion.message).toContain('Chào bạn')
  expect(completion.session.state_version).toBe(2)
  expect(adapter).toHaveBeenCalledOnce()
  const record = await store.read(reference, actor)
  expect(record).toMatchObject({ ok: true, record: { transcript: expect.arrayContaining([
    { role: 'user', content: 'Xin chào' },
  ]) } })
  if (record.ok) expect(record.record.transcript.filter(entry => entry.role === 'user')).toHaveLength(1)
})

it('never exposes text/cards when CAS rejects the turn', async () => {
  const brokenStore = new Proxy(store, { get(target, property) {
    if (property === 'compareAndSwap') return async () => ({ ok: false, error: { code: 'STATE_CONFLICT', message: 'Phiên đã thay đổi.' } })
    const value = Reflect.get(target, property)
    return typeof value === 'function' ? value.bind(target) : value
  } }) as ConciergeV2SessionStore
  const wire = await (await send(request(), brokenStore)).text()
  expect(wire).toContain('STATE_CONFLICT')
  expect(wire).not.toContain('event: text_delta')
  expect(wire).not.toContain('event: card')
  expect(wire).not.toContain('event: complete')
})

it('read-only recovery of an unfinished request cannot execute it', async () => {
  const created = await store.create({ ...emptyConciergeSession(), actor })
  expect(created.ok).toBe(true)
  if (!created.ok) return
  ready(created.reference)
  const body = request({ resume_session: created.reference, recover_only: true })
  await expect(readConciergeStream(await send(body), vi.fn(), undefined, body.request_id))
    .rejects.toMatchObject({ code: 'TURN_CANCELLED' })
  expect(adapter).not.toHaveBeenCalled()
  expect(await store.read(created.reference, actor)).toMatchObject({ ok: true, record: { state_version: 1, transcript: [] } })
})

it('rejects first-turn replay when page context or operation changes', async () => {
  const body = request({ page_context: { page: 'home' } })
  let reference!: ConciergeV2SessionReference
  await readConciergeStream(await send(body), vi.fn(), undefined, body.request_id, value => { reference = value; ready(value) })
  const response = await send({ ...body, page_context: { page: 'menu' }, resume_session: reference })
  await expect(readConciergeStream(response, vi.fn())).rejects.toMatchObject({ code: 'IDEMPOTENCY_MISMATCH' })
  expect(adapter).toHaveBeenCalledOnce()
})

it('cancels an in-flight model turn without committing transcript or draft', async () => {
  let signal!: AbortSignal
  let finished!: () => void
  const done = new Promise<void>(resolve => { finished = resolve })
  const llm = new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, context) => {
    signal = context.signal as AbortSignal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError')); finished()
    }, { once: true }))
  } })
  const body = request()
  const response = await send(body, store, llm)
  const reader = response.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  const reference = JSON.parse(first.split('data: ')[1]).data.session
  ready(reference)
  await vi.waitFor(() => expect(signal).toBeDefined())
  await reader.cancel()
  await done
  await vi.waitFor(async () => {
    const record = await store.read(reference, actor)
    expect(record).toMatchObject({ ok: true, record: { state_version: 1, draft: null, transcript: [], idempotency: [] } })
  })
})

it('streams deterministic meal plans and accepts them through the existing guarded draft flow', async () => {
  const body = request({ message: '4 người tối đa 800k' })
  const completion = await readConciergeStream(await send(body), vi.fn(), undefined, body.request_id, ready)
  expect(adapter).toHaveBeenCalledTimes(2)
  const plan = completion.cards.find(card => card.type === 'meal_plan')
  expect(plan).toBeDefined()
  if (!plan || plan.type !== 'meal_plan') throw new Error('Expected an authoritative meal plan')
  expect(plan.subtotal_vnd).toBeLessThanOrEqual(800000)
  const accepted: ConciergeV2TurnRequest = { protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
    session: { session_id: completion.session.session_id, session_capability: completion.session.session_capability },
    expected_state_version: completion.session.state_version,
    action: { type: 'accept_meal_plan', plan_id: plan.plan_id, suggestion_ids: plan.lines.map(line => line.suggestion_id) } }
  const result = await readConciergeStream(await send(accepted), vi.fn(), undefined, accepted.request_id)
  expect(result.draft?.items.map(line => ({ id: line.menu_item_id, quantity: line.quantity })))
    .toEqual(plan.lines.map(line => ({ id: line.item.id, quantity: line.quantity })))
  expect(result.draft?.subtotal_vnd).toBe(plan.subtotal_vnd)
  expect(adapter).toHaveBeenCalledTimes(2)
  adapter.mockClear()
  const replay = await readConciergeStream(await send(accepted), vi.fn(), undefined, accepted.request_id)
  expect(replay).toEqual(result)
  expect(adapter).not.toHaveBeenCalled()
})

it('does not delete a committed first session when presentation delivery fails', async () => {
  const body = request()
  let reference!: ConciergeV2SessionReference
  await expect(processConciergeTurn(body, actor, { pool, store,
    orchestrator: new ConciergeLlmOrchestrator({ customAdapter: adapter }),
    onReady: value => { reference = value; ready(value) },
    onSafeText: () => { throw new Error('simulated downstream failure') },
  })).rejects.toMatchObject({ detail: { code: 'INTERNAL_SAFE_FAILURE' } })
  expect(await store.read(reference, actor)).toMatchObject({ ok: true, record: { state_version: 2 } })
  const recovered = await readConciergeStream(await send({ ...body, resume_session: reference, recover_only: true }), vi.fn())
  expect(recovered.session.state_version).toBe(2)
  expect(adapter).toHaveBeenCalledOnce()
})
