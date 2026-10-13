import { describe, expect, it } from 'vitest'
import { authorizeCron } from '../../supabase/functions/_shared/cron-auth.ts'

describe('Cron credential scope', () => {
  const secret = 'test-scheduler-credential'
  const request = (method: string, key = secret) => new Request('https://example.test', {
    method, headers: { 'x-cron-secret': key },
  })

  it.each(['/retention/run', '/retention/retry-deletions', '/account-deletions/retry'])(
    'allows scheduled POST %s', (path) => {
      expect(authorizeCron(request('POST'), path, secret)).toBe(true)
    },
  )

  it.each([
    ['GET', '/orders'], ['GET', '/me'], ['PATCH', '/settings'],
    ['POST', '/orders/id/payment'], ['GET', '/retention/run'],
    ['DELETE', '/retention/run'], ['POST', '/retention/run/extra'],
  ])('rejects cron access to %s %s', (method, path) => {
    expect(() => authorizeCron(request(method), path, secret)).toThrow(/cannot access/)
  })

  it('does not authenticate absent, wrong or unconfigured credentials', () => {
    expect(authorizeCron(request('POST', ''), '/retention/run', secret)).toBe(false)
    expect(authorizeCron(request('POST', 'wrong'), '/retention/run', secret)).toBe(false)
    expect(authorizeCron(request('POST'), '/retention/run', undefined)).toBe(false)
  })
})
