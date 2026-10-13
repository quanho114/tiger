import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { processDeletionRetries } from '../_shared/account-deletion-worker.ts'
import type { RouteContext } from './context.ts'

export async function handleRetentionRoutes({
  req,
  path,
  pool,
  supabaseAdmin,
  requestId,
}: RouteContext): Promise<Response | null> {
  // --------------------------------------------------------------------------
  // RETENTION CLEANUP ENDPOINTS (Task T19, Invariants V23 / D04)
  // --------------------------------------------------------------------------

  // GET /retention/dry-run - Reports count of expired records eligible for purge
  if (path === '/retention/dry-run' && req.method === 'GET') {
    const res = await pool.query(`SELECT public.run_retention_cleanup(true) as result`)
    const sessions = await pool.query('SELECT count(*)::integer AS count FROM public.concierge_v2_sessions WHERE expires_at <= now()')
    return jsonResponse({ ...res.rows[0].result, concierge_sessions_purged: sessions.rows[0].count }, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // POST /retention/retry-deletions - Retries pending/failed Auth deletions (F05 Remediation)
  if (
    (path === '/retention/retry-deletions' || path === '/account-deletions/retry') &&
    req.method === 'POST'
  ) {
    const rawBody =
      (await parseJsonBody<Record<string, unknown>>(req).catch(
        () => ({}) as Record<string, unknown>
      )) || {}
    const limit = typeof rawBody.limit === 'number' ? rawBody.limit : 50
    const maxRetries = typeof rawBody.max_retries === 'number' ? rawBody.max_retries : 5

    const retryReport = await processDeletionRetries(pool, supabaseAdmin, {
      limit,
      maxRetries,
    })

    return jsonResponse(retryReport, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  // POST /retention/run - Executes destructive cleanup with D04 safeguards and retries pending deletions
  if (path === '/retention/run' && req.method === 'POST') {
    const isProduction =
      process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production'
    const rawBody = (await parseJsonBody<Record<string, unknown>>(req).catch(() => ({}))) || {}
    const body = rawBody as Record<string, unknown>
    const confirmProd = Boolean(body.confirm_production_cleanup)

    if (isProduction && !confirmProd) {
      throw new AppError(
        'PRODUCTION_CLEANUP_DISABLED',
        'Chính sách lưu trữ D04 chưa được xác nhận chính thức cho môi trường Production. Cần confirm_production_cleanup: true để thực hiện.',
        403
      )
    }

    const res = await pool.query(`SELECT public.run_retention_cleanup(false) as result`)
    const sessions = await pool.query('DELETE FROM public.concierge_v2_sessions WHERE expires_at <= now()')
    const retryReport = await processDeletionRetries(pool, supabaseAdmin)
    const combined = {
      ...res.rows[0].result,
      concierge_sessions_purged: sessions.rowCount ?? 0,
      deletion_retries: retryReport,
    }

    return jsonResponse(combined, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  return null
}
