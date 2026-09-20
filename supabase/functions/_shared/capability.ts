/**
 * Tiger 345 - Table Visit Capability Token Engine
 * Secure HMAC token generation and live DB verification for QR table visits.
 */

import type pg from 'pg'
import { createSignedToken, verifySignedToken } from './crypto.ts'
import { AppError } from './errors.ts'

export const CAPABILITY_DEFAULT_TTL_SECONDS = 4 * 3600 // 4 hours

export function getCapabilitySecret(): string {
  return (
    process.env.CAPABILITY_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'tiger345-capability-secret-2026'
  )
}

export interface VisitCapabilityPayload {
  type: 'visit_capability'
  visit_id: string
  table_id: string
  qr_token_id: string
  epoch: number
  [key: string]: unknown
}

export interface VerifiedCapability {
  visit_id: string
  table_id: string
  table_code: string
  table_name: string
  qr_token_id: string
  epoch: number
}

/**
 * Creates a signed visit capability token with expiration and kid.
 */
export function createVisitCapability(
  params: {
    visit_id: string
    table_id: string
    qr_token_id: string
    epoch: number
  },
  secret = getCapabilitySecret(),
  options?: { expiresInSeconds?: number; kid?: string }
): string {
  const expiresInSeconds = options?.expiresInSeconds ?? CAPABILITY_DEFAULT_TTL_SECONDS
  return createSignedToken(
    {
      type: 'visit_capability',
      visit_id: params.visit_id,
      table_id: params.table_id,
      qr_token_id: params.qr_token_id,
      epoch: params.epoch,
    },
    secret,
    {
      expiresInSeconds,
      kid: options?.kid ?? 'v1',
    }
  )
}

/**
 * Verifies a visit capability token against its cryptographic signature, expiration,
 * and live database status (table active, visit open, capability_epoch match, qr_token match).
 */
export async function verifyVisitCapability(
  token: string,
  pool: pg.Pool,
  secret = getCapabilitySecret()
): Promise<VerifiedCapability> {
  // 1. Cryptographic and expiration verification
  const result = verifySignedToken<VisitCapabilityPayload>(token, secret)
  if (!result.valid) {
    throw new AppError(
      'CAPABILITY_INVALID',
      `Chữ ký capability không hợp lệ hoặc đã hết hạn: ${result.error}`,
      401
    )
  }

  const payload = result.payload
  if (
    payload.type !== 'visit_capability' ||
    !payload.visit_id ||
    !payload.table_id ||
    !payload.qr_token_id ||
    typeof payload.epoch !== 'number'
  ) {
    throw new AppError('CAPABILITY_INVALID', 'Cấu trúc capability không đúng định dạng', 400)
  }

  // 2. Query live database state (never trust token in isolation)
  const res = await pool.query(
    `SELECT
       v.id as visit_id,
       v.status as visit_status,
       v.capability_epoch,
       t.id as table_id,
       t.code as table_code,
       t.name as table_name,
       t.active as table_active,
       qr.id as qr_token_id,
       qr.active as qr_active
     FROM public.table_visits v
     JOIN public.dining_tables t ON v.table_id = t.id
     JOIN public.table_qr_tokens qr ON qr.table_id = t.id AND qr.active = true
     WHERE v.id = $1`,
    [payload.visit_id]
  )

  if (res.rows.length === 0) {
    throw AppError.notFound('Phiên phục vụ không tồn tại')
  }

  const row = res.rows[0]

  // Verify visit is still open
  if (row.visit_status !== 'open') {
    throw new AppError('VISIT_CLOSED', 'Phiên phục vụ tại bàn đã kết thúc', 409)
  }

  // Verify table is active
  if (!row.table_active) {
    throw new AppError('TABLE_UNAVAILABLE', 'Bàn hiện đang tạm ngưng phục vụ', 409)
  }

  // Verify table ID matches
  if (row.table_id !== payload.table_id) {
    throw new AppError('CAPABILITY_INVALID', 'Bàn không khớp với phiên phục vụ', 403)
  }

  // Verify capability epoch (revocation on close/reset)
  if (row.capability_epoch !== payload.epoch) {
    throw new AppError('CAPABILITY_REVOKED', 'Mã phiên phục vụ đã bị thu hồi hoặc làm mới', 401)
  }

  // Verify active QR token ID (revocation on QR rotate)
  if (row.qr_token_id !== payload.qr_token_id) {
    throw new AppError('QR_REVOKED', 'Mã QR bàn đã được thay thế hoặc làm mới', 401)
  }

  return {
    visit_id: row.visit_id,
    table_id: row.table_id,
    table_code: row.table_code,
    table_name: row.table_name,
    qr_token_id: row.qr_token_id,
    epoch: row.capability_epoch,
  }
}
