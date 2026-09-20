/**
 * Tiger 345 - Admin API Edge Function Gateway
 * Handles admin-only endpoints: /dashboard, /orders, /tables, /visits, /reservations, /menu-items, /settings, /audit.
 * Verifies active admin status on EVERY request.
 */

import { Buffer } from 'node:buffer'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { handleCorsPreflight } from '../_shared/cors.ts'
import { getOrCreateRequestId, getClientIp, jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { toErrorResponse, AppError } from '../_shared/errors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256, generateSecureToken } from '../_shared/crypto.ts'
import type { AuthActor } from '../_shared/types.ts'
import { isTrustedTestEnvironment } from '../_shared/schedule.ts'
import { handleContentRoutes } from './content-handlers.ts'
import { handleConciergeKnowledgeRoutes } from './concierge-knowledge-handlers.ts'
import { listAdminFeedbackAsync, adminReviewFeedbackAsync } from '../_shared/concierge/feedback.ts'
import { processDeletionRetries } from '../_shared/account-deletion-worker.ts'

const { Pool } = pg

function handleDbError(err: unknown): never {
  if (err instanceof AppError) throw err
  if (err && typeof err === 'object') {
    const pgErr = err as { code?: string; message?: string }
    const msg = pgErr.message || ''
    if (pgErr.code === '23505') {
      if (msg.includes('dining_tables_code') || msg.includes('dining_tables_code_key')) {
        throw new AppError('DUPLICATE_CODE', 'Mã bàn đã tồn tại', 409)
      }
      if (msg.includes('idx_table_visits_single_open') || msg.includes('VISIT_ALREADY_OPEN')) {
        throw new AppError('VISIT_ALREADY_OPEN', 'Bàn đã có phiên phục vụ đang mở', 409)
      }
      throw new AppError('CONFLICT', 'Dữ liệu bị trùng lặp trong hệ thống', 409)
    }
    if (pgErr.code === 'P0001') {
      throw new AppError('TABLE_UNAVAILABLE', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0002') {
      throw AppError.notFound(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0003') {
      if (msg.includes('ORDER_LIST_MISMATCH')) {
        throw new AppError('ORDER_LIST_MISMATCH', msg.replace(/^[^:]+:\s*/, ''), 400)
      }
      throw AppError.versionConflict(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0004') {
      if (msg.includes('INVALID_TRANSITION')) {
        throw new AppError('INVALID_TRANSITION', msg.replace(/^[^:]+:\s*/, ''), 422)
      }
      if (msg.includes('VISIT_HAS_ACTIVE_ORDERS')) {
        throw new AppError('VISIT_HAS_ACTIVE_ORDERS', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('VISIT_NOT_SETTLED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0005') {
      throw new AppError('TABLE_HAS_ACTIVE_VISIT', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0012') {
      throw new AppError('VALIDATION_ERROR', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0018') {
      throw new AppError('PAYMENT_REQUIRED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0019') {
      if (msg.includes('RESERVATION_TERMINAL')) {
        throw new AppError('RESERVATION_TERMINAL', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('ORDER_TERMINAL', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0020') {
      if (msg.includes('ORDER_LIST_MISMATCH')) {
        throw new AppError('ORDER_LIST_MISMATCH', msg.replace(/^[^:]+:\s*/, ''), 400)
      }
      throw new AppError('INVALID_TRANSITION', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0021') {
      throw new AppError('PAID_ORDER_NOT_REFUNDED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0023') {
      if (msg.includes('ALREADY_PAID')) {
        throw new AppError('ALREADY_PAID', msg.replace(/^[^:]+:\s*/, ''), 409)
      }
      throw new AppError('NO_SHOW_GRACE_ACTIVE', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0024') {
      throw new AppError('CANCEL_NOTICE_EXPIRED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0026') {
      throw new AppError('REASON_REQUIRED', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0029') {
      throw new AppError('VISIT_HAS_PENDING_REFUNDS', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
  }
  throw err
}

export interface FunctionContext {
  supabaseAdmin?: SupabaseClient
  pool?: pg.Pool
}

let cachedPool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (!cachedPool) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL')
        : (typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined)
    const connectionString =
      envUrl || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    cachedPool = new Pool({ connectionString })
  }
  return cachedPool
}

let cachedAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!cachedAdmin) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_URL')
        : (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined)
    const url = envUrl || 'http://127.0.0.1:54321'
    const envKey =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        : (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined)
    const serviceRoleKey =
      envKey ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    cachedAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return cachedAdmin
}

export async function handleAdminApi(
  req: Request,
  ctx: FunctionContext = {}
): Promise<Response> {
  // 1. CORS Preflight
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const requestId = getOrCreateRequestId(req)
  const pool = ctx.pool || getPool()
  const supabaseAdmin = ctx.supabaseAdmin || getSupabaseAdmin()

  try {
    const clientIp = getClientIp(req)

    // 2. Strict Active Admin or System Cron Verification
    const cronHeader = req.headers.get('x-cron-secret')?.trim()
    const configuredCronSecret = process.env.CRON_SECRET?.trim()
    const isCronAuthorized =
      Boolean(configuredCronSecret) &&
      Boolean(cronHeader) &&
      cronHeader === configuredCronSecret

    let actor: AuthActor
    if (isCronAuthorized) {
      actor = {
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        displayName: 'System Retention Scheduler',
      }
    } else {
      // Verifies user JWT AND admin_profiles.active = true on EVERY request
      actor = await requireAdmin(req, supabaseAdmin, pool)
    }

    // 3. Admin Rate Limit (120 req / min)
    await assertRateLimit(pool, {
      key: `admin:${actor.userId || clientIp}`,
      limit: 120,
      windowSeconds: 60,
    })

    const url = new URL(req.url)
    const path = url.pathname
      .replace(/^\/functions\/v1\/admin-api/, '')
      .replace(/^\/admin-api/, '')

    // 4. Routing
    // Identity & Health: /health or /me returns the authenticated admin actor
    if (path === '/health' || path === '' || path === '/' || path === '/me') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'admin-api',
          actor: {
            role: actor.role,
            userId: actor.userId,
            displayName: actor.displayName,
          },
          time: new Date().toISOString(),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    if (path === '/dashboard' && req.method === 'GET') {
      const [
        pendingOrders,
        preparingOrders,
        waitingVisits,
        deliveringOrders,
        completedToday,
        openVisits,
        activeTables,
        settingsRes,
        recentPending,
      ] = await Promise.all([
        pool.query("SELECT count(*) as count FROM public.orders WHERE status = 'pending'"),
        pool.query("SELECT count(*) as count FROM public.orders WHERE status IN ('confirmed', 'preparing')"),
        pool.query(
          "SELECT count(DISTINCT table_visit_id) as count FROM public.orders WHERE status IN ('pending', 'confirmed', 'preparing') AND table_visit_id IS NOT NULL"
        ),
        pool.query("SELECT count(*) as count FROM public.orders WHERE status = 'delivering'"),
        pool.query(
          "SELECT count(*) as count FROM public.orders WHERE status = 'completed' AND completed_at >= date_trunc('day', now())"
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

      const settingsRow = settingsRes.rows[0] || {
        accepting_orders: true,
        accepting_dine_in_orders: true,
        accepting_delivery_orders: true,
        booking_enabled: true,
      }

      return jsonResponse(
        {
          pending_orders_count: Number(pendingOrders.rows[0].count),
          preparing_orders_count: Number(preparingOrders.rows[0].count),
          active_visits_waiting_count: Number(waitingVisits.rows[0].count),
          delivering_orders_count: Number(deliveringOrders.rows[0].count),
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

      if (orderType) {
        whereClauses.push(`o.order_type = $${paramIdx++}`)
        values.push(orderType)
      }
      if (status) {
        whereClauses.push(`o.status = $${paramIdx++}`)
        values.push(status)
      }
      if (date) {
        whereClauses.push(`(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $${paramIdx++}::date`)
        values.push(date)
      }
      if (search) {
        whereClauses.push(`(o.code ILIKE $${paramIdx} OR o.customer_phone ILIKE $${paramIdx} OR o.customer_name ILIKE $${paramIdx})`)
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
        const responseData = result.receipt ? { ...result.receipt, replayed: result.replayed } : result
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
           LEFT JOIN public.admin_profiles ap ON osh.actor_admin_id = ap.id
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
           LEFT JOIN public.admin_profiles ap ON ope.actor_admin_id = ap.id
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
            actor_name: p.actor_name || 'Hệ thống',
          })),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    // --------------------------------------------------------------------------
    // SETTINGS & MENU ITEMS ENDPOINTS
    // --------------------------------------------------------------------------

    if (path === '/settings' && req.method === 'GET') {
      const res = await pool.query(`SELECT * FROM public.restaurant_settings WHERE id = 1`)
      if (res.rows.length === 0) {
        throw AppError.notFound('Cấu hình nhà hàng không tồn tại')
      }
      return jsonResponse(res.rows[0], requestId, req, 200, { 'Cache-Control': 'no-store' })
    }

    if (path === '/settings' && req.method === 'PATCH') {
      const body = await parseJsonBody<{
        accepting_orders?: boolean
        accepting_dine_in_orders?: boolean
        accepting_delivery_orders?: boolean
        booking_enabled?: boolean
      }>(req)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const currentRes = await client.query(`SELECT * FROM public.restaurant_settings WHERE id = 1 FOR UPDATE`)
        if (currentRes.rows.length === 0) {
          throw AppError.notFound('Cấu hình nhà hàng không tồn tại')
        }
        const current = currentRes.rows[0]

        const updatedAcceptingOrders = body.accepting_orders !== undefined ? Boolean(body.accepting_orders) : current.accepting_orders
        const updatedDineIn = body.accepting_dine_in_orders !== undefined ? Boolean(body.accepting_dine_in_orders) : current.accepting_dine_in_orders
        const updatedDelivery = body.accepting_delivery_orders !== undefined ? Boolean(body.accepting_delivery_orders) : current.accepting_delivery_orders
        const updatedBooking = body.booking_enabled !== undefined ? Boolean(body.booking_enabled) : current.booking_enabled

        const updateRes = await client.query(
          `UPDATE public.restaurant_settings
           SET accepting_orders = $1,
               accepting_dine_in_orders = $2,
               accepting_delivery_orders = $3,
               booking_enabled = $4,
               updated_at = now()
           WHERE id = 1
           RETURNING *`,
          [updatedAcceptingOrders, updatedDineIn, updatedDelivery, updatedBooking]
        )

        await client.query(
          `INSERT INTO public.audit_logs (
             admin_id, actor_kind, action, entity_type, entity_id, metadata
           ) VALUES (
             $1, 'admin', 'update_settings', 'restaurant_settings', '1', $2
           )`,
          [
            actor.userId,
            JSON.stringify({
              accepting_orders: updatedAcceptingOrders,
              accepting_dine_in_orders: updatedDineIn,
              accepting_delivery_orders: updatedDelivery,
              booking_enabled: updatedBooking,
            }),
          ]
        )

        await client.query('COMMIT')
        return jsonResponse(updateRes.rows[0], requestId, req, 200, { 'Cache-Control': 'no-store' })
      } catch (err) {
        await client.query('ROLLBACK')
        handleDbError(err)
      } finally {
        client.release()
      }
    }

    // --------------------------------------------------------------------------
    // TABLES ENDPOINTS
    // --------------------------------------------------------------------------

    // GET /tables: list all tables with open visit & unpaid summaries
    if (path === '/tables' && req.method === 'GET') {
      const tablesRes = await pool.query(
        `SELECT
           t.id,
           t.code,
           t.name,
           t.seating_area_id,
           sa.name as seating_area_name,
           t.active,
           t.sort_order,
           t.version,
           t.created_at,
           t.updated_at,
           v.id as current_visit_id,
           v.status as current_visit_status,
           v.capability_epoch as current_visit_epoch,
           v.opened_at as current_visit_opened_at,
           v.version as current_visit_version,
           COALESCE((
             SELECT count(*) FROM public.orders o
             WHERE o.table_visit_id = v.id AND o.status NOT IN ('completed', 'cancelled')
           ), 0)::int as active_orders_count,
           COALESCE((
             SELECT count(*) FROM public.orders o
             WHERE o.table_visit_id = v.id AND o.payment_status = 'unpaid' AND o.status != 'cancelled'
           ), 0)::int as unpaid_orders_count,
           COALESCE((
             SELECT sum(o.total_vnd) FROM public.orders o
             WHERE o.table_visit_id = v.id AND o.payment_status = 'unpaid' AND o.status != 'cancelled'
           ), 0)::numeric as unpaid_total_vnd
         FROM public.dining_tables t
         LEFT JOIN public.seating_areas sa ON t.seating_area_id = sa.id
         LEFT JOIN public.table_visits v ON v.table_id = t.id AND v.status = 'open'
         ORDER BY t.sort_order ASC, t.code ASC`
      )

      const items = tablesRes.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        seating_area_id: row.seating_area_id,
        seating_area_name: row.seating_area_name,
        active: Boolean(row.active),
        sort_order: Number(row.sort_order),
        version: Number(row.version),
        created_at: row.created_at,
        updated_at: row.updated_at,
        current_visit: row.current_visit_id
          ? {
              id: row.current_visit_id,
              status: row.current_visit_status,
              capability_epoch: Number(row.current_visit_epoch),
              opened_at: row.current_visit_opened_at,
              version: Number(row.current_visit_version),
              active_orders_count: Number(row.active_orders_count),
              unpaid_orders_count: Number(row.unpaid_orders_count),
              unpaid_total_vnd: Number(row.unpaid_total_vnd),
            }
          : null,
      }))

      return jsonResponse({ items }, requestId, req, 200, { 'Cache-Control': 'no-store' })
    }

    // POST /tables: create table + generate first QR token (hash only in DB, raw returned once)
    if (path === '/tables' && req.method === 'POST') {
      const body = await parseJsonBody<{
        code?: string
        name?: string
        seating_area_id?: string | null
        active?: boolean
        sort_order?: number
      }>(req)

      const code = typeof body.code === 'string' ? body.code.trim() : ''
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!code || !name) {
        throw AppError.validation('Mã bàn và tên bàn là bắt buộc', {
          code: !code ? ['Mã bàn không được để trống'] : [],
          name: !name ? ['Tên bàn không được để trống'] : [],
        })
      }

      const active = body.active !== undefined ? Boolean(body.active) : true
      const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
      const seatingAreaId = body.seating_area_id || null

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Generate raw QR token & hash
        const rawToken = generateSecureToken(32)
        const tokenHash = sha256(rawToken)

        const insertTableRes = await client.query(
          `INSERT INTO public.dining_tables (
             id, code, name, seating_area_id, active, sort_order, version
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, $4, $5, 1
           ) RETURNING *`,
          [code, name, seatingAreaId, active, sortOrder]
        )
        const newTable = insertTableRes.rows[0]

        const insertQrRes = await client.query(
          `INSERT INTO public.table_qr_tokens (
             id, table_id, token_hash, active, created_at
           ) VALUES (
             gen_random_uuid(), $1, $2, true, now()
           ) RETURNING id`,
          [newTable.id, tokenHash]
        )
        const newQrId = insertQrRes.rows[0].id

        await client.query(
          `INSERT INTO public.audit_logs (
             admin_id, actor_kind, action, entity_type, entity_id, metadata
           ) VALUES (
             $1, 'admin', 'create_table', 'dining_table', $2, $3
           )`,
          [
            actor.userId,
            newTable.id,
            JSON.stringify({
              code: newTable.code,
              name: newTable.name,
              qr_token_id: newQrId,
            }),
          ]
        )

        await client.query('COMMIT')

        const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
        return jsonResponse(
          {
            table: newTable,
            qr_token_id: newQrId,
            qr_token: rawToken, // Returned ONE-TIME only
            qr_url: `${siteUrl}/table/${rawToken}`,
          },
          requestId,
          req,
          201,
          { 'Cache-Control': 'no-store' }
        )
      } catch (err) {
        await client.query('ROLLBACK')
        handleDbError(err)
      } finally {
        client.release()
      }
    }

    // Dynamic routing for /tables/:id sub-paths
    const tablesQrMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)\/qr(?:\/rotate)?$/)
    if (tablesQrMatch && req.method === 'POST') {
      const tableId = tablesQrMatch[1]
      const body = await parseJsonBody<{ expected_version?: number }>(req)

      const rawToken = generateSecureToken(32)
      const tokenHash = sha256(rawToken)

      try {
        const res = await pool.query(
          `SELECT public.rotate_table_qr($1, $2, $3, $4) as result`,
          [tableId, tokenHash, actor.userId, body.expected_version ?? null]
        )
        const result = res.rows[0].result
        const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'

        return jsonResponse(
          {
            table: result.table,
            table_id: tableId,
            qr_token_id: result.qr_token_id,
            qr_token: rawToken, // Returned ONE-TIME only
            qr_url: `${siteUrl}/table/${rawToken}`,
            epoch_bumped: result.epoch_bumped,
          },
          requestId,
          req,
          200,
          { 'Cache-Control': 'no-store' }
        )
      } catch (err) {
        handleDbError(err)
      }
    }

    const tablesVisitsMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)\/visits$/)
    if (tablesVisitsMatch && req.method === 'POST') {
      const tableId = tablesVisitsMatch[1]
      const body = await parseJsonBody<{ expected_table_version?: number }>(req)

      try {
        const res = await pool.query(
          `SELECT public.open_table_visit($1, $2, $3) as result`,
          [tableId, actor.userId, body.expected_table_version ?? null]
        )
        const newVisit = res.rows[0].result
        return jsonResponse(newVisit, requestId, req, 201, { 'Cache-Control': 'no-store' })
      } catch (err) {
        handleDbError(err)
      }
    }

    const tablesIdMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)$/)
    if (tablesIdMatch && req.method === 'PATCH') {
      const tableId = tablesIdMatch[1]
      const body = await parseJsonBody<{
        expected_version: number
        code?: string
        name?: string
        seating_area_id?: string | null
        active?: boolean
        sort_order?: number
      }>(req)

      if (typeof body.expected_version !== 'number') {
        throw AppError.validation('expected_version là bắt buộc để cập nhật thông tin bàn')
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const currentRes = await client.query(
          `SELECT * FROM public.dining_tables WHERE id = $1 FOR UPDATE`,
          [tableId]
        )
        if (currentRes.rows.length === 0) {
          throw AppError.notFound('Bàn không tồn tại')
        }
        const current = currentRes.rows[0]
        if (current.version !== body.expected_version) {
          throw AppError.versionConflict('Thông tin bàn đã bị thay đổi bởi người khác')
        }

        const updatedCode = body.code !== undefined ? body.code.trim() : current.code
        const updatedName = body.name !== undefined ? body.name.trim() : current.name
        const updatedSeatingAreaId =
          body.seating_area_id !== undefined ? body.seating_area_id : current.seating_area_id
        const updatedActive = body.active !== undefined ? Boolean(body.active) : current.active
        const updatedSortOrder = body.sort_order !== undefined ? body.sort_order : current.sort_order

        // Updating table (deactivation guard trigger will fire if active true -> false while visit is open)
        const updateRes = await client.query(
          `UPDATE public.dining_tables
           SET code = $1,
               name = $2,
               seating_area_id = $3,
               active = $4,
               sort_order = $5,
               version = version + 1,
               updated_at = now()
           WHERE id = $6 AND version = $7
           RETURNING *`,
          [
            updatedCode,
            updatedName,
            updatedSeatingAreaId,
            updatedActive,
            updatedSortOrder,
            tableId,
            body.expected_version,
          ]
        )

        if (updateRes.rows.length === 0) {
          throw AppError.versionConflict('Thông tin bàn đã bị thay đổi (version mismatch)')
        }

        const updatedTable = updateRes.rows[0]

        await client.query(
          `INSERT INTO public.audit_logs (
             admin_id, actor_kind, action, entity_type, entity_id, metadata
           ) VALUES (
             $1, 'admin', 'update_table', 'dining_table', $2, $3
           )`,
          [
            actor.userId,
            tableId,
            JSON.stringify({
              old_version: body.expected_version,
              new_version: updatedTable.version,
              active: updatedTable.active,
            }),
          ]
        )

        await client.query('COMMIT')
        return jsonResponse(updatedTable, requestId, req, 200, { 'Cache-Control': 'no-store' })
      } catch (err) {
        await client.query('ROLLBACK')
        handleDbError(err)
      } finally {
        client.release()
      }
    }

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
        const responseData = result.receipt ? { ...result.receipt, replayed: result.replayed } : result
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
      const unpaidTotalVnd = unpaidOrders.reduce(
        (sum, o) => sum + Number(o.total_vnd || 0),
        0
      )

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

    // GET /concierge/feedback or /feedback/concierge - Admin inspects feedback pipeline (§22)
    if ((path === '/concierge/feedback' || path === '/feedback/concierge') && req.method === 'GET') {
      const statusParam = url.searchParams.get('status') as
        | 'NEW'
        | 'REVIEWED'
        | 'DISMISSED'
        | null
      const ratingParam = url.searchParams.get('rating') as
        | 'perfect'
        | 'too_much'
        | 'too_little'
        | 'too_expensive'
        | 'dislike'
        | null
      const records = await listAdminFeedbackAsync(pool, {
        status: statusParam || undefined,
        rating: ratingParam || undefined,
      })
      return jsonResponse({ items: records, total: records.length }, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    // PATCH /concierge/feedback/:id or /feedback/concierge/:id - Admin reviews or dismisses feedback (§22)
    const feedbackIdMatch = path.match(/^\/(?:concierge\/feedback|feedback\/concierge)\/([a-zA-Z0-9_-]+)$/)
    if (feedbackIdMatch && req.method === 'PATCH') {
      const feedbackId = feedbackIdMatch[1]
      const body = await parseJsonBody<{
        status: 'REVIEWED' | 'DISMISSED'
        admin_notes?: string
      }>(req)
      if (!body.status || !['REVIEWED', 'DISMISSED'].includes(body.status)) {
        throw new AppError('VALIDATION_ERROR', 'Trạng thái xử lý phải là REVIEWED hoặc DISMISSED')
      }
      const updated = await adminReviewFeedbackAsync(pool, feedbackId, {
        status: body.status,
        admin_notes: body.admin_notes,
        reviewed_by: actor?.userId || null,
      })

      if (pool) {
        await pool.query(
          `INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
           VALUES ($1, 'admin', 'review_concierge_feedback', 'concierge_feedback', $2, $3)`,
          [actor.userId, feedbackId, JSON.stringify({ status: body.status, admin_notes: body.admin_notes })]
        )
      }

      return jsonResponse(updated, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    // --------------------------------------------------------------------------
    // RESERVATIONS ENDPOINTS (Task T12, Invariants V15, V16, V24)
    // --------------------------------------------------------------------------

    // GET /reservations - List reservations with date/status filters and pagination
    if (path === '/reservations' && req.method === 'GET') {
      const dateParam = url.searchParams.get('date')?.trim() // YYYY-MM-DD
      const statusParam = url.searchParams.get('status')?.trim()
      const searchParam = url.searchParams.get('search')?.trim()
      const limitParam = parseInt(url.searchParams.get('limit') || '20', 10)
      const limit = Math.min(Math.max(Number.isInteger(limitParam) ? limitParam : 20, 1), 100)
      const cursorParam = url.searchParams.get('cursor')?.trim()

      const conditions: string[] = []
      const values: unknown[] = []

      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        values.push(dateParam)
        conditions.push(`(starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $${values.length}`)
      }

      if (statusParam) {
        values.push(statusParam)
        conditions.push(`status = $${values.length}`)
      }

      if (searchParam) {
        values.push(`%${searchParam}%`)
        conditions.push(
          `(code ILIKE $${values.length} OR customer_phone ILIKE $${values.length} OR customer_name ILIKE $${values.length})`
        )
      }

      if (cursorParam) {
        try {
          const decoded = Buffer.from(cursorParam, 'base64').toString('utf8')
          const [cursorStartsAt, cursorId] = decoded.split('|')
          if (cursorStartsAt && cursorId) {
            values.push(cursorStartsAt, cursorId)
            conditions.push(`(starts_at, id) > ($${values.length - 1}, $${values.length})`)
          }
        } catch {
          // ignore malformed cursor
        }
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      values.push(limit + 1)
      const queryStr = `
        SELECT
          id, code, customer_name, customer_phone,
          starts_at, ends_at, guest_count,
          seating_area_id, area_name_snapshot,
          status, note, internal_note,
          contact_outcome, contacted_at,
          version, created_at, updated_at
        FROM public.reservations
        ${whereClause}
        ORDER BY starts_at ASC, id ASC
        LIMIT $${values.length}
      `

      const res = await pool.query(queryStr, values)
      const hasMore = res.rows.length > limit
      const items = hasMore ? res.rows.slice(0, limit) : res.rows

      let nextCursor: string | null = null
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1]
        nextCursor = Buffer.from(`${lastItem.starts_at.toISOString()}|${lastItem.id}`).toString('base64')
      }

      return jsonResponse(
        {
          items: items.map((r) => ({
            id: r.id,
            code: r.code,
            customer_name: r.customer_name,
            customer_phone: r.customer_phone,
            starts_at: r.starts_at,
            ends_at: r.ends_at,
            guest_count: Number(r.guest_count),
            seating_area_id: r.seating_area_id,
            area_name_snapshot: r.area_name_snapshot,
            status: r.status,
            note: r.note,
            internal_note: r.internal_note,
            contact_outcome: r.contact_outcome,
            contacted_at: r.contacted_at,
            version: Number(r.version),
            created_at: r.created_at,
            updated_at: r.updated_at,
          })),
          next_cursor: nextCursor,
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    // GET /reservations/:id - Reservation detail
    const singleResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})$/)
    if (singleResvMatch && req.method === 'GET') {
      const reservationId = singleResvMatch[1]
      const res = await pool.query(
        `SELECT
          id, code, customer_user_id, customer_name, customer_phone,
          starts_at, ends_at, guest_count,
          seating_area_id, area_name_snapshot,
          status, note, internal_note,
          contact_outcome, contacted_at,
          version, created_at, updated_at
        FROM public.reservations
        WHERE id = $1`,
        [reservationId]
      )
      if (res.rows.length === 0) {
        throw AppError.notFound('Đặt bàn không tồn tại')
      }
      const r = res.rows[0]
      return jsonResponse(
        {
          id: r.id,
          code: r.code,
          customer_user_id: r.customer_user_id,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          guest_count: Number(r.guest_count),
          seating_area_id: r.seating_area_id,
          area_name_snapshot: r.area_name_snapshot,
          status: r.status,
          note: r.note,
          internal_note: r.internal_note,
          contact_outcome: r.contact_outcome,
          contacted_at: r.contacted_at,
          version: Number(r.version),
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    // POST /reservations/:id/transition - Transition reservation state
    const transitionResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/transition$/)
    if (transitionResvMatch && req.method === 'POST') {
      const reservationId = transitionResvMatch[1]
      const body = await parseJsonBody<Record<string, unknown>>(req)
      const expectedVersion =
        typeof body.expected_version === 'number' ? body.expected_version : Number(body.expected_version)
      const targetStatus = typeof body.target_status === 'string' ? body.target_status.trim() : ''
      const reason = typeof body.reason === 'string' ? body.reason.trim() : null

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw AppError.validation('expected_version không hợp lệ (phải là số nguyên >= 1)', {
          expected_version: ['Bắt buộc phải có expected_version'],
        })
      }
      const allowedStatuses = ['confirmed', 'rejected', 'cancelled', 'seated', 'completed', 'no_show']
      if (!allowedStatuses.includes(targetStatus)) {
        throw AppError.validation(`target_status không hợp lệ (${targetStatus})`, {
          target_status: [`Phải thuộc một trong: ${allowedStatuses.join(', ')}`],
        })
      }

      let testNow: Date | null = null
      if (isTrustedTestEnvironment()) {
        const testNowHeader = req.headers.get('x-test-now') || req.headers.get('X-Test-Now')
        if (testNowHeader) {
          const parsed = new Date(testNowHeader.trim())
          if (!isNaN(parsed.getTime())) {
            testNow = parsed
          }
        }
      }

      try {
        const rpcRes = await pool.query(
          `SELECT public.transition_reservation($1, $2, $3, $4, $5, $6) as result`,
          [
            reservationId,
            expectedVersion,
            targetStatus,
            actor.userId,
            reason,
            testNow ? testNow.toISOString() : null,
          ]
        )
        const result = rpcRes.rows[0].result
        return jsonResponse(result, requestId, req, 200, { 'Cache-Control': 'no-store' })
      } catch (err: unknown) {
        handleDbError(err)
      }
    }

    // PATCH /reservations/:id/contact - Record phone call outcome
    const contactResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/contact$/)
    if (contactResvMatch && req.method === 'PATCH') {
      const reservationId = contactResvMatch[1]
      const body = await parseJsonBody<Record<string, unknown>>(req)
      const expectedVersion =
        typeof body.expected_version === 'number' ? body.expected_version : Number(body.expected_version)
      const outcome = typeof body.outcome === 'string' ? body.outcome.trim() : ''
      const contactedAt = typeof body.contacted_at === 'string' ? new Date(body.contacted_at) : null

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw AppError.validation('expected_version không hợp lệ', {
          expected_version: ['Bắt buộc'],
        })
      }
      if (outcome.length === 0) {
        throw AppError.validation('Kết quả liên hệ (outcome) không được để trống', {
          outcome: ['Bắt buộc'],
        })
      }

      try {
        const rpcRes = await pool.query(
          `SELECT public.update_reservation_contact($1, $2, $3, $4, $5) as result`,
          [
            reservationId,
            expectedVersion,
            outcome,
            actor.userId,
            contactedAt ? contactedAt.toISOString() : null,
          ]
        )
        return jsonResponse(rpcRes.rows[0].result, requestId, req, 200, { 'Cache-Control': 'no-store' })
      } catch (err: unknown) {
        handleDbError(err)
      }
    }

    // PATCH /reservations/:id/note - Update staff internal note
    const noteResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/note$/)
    if (noteResvMatch && req.method === 'PATCH') {
      const reservationId = noteResvMatch[1]
      const body = await parseJsonBody<Record<string, unknown>>(req)
      const expectedVersion =
        typeof body.expected_version === 'number' ? body.expected_version : Number(body.expected_version)
      const internalNote = typeof body.internal_note === 'string' ? body.internal_note.trim() : ''

      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw AppError.validation('expected_version không hợp lệ', {
          expected_version: ['Bắt buộc'],
        })
      }

      try {
        const rpcRes = await pool.query(
          `SELECT public.update_reservation_internal_note($1, $2, $3, $4) as result`,
          [reservationId, expectedVersion, internalNote, actor.userId]
        )
        return jsonResponse(rpcRes.rows[0].result, requestId, req, 200, { 'Cache-Control': 'no-store' })
      } catch (err: unknown) {
        handleDbError(err)
      }
    }

    // --------------------------------------------------------------------------
    // RETENTION CLEANUP ENDPOINTS (Task T19, Invariants V23 / D04)
    // --------------------------------------------------------------------------

    // GET /retention/dry-run - Reports count of expired records eligible for purge
    if (path === '/retention/dry-run' && req.method === 'GET') {
      const res = await pool.query(`SELECT public.run_retention_cleanup(true) as result`)
      return jsonResponse(res.rows[0].result, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    // POST /retention/retry-deletions - Retries pending/failed Auth deletions (F05 Remediation)
    if (
      (path === '/retention/retry-deletions' || path === '/account-deletions/retry') &&
      req.method === 'POST'
    ) {
      const rawBody = (await parseJsonBody<Record<string, unknown>>(req).catch(() => ({} as Record<string, unknown>))) || {}
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
      const retryReport = await processDeletionRetries(pool, supabaseAdmin)
      const combined = {
        ...res.rows[0].result,
        deletion_retries: retryReport,
      }

      return jsonResponse(combined, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    // 5. Content, Settings, Storage & Audit Handlers (Task T13)
    const contentRes = await handleContentRoutes(req, path, actor, pool, supabaseAdmin, requestId)
    if (contentRes) {
      return contentRes
    }

    // 6. Concierge Knowledge & Governance Handlers (Task C03)
    const conciergeKnowledgeRes = await handleConciergeKnowledgeRoutes(
      req,
      path,
      actor,
      pool,
      supabaseAdmin,
      requestId
    )
    if (conciergeKnowledgeRes) {
      return conciergeKnowledgeRes
    }

    throw AppError.notFound(`Không tìm thấy endpoint admin: ${req.method} ${path}`)
  } catch (err: unknown) {
    return toErrorResponse(err, requestId, req)
  }
}

// Deno Edge Runtime HTTP Entrypoint
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req: Request) => handleAdminApi(req))
}

export default handleAdminApi

