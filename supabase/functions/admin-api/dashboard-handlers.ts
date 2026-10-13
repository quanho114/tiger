import { jsonResponse } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import type { RouteContext } from './context.ts'

export async function handleDashboardRoutes({
  req,
  path,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  if (path === '/dashboard' && req.method === 'GET') {
    const [
      pendingOrders,
      preparingOrders,
      waitingVisits,
      deliveringOrders,
      completedToday,
      bookingsToday,
      openVisits,
      activeTables,
      settingsRes,
      recentPending,
    ] = await Promise.all([
      pool.query("SELECT count(*) as count FROM public.orders WHERE status = 'pending'"),
      pool.query(
        "SELECT count(*) as count FROM public.orders WHERE status IN ('confirmed', 'preparing')"
      ),
      pool.query(
        "SELECT count(DISTINCT table_visit_id) as count FROM public.orders WHERE status IN ('pending', 'confirmed', 'preparing') AND table_visit_id IS NOT NULL"
      ),
      pool.query("SELECT count(*) as count FROM public.orders WHERE status = 'delivering'"),
      pool.query(
        "SELECT count(*) as count FROM public.orders WHERE status = 'completed' AND completed_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')"
      ),
      pool.query(
        "SELECT count(*) as count FROM public.reservations WHERE status = 'confirmed' AND (starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date"
      ),
      pool.query("SELECT count(*) as count FROM public.table_visits WHERE status = 'open'"),
      pool.query('SELECT count(*) as count FROM public.dining_tables WHERE active = true'),
      pool.query(
        'SELECT accepting_orders, accepting_dine_in_orders, accepting_delivery_orders, booking_enabled FROM public.restaurant_settings WHERE id = 1'
      ),
      pool.query(
        `SELECT
           o.id, o.code, o.order_type, o.status, o.total_vnd, o.note, o.created_at, o.version,
           o.table_id, o.table_name_snapshot, o.customer_name, o.customer_phone,
           COALESCE((SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id), 0)::int as items_count
         FROM public.orders o
         WHERE o.status = 'pending'
         ORDER BY o.created_at DESC
         LIMIT 10`
      ),
    ])

    const settingsRow = settingsRes.rows[0]
    if (!settingsRow) throw AppError.notFound('Cấu hình nhà hàng không tồn tại')

    return jsonResponse(
      {
        pending_orders_count: Number(pendingOrders.rows[0].count),
        preparing_orders_count: Number(preparingOrders.rows[0].count),
        active_visits_waiting_count: Number(waitingVisits.rows[0].count),
        delivering_orders_count: Number(deliveringOrders.rows[0].count),
        confirmed_bookings_today_count: Number(bookingsToday.rows[0].count),
        completed_today_count: Number(completedToday.rows[0].count),
        open_visits_count: Number(openVisits.rows[0].count),
        active_tables_count: Number(activeTables.rows[0].count),
        settings: {
          accepting_orders: Boolean(settingsRow.accepting_orders),
          accepting_dine_in_orders: Boolean(settingsRow.accepting_dine_in_orders),
          accepting_delivery_orders: Boolean(settingsRow.accepting_delivery_orders),
          booking_enabled: Boolean(settingsRow.booking_enabled),
        },
        recent_pending_orders: recentPending.rows.map((row) => ({
          id: row.id,
          code: row.code,
          order_type: row.order_type,
          status: row.status,
          total_vnd: Number(row.total_vnd),
          note: row.note,
          created_at: row.created_at,
          version: Number(row.version),
          table_id: row.table_id,
          table_name: row.table_name_snapshot,
          customer_name: row.customer_name,
          customer_phone: row.customer_phone,
          items_count: Number(row.items_count),
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
