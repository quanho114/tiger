import { afterEach, describe, expect, it, vi } from 'vitest'
import { configuredValue, signingSecret } from '../../supabase/functions/_shared/environment.ts'

afterEach(() => vi.unstubAllEnvs())

describe('Server configuration boundaries', () => {
  it('allows defaults in explicit local tests', () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENVIRONMENT', '')
    vi.stubEnv('DENO_DEPLOYMENT_ID', '')
    expect(configuredValue('DATABASE_URL', undefined, 'local-db')).toBe('local-db')
  })

  it.each(['production', ''])('fails closed when NODE_ENV is %s', (mode) => {
    vi.stubEnv('NODE_ENV', mode)
    vi.stubEnv('ENVIRONMENT', '')
    vi.stubEnv('QUOTE_SECRET', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    expect(() => signingSecret('QUOTE_SECRET', 'local-secret')).toThrow(/QUOTE_SECRET/)
    expect(() => configuredValue('DATABASE_URL', undefined, 'local-db')).toThrow(/DATABASE_URL/)
  })

  it('never allows local defaults in a deployed edge function', () => {
    vi.stubEnv('DENO_DEPLOYMENT_ID', 'deployment')
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('ENVIRONMENT', 'local')
    expect(() => configuredValue('DATABASE_URL', undefined, 'local-db')).toThrow()
  })

  it('uses configured values without exposing them in errors', () => {
    expect(configuredValue('DATABASE_URL', 'configured-db', 'local-db')).toBe('configured-db')
    vi.stubEnv('QUOTE_SECRET', 'configured-signing-key')
    expect(signingSecret('QUOTE_SECRET', 'local-secret')).toBe('configured-signing-key')
  })
})
