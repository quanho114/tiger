import { describe, it, expect, beforeEach } from 'vitest'
import {
  safeReturnTo,
  getAuthRedirectUrl,
  savePendingReturnTo,
  getAndClearPendingReturnTo,
} from '../auth-helpers'

describe('safeReturnTo - Open Redirect (CWE-601) Defense (Invariant V19)', () => {
  it('allows safe internal paths', () => {
    expect(safeReturnTo('/')).toBe('/')
    expect(safeReturnTo('/menu')).toBe('/menu')
    expect(safeReturnTo('/menu?mode=delivery')).toBe('/menu?mode=delivery')
    expect(safeReturnTo('/reservation')).toBe('/reservation')
    expect(safeReturnTo('/reservations')).toBe('/reservations')
    expect(safeReturnTo('/location')).toBe('/location')
    expect(safeReturnTo('/account')).toBe('/account')
    expect(safeReturnTo('/account/orders')).toBe('/account/orders')
    expect(safeReturnTo('/table/11111111-1111-1111-1111-111111111111')).toBe(
      '/table/11111111-1111-1111-1111-111111111111'
    )
    expect(safeReturnTo('/admin')).toBe('/admin')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeReturnTo('//evil.com')).toBe('/')
    expect(safeReturnTo('//attacker.com/menu')).toBe('/')
    expect(safeReturnTo('///evil.com')).toBe('/')
  })

  it('rejects backslash obfuscation tricks', () => {
    expect(safeReturnTo('/\\evil.com')).toBe('/')
    expect(safeReturnTo('\\evil.com')).toBe('/')
    expect(safeReturnTo('/menu\\evil.com')).toBe('/')
    expect(safeReturnTo('/menu/\\evil.com')).toBe('/')
  })

  it('rejects external absolute URLs', () => {
    expect(safeReturnTo('https://evil.com')).toBe('/')
    expect(safeReturnTo('http://evil.com/menu')).toBe('/')
    expect(safeReturnTo('https://google.com')).toBe('/')
  })

  it('rejects dangerous pseudo-protocols', () => {
    expect(safeReturnTo('javascript:alert(1)')).toBe('/')
    expect(safeReturnTo('data:text/html,<script>alert(1)</script>')).toBe('/')
    expect(safeReturnTo('vbscript:msgbox(1)')).toBe('/')
  })

  it('rejects control characters, CRLF, and unwhitelisted paths', () => {
    expect(safeReturnTo('/menu\r\nSet-Cookie:malicious')).toBe('/')
    expect(safeReturnTo('/menu\u0000admin')).toBe('/')
    expect(safeReturnTo('/etc/passwd')).toBe('/')
    expect(safeReturnTo('/unknown-unwhitelisted-endpoint')).toBe('/')
    expect(safeReturnTo('/malicious/path')).toBe('/')
  })

  it('falls back to provided fallback when input is empty, null, or invalid', () => {
    expect(safeReturnTo(null)).toBe('/')
    expect(safeReturnTo(undefined)).toBe('/')
    expect(safeReturnTo('')).toBe('/')
    expect(safeReturnTo('   ')).toBe('/')
    expect(safeReturnTo(null, '/menu')).toBe('/menu')
    expect(safeReturnTo('https://evil.com', '/reservation')).toBe('/reservation')
  })
})

describe('getAuthRedirectUrl', () => {
  it('constructs correct callback URL with sanitized returnTo', () => {
    const url = getAuthRedirectUrl('/menu?mode=delivery')
    expect(url).toContain('/auth/callback?returnTo=%2Fmenu%3Fmode%3Ddelivery')
  })

  it('falls back to / if raw returnTo is an open redirect target', () => {
    const url = getAuthRedirectUrl('https://evil.com')
    expect(url).toContain('/auth/callback?returnTo=%2F')
  })
})

describe('Pending returnTo SessionStorage handling', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('saves and clears pending returnTo correctly', () => {
    savePendingReturnTo('/account')
    expect(getAndClearPendingReturnTo()).toBe('/account')
    // After clearing, subsequent read should return null
    expect(getAndClearPendingReturnTo()).toBeNull()
  })

  it('sanitizes pending returnTo before storing', () => {
    savePendingReturnTo('//evil.com')
    expect(getAndClearPendingReturnTo()).toBe('/')
  })
})
