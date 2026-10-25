import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchMenu, fetchSettings } from '@/features/catalog/api'
import { customerApi, publicApi } from '@/shared/lib/api/client'

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/shared/lib/supabase', () => ({
  supabaseUrl: 'http://catalog.test',
  supabase: { auth: { getSession } },
}))

beforeEach(() => {
  getSession.mockResolvedValue({ data: { session: { access_token: 'stale-test-session' } }, error: null })
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    if (new Headers(init.headers).has('Authorization')) {
      return new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED', message: 'Session expired' } }), {
        status: 401,
      })
    }
    const url = new URL(input)
    const data = url.pathname.endsWith('/menu')
      ? { categories: [{ id: 'grill', name: 'Món nướng', slug: 'mon-nuong', sort_order: 1 }], items: [] }
      : { name: 'Tiger 345' }
    return new Response(JSON.stringify({ data }), { status: 200 })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('public catalog reads with a rejected stored session', () => {
  it('loads the public menu even when the stored session would be rejected', async () => {
    await expect(fetchMenu({ mode: 'delivery' })).resolves.toEqual({
      categories: [{ id: 'grill', name: 'Món nướng', slug: 'mon-nuong', sort_order: 1 }],
      items: [],
    })
  })

  it('loads public restaurant settings even when the stored session would be rejected', async () => {
    await expect(fetchSettings()).resolves.toEqual({ name: 'Tiger 345' })
  })

  it('keeps customer requests authenticated and surfaces an invalid session', async () => {
    await expect(customerApi.get('/me')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED', status: 401,
    })
  })

  it('does not silently downgrade an authenticated public mutation to a guest request', async () => {
    await expect(publicApi.post('/orders', {})).rejects.toMatchObject({
      code: 'AUTH_REQUIRED', status: 401,
    })
  })
})
