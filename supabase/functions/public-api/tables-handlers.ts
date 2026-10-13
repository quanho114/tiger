import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import { createVisitCapability, CAPABILITY_DEFAULT_TTL_SECONDS } from '../_shared/capability.ts'
import type { RouteContext } from './context.ts'

export async function handleTablesRoutes({
  req,
  path,
  pool,
  requestId,
  clientIp,
}: RouteContext): Promise<Response | null> {
  if (path === '/tables/resolve' && req.method === 'POST') {
    // 1. IP rate limit specifically for table resolve: 60/min/IP
    await assertRateLimit(pool, {
      key: `resolve:${clientIp}`,
      limit: 60,
      windowSeconds: 60,
    })

    // 2. Parse body
    const body = await parseJsonBody<{ token?: string }>(req)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    if (!token) {
      throw AppError.validation('Mã QR bàn không được để trống', {
        token: ['Token là bắt buộc'],
      })
    }

    // 3. Hash token
    const tokenHash = sha256(token)

    // 4. Query token and table
    const tokenRes = await pool.query(
      `SELECT
         qr.id as qr_token_id,
         qr.table_id,
         qr.active as qr_active,
         t.code as table_code,
         t.name as table_name,
         t.active as table_active
       FROM public.table_qr_tokens qr
       JOIN public.dining_tables t ON qr.table_id = t.id
       WHERE qr.token_hash = $1`,
      [tokenHash]
    )

    if (tokenRes.rows.length === 0) {
      throw AppError.notFound('Mã QR bàn không tồn tại hoặc không hợp lệ')
    }

    const row = tokenRes.rows[0]

    if (!row.qr_active) {
      throw new AppError('QR_REVOKED', 'Mã QR bàn này đã được thay thế hoặc làm mới', 401)
    }

    if (!row.table_active) {
      throw new AppError('TABLE_UNAVAILABLE', 'Bàn hiện đang tạm ngưng phục vụ', 409)
    }

    // 5. Query open visit for this table
    const visitRes = await pool.query(
      `SELECT id, status, capability_epoch, opened_at
       FROM public.table_visits
       WHERE table_id = $1 AND status = 'open'`,
      [row.table_id]
    )

    if (visitRes.rows.length === 0) {
      throw new AppError(
        'VISIT_CLOSED',
        'Bàn hiện chưa có phiên phục vụ đang mở hoặc phiên đã kết thúc. Vui lòng liên hệ nhân viên để được mở bàn.',
        409
      )
    }

    const visit = visitRes.rows[0]
    const ttlSeconds = CAPABILITY_DEFAULT_TTL_SECONDS
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()

    const capability = createVisitCapability(
      {
        visit_id: visit.id,
        table_id: row.table_id,
        qr_token_id: row.qr_token_id,
        epoch: visit.capability_epoch,
      },
      undefined,
      { expiresInSeconds: ttlSeconds }
    )

    return jsonResponse(
      {
        table_id: row.table_id,
        table_code: row.table_code,
        table_name: row.table_name,
        visit_id: visit.id,
        visit_capability: capability,
        expires_at: expiresAt,
      },
      requestId,
      req,
      200,
      {
        'Cache-Control': 'no-store',
      }
    )
  }

  return null
}
