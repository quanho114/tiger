import { beforeEach, describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AppError } from '../../supabase/functions/_shared/errors.ts'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.ts'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import { createConciergeV2UnavailableSessionStore, createConciergeV2SessionStore,
  InMemoryConciergeV2SessionBackend } from '../../supabase/functions/_shared/concierge/session-store.ts'
import { setConciergeFeatureFlagsForTesting } from '../../supabase/functions/_shared/concierge/flags.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'

const guards = vi.hoisted(() => ({ admin: vi.fn(), public: vi.fn(), rateLimit: vi.fn() }))
vi.mock('../../supabase/functions/_shared/auth.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../supabase/functions/_shared/auth.ts')>()),
  requireAdmin: guards.admin,
  getPublicActor: guards.public,
}))
vi.mock('../../supabase/functions/_shared/rate-limit.ts', () => ({
  assertRateLimit: guards.rateLimit,
}))

const query = vi.fn()
const context = {
  pool: { query } as unknown as pg.Pool,
  supabaseAdmin: {} as SupabaseClient,
}
const request = (scope: 'admin' | 'public', route: string, method = 'GET') =>
  new Request(`http://localhost/functions/v1/${scope}-api${route}`, { method })

beforeEach(() => {
  vi.resetAllMocks()
  guards.admin.mockResolvedValue({ role: 'admin', userId: 'admin-1', displayName: 'Admin' })
  guards.public.mockResolvedValue({ role: 'guest', userId: null })
  guards.rateLimit.mockResolvedValue(undefined)
  query.mockResolvedValue({ rows: [] })
})

