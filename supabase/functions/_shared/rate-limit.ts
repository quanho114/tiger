/**
 * Tiger 345 - Atomic PostgreSQL Rate Limiter
 * Uses table `rate_limit_buckets` for concurrent, atomic rate limiting per plans/tiger-345/04-api-contracts.md
 */

import type pg from 'pg'
import { hashWithSalt } from './crypto.ts'
import { AppError } from './errors.ts'

export interface RateLimitConfig {
  key: string
  limit: number
  windowSeconds: number
}

export interface RateLimitResult {
  allowed: boolean
  count: number
  limit: number
  remaining: number
  resetInSeconds: number
}

export async function checkRateLimit(
  pool: pg.Pool,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = config

  const nowMs = Date.now()
  const windowMs = windowSeconds * 1000
  const windowStartMs = Math.floor(nowMs / windowMs) * windowMs
  const windowStart = new Date(windowStartMs)
  // Store expiration as window end + window buffer for cleanup
  const expiresAt = new Date(windowStartMs + windowMs * 2)

  const bucketHash = hashWithSalt(key)

  const res = await pool.query(
    `INSERT INTO rate_limit_buckets (bucket_hash, window_start, count, expires_at)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT (bucket_hash, window_start)
     DO UPDATE SET count = rate_limit_buckets.count + 1
     RETURNING count`,
    [bucketHash, windowStart.toISOString(), expiresAt.toISOString()]
  )

  const currentCount = Number(res.rows[0].count)
  const remaining = Math.max(0, limit - currentCount)
  const resetInSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + windowMs - nowMs) / 1000)
  )

  const allowed = currentCount <= limit

  return {
    allowed,
    count: currentCount,
    limit,
    remaining,
    resetInSeconds,
  }
}

/**
 * Convenience helper that checks rate limit and throws AppError.rateLimited if exceeded
 */
export async function assertRateLimit(
  pool: pg.Pool,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const result = await checkRateLimit(pool, config)
  if (!result.allowed) {
    throw AppError.rateLimited(result.resetInSeconds)
  }
  return result
}
