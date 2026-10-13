import { afterEach, expect, it, vi } from 'vitest'
import { assertPublicProviderDestination, localProviderBaseUrl, validateProviderBaseUrl } from '../../supabase/functions/_shared/concierge/provider-url.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'

afterEach(() => vi.unstubAllEnvs())

it.each(['http://api.openai.com/v1', 'http://127.0.0.1:9999/v1', 'https://localhost/v1',
  'https://[::1]/v1', 'https://169.254.169.254/v1', 'https://api.openai.com.evil.test/v1',
  'https://user:secret@api.openai.com/v1', 'https://api.openai.com/v1?next=internal'])('rejects unsafe provider URL %s', url => {
  expect(() => validateProviderBaseUrl(url)).toThrow('INVALID_PROVIDER_URL')
})

it('requires an exact approved HTTPS domain for custom gateways', () => {
  expect(validateProviderBaseUrl('https://gateway.example.com/v1/', 'gateway.example.com')).toBe('https://gateway.example.com/v1')
  expect(() => validateProviderBaseUrl('https://gateway.example.com.evil/v1', 'gateway.example.com')).toThrow()
})

it('reads the provider allowlist from Deno.env in the edge runtime', () => {
  const edgeEnvironment: Record<string, string> = {
    DENO_DEPLOYMENT_ID: 'local-edge-test',
    CONCIERGE_LLM_ALLOWED_HOSTS: 'gateway.example.com',
  }
  vi.stubGlobal('process', undefined)
  vi.stubGlobal('Deno', { env: { get: (name: string) => edgeEnvironment[name] } })
  try {
    expect(validateProviderBaseUrl('https://gateway.example.com/v1')).toBe('https://gateway.example.com/v1')
  } finally {
    vi.unstubAllGlobals()
  }
})

it('allows only the operator-pinned local dev URL and its completion endpoint', async () => {
  vi.stubEnv('ENVIRONMENT', 'local')
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('DENO_DEPLOYMENT_ID', '')
  vi.stubEnv('CONCIERGE_LLM_DEV_BASE_URL', 'http://host.docker.internal:20128/v1')
  expect(localProviderBaseUrl()).toBe('http://host.docker.internal:20128/v1')
  expect(validateProviderBaseUrl('http://host.docker.internal:20128/v1')).toBe(localProviderBaseUrl())
  const resolve = vi.fn(async () => ['127.0.0.1'])
  await expect(assertPublicProviderDestination('http://host.docker.internal:20128/v1/chat/completions', resolve)).resolves.toBeUndefined()
  expect(resolve).not.toHaveBeenCalled()
  expect(() => validateProviderBaseUrl('http://host.docker.internal:20129/v1')).toThrow('INVALID_PROVIDER_URL')
  expect(() => validateProviderBaseUrl('http://host.docker.internal:20128/v1/other')).toThrow('INVALID_PROVIDER_URL')
  expect(() => validateProviderBaseUrl('http://host.docker.internal.evil:20128/v1')).toThrow('INVALID_PROVIDER_URL')
  expect(() => validateProviderBaseUrl('http://user:pass@host.docker.internal:20128/v1')).toThrow('INVALID_PROVIDER_URL')
  await expect(assertPublicProviderDestination('http://host.docker.internal:20128/v1/models', resolve)).rejects.toThrow('UNSAFE_PROVIDER_DESTINATION')
})

it('disables the pinned local URL in production, deployed runtimes, and without explicit dev mode', () => {
  vi.stubEnv('CONCIERGE_LLM_DEV_BASE_URL', 'http://host.docker.internal:20128/v1')
  for (const [mode, deployment] of [['', ''], ['production', ''], ['local', 'deployed']]) {
    vi.stubEnv('ENVIRONMENT', mode)
    vi.stubEnv('NODE_ENV', '')
    vi.stubEnv('DENO_DEPLOYMENT_ID', deployment)
    expect(localProviderBaseUrl()).toBeNull()
    expect(() => validateProviderBaseUrl('http://host.docker.internal:20128/v1')).toThrow('INVALID_PROVIDER_URL')
  }
})

it.each(['http://10.0.0.1:20128/v1', 'http://169.254.169.254:20128/v1',
  'http://evil.test:20128/v1', 'http://host.docker.internal/v1',
  'http://host.docker.internal:20128/v1?x=1'])('ignores unsafe local dev settings %s', value => {
  vi.stubEnv('ENVIRONMENT', 'local')
  vi.stubEnv('CONCIERGE_LLM_DEV_BASE_URL', value)
  expect(localProviderBaseUrl()).toBeNull()
  expect(() => validateProviderBaseUrl(value)).toThrow('INVALID_PROVIDER_URL')
})

it('uses the pinned dev gateway without following redirects in the model adapter', async () => {
  vi.stubEnv('ENVIRONMENT', 'local')
  vi.stubEnv('CONCIERGE_LLM_DEV_BASE_URL', 'http://host.docker.internal:20128/v1')
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/' } }))
  vi.stubGlobal('fetch', fetch)
  try {
    const llm = new ConciergeLlmOrchestrator({ provider: 'openai', apiKey: 'synthetic-test-only',
      baseUrl: 'http://host.docker.internal:20128/v1' })
    await expect(llm.orchestrateTurn('xin chào', [])).rejects.toThrow()
    expect(fetch).toHaveBeenCalledWith('http://host.docker.internal:20128/v1/chat/completions',
      expect.objectContaining({ redirect: 'error' }))
  } finally { vi.unstubAllGlobals() }
})

it.each(['127.0.0.1', '10.20.30.40', '172.16.1.2', '192.168.1.1', '169.254.169.254',
  '100.64.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1'])('blocks DNS answers to non-public address %s', async address => {
  await expect(assertPublicProviderDestination('https://gateway.example.com/v1', async () => [address])).rejects.toThrow('UNSAFE_PROVIDER_DESTINATION')
})

it('allows public DNS answers and rejects unresolved destinations', async () => {
  await expect(assertPublicProviderDestination('https://gateway.example.com/v1', async () => ['8.8.8.8', '2606:4700::1111'])).resolves.toBeUndefined()
  await expect(assertPublicProviderDestination('https://gateway.example.com/v1', async () => [])).rejects.toThrow()
})

it('rejects provider redirects before following them with a credential', async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/' } }))
  vi.stubGlobal('fetch', fetch)
  try {
    const llm = new ConciergeLlmOrchestrator({ provider: 'openai', apiKey: 'synthetic-test-only' })
    await expect(llm.orchestrateTurn('xin chào', [])).rejects.toThrow()
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: 'error' }))
  } finally { vi.unstubAllGlobals() }
})
