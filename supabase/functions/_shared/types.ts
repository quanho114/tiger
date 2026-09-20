/**
 * Tiger 345 - Shared API Response & Contract Envelopes
 * Standard error codes and HTTP transport envelopes per plans/tiger-345/04-api-contracts.md
 */

export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  QUOTE_CHANGED: 'QUOTE_CHANGED',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  ITEM_UNAVAILABLE: 'ITEM_UNAVAILABLE',
  SERVICE_CLOSED: 'SERVICE_CLOSED',
  TABLE_UNAVAILABLE: 'TABLE_UNAVAILABLE',
  VISIT_CLOSED: 'VISIT_CLOSED',
  QR_REVOKED: 'QR_REVOKED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  CLAIM_INVALID: 'CLAIM_INVALID',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode]

export interface ApiSuccessEnvelope<T> {
  data: T
  request_id: string
}

export interface ApiListEnvelope<T> {
  data: {
    items: T[]
    next_cursor?: string | null
  }
  request_id: string
}

export interface ApiErrorDetail {
  code: ApiErrorCode | string
  message: string
  field_errors?: Record<string, string[]>
  details?: unknown
}

export interface ApiErrorEnvelope {
  error: ApiErrorDetail
  request_id: string
}

export type ApiResponseEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope

export interface AuthActor {
  role: 'guest' | 'customer' | 'admin'
  userId: string | null
  email?: string
  displayName?: string
}
