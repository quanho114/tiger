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

export function getClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]
    if (first) return first.trim()
  }

  return '127.0.0.1'
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
