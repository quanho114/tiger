import type pg from 'pg'
import { AppError } from './errors.ts'
import { sha256 } from './crypto.ts'

export async function recoverOrder(pool: pg.Pool, body: Record<string, unknown>): Promise<unknown | null> {
  const key = typeof body.idempotency_key === 'string' ? body.idempotency_key.trim() : ''
  const secret = typeof body.claim_secret === 'string' ? body.claim_secret.trim() : ''
  if (key.length < 16 || key.length > 200 || secret.length < 16 || secret.length > 128) {
    throw AppError.validation('Thông tin khôi phục đơn không hợp lệ')
  }
  // Both credentials are required; IP changes must not prevent recovery after a network drop.
  const result = await pool.query(
    `SELECT i.response_json
     FROM public.idempotency_requests i
     JOIN public.guest_order_claims c ON c.order_id = i.result_id
     WHERE i.operation = 'create_order' AND i.key_hash = $1
       AND c.secret_hash = $2 AND c.expires_at > now() AND i.expires_at > now()`,
    [sha256(key), sha256(secret)],
  )
  return result.rows[0]?.response_json ?? null
}
