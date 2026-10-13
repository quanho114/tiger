import type pg from 'pg'
import { AppError } from '../_shared/errors.ts'
import { jsonResponse } from '../_shared/request.ts'

export function financialPeriod(range: string | null, now = new Date()) {
  const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10)
  const today = new Date(`${day}T00:00:00+07:00`)
  let start = new Date(today)
  let end = new Date(today.getTime() + 86400000)
  if (range === 'yesterday') { start = new Date(today.getTime() - 86400000); end = today }
  else if (range === 'week' || range === '7days') start = new Date(today.getTime() - 6 * 86400000)
  else if (range === 'month') start = new Date(`${day.slice(0, 7)}-01T00:00:00+07:00`)
  else if (range && range !== 'today') throw new AppError('VALIDATION_ERROR', 'Khoảng thời gian không hợp lệ', 400)
  return [start.toISOString(), end.toISOString()]
}

export async function handleFinancialRoutes(req: Request, path: string, pool: pg.Pool, requestId: string): Promise<Response | null> {
  if (req.method !== 'GET' || !['/invoices', '/reports'].includes(path)) return null
  const params = new URL(req.url).searchParams
  const [start, end] = financialPeriod(params.get('range'))
  if (path === '/invoices') {
    const offset = Number(params.get('offset') || 0)
    const limit = Number(params.get('limit') || 100)
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError('VALIDATION_ERROR', 'Phân trang không hợp lệ', 400)
    }
    const result = await pool.query(`SELECT o.id, o.id AS order_id, o.code, o.order_type,
      o.table_name_snapshot AS table_name, o.customer_name, o.customer_phone, o.created_at,
      o.paid_at, o.payment_method, o.subtotal_vnd::float8, o.shipping_fee_vnd::float8, o.total_vnd::float8,
      (SELECT a.display_name FROM public.order_payment_events e LEFT JOIN public.admin_profiles a ON a.user_id = e.actor_admin_id
        WHERE e.order_id = o.id AND e.event = 'paid' ORDER BY e.created_at DESC LIMIT 1) AS cashier_name,
      COALESCE((SELECT json_agg(json_build_object('name', i.item_name, 'quantity', i.quantity,
        'unit_price_vnd', i.unit_price_vnd, 'line_total_vnd', i.line_total_vnd) ORDER BY i.position)
        FROM public.order_items i WHERE i.order_id = o.id), '[]') AS items
      FROM public.orders o WHERE o.payment_status = 'paid' AND o.paid_at >= $1 AND o.paid_at < $2
      ORDER BY o.paid_at DESC, o.id DESC LIMIT $3 OFFSET $4`, [start, end, limit + 1, offset])
    return jsonResponse({ items: result.rows.slice(0, limit), has_more: result.rows.length > limit, start, end }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }
  // Corrections undo a recorded payment just like refunds; count movements on their actual date.
  const result = await pool.query(`WITH ledger AS (
    SELECT * FROM public.order_payment_events WHERE created_at >= $1 AND created_at < $2
  ), days AS (
    SELECT to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS day,
      sum(CASE WHEN event = 'paid' THEN amount_vnd ELSE -amount_vnd END)::float8 AS revenue
      FROM ledger GROUP BY 1
  ) SELECT
    COALESCE(sum(CASE WHEN event = 'paid' THEN amount_vnd ELSE -amount_vnd END), 0)::float8 AS net_revenue,
    COALESCE(sum(amount_vnd) FILTER (WHERE event = 'paid'), 0)::float8 AS received,
    COALESCE(sum(amount_vnd) FILTER (WHERE event <> 'paid'), 0)::float8 AS reversed,
    count(*) FILTER (WHERE event = 'paid')::int AS payment_count,
    COALESCE(sum(CASE WHEN event = 'paid' THEN amount_vnd ELSE -amount_vnd END) FILTER (WHERE method = 'cash'), 0)::float8 AS cash,
    COALESCE(sum(CASE WHEN event = 'paid' THEN amount_vnd ELSE -amount_vnd END) FILTER (WHERE method = 'bank_transfer'), 0)::float8 AS bank_transfer,
    (SELECT COALESCE(json_agg(days ORDER BY day), '[]') FROM days) AS daily
    FROM ledger`, [start, end])
  return jsonResponse({ ...result.rows[0], start, end }, requestId, req, 200, { 'Cache-Control': 'no-store' })
}
