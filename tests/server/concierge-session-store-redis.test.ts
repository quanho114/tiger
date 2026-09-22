import { describe, expect, it } from 'vitest'
import {
  createConciergeV2SessionStore,
  type ConciergeV2Clock,
} from '../../supabase/functions/_shared/concierge/session-store.js'
import {
  createUpstashRedisSessionBackendFromEnvironment,
  UpstashRedisSessionBackend,
} from '../../supabase/functions/_shared/concierge/session-store-redis.js'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const RESPONSE_ID = '33333333-3333-4333-8333-333333333333'
const OPERATION_HASH = '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234'

class FakeClock implements ConciergeV2Clock {
  private value = Date.parse('2026-09-22T12:00:00.000Z')

  now(): Date {
    return new Date(this.value)
  }

  advance(milliseconds: number): void {
    this.value += milliseconds
  }
}

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

function commandFrom(init: RequestInit | undefined): string[] {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body')
  }

  const parsed: unknown = JSON.parse(init.body)
  if (!Array.isArray(parsed) || !Array.isArray(parsed[0]) || !parsed[0].every((item) => typeof item === 'string')) {
    throw new Error('Expected one Redis command')
  }

  return parsed[0]
}

describe('Concierge V2 Upstash Redis session backend', () => {
  it('requires an explicit HTTPS shared-store configuration without exposing values', () => {
    expect(createUpstashRedisSessionBackendFromEnvironment({ CONCIERGE_SESSION_STORE: 'upstash' })).toBeNull()
    expect(
      createUpstashRedisSessionBackendFromEnvironment({
        CONCIERGE_SESSION_STORE: 'upstash',
        CONCIERGE_REDIS_REST_URL: 'http://redis.example.test',
        CONCIERGE_REDIS_REST_TOKEN: 'fake-test-token',
        CONCIERGE_REDIS_KEY_PREFIX: 'test',
      })
    ).toBeNull()
    expect(() => new UpstashRedisSessionBackend({ restUrl: 'http://redis.example.test', restToken: 'fake-test-token', keyPrefix: 'test' })).toThrow(
      'Invalid shared session store configuration'
    )
  })

  it('uses an atomic Redis script, fixed absolute TTL, and server-side idle-expiry cap', async () => {
    const commands: string[][] = []
    let storedRecord: Record<string, unknown> | null = null
    const fetcher: typeof fetch = async (_input, init) => {
      const command = commandFrom(init)
      commands.push(command)

      if (command[1].includes("redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')")) {
        storedRecord = JSON.parse(command[4]) as Record<string, unknown>
        return new Response(JSON.stringify([{ result: 1 }]), { status: 200 })
      }

      if (storedRecord === null) {
        throw new Error('Mutation before create')
      }

      const next = JSON.parse(command[10]) as Record<string, unknown>
      const result = JSON.parse(command[12]) as Record<string, unknown>
      storedRecord = {
        ...storedRecord,
        ...next,
        state_version: 2,
        idle_expires_at: storedRecord.absolute_expires_at,
        idempotency: [
          {
            request_id: command[8],
            operation_hash: command[9],
            result,
          },
        ],
      }
      return new Response(
        JSON.stringify([
          {
            result: JSON.stringify({
              status: 'ok',
              replay: false,
              record: storedRecord,
              result,
            }),
          },
        ]),
        { status: 200 }
      )
    }
    const clock = new FakeClock()
    const backend = new UpstashRedisSessionBackend({
      restUrl: 'https://redis.example.test/',
      restToken: 'fake-test-token',
      keyPrefix: 'isolated-v02',
      fetch: fetcher,
    })
    const store = createConciergeV2SessionStore({ backend, clock })
    const created = await store.create(createInput())

    if (!created.ok) {
      throw new Error(created.error.code)
    }

    clock.advance(3 * 60 * 60 * 1000 + 30 * 60 * 1000)
    const mutation = await store.compareAndSwap({
      reference: created.reference,
      actor: { authenticated_user_id: ACTOR_ID },
      expected_state_version: 1,
      request_id: REQUEST_ID,
      operation_hash: OPERATION_HASH,
      next: {
        transcript: [],
        summary: '',
        constraints: createInput().constraints,
        draft: null,
        pending_suggestion_ids: [],
      },
      result: createResult(),
    })

    expect(mutation).toMatchObject({ ok: true, replay: false, record: { idle_expires_at: '2026-09-22T16:00:00.000Z' } })
    expect(commands).toHaveLength(2)
    expect(commands[0][5]).toBe(String(4 * 60 * 60 * 1000))
    expect(commands[1][1]).toContain('record.idle_expires_at = record.absolute_expires_at')
    expect(commands[1][11]).toBe('2026-09-22T16:15:00.000Z')
  })

  it('maps an Upstash pipeline failure to a safe unavailable result', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify([{ error: 'token rejected' }]), { status: 200 })
    const store = createConciergeV2SessionStore({
      backend: new UpstashRedisSessionBackend({
        restUrl: 'https://redis.example.test',
        restToken: 'fake-test-token',
        keyPrefix: 'isolated-v02',
        fetch: fetcher,
      }),
    })

    const created = await store.create(createInput())

    expect(created).toMatchObject({ ok: false, error: { code: 'DEPENDENCY_UNAVAILABLE', retryable: true } })
  })
})
