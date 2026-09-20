/**
 * Tiger 345 - Auth Helper Utilities
 * Implements Invariant V19: Safe internal redirect validation and returnTo protection.
 */

const PENDING_RETURN_TO_KEY = 'tiger_auth_pending_return_to'

/**
 * Validates and sanitizes a returnTo redirect target.
 * Strictly prevents Open Redirect vulnerabilities (CWE-601).
 *
 * Rules:
 * 1. Must be a string.
 * 2. Must start with a single forward slash '/' and NOT '//' or '/\\'.
 * 3. Must not contain backslashes, CRLF, or control characters.
 * 4. Must match allowed Tiger 345 internal route prefixes.
 * 5. If invalid, returns the safe default fallback.
 */
export function safeReturnTo(
  rawReturnTo: string | null | undefined,
  fallback: string = '/'
): string {
  if (!rawReturnTo || typeof rawReturnTo !== 'string') {
    return fallback
  }

  const trimmed = rawReturnTo.trim()

  // Must start with '/' and not '//' (protocol-relative) or '/\'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return fallback
  }

  // Reject backslashes anywhere in the path
  if (trimmed.includes('\\')) {
    return fallback
  }

  // Reject control characters or newlines
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return fallback
  }

  // Reject dangerous pseudo-protocols like javascript: or data:
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) {
    return fallback
  }

  // Parse path without query or hash for prefix validation
  const pathOnly = trimmed.split('?')[0].split('#')[0]

  const ALLOWED_EXACT_OR_PREFIXES = [
    '/',
    '/menu',
    '/reservation',
    '/reservations',
    '/location',
    '/account',
    '/table',
    '/admin',
  ]

  const isAllowed = ALLOWED_EXACT_OR_PREFIXES.some((allowed) => {
    if (allowed === '/') return pathOnly === '/'
    return pathOnly === allowed || pathOnly.startsWith(`${allowed}/`)
  })

  if (!isAllowed) {
    return fallback
  }

  return trimmed
}

/**
 * Constructs the full callback URL for Supabase OAuth and Magic Link redirects.
 */
export function getAuthRedirectUrl(returnTo?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'
  const safeTarget = safeReturnTo(returnTo, '/')
  const params = new URLSearchParams({ returnTo: safeTarget })
  return `${origin}/auth/callback?${params.toString()}`
}

/**
 * Temporarily saves returnTo in sessionStorage before initiating OAuth redirect.
 */
export function savePendingReturnTo(returnTo: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(PENDING_RETURN_TO_KEY, safeReturnTo(returnTo, '/'))
  } catch {
    // SessionStorage may fail in restricted/private modes
  }
}

/**
 * Retrieves and clears pending returnTo from sessionStorage.
 */
export function getAndClearPendingReturnTo(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = sessionStorage.getItem(PENDING_RETURN_TO_KEY)
    if (saved) {
      sessionStorage.removeItem(PENDING_RETURN_TO_KEY)
      return safeReturnTo(saved, '/')
    }
  } catch {
    // SessionStorage may fail
  }
  return null
}
