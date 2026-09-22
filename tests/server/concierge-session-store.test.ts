import { describe, expect, it } from 'vitest'
import {
  InMemoryConciergeV2SessionBackend,
  createConciergeV2SessionStore,
  createConciergeV2UnavailableSessionStore,
} from '../../supabase/functions/_shared/concierge/session-store.js'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const RESULT_ID = '44444444-4444-4444-8444-444444444444'
const OPERATION_HASH = '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234'
const SECOND_OPERATION_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

class FakeClock {
  private value = Date.parse('2026-09-22T12:00:00.000Z')

  now(): Date {
    return new Date(this.value)
  }

  advance(milliseconds: number): void {
    this.value += milliseconds
  }
}

function createInput(actorId: string | null = null) {
  return {
    actor: { authenticated_user_id: actorId },
    transcript: [],
    summary: '',
    constraints: {
      adults: 2,
      children: 0,
      appetite: 'normal' as const,
      is_hard_budget: false,
      preferences: [],
      dislikes: [],
      allergies: [],
    },
    draft: null,
    pending_suggestion_ids: [],
  }
}

function createMutableState() {
  const input = createInput()

  return {
    transcript: input.transcript,
    summary: input.summary,
    constraints: input.constraints,
    draft: input.draft,
    pending_suggestion_ids: input.pending_suggestion_ids,
  }
}

function createResult() {
  return {
    response_id: RESULT_ID,
    phase: 'DISCOVERY' as const,
    message: 'Đã cập nhật phiên tạm thời.',
    cards: [],
    warnings: [],
  }
}

async function createSession(actorId: string | null = null) {
  const clock = new FakeClock()
  const backend = new InMemoryConciergeV2SessionBackend(clock)
  const store = createConciergeV2SessionStore({ backend, clock })
  const created = await store.create(createInput(actorId))

  if (!created.ok) {
    throw new Error(created.error.code)
  }

  return { backend, clock, created, store }
}

describe('Concierge V2 ephemeral session store', () => {
  it('creates an opaque capability while persisting only its hash', async () => {
    const { backend, created } = await createSession()

    expect(created.reference.session_capability).toMatch(/^csc_[A-Za-z0-9_-]{24,256}$/)
    expect(created.record.capability_hash).not.toContain(created.reference.session_capability)
    expect(await backend.getRaw(created.reference.session_id)).not.toContain(created.reference.session_capability)
  })

  it('shares an actor-bound session across independent store instances', async () => {
    const clock = new FakeClock()
    const backend = new InMemoryConciergeV2SessionBackend(clock)
    const firstStore = createConciergeV2SessionStore({ backend, clock })
    const secondStore = createConciergeV2SessionStore({ backend, clock })
    const created = await firstStore.create(createInput(ACTOR_ID))

    if (!created.ok) {
      throw new Error(created.error.code)
    }

    const read = await secondStore.read(created.reference, { authenticated_user_id: ACTOR_ID })
    const denied = await secondStore.read(created.reference, { authenticated_user_id: null })

    expect(read.ok).toBe(true)
    expect(denied).toMatchObject({ ok: false, error: { code: 'OWNERSHIP_MISMATCH' } })
  })

  it('enforces idle expiry without reviving expired records', async () => {
    const { clock, created, store } = await createSession()

    clock.advance(45 * 60 * 1000 + 1)
    const expired = await store.read(created.reference, { authenticated_user_id: null })
    const mutation = await store.compareAndSwap({
      reference: created.reference,
      actor: { authenticated_user_id: null },
      expected_state_version: 1,
      request_id: REQUEST_ID,
      operation_hash: OPERATION_HASH,
      next: createMutableState(),
      result: createResult(),
    })

    expect(expired).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
    expect(mutation).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('commits one matching mutation and rejects a stale concurrent version', async () => {
    const { created, store } = await createSession()
    const mutation = {
      reference: created.reference,
      actor: { authenticated_user_id: null },
      expected_state_version: 1,
      request_id: REQUEST_ID,
      operation_hash: OPERATION_HASH,
      next: {
        ...createMutableState(),
        transcript: [{ role: 'user' as const, content: 'Gợi ý món nhẹ.' }],
      },
      result: createResult(),
    }

    const [first, second] = await Promise.all([
      store.compareAndSwap(mutation),
      store.compareAndSwap({ ...mutation, request_id: SECOND_REQUEST_ID, operation_hash: SECOND_OPERATION_HASH }),
    ])

    expect([first, second].filter((result) => result.ok)).toHaveLength(1)
    expect([first, second].filter((result) => !result.ok)).toMatchObject([
      { error: { code: 'STATE_CONFLICT' } },
    ])
  })

  it('replays a response-loss retry and rejects a request ID reused for another operation', async () => {
    const { created, store } = await createSession()
    const mutation = {
      reference: created.reference,
      actor: { authenticated_user_id: null },
      expected_state_version: 1,
      request_id: REQUEST_ID,
      operation_hash: OPERATION_HASH,
      next: createMutableState(),
      result: createResult(),
    }

    const committed = await store.compareAndSwap(mutation)
    const replayed = await store.compareAndSwap(mutation)
    const mismatch = await store.compareAndSwap({ ...mutation, operation_hash: SECOND_OPERATION_HASH })

    expect(committed).toMatchObject({ ok: true, replay: false })
    expect(replayed).toMatchObject({ ok: true, replay: true, result: createResult() })
    expect(mismatch).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_MISMATCH' } })
  })

  it('deletes only an owned session', async () => {
    const { created, store } = await createSession(ACTOR_ID)

    const denied = await store.delete(created.reference, { authenticated_user_id: null })
    const deleted = await store.delete(created.reference, { authenticated_user_id: ACTOR_ID })
    const afterDelete = await store.read(created.reference, { authenticated_user_id: ACTOR_ID })

    expect(denied).toMatchObject({ ok: false, error: { code: 'OWNERSHIP_MISMATCH' } })
    expect(deleted).toEqual({ ok: true, deleted: true })
    expect(afterDelete).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })

  it('returns a safe unavailable error when production storage is not configured', async () => {
    const store = createConciergeV2UnavailableSessionStore()
    const response = await store.create(createInput())

    expect(response).toMatchObject({ ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true } })
  })
})
