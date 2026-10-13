import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { sha256 } from '../_shared/crypto.ts'
import { handleDbError } from './db-errors.ts'
import type { RouteContext } from './context.ts'

export async function handleVisitsRoutes({
  req,
  path,
  actor,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  // --------------------------------------------------------------------------
  // VISITS ENDPOINTS
  // --------------------------------------------------------------------------

  const visitsSettleMatch = path.match(/^\/visits\/([0-9a-fA-F-]+)\/settle$/)
  if (visitsSettleMatch && req.method === 'POST') {
    const visitId = visitsSettleMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      expected_orders: Array<{ id: string; version: number }>
      method?: 'cash' | 'bank_transfer'
      payment_method?: 'cash' | 'bank_transfer'
    }>(req)

    const method = body.method || body.payment_method
    if (
      typeof body.expected_version !== 'number' ||
      !Array.isArray(body.expected_orders) ||
      !method
    ) {
      throw AppError.validation('expected_version, expected_orders và method là bắt buộc')
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim()
    const keyHash = idempotencyKey ? sha256(idempotencyKey) : null
    const actorScope = `admin:${actor.userId}`
    const requestHash = sha256(
      JSON.stringify({
        visitId,
        expected_version: body.expected_version,
        expected_orders: body.expected_orders,
        method,
      })
    )

    try {
      const res = await pool.query(
        `SELECT public.settle_table_visit($1::uuid, $2::int, $3::jsonb, $4::text, $5::uuid, $6::text, $7::text, $8::text) as result`,
        [
          visitId,
          body.expected_version,
          JSON.stringify(body.expected_orders),
          method,
          actor.userId,
          keyHash,
          actorScope,
          requestHash,
        ]
      )
      const result = res.rows[0].result
      const responseData = result.receipt
        ? { ...result.receipt, replayed: result.replayed }
        : result
      return jsonResponse(responseData, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      handleDbError(err)
    }
  }

  const visitsCloseMatch = path.match(/^\/visits\/([0-9a-fA-F-]+)\/close$/)
  if (visitsCloseMatch && req.method === 'POST') {
    const visitId = visitsCloseMatch[1]
    const body = await parseJsonBody<{ expected_version: number }>(req)

    if (typeof body.expected_version !== 'number') {
      throw AppError.validation('expected_version là bắt buộc để đóng phiên phục vụ')
    }

    try {
      const res = await pool.query(
        `SELECT public.close_table_visit($1::uuid, $2::int, $3::uuid) as result`,
        [visitId, body.expected_version, actor.userId]
      )
      const closedVisit = res.rows[0].result
      return jsonResponse(closedVisit, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      handleDbError(err)
    }
  }

  const visitsIdMatch = path.match(/^\/visits\/([0-9a-fA-F-]+)$/)
  if (visitsIdMatch && req.method === 'GET') {
    const visitId = visitsIdMatch[1]

    const visitRes = await pool.query(
      `SELECT
         v.*,
         t.code as table_code,
         t.name as table_name,
         t.active as table_active
       FROM public.table_visits v
       JOIN public.dining_tables t ON v.table_id = t.id
       WHERE v.id = $1`,
      [visitId]
    )

    if (visitRes.rows.length === 0) {
      throw AppError.notFound('Phiên phục vụ không tồn tại')
    }

    const visitRow = visitRes.rows[0]

    const ordersRes = await pool.query(
      `SELECT
         o.id, o.code, o.order_type, o.status, o.payment_status, o.payment_method,
         o.total_vnd, o.created_at, o.paid_at, o.version,
         COALESCE(
           (SELECT json_agg(json_build_object('name', oi.item_name, 'quantity', oi.quantity, 'line_total_vnd', oi.line_total_vnd))
            FROM public.order_items oi WHERE oi.order_id = o.id),
           '[]'::json
         ) as items_summary
       FROM public.orders o
       WHERE o.table_visit_id = $1
       ORDER BY o.created_at ASC`,
      [visitId]
    )

    const activeOrders = ordersRes.rows.filter(
      (o) => !['completed', 'cancelled', 'rejected'].includes(o.status)
    )
    const unpaidOrders = ordersRes.rows.filter(
      (o) => o.payment_status === 'unpaid' && !['cancelled', 'rejected'].includes(o.status)
    )
    const unpaidTotalVnd = unpaidOrders.reduce((sum, o) => sum + Number(o.total_vnd || 0), 0)

    return jsonResponse(
      {
        visit: {
          id: visitRow.id,
          table_id: visitRow.table_id,
          table_code: visitRow.table_code,
          table_name: visitRow.table_name,
          status: visitRow.status,
          capability_epoch: Number(visitRow.capability_epoch),
          opened_at: visitRow.opened_at,
          closed_at: visitRow.closed_at,
          opened_by_admin_id: visitRow.opened_by_admin_id,
          version: Number(visitRow.version),
        },
        orders: ordersRes.rows.map((o) => ({
          id: o.id,
          code: o.code,
          order_type: o.order_type,
          status: o.status,
          payment_status: o.payment_status,
          payment_method: o.payment_method,
          total_vnd: Number(o.total_vnd || 0),
          created_at: o.created_at,
          paid_at: o.paid_at,
          version: Number(o.version),
          items_summary: o.items_summary,
        })),
        unpaid_summary: {
          active_orders_count: activeOrders.length,
          unpaid_orders_count: unpaidOrders.length,
          unpaid_total_vnd: unpaidTotalVnd,
        },
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  return null
}
