import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createConciergeV2SessionStore,
  type ConciergeV2SessionStore,
} from '../../supabase/functions/_shared/concierge/session-store.js'
import { createUpstashRedisSessionBackendFromEnvironment } from '../../supabase/functions/_shared/concierge/session-store-redis.js'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const SECOND_REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const RESPONSE_ID = '44444444-4444-4444-8444-444444444444'
const OPERATION_HASH = '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234'
const SECOND_OPERATION_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const TEST_PREFIX_PATTERN = /^concierge-v2-test:[A-Za-z0-9_-]{8,80}$/

function createInput() {
  return {
    actor: { authenticated_user_id: ACTOR_ID },
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

function createResult() {
  return {
    response_id: RESPONSE_ID,
    phase: 'DISCOVERY' as const,
    message: 'Đã cập nhật phiên tạm thời.',
    cards: [],
    warnings: [],
  }
}

describe('Concierge V2 shared Redis session-store integration', () => {
  const environment = process.env
  const testPrefix = environment.CONCIERGE_REDIS_TEST_PREFIX
  const enabled = environment.CONCIERGE_REDIS_TESTS === '1' && testPrefix !== undefined && TEST_PREFIX_PATTERN.test(testPrefix)
  const run = enabled ? it : it.skip
  const backend = enabled ? createUpstashRedisSessionBackendFromEnvironment(environment, testPrefix) : null
  const createdReferences: Array<{ session_id: string; session_capability: string }> = []
  let firstStore: ConciergeV2SessionStore
  let secondStore: ConciergeV2SessionStore

  beforeAll(() => {
    if (!enabled || !backend || !testPrefix) {
      return
    }

    firstStore = createConciergeV2SessionStore({ backend })
    secondStore = createConciergeV2SessionStore({ backend })
  })

  afterAll(async () => {
    if (!enabled || !backend || !testPrefix) {
      return
    }

    await Promise.all(createdReferences.map((reference) => backend.delete(reference.session_id)))
  })

  run('shares state across clients and atomically handles conflicts, retries, and owned deletion', async () => {
    const created = await firstStore.create(createInput())

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    createdReferences.push(created.reference)
    const read = await secondStore.read(created.reference, { authenticated_user_id: ACTOR_ID })
    const mutation = {
      reference: created.reference,
      actor: { authenticated_user_id: ACTOR_ID },
      expected_state_version: 1,
      request_id: REQUEST_ID,
      operation_hash: OPERATION_HASH,
      next: {
        transcript: [{ role: 'user' as const, content: 'Gợi ý món nhẹ.' }],
        summary: '',
        constraints: createInput().constraints,
        draft: null,
        pending_suggestion_ids: [],
      },
      result: createResult(),
    }
    const [first, second] = await Promise.all([
      firstStore.compareAndSwap(mutation),
      secondStore.compareAndSwap({ ...mutation, request_id: SECOND_REQUEST_ID, operation_hash: SECOND_OPERATION_HASH }),
    ])
    const winner = first.ok ? first : second
    const replay = await secondStore.compareAndSwap(mutation)
    const deleted = await firstStore.delete(created.reference, { authenticated_user_id: ACTOR_ID })
    const afterDelete = await secondStore.read(created.reference, { authenticated_user_id: ACTOR_ID })

    expect(read.ok).toBe(true)
    expect([first, second].filter((result) => result.ok)).toHaveLength(1)
    expect([first, second].filter((result) => !result.ok)).toMatchObject([{ error: { code: 'STATE_CONFLICT' } }])
    expect(winner).toMatchObject({ ok: true, replay: false })
    expect(replay).toMatchObject({ ok: true, replay: true, result: createResult() })
    expect(deleted).toEqual({ ok: true, deleted: true })
    expect(afterDelete).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  })
})
