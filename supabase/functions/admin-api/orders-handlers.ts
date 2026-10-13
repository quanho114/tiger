import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { sha256 } from '../_shared/crypto.ts'
import { handleDbError } from './db-errors.ts'
import type { RouteContext } from './context.ts'

export async function handleOrdersRoutes({
  req,
  path,
  url,
  actor,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  // --------------------------------------------------------------------------
  // ORDERS ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /orders: list orders with filters & pagination
  if (path === '/orders' && req.method === 'GET') {
    const orderType = url.searchParams.get('order_type')
    const status = url.searchParams.get('status')
    const date = url.searchParams.get('date')
    const search = url.searchParams.get('search')?.trim()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

    const whereClauses: string[] = []
    const values: unknown[] = []
    let paramIdx = 1

    if (url.searchParams.get('actionable') === 'true')
      whereClauses.push("o.status IN ('pending', 'confirmed', 'preparing')")
    if (orderType) {
      whereClauses.push(`o.order_type = $${paramIdx++}`)
      values.push(orderType)
    }
    if (status) {
      whereClauses.push(`o.status = $${paramIdx++}`)
      values.push(status)
    }
    if (date) {
      whereClauses.push(
        `(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $${paramIdx++}::date`
      )
      values.push(date)
    }
    if (search) {
      whereClauses.push(
        `(o.code ILIKE $${paramIdx} OR o.customer_phone ILIKE $${paramIdx} OR o.customer_name ILIKE $${paramIdx})`
      )
      values.push(`%${search}%`)
      paramIdx++
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const countRes = await pool.query(
      `SELECT count(*) as total FROM public.orders o ${whereSql}`,
      values
    )
    const total = Number(countRes.rows[0].total)

    const listValues = [...values, limit, offset]
    const ordersRes = await pool.query(
      `SELECT
         o.id,
         o.code,
         o.order_type,
         o.status,
         o.payment_status,
         o.payment_method,
         o.subtotal_vnd,
         o.shipping_fee_vnd,
         o.total_vnd,
         o.note,
         o.internal_note,
         o.table_id,
         o.table_visit_id,
         o.table_name_snapshot,
         o.customer_name,
         o.customer_phone,
         o.address_snapshot,
         o.zone_name_snapshot,
         o.confirmed_at,
         o.completed_at,
         o.cancelled_at,
         o.version,
         o.created_at,
         o.updated_at,
         COALESCE((SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id), 0)::int as items_count,
         COALESCE((
           SELECT json_agg(json_build_object(
             'item_name', oi.item_name,
             'quantity', oi.quantity
           ) ORDER BY oi.position ASC)
           FROM public.order_items oi WHERE oi.order_id = o.id
         ), '[]'::json) as items_summary
       FROM public.orders o
       ${whereSql}
       ORDER BY o.created_at DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      listValues
    )

    const items = ordersRes.rows.map((r) => ({
      id: r.id,
      code: r.code,
      order_type: r.order_type,
      status: r.status,
      payment_status: r.payment_status,
      payment_method: r.payment_method,
      subtotal_vnd: Number(r.subtotal_vnd),
      shipping_fee_vnd: Number(r.shipping_fee_vnd),
      total_vnd: Number(r.total_vnd),
      note: r.note,
      internal_note: r.internal_note,
      table_id: r.table_id,
      table_visit_id: r.table_visit_id,
      table_name: r.table_name_snapshot,
      table_name_snapshot: r.table_name_snapshot,
      address_snapshot: r.address_snapshot,
      item_count: Number(r.items_count),
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address_snapshot,
      zone_name: r.zone_name_snapshot,
      confirmed_at: r.confirmed_at,
      completed_at: r.completed_at,
      cancelled_at: r.cancelled_at,
      version: Number(r.version),
      created_at: r.created_at,
      updated_at: r.updated_at,
      items_count: Number(r.items_count),
      items_summary: r.items_summary,
    }))

    return jsonResponse({ items, total }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // Dynamic routing for /orders/:id sub-paths
  const ordersTransitionMatch = path.match(/^\/orders\/([0-9a-fA-F-]+)\/transition$/)
  if (ordersTransitionMatch && req.method === 'POST') {
    const orderId = ordersTransitionMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      target_status: string
      reason?: string
    }>(req)

    if (typeof body.expected_version !== 'number' || !body.target_status) {
      throw AppError.validation('expected_version và target_status là bắt buộc')
    }

    try {
      const res = await pool.query(
        `SELECT public.transition_order_status($1, $2, $3, $4, $5) as result`,
        [orderId, body.expected_version, body.target_status, actor.userId, body.reason || null]
      )
      const updated = res.rows[0].result
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      handleDbError(err)
    }
  }

  const ordersNoteMatch = path.match(/^\/orders\/([0-9a-fA-F-]+)\/note$/)
  if (ordersNoteMatch && req.method === 'PATCH') {
    const orderId = ordersNoteMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      internal_note: string
    }>(req)

    if (typeof body.expected_version !== 'number' || body.internal_note === undefined) {
      throw AppError.validation('expected_version và internal_note là bắt buộc')
    }

    try {
      const res = await pool.query(
        `SELECT public.update_order_internal_note($1, $2, $3, $4) as result`,
        [orderId, body.expected_version, body.internal_note, actor.userId]
      )
      const updated = res.rows[0].result
      return jsonResponse(updated, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      handleDbError(err)
    }
  }

  const ordersPaymentMatch = path.match(/^\/orders\/([0-9a-fA-F-]+)\/payment$/)
  if (ordersPaymentMatch && req.method === 'POST') {
    const orderId = ordersPaymentMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      event: 'paid' | 'refunded' | 'corrected'
      method?: 'cash' | 'bank_transfer'
      reason?: string
    }>(req)

    if (typeof body.expected_version !== 'number' || !body.event) {
      throw AppError.validation('expected_version và event là bắt buộc')
    }

    const idempotencyKey = req.headers.get('idempotency-key')?.trim()
    const keyHash = idempotencyKey ? sha256(idempotencyKey) : null
    const actorScope = `admin:${actor.userId}`
    const requestHash = sha256(
      JSON.stringify({
        orderId,
        expected_version: body.expected_version,
        event: body.event,
        method: body.method || null,
        reason: body.reason || null,
      })
    )

    try {
      const res = await pool.query(
        `SELECT public.record_order_payment($1::uuid, $2::int, $3::text, $4::text, $5::uuid, $6::text, $7::text, $8::text, $9::text) as result`,
        [
          orderId,
          body.expected_version,
          body.event,
          body.method || null,
          actor.userId,
          body.reason || null,
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

  const ordersIdMatch = path.match(/^\/orders\/([0-9a-fA-F-]+)$/)
  if (ordersIdMatch && req.method === 'GET') {
    const orderId = ordersIdMatch[1]

    const [orderRes, itemsRes, historyRes, paymentsRes] = await Promise.all([
      pool.query(
        `SELECT
           o.*,
           sa.name as seating_area_name
         FROM public.orders o
         LEFT JOIN public.dining_tables dt ON o.table_id = dt.id
         LEFT JOIN public.seating_areas sa ON dt.seating_area_id = sa.id
         WHERE o.id = $1`,
        [orderId]
      ),
      pool.query(
        `SELECT
           id, menu_item_id, item_name, unit_price_vnd, quantity, line_total_vnd, note, position
         FROM public.order_items
         WHERE order_id = $1
         ORDER BY position ASC, created_at ASC`,
        [orderId]
      ),
      pool.query(
        `SELECT
           osh.id, osh.from_status, osh.to_status, osh.reason, osh.created_at,
           osh.actor_admin_id,
           ap.display_name as actor_name
         FROM public.order_status_history osh
         LEFT JOIN public.admin_profiles ap ON osh.actor_admin_id = ap.user_id
         WHERE osh.order_id = $1
         ORDER BY osh.created_at ASC`,
        [orderId]
      ),
      pool.query(
        `SELECT
           ope.id, ope.event, ope.amount_vnd, ope.method, ope.reason, ope.batch_id, ope.created_at,
           ope.actor_admin_id,
           ap.display_name as actor_name
         FROM public.order_payment_events ope
         LEFT JOIN public.admin_profiles ap ON ope.actor_admin_id = ap.user_id
         WHERE ope.order_id = $1
         ORDER BY ope.created_at ASC`,
        [orderId]
      ),
    ])

    if (orderRes.rows.length === 0) {
      throw AppError.notFound('Đơn hàng không tồn tại')
    }

    const orderRow = orderRes.rows[0]
    return jsonResponse(
      {
        order: {
          id: orderRow.id,
          code: orderRow.code,
          order_type: orderRow.order_type,
          status: orderRow.status,
          payment_status: orderRow.payment_status,
          payment_method: orderRow.payment_method,
          subtotal_vnd: Number(orderRow.subtotal_vnd),
          shipping_fee_vnd: Number(orderRow.shipping_fee_vnd),
          total_vnd: Number(orderRow.total_vnd),
          note: orderRow.note,
          internal_note: orderRow.internal_note,
          table_id: orderRow.table_id,
          table_visit_id: orderRow.table_visit_id,
          table_name: orderRow.table_name_snapshot,
          table_name_snapshot: orderRow.table_name_snapshot,
          address_snapshot: orderRow.address_snapshot,
          item_count: itemsRes.rows.length,
          seating_area_name: orderRow.seating_area_name,
          customer_name: orderRow.customer_name,
          customer_phone: orderRow.customer_phone,
          address: orderRow.address_snapshot,
          zone_name: orderRow.zone_name_snapshot,
          confirmed_at: orderRow.confirmed_at,
          completed_at: orderRow.completed_at,
          cancelled_at: orderRow.cancelled_at,
          paid_at: orderRow.paid_at,
          version: Number(orderRow.version),
          created_at: orderRow.created_at,
          updated_at: orderRow.updated_at,
        },
        items: itemsRes.rows.map((i) => ({
          id: i.id,
          menu_item_id: i.menu_item_id,
          item_name: i.item_name,
          name_snapshot: i.item_name,
          price_vnd: Number(i.unit_price_vnd),
          subtotal_vnd: Number(i.line_total_vnd),
          unit_price_vnd: Number(i.unit_price_vnd),
          quantity: Number(i.quantity),
          line_total_vnd: Number(i.line_total_vnd),
          note: i.note,
          position: Number(i.position),
        })),
        status_history: historyRes.rows.map((h) => ({
          id: h.id,
          from_status: h.from_status,
          to_status: h.to_status,
          reason: h.reason,
          created_at: h.created_at,
          actor_admin_id: h.actor_admin_id,
          actor_name: h.actor_name || 'Hệ thống',
        })),
        payment_events: paymentsRes.rows.map((p) => ({
          id: p.id,
          event: p.event,
          amount_vnd: Number(p.amount_vnd),
          method: p.method,
          reason: p.reason,
          batch_id: p.batch_id,
          created_at: p.created_at,
          actor_admin_id: p.actor_admin_id,
          actor_admin_name: p.actor_name || 'Hệ thống',
          actor_name: p.actor_name || 'Hệ thống',
        })),
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  return null
}
