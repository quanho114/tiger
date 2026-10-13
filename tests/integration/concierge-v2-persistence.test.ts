import { readFile } from 'node:fs/promises'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import { ConciergeV2CompletionPayloadSchema } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'
import { createConciergeV2SessionStore, createConciergeV2UnavailableSessionStore } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { ensureConciergePostgresSessionTable } from '../fixtures/concierge-postgres.ts'
import { PostgresConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store-postgres.ts'
import { FIXTURE_USERS, getUserToken, seedFixtureUsers } from '../fixtures/auth-users.ts'

describe('V03 real PostgreSQL request path', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  const backend = new PostgresConciergeV2SessionBackend(pool)
  const store = createConciergeV2SessionStore({ backend })
  const ids: string[] = []
  const orchestrator = new ConciergeLlmOrchestrator({ customAdapter: async (message, _history, context) => {
    const bounded = context.bounded!
    if (bounded.exchanges.length) {
      const exchange = bounded.exchanges[0]
      const value = exchange.result as { status?: string; candidates?: unknown[] }
      const reply_text = value.status === 'unknown' || value.status === 'unavailable' || value.candidates?.length === 0
        ? 'Mình chưa tìm thấy thông tin phù hợp trong dữ liệu đã kiểm tra.'
        : exchange.name === 'lookup_restaurant_info'
          ? 'Mình đã kiểm tra thông tin nhà hàng hiện có. Bạn xem phần chi tiết bên dưới nhé.'
          : 'Mình đã tìm các món phù hợp; lựa chọn nằm trong thẻ thực đơn bên dưới.'
      return { reply_text, tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    }
    const tool = bounded.tools.some(value => value.name === 'lookup_restaurant_info')
      ? 'lookup_restaurant_info' : /mâm|nhóm|\d+ người/i.test(message) ? 'recommend_meal' : 'search_menu_items'
    const args = tool === 'lookup_restaurant_info' ? { query: message }
      : tool === 'search_menu_items' ? { query: message, limit: 4 } : {}
    return { reply_text: '', tool_calls: [{ id: crypto.randomUUID(), name: tool, arguments: args }],
      tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
  } })
  beforeAll(async () => {
    await ensureConciergePostgresSessionTable(pool)
    await seedFixtureUsers(pool)
    const schema = await pool.query("SELECT to_regclass('public.concierge_feedback_aggregates') AS name")
    if (!schema.rows[0].name) await pool.query(await readFile('supabase/migrations/20260922000002_concierge_feedback_aggregates.sql', 'utf8'))
  })
  beforeEach(() => setConciergeFeatureFlagsForTesting({}))
  afterAll(async () => {
    setConciergeFeatureFlagsForTesting(null)
    for (const id of ids) await backend.delete(id)
    await pool.end()
  })
  async function counts() {
    const result = await pool.query(`SELECT
      (SELECT count(*) FROM public.concierge_conversations) AS conversations,
      (SELECT count(*) FROM public.concierge_proposals) AS proposals,
      (SELECT count(*) FROM public.concierge_events) AS events,
      (SELECT count(*) FROM public.user_ai_memories) AS memories,
      (SELECT count(*) FROM public.orders) AS orders,
      (SELECT count(*) FROM public.reservations) AS reservations`)
    return result.rows[0]
  }
  async function send(body: object, token?: string, path = 'chat', sse = false, unavailable = false) {
    const response = await handlePublicApi(new Request(`http://localhost/public-api/concierge/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(sse ? { Accept: 'text/event-stream' } : {}) }, body: JSON.stringify(body),
    }), { pool, orchestrator, conciergeSessionStore: unavailable ? createConciergeV2UnavailableSessionStore() : store })
    const raw = await response.text()
    const completed = sse && response.ok ? raw.split('\n\n').find(block => block.startsWith('event: complete\n')) : null
    const data = JSON.parse(completed ? completed.slice(completed.indexOf('data: ') + 6).trim() : raw)
    if (data.session) ids.push(data.session.session_id)
    return { response, data }
  }
  const turn = (message = 'Xem món ăn') => ({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message })

  it.each([undefined, 'customerA' as const])('writes zero transcript/proposal/event rows for %s across requests', async identity => {
    const before = await counts()
    const token = identity ? getUserToken(identity) : undefined
    const first = await send(turn(), token)
    expect(first.response.status).toBe(200)
    ConciergeV2CompletionPayloadSchema.parse(first.data)
    expect(first.data.cards.length).toBeGreaterThan(0)
    const second = await send({ ...turn('Giờ mở cửa'), session: {
      session_id: first.data.session.session_id, session_capability: first.data.session.session_capability,
    }, expected_state_version: first.data.session.state_version }, token, 'chat', true)
    expect(second.response.status).toBe(200)
    ConciergeV2CompletionPayloadSchema.parse(second.data)
    expect(await counts()).toEqual(before)
    const read = await store.read({ session_id: first.data.session.session_id, session_capability: first.data.session.session_capability },
      { authenticated_user_id: identity ? FIXTURE_USERS[identity].id : null })
    expect(read).toMatchObject({ ok: true, record: { transcript: expect.any(Array), pending_suggestion_ids: expect.any(Array) } })
    if (read.ok) expect(read.record.transcript).toHaveLength(4)
  })

  it('rejects every request using the retired chat contract', async () => {
    const before = await counts()
    for (const path of ['chat', 'action', 'feedback']) {
      const result = await send({ message: 'legacy', action: { type: 'confirm_quote' } }, undefined, path)
      expect(result.response.status).toBe(409)
      expect(result.data.error.code).toBe('REFRESH_REQUIRED')
    }
    expect(await counts()).toEqual(before)
  })

  it('returns an unavailable error when the session store is unavailable', async () => {
    const before = await counts()
    const result = await send(turn(), undefined, 'chat', false, true)
    expect(result.response.status).toBe(503)
    expect(result.data.error.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(await counts()).toEqual(before)
  })

  it('emergency stop keeps retired transcript writers closed', async () => {
    const before = await counts()
    setConciergeFeatureFlagsForTesting({ concierge_disabled: true })
    expect((await send(turn())).data.error.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect((await send({ message: 'legacy' })).data.error.code).toBe('REFRESH_REQUIRED')
    expect(await counts()).toEqual(before)
  })

  it('does not expose provider failure content in responses or logs', async () => {
    const before = await counts()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn('Xin chào')),
      }), { pool, conciergeSessionStore: store, orchestrator: new ConciergeLlmOrchestrator({
        customAdapter: async () => { throw new Error('private-provider-content') },
      }) })
      expect(response.status).toBe(500)
      expect(await response.text()).not.toContain('private-provider-content')
      expect(logged).not.toHaveBeenCalled()
      expect(await counts()).toEqual(before)
    } finally { logged.mockRestore() }
  })

  it('invalidates the previous capability on reset', async () => {
    const initial = await send(turn('Giờ mở cửa'))
    const session = { session_id: initial.data.session.session_id, session_capability: initial.data.session.session_capability }
    const faq = await send({ ...turn('Giờ mở cửa'), session, expected_state_version: initial.data.session.state_version })
    expect(faq.response.status).toBe(200)
    const reset = await send({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: faq.data.session.state_version, action: { type: 'reset_conversation' } }, undefined, 'action')
    expect(reset.response.status).toBe(200)
    expect(reset.data.session.session_id).not.toBe(session.session_id)
    expect(reset.data.session.session_capability).not.toBe(session.session_capability)
    expect(await store.read(session, { authenticated_user_id: null })).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('validates feedback against ephemeral proposals instead of a SQL archive', async () => {
    const first = await send(turn())
    const session = { session_id: first.data.session.session_id, session_capability: first.data.session.session_capability }
    const suggestion = first.data.cards.find((card: { type: string }) => card.type === 'draft_suggestion')
    const proposal = { id: suggestion.suggestion_id, version: first.data.session.state_version }
    const before = await counts()
    const storedBefore = await pool.query('SELECT count(*) FROM public.concierge_feedback')
    const countBefore = await pool.query("SELECT coalesce(sum(count), 0) AS count FROM public.concierge_feedback_aggregates WHERE day = CURRENT_DATE AND rating = 'perfect'")
    const body = { protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: first.data.session.state_version,
      action: { type: 'feedback_proposal', proposal_id: proposal.id, proposal_version: proposal.version, rating: 'perfect' },
    }
    const feedback = await Promise.all([send(body, undefined, 'feedback'), send(body, undefined, 'feedback')])
    expect(feedback.map(r => r.response.status)).toEqual([200, 200])
    expect(feedback[0].data.response_id).toBe(feedback[1].data.response_id)
    const countAfter = await pool.query("SELECT coalesce(sum(count), 0) AS count FROM public.concierge_feedback_aggregates WHERE day = CURRENT_DATE AND rating = 'perfect'")
    expect(Number(countAfter.rows[0].count) - Number(countBefore.rows[0].count)).toBe(1)
    expect((await pool.query('SELECT count(*) FROM public.concierge_feedback')).rows).toEqual(storedBefore.rows)
    expect(await counts()).toEqual(before)
  })

  it('honors the single SQL kill switch without a test override', async () => {
    const client = await pool.connect()
    setConciergeFeatureFlagsForTesting(null)
    try {
      await client.query('BEGIN')
      await client.query(`INSERT INTO public.system_settings (key, value) VALUES ('concierge_disabled', 'true')
        ON CONFLICT (key) DO UPDATE SET value = 'true'`)
      const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Legacy client' }),
      }), { pool: client as unknown as pg.Pool, conciergeSessionStore: store, orchestrator })
      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('REFRESH_REQUIRED')
      const stopped = await handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn()),
      }), { pool: client as unknown as pg.Pool, conciergeSessionStore: store, orchestrator })
      expect(stopped.status).toBe(503)
    } finally { await client.query('ROLLBACK'); client.release() }
  })

  it('enforces actor binding, CAS and response-loss idempotency', async () => {
    const first = await send(turn('Giờ mở cửa'))
    const session = { session_id: first.data.session.session_id, session_capability: first.data.session.session_capability }
    const body = { ...turn('Giờ mở cửa'), session, expected_state_version: first.data.session.state_version }
    const otherActor = await send(body, getUserToken('customerA'))
    expect(otherActor.response.status).toBe(403)
    const outcomes = await Promise.all([send(body), send({ ...body, request_id: crypto.randomUUID() })])
    expect(outcomes.map(r => r.response.status).sort()).toEqual([200, 409])
    // Replay the actual winner, independent of scheduling.
    const winner = outcomes.find(r => r.response.ok)!
    const replay = await send({ ...body, request_id: winner.data.request_id })
    expect(replay.response.status).toBe(200)
    expect(replay.data).toEqual(winner.data)
    const mismatch = await send({ ...body, request_id: winner.data.request_id, message: 'Different message' })
    expect(mismatch.data.error.code).toBe('IDEMPOTENCY_MISMATCH')
  })

  async function selectedDraft() {
    const first = await send(turn())
    const delivery = await pool.query('SELECT id FROM public.menu_items WHERE allow_delivery = true')
    const suggestion = first.data.cards.find((c: { type: string; item: { id: string } }) => c.type === 'draft_suggestion' && delivery.rows.some(row => row.id === c.item.id))
    expect(suggestion).toBeDefined()
    const session = { session_id: first.data.session.session_id, session_capability: first.data.session.session_capability }
    const selected = await send({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: first.data.session.state_version, draft_operation: { type: 'add_item',
        pending_suggestion_id: suggestion.suggestion_id, menu_item_id: suggestion.item.id, quantity: 2, note: 'Ít cay' } }, undefined, 'action')
    expect(selected.response.status).toBe(200)
    expect(selected.data.handoff).toBeUndefined()
    const reviewed = await send({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: selected.data.session.state_version, action: { type: 'review_draft' } }, undefined, 'action')
    expect(reviewed.data.draft.review_state).toBe('ready_for_review')
    return { session, reviewed, suggestion }
  }

  it('hands off only a reviewed draft, replays once and fences concurrent additions', async () => {
    const before = await counts()
    const { session, reviewed, suggestion } = await selectedDraft()
    const body = { protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: reviewed.data.session.state_version,
      action: { type: 'handoff_draft', draft_id: reviewed.data.draft.draft_id, draft_version: reviewed.data.draft.version, order_mode: 'delivery' } }
    expect((await send(body, getUserToken('customerA'), 'action')).response.status).toBe(403)
    const results = await Promise.all([send(body, undefined, 'action'), send({ ...body, request_id: crypto.randomUUID() }, undefined, 'action')])
    expect(results.map(r => r.response.status).sort()).toEqual([200, 409])
    const winner = results.find(r => r.response.ok)!
    expect(winner.data.phase).toBe('HANDOFF_TO_CART')
    expect(winner.data.handoff.lines).toMatchObject([{ menu_item_id: suggestion.item.id, quantity: 2, note: 'Ít cay', price_vnd: suggestion.item.price_vnd }])
    expect((await send({ ...body, request_id: winner.data.request_id }, undefined, 'action')).data).toEqual(winner.data)
    const duplicate = await send({ ...body, request_id: crypto.randomUUID(), expected_state_version: winner.data.session.state_version }, undefined, 'action')
    expect(duplicate.data.handoff.handoff_id).toBe(winner.data.handoff.handoff_id)
    expect(duplicate.data.handoff.replay).toBe(true)
    expect(await counts()).toEqual(before)
  })

  it('validates clarification and rejects foreign proposals and transactional actions through HTTP', async () => {
    const first = await send(turn())
    const session = { session_id: first.data.session.session_id, session_capability: first.data.session.session_capability }
    const base = { protocol_version: 'concierge-v2', session, expected_state_version: first.data.session.state_version }
    for (const action of [
      { type: 'answer_clarification', choice_field: 'guests', choice_value: '999' },
      { type: 'answer_clarification', choice_field: 'unknown', choice_value: '4' },
      { type: 'confirm_quote', quote_token: 'untrusted' },
      { type: 'confirm_reservation', hold_token: 'untrusted' },
    ]) {
      const invalid = await send({ ...base, request_id: crypto.randomUUID(), action }, undefined, 'action')
      expect(invalid.response.status).toBe(400)
    }
    const retired = await send({ ...base, request_id: crypto.randomUUID(), action: {
      type: 'add_proposal_to_cart', proposal_id: 'foreign-proposal',
    } }, undefined, 'action')
    expect(retired.response.status).toBe(400)
    expect(retired.data.error.code).toBe('UNSUPPORTED_VERSION')
    const clarified = await send({ ...base, request_id: crypto.randomUUID(), action: {
      type: 'answer_clarification', choice_field: 'guests', choice_value: '4',
    } }, undefined, 'action')
    expect(clarified.response.status).toBe(200)
    expect(await store.read(session, { authenticated_user_id: null })).toMatchObject({ ok: true, record: { constraints: { adults: 4 } } })
  })

  it.each(['expired', 'unavailable', 'price_changed', 'allergy'] as const)('revalidates %s draft before returning cart lines', async scenario => {
    const { session, reviewed } = await selectedDraft()
    const actor = { authenticated_user_id: null }
    const loaded = await store.read(session, actor)
    if (!loaded.ok) throw new Error(loaded.error.code)
    const { recordMutable } = await import('../../supabase/functions/_shared/concierge/orchestrator.ts')
    const next = recordMutable(loaded.record)
    if (scenario === 'unavailable') next.draft!.items[0].menu_item_id = crypto.randomUUID()
    if (scenario === 'price_changed') next.draft!.items[0].unit_price_vnd += 1000
    if (scenario === 'allergy') next.constraints.allergies = ['unverified-allergen']
    const seeded = await store.compareAndSwap({ reference: session, actor, expected_state_version: loaded.record.state_version,
      request_id: crypto.randomUUID(), operation_hash: 'b'.repeat(64), next,
      result: { response_id: crypto.randomUUID(), phase: 'REVIEWING', message: '', cards: [], warnings: [] } })
    expect(seeded.ok).toBe(true)
    const body = { protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
      expected_state_version: loaded.record.state_version + 1, action: { type: 'handoff_draft',
        draft_id: scenario === 'expired' ? crypto.randomUUID() : next.draft!.draft_id,
        draft_version: next.draft!.version, order_mode: 'delivery' } }
    const rejected = await send(body, undefined, 'action')
    expect(rejected.response.status).toBe(scenario === 'expired' ? 409 : 200)
    expect(rejected.data.handoff).toBeUndefined()
    if (scenario === 'expired') expect(rejected.data.error.code).toBe('INVALID_HANDOFF')
    else expect(rejected.data.draft.blocked_items).toHaveLength(1)
    if (scenario === 'price_changed') {
      const review = await send({ ...body, expected_state_version: rejected.data.session.state_version, request_id: crypto.randomUUID(), action: { type: 'review_draft' } }, undefined, 'action')
      expect(review.data.draft.items).toHaveLength(reviewed.data.draft.items.length)
      expect(review.data.draft.blocked_items[0].reason).toBe('PRICE_CHANGED')
      const accepted = await send({ ...body, request_id: crypto.randomUUID(), expected_state_version: review.data.session.state_version,
        action: { type: 'accept_prices', draft_version: review.data.draft.version } }, undefined, 'action')
      expect(accepted.data.draft.review_state).toBe('ready_for_review')
      expect(accepted.data.handoff).toBeUndefined()
    }
  })

  it.each([
    ['prepare_reservation_summary', 'reservations'], ['create_order_quote', 'cart'], ['get_customer_context', 'orders'],
  ] as const)('ignores injected transactional tool %s on menu turns without writing orders or bookings', async (tool, destination) => {
    const before = await counts()
    const injected = new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, context) => {
      if (context.bounded?.exchanges.length) return { reply_text: 'Mình đã kiểm tra thực đơn hiện tại. Bạn xem các món trong thẻ bên dưới nhé.',
        tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
      return { reply_text: '', tool_calls: [{ id: crypto.randomUUID(), name: tool,
        arguments: tool === 'get_customer_context' ? { customer_user_id: FIXTURE_USERS.customerA.id } : {} }],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    } })
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(turn()),
    }), { pool, conciergeSessionStore: store, orchestrator: injected })
    expect(response.status).toBe(200)
    const result = await response.json()
    ids.push(result.session.session_id)
    expect(result.cards).not.toContainEqual({ type: 'service_link', destination })
    expect(result.cards.some((card: { type: string }) => card.type === 'draft_suggestion')).toBe(true)
    expect(result.cards.some((card: { type: string }) => ['order_quote', 'reservation_summary'].includes(card.type))).toBe(false)
    expect(await counts()).toEqual(before)
  })

})
