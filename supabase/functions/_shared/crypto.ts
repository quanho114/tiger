/**
 * Tiger 345 - Cryptographic Utilities
 * Semantic hashing (SHA-256 with salt) and signed tokens with kid/expiration.
 */

import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'

const DEFAULT_SALT = process.env.HASH_SALT || 'tiger345-secure-hash-salt-2026'

/**
 * Creates a salted SHA-256 hash (e.g. for IP addresses, tokens, idempotency keys)
 */
export function hashWithSalt(input: string, salt = DEFAULT_SALT): string {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${input}`)
    .digest('hex')
}

/**
 * Standard SHA-256 hash (hex digest)
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Generates cryptographically secure random token (base64url encoded)
 */
export function generateSecureToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url')
}

export interface SignedTokenPayload {
  exp: number
  iat: number
  [key: string]: unknown
}

export interface TokenHeader {
  alg: 'HS256'
  typ: 'JWT'
  kid: string
}

export interface TokenOptions {
  expiresInSeconds?: number
  kid?: string
}

/**
 * Signs a structured payload with HMAC-SHA256, expiration, and key ID (kid)
 */
export function createSignedToken<T extends Record<string, unknown>>(
  payload: T,
  secret: string,
  options?: TokenOptions | number,
  kidParam = 'v1'
): string {
  const expiresInSeconds =
    typeof options === 'number'
      ? options
      : options?.expiresInSeconds ?? 3600
  const kid =
    typeof options === 'object' && options?.kid
      ? options.kid
      : kidParam

  const header: TokenHeader = { alg: 'HS256', typ: 'JWT', kid }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: SignedTokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const b64Url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const content = `${b64Url(header)}.${b64Url(fullPayload)}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(content)
    .digest('base64url')

  return `${content}.${signature}`
}

/**
 * Verifies a signed HMAC-SHA256 token, ensuring signature and expiration validity
 */
export function verifySignedToken<T extends Record<string, unknown>>(
  token: string,
  secret: string,
  options?: { ignoreExpiration?: boolean }
):
  | { valid: true; payload: T & SignedTokenPayload; kid: string; expired: boolean }
  | { valid: false; error: string } {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return { valid: false, error: 'Malformed token structure' }
    }

    const [headerB64, payloadB64, signatureB64] = parts
    const content = `${headerB64}.${payloadB64}`

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(content)
      .digest('base64url')

    const sigA = Buffer.from(signatureB64, 'base64url')
    const sigB = Buffer.from(expectedSignature, 'base64url')

    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return { valid: false, error: 'Invalid token signature' }
    }

    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    ) as TokenHeader

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as T & SignedTokenPayload

    const now = Math.floor(Date.now() / 1000)
    const isExpired = Boolean(payload.exp && payload.exp < now)
    if (isExpired && !options?.ignoreExpiration) {
      return { valid: false, error: 'Token has expired' }
    }

    return {
      valid: true,
      payload,
      kid: header.kid || 'v1',
      expired: isExpired,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { valid: false, error: `Token verification failed: ${msg}` }
  }
}
