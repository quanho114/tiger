import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { hashWithSalt, createSignedToken, verifySignedToken } from '../../supabase/functions/_shared/crypto.js'
import { checkRateLimit, assertRateLimit } from '../../supabase/functions/_shared/rate-limit.js'
import { AppError } from '../../supabase/functions/_shared/errors.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('Server Crypto & Rate Limiting', () => {
  let pool: pg.Pool

  beforeAll(() => {
    pool = new Pool({ connectionString })
  })

  afterAll(async () => {
    // Clean up test rate limit buckets
    await pool.query("DELETE FROM rate_limit_buckets WHERE bucket_hash LIKE 'test-%' OR true")
    await pool.end()
  })

  describe('Semantic Hashing & Tokens', () => {
    it('produces deterministic salted hashes without exposing raw values', () => {
      const hash1 = hashWithSalt('192.168.1.100', 'salt-1')
      const hash2 = hashWithSalt('192.168.1.100', 'salt-1')
      const hash3 = hashWithSalt('192.168.1.101', 'salt-1')

      expect(hash1).toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash1).not.toContain('192.168.1.100')
      expect(hash1.length).toBe(64) // SHA-256 hex length
    })

    it('creates and verifies signed tokens with kid and expiry', () => {
      const secret = 'test-secret-key-at-least-32-chars-long'
      const payload = { sub: 'user-123', role: 'customer' }
      const token = createSignedToken(payload, secret, {
        kid: 'v1',
        expiresInSeconds: 60,
      })

      const verified = verifySignedToken<{ sub: string; role: string }>(token, secret)
      expect(verified.valid).toBe(true)
      if (verified.valid) {
        expect(verified.payload.sub).toBe('user-123')
        expect(verified.payload.role).toBe('customer')
      }
    })

    it('rejects tampered or expired tokens', () => {
      const secret = 'test-secret-key-at-least-32-chars-long'
      const expiredToken = createSignedToken({ sub: 'user-expired' }, secret, {
        kid: 'v1',
        expiresInSeconds: -10, // already expired
      })

      const verifiedExpired = verifySignedToken(expiredToken, secret)
      expect(verifiedExpired.valid).toBe(false)

      const validToken = createSignedToken({ sub: 'user-valid' }, secret, { kid: 'v1' })
      const tamperedToken = validToken.slice(0, -4) + 'abcd'
      const verifiedTampered = verifySignedToken(tamperedToken, secret)
      expect(verifiedTampered.valid).toBe(false)
    })
  })

  describe('Atomic Database Rate Limiting', () => {
    it('increments bucket atomically and enforces rate limits', async () => {
      const key = `test-ip-${Date.now()}`
      const config = { key, limit: 3, windowSeconds: 10 }

      const res1 = await checkRateLimit(pool, config)
      expect(res1.allowed).toBe(true)
      expect(res1.count).toBe(1)
      expect(res1.remaining).toBe(2)

      const res2 = await checkRateLimit(pool, config)
      expect(res2.allowed).toBe(true)
      expect(res2.count).toBe(2)
      expect(res2.remaining).toBe(1)

      const res3 = await checkRateLimit(pool, config)
      expect(res3.allowed).toBe(true)
      expect(res3.count).toBe(3)
      expect(res3.remaining).toBe(0)

      const res4 = await checkRateLimit(pool, config)
      expect(res4.allowed).toBe(false)
      expect(res4.count).toBe(4)
      expect(res4.remaining).toBe(0)
    })

    it('assertRateLimit throws 429 AppError when limit is exceeded', async () => {
      const key = `test-assert-${Date.now()}`
      const config = { key, limit: 1, windowSeconds: 10 }

      await expect(assertRateLimit(pool, config)).resolves.not.toThrow()

      try {
        await assertRateLimit(pool, config)
        expect.fail('Should have thrown AppError 429')
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError)
        const appErr = err as AppError
        expect(appErr.statusCode).toBe(429)
        expect(appErr.code).toBe('RATE_LIMITED')
        expect(appErr.retryAfter).toBeGreaterThan(0)
      }
    })
  })
})