describe('API routing after handler extraction', () => {
  it.each(['/orders', '/tables', '/visits/123', '/reservations', '/dashboard', '/settings'])(
    'authenticates admin requests before dispatching %s',
    async (route) => {
      guards.admin.mockRejectedValue(AppError.forbidden())
      const response = await handleAdminApi(request('admin', route), context)
      expect(response.status).toBe(403)
      expect(query).not.toHaveBeenCalled()
      expect(guards.rateLimit).not.toHaveBeenCalled()
    }
  )

  it('preserves admin filtering and pagination through the orders handler', async () => {
    query.mockResolvedValueOnce({ rows: [{ total: '2' }] }).mockResolvedValueOnce({ rows: [] })
    const response = await handleAdminApi(
      request('admin', '/orders?status=pending&limit=10&offset=20'),
      context
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { items: [], total: 2 } })
    expect(query.mock.calls[0][1]).toEqual(['pending'])
    expect(query.mock.calls[1][1]).toEqual(['pending', 10, 20])
    expect(guards.rateLimit).toHaveBeenCalledOnce()
  })

  it('preserves public catalog routing and filtering', async () => {
    const response = await handlePublicApi(
      request('public', '/menu?mode=delivery&category=lunch'),
      context
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { categories: [], items: [] } })
    expect(query.mock.calls[1][0]).toContain('m.allow_delivery = true')
    expect(query.mock.calls[1][1]).toEqual(['lunch'])
  })

  it('does not dispatch public routes when rate limited', async () => {
    guards.rateLimit.mockRejectedValue(AppError.rateLimited())
    const response = await handlePublicApi(request('public', '/menu'), context)
    expect(response.status).toBe(429)
    expect(guards.public).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })

  it.each(['chat', 'action', 'feedback'])('rejects retired %s requests without a legacy write', async (route) => {
    const response = await handlePublicApi(new Request(`http://localhost/public-api/concierge/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'old client' }),
    }), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: 'REFRESH_REQUIRED' } })
    expect(query).not.toHaveBeenCalled()
  })

  it('routes the current chat contract without a version feature flag', async () => {
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message: 'Xin chào' }),
    }), { ...context, conciergeSessionStore: createConciergeV2UnavailableSessionStore() })
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: { code: 'DEPENDENCY_UNAVAILABLE' } })
  })

  it('keeps greetings available when recommendations are disabled', async () => {
    setConciergeFeatureFlagsForTesting({ recommendation_disabled: true })
    try {
      const send = (message: string) => handlePublicApi(new Request('http://localhost/public-api/concierge/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), message }),
      }), { ...context, conciergeSessionStore: createConciergeV2UnavailableSessionStore() })
      const greeting = await send('Chào bạn')
      expect(await greeting.json()).toMatchObject({ error: { message: 'Dịch vụ phiên tạm thời chưa sẵn sàng.' } })
      const food = await send('Gợi ý món ăn')
      expect(await food.json()).toMatchObject({ error: { message: 'Chức năng này đang tạm dừng. Bạn vẫn có thể chọn món trực tiếp từ thực đơn.' } })
    } finally {
      setConciergeFeatureFlagsForTesting(null)
    }
  })

  it('opens a guest conversation through the public handler without menu cards', async () => {
    const model = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Chào bạn, mình giúp chọn món nhé?',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
    const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('pg_try_advisory') ? [{ acquired: true }] : [] })),
      release: vi.fn() }
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
        page_context: { page: 'menu' }, action: { type: 'open_conversation' } }),
    }), { ...context, pool: { query, connect: async () => client } as unknown as pg.Pool,
      conciergeSessionStore: createConciergeV2SessionStore({ backend: new InMemoryConciergeV2SessionBackend() }),
      orchestrator: model })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ message: 'Chào bạn, mình giúp chọn món nhé?', cards: [],
      session: { state_version: 2 } })
  })

  it('streams a working status before the committed completion', async () => {
    const model = new ConciergeLlmOrchestrator({ customAdapter: async () => ({ reply_text: 'Chào bạn.',
      tool_calls: [], tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) })
    const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('pg_try_advisory') ? [{ acquired: true }] : [] })),
      release: vi.fn() }
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
        action: { type: 'open_conversation' } }),
    }), { ...context, pool: { query, connect: async () => client } as unknown as pg.Pool,
      conciergeSessionStore: createConciergeV2SessionStore({ backend: new InMemoryConciergeV2SessionBackend() }),
      orchestrator: model })
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const wire = await response.text()
    expect(wire).toContain('event: status\ndata: {"phase":"thinking"}')
    expect(wire).toContain('event: complete\ndata: {"protocol_version":"concierge-v2"')
    expect(wire.indexOf('event: status')).toBeLessThan(wire.indexOf('event: complete'))
  })

  it('streams guarded model prose after status and before the saved response', async () => {
    const model = new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, options) => {
      options.onTextDelta?.('Chào bạn, mình giúp chọn món ')
      options.onTextDelta?.('theo khẩu vị nhé.')
      return { reply_text: 'Chào bạn, mình giúp chọn món theo khẩu vị nhé.', tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }
    } })
    const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('pg_try_advisory') ? [{ acquired: true }] : [] })),
      release: vi.fn() }
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
        action: { type: 'open_conversation' } }),
    }), { ...context, pool: { query, connect: async () => client } as unknown as pg.Pool,
      conciergeSessionStore: createConciergeV2SessionStore({ backend: new InMemoryConciergeV2SessionBackend() }),
      orchestrator: model })
    const wire = await response.text()
    expect(wire).toContain('event: text')
    expect(wire.indexOf('event: status')).toBeLessThan(wire.indexOf('event: text'))
    expect(wire.indexOf('event: text')).toBeLessThan(wire.indexOf('event: complete'))
  })

  it('ends a failed stream with an error and no completion', async () => {
    const model = new ConciergeLlmOrchestrator({ customAdapter: async () => { throw new AppError('SERVICE_UNAVAILABLE', 'provider down', 503) } })
    const client = { query: vi.fn(async (sql: string) => ({ rows: sql.includes('pg_try_advisory') ? [{ acquired: true }] : [] })),
      release: vi.fn() }
    const response = await handlePublicApi(new Request('http://localhost/public-api/concierge/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ protocol_version: 'concierge-v2', request_id: crypto.randomUUID(),
        action: { type: 'open_conversation' } }),
    }), { ...context, pool: { query, connect: async () => client } as unknown as pg.Pool,
      conciergeSessionStore: createConciergeV2SessionStore({ backend: new InMemoryConciergeV2SessionBackend() }),
      orchestrator: model })
    const wire = await response.text()
    expect(wire).toContain('event: error')
    expect(wire).toContain('DEPENDENCY_UNAVAILABLE')
    expect(wire).not.toContain('event: complete')
  })

  it.each(['admin', 'public'] as const)('retains the %s gateway fallback', async (scope) => {
    const handler = scope === 'admin' ? handleAdminApi : handlePublicApi
    const response = await handler(request(scope, '/not-a-route'), context)
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(query).not.toHaveBeenCalled()
  })

  it('handles preflight without authenticating or dispatching', async () => {
    const response = await handleAdminApi(request('admin', '/orders', 'OPTIONS'), context)
    expect(response.status).toBeLessThan(300)
    expect(guards.admin).not.toHaveBeenCalled()
    expect(query).not.toHaveBeenCalled()
  })
})
