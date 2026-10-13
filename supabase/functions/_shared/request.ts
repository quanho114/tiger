/**
 * Tiger 345 - Request Handling Utilities
 * Validates payload limits (64KB), extracts/generates request IDs, formats JSON responses.
 */

import crypto from 'node:crypto'
import { AppError } from './errors.ts'
import { getCorsHeaders } from './cors.ts'
import type { ApiSuccessEnvelope } from './types.ts'

export const MAX_PAYLOAD_BYTES = 64 * 1024 // 64 KB

export function getOrCreateRequestId(req: Request): string {
  const incoming = req.headers.get('x-request-id')
  // Validate incoming request ID: must be safe alphanumeric + dashes, max 64 chars
  if (incoming && /^[a-zA-Z0-9_-]{8,64}$/.test(incoming)) {
    return incoming
  }
  return crypto.randomUUID()
}

/**
 * Client IP is used for RATE LIMITING and abuse detection ONLY.
 * It is NEVER an identity: guest sessions use a cryptographically random
 * capability (csc_*) and authenticated users use their verified JWT.
 * Proxy headers are untrusted input — validated, never trusted blindly.
 * Missing/unresolvable IP returns a non-loopback sentinel so callers never
 * grant elevated (local-test) rate limits to unknown clients.
 */
export function getClientIp(req: Request): string {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ]
  for (const raw of candidates) {
    const ip = raw?.trim()
    if (ip && isPlausibleIp(ip)) return ip
  }
  return '0.0.0.0'
}

function isPlausibleIp(value: string): boolean {
  if (value.length > 45) return false
  // IPv4 or IPv6 textual form only — no ports, no garbage.
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) || /^[0-9a-fA-F:.]{2,45}$/.test(value)
}

export async function parseJsonBody<T = unknown>(req: Request): Promise<T> {
  const contentLength = req.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    throw AppError.validation('Kích thước payload vượt quá giới hạn 64KB')
  }

  const rawText = await req.text()
  if (!rawText || rawText.trim() === '') {
    return {} as T
  }

  if (new TextEncoder().encode(rawText).length > MAX_PAYLOAD_BYTES) {
    throw AppError.validation('Kích thước payload vượt quá giới hạn 64KB')
  }

  try {
    return JSON.parse(rawText) as T
  } catch {
    throw AppError.validation('Dữ liệu JSON trong request body không hợp lệ')
  }
}

export function jsonResponse<T>(
  data: T,
  requestId: string,
  req: Request,
  status = 200,
  additionalHeaders?: HeadersInit
): Response {
  const payload: ApiSuccessEnvelope<T> = {
    data,
    request_id: requestId,
  }

  const headers = new Headers(getCorsHeaders(req))
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('X-Request-Id', requestId)

  if (additionalHeaders) {
    const extra = new Headers(additionalHeaders)
    extra.forEach((value, key) => {
      headers.set(key, value)
    })
  }

  return new Response(JSON.stringify(payload), {
    status,
    headers,
  })
}
