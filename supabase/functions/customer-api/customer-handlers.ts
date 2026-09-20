/**
 * Tiger 345 - Customer API Handlers
 * Implements private endpoints: /me, /me/home, /me/orders, /me/reservations, /me/addresses, /me/favorites, /me/reorder.
 * Enforces Invariants:
 * - V04: Ownership checks on every query, Private DTO whitelist, Cache-Control: no-store
 * - V16: Reservation state machine, notice cutoff check (P0024), OCC versioning (P0003)
 * - V20: Address default atomicity and promotion on deletion
 * - V21: Frequent items derived solely from completed orders with deterministic tie-break;
 *        Reorder checks live menu price/availability/mode without copying old tables/prices
 */

import { Buffer } from 'node:buffer'
import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import type { AuthActor } from '../_shared/types.ts'
import { sha256 } from '../_shared/crypto.ts'
import {
  CustomerProfilePatchSchema,
  CustomerAddressCreateSchema,
  CustomerAddressUpdateSchema,
  CustomerCancelReservationSchema,
  CustomerReorderSchema,
} from '../_shared/contracts/customer.ts'
import { isTrustedTestEnvironment } from '../_shared/schedule.ts'

const PRIVATE_CACHE_HEADERS = { 'Cache-Control': 'no-store' }

export function handleCustomerDbError(err: unknown): never {
  if (err && typeof err === 'object' && 'code' in err) {
    const pgErr = err as { code: string; message: string }
    const msg = pgErr.message || ''

    if (pgErr.code === 'P0002') {
      throw AppError.notFound(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0003') {
      throw AppError.versionConflict(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0004' || pgErr.code === 'P0020') {
      throw new AppError('INVALID_TRANSITION', msg.replace(/^[^:]+:\s*/, ''), 422)
    }
    if (pgErr.code === 'P0012') {
      throw AppError.validation(msg.replace(/^[^:]+:\s*/, ''))
    }
    if (pgErr.code === 'P0019') {
      throw new AppError('RESERVATION_TERMINAL', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === 'P0024') {
      throw new AppError('CANCEL_NOTICE_EXPIRED', msg.replace(/^[^:]+:\s*/, ''), 409)
    }
    if (pgErr.code === '23505') {
      throw new AppError('CONFLICT', 'Dữ liệu bị trùng lặp trong hệ thống', 409)
    }
  }
  throw err
}

async function parseBody<T>(req: Request): Promise<T> {
  try {
    const text = await req.text()
    if (!text || text.trim() === '') {
      return {} as T
    }
    return JSON.parse(text) as T
  } catch {
    throw AppError.validation('Nội dung yêu cầu (JSON) không hợp lệ')
  }
}

// -----------------------------------------------------------------------------
// 1. PROFILE HANDLERS: GET /me, PATCH /me
// -----------------------------------------------------------------------------

export async function handleGetProfile(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const profileRes = await pool.query(
    `SELECT user_id, display_name, phone, avatar_url, marketing_opt_in, created_at, updated_at
     FROM public.customer_profiles
     WHERE user_id = $1`,
    [actor.userId]
  )

  if (profileRes.rows.length === 0) {
    throw AppError.notFound('Không tìm thấy thông tin tài khoản')
  }

  const row = profileRes.rows[0]
  return jsonResponse(
    {
      user_id: row.user_id,
      display_name: row.display_name,
      phone: row.phone,
      avatar_url: row.avatar_url,
      marketing_opt_in: Boolean(row.marketing_opt_in),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

export async function handlePatchProfile(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const rawBody = await parseBody<unknown>(req)
  const parseResult = CustomerProfilePatchSchema.safeParse(rawBody)

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'payload'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    throw AppError.validation('Dữ liệu cập nhật hồ sơ không hợp lệ', fieldErrors)
  }

  const data = parseResult.data
  const updates: string[] = []
  const values: unknown[] = []
  let idx = 1

  if (data.display_name !== undefined) {
    updates.push(`display_name = $${idx++}`)
    values.push(data.display_name)
  }
  if (data.phone !== undefined) {
    updates.push(`phone = $${idx++}`)
    values.push(data.phone)
  }
  if (data.avatar_url !== undefined) {
    updates.push(`avatar_url = $${idx++}`)
    values.push(data.avatar_url)
  }
  if (data.marketing_opt_in !== undefined) {
    updates.push(`marketing_opt_in = $${idx++}`)
    values.push(data.marketing_opt_in)
  }

  if (updates.length === 0) {
    throw AppError.validation('Vui lòng cung cấp ít nhất một trường để cập nhật')
  }

  updates.push(`updated_at = now()`)
  values.push(actor.userId)

  const query = `
    UPDATE public.customer_profiles
    SET ${updates.join(', ')}
    WHERE user_id = $${idx}
    RETURNING user_id, display_name, phone, avatar_url, marketing_opt_in, created_at, updated_at
  `

  const res = await pool.query(query, values)
  if (res.rows.length === 0) {
    throw AppError.notFound('Không tìm thấy thông tin tài khoản để cập nhật')
  }

  const row = res.rows[0]
  return jsonResponse(
    {
      user_id: row.user_id,
      display_name: row.display_name,
      phone: row.phone,
      avatar_url: row.avatar_url,
      marketing_opt_in: Boolean(row.marketing_opt_in),
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

// -----------------------------------------------------------------------------
// 2. HOME AGGREGATE HANDLER: GET /me/home (Invariant V21)
// -----------------------------------------------------------------------------

export async function handleGetHome(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const userId = actor.userId

  // A. Recent Orders (up to 3)
  const recentOrdersRes = await pool.query(
    `SELECT
       o.id,
       o.code,
       o.order_type,
       o.status,
       o.payment_status,
       o.total_vnd,
       o.created_at,
       COALESCE((SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id), 0)::int as item_count
     FROM public.orders o
     WHERE o.customer_user_id = $1
     ORDER BY o.created_at DESC
     LIMIT 3`,
    [userId]
  )

  // B. Frequent Items (up to 6, derived ONLY from completed orders, deterministic tie-break)
  // Excludes unpublished or deleted items; retains available = false with out-of-stock flag
  const frequentItemsRes = await pool.query(
    `SELECT
       oi.menu_item_id,
       mi.name,
       mi.slug,
       mi.price_vnd,
       mi.image_path,
       mi.available,
       mi.allow_dine_in,
       mi.allow_delivery,
       c.id as category_id,
       c.name as category_name,
       SUM(oi.quantity)::int as total_quantity,
       COUNT(DISTINCT o.id)::int as order_count,
       MAX(o.created_at) as last_ordered_at
     FROM public.order_items oi
     JOIN public.orders o ON o.id = oi.order_id
     JOIN public.menu_items mi ON mi.id = oi.menu_item_id
     JOIN public.categories c ON c.id = mi.category_id
     WHERE o.customer_user_id = $1
       AND o.status = 'completed'
       AND mi.published = true
       AND c.active = true
     GROUP BY oi.menu_item_id, mi.name, mi.slug, mi.price_vnd, mi.image_path, mi.available, mi.allow_dine_in, mi.allow_delivery, c.id, c.name
     ORDER BY total_quantity DESC, order_count DESC, last_ordered_at DESC, oi.menu_item_id ASC
     LIMIT 6`,
    [userId]
  )

  // C. Customer Favorites (up to 6, projected with current menu item info)
  const favoritesRes = await pool.query(
    `SELECT
       cf.menu_item_id,
       mi.name,
       mi.slug,
       mi.price_vnd,
       mi.image_path,
       mi.available,
       mi.allow_dine_in,
       mi.allow_delivery,
       c.id as category_id,
       c.name as category_name,
       cf.created_at
     FROM public.customer_favorites cf
     JOIN public.menu_items mi ON mi.id = cf.menu_item_id
     JOIN public.categories c ON c.id = mi.category_id
     WHERE cf.user_id = $1
       AND mi.published = true
       AND c.active = true
     ORDER BY cf.created_at DESC
     LIMIT 6`,
    [userId]
  )

  // D. Upcoming Reservations (up to 3 active)
  const upcomingResvRes = await pool.query(
    `SELECT
       id, code, customer_name, customer_phone, starts_at, ends_at,
       guest_count, seating_area_id, area_name_snapshot, status, note, version, created_at
     FROM public.reservations
     WHERE customer_user_id = $1
       AND status IN ('pending', 'confirmed')
       AND starts_at >= (now() - interval '2 hours')
     ORDER BY starts_at ASC
     LIMIT 3`,
    [userId]
  )

  return jsonResponse(
    {
      recent_orders: recentOrdersRes.rows.map((r) => ({
        id: r.id,
        code: r.code,
        order_type: r.order_type,
        status: r.status,
        payment_status: r.payment_status,
        total_vnd: Number(r.total_vnd),
        item_count: Number(r.item_count),
        created_at: r.created_at,
      })),
      frequent_items: frequentItemsRes.rows.map((r) => ({
        menu_item_id: r.menu_item_id,
        name: r.name,
        slug: r.slug,
        price_vnd: Number(r.price_vnd),
        image_path: r.image_path,
        available: Boolean(r.available),
        allow_dine_in: Boolean(r.allow_dine_in),
        allow_delivery: Boolean(r.allow_delivery),
        category_id: r.category_id,
        category_name: r.category_name,
        total_quantity: Number(r.total_quantity),
        order_count: Number(r.order_count),
        last_ordered_at: r.last_ordered_at,
      })),
      favorites: favoritesRes.rows.map((r) => ({
        menu_item_id: r.menu_item_id,
        name: r.name,
        slug: r.slug,
        price_vnd: Number(r.price_vnd),
        image_path: r.image_path,
        available: Boolean(r.available),
        allow_dine_in: Boolean(r.allow_dine_in),
        allow_delivery: Boolean(r.allow_delivery),
        category_id: r.category_id,
        category_name: r.category_name,
        created_at: r.created_at,
      })),
      upcoming_reservations: upcomingResvRes.rows.map((r) => ({
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
        version: Number(r.version),
        created_at: r.created_at,
      })),
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

// -----------------------------------------------------------------------------
// 3. ORDERS HANDLERS: GET /me/orders, GET /me/orders/:id (Invariant V04 & V20)
// -----------------------------------------------------------------------------

export async function handleGetOrders(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  url: URL
): Promise<Response> {
  const limitParam = parseInt(url.searchParams.get('limit') || '20', 10)
  const limit = Math.min(Math.max(Number.isInteger(limitParam) ? limitParam : 20, 1), 100)
  const cursorParam = url.searchParams.get('cursor')?.trim()
  const statusParam = url.searchParams.get('status')?.trim()
  const orderTypeParam = url.searchParams.get('order_type')?.trim()

  const conditions: string[] = ['o.customer_user_id = $1']
  const values: unknown[] = [actor.userId]
  let idx = 2

  if (statusParam) {
    conditions.push(`o.status = $${idx++}`)
    values.push(statusParam)
  }
  if (orderTypeParam) {
    conditions.push(`o.order_type = $${idx++}`)
    values.push(orderTypeParam)
  }

  if (cursorParam) {
    try {
      const decoded = Buffer.from(cursorParam, 'base64').toString('utf-8')
      const [cursorCreatedAt, cursorId] = decoded.split('|')
      if (cursorCreatedAt && cursorId) {
        conditions.push(`(o.created_at, o.id) < ($${idx++}, $${idx++})`)
        values.push(cursorCreatedAt, cursorId)
      }
    } catch {
      // Ignore invalid cursor
    }
  }

  const query = `
    SELECT
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
      o.table_name_snapshot,
      o.address_snapshot,
      o.zone_name_snapshot,
      o.created_at,
      o.paid_at,
      o.confirmed_at,
      o.completed_at,
      o.cancelled_at,
      COALESCE((SELECT count(*) FROM public.order_items oi WHERE oi.order_id = o.id), 0)::int as item_count,
      COALESCE((
        SELECT json_agg(json_build_object(
          'item_name', oi.item_name,
          'quantity', oi.quantity
        ) ORDER BY oi.position ASC)
        FROM public.order_items oi WHERE oi.order_id = o.id
      ), '[]'::json) as items_summary
    FROM public.orders o
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC, o.id DESC
    LIMIT $${idx}
  `
  values.push(limit + 1)

  const res = await pool.query(query, values)
  const hasMore = res.rows.length > limit
  const items = hasMore ? res.rows.slice(0, limit) : res.rows

  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]
    nextCursor = Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString('base64')
  }

  // Private DTO Whitelist (Invariant V04): no internal_note, no admin IDs, no claim hash
  const dtos = items.map((o) => ({
    id: o.id,
    code: o.code,
    order_type: o.order_type,
    status: o.status,
    payment_status: o.payment_status,
    payment_method: o.payment_method,
    subtotal_vnd: Number(o.subtotal_vnd),
    shipping_fee_vnd: Number(o.shipping_fee_vnd),
    total_vnd: Number(o.total_vnd),
    note: o.note,
    table_name_snapshot: o.table_name_snapshot,
    address_snapshot: o.address_snapshot,
    zone_name_snapshot: o.zone_name_snapshot,
    item_count: Number(o.item_count),
    items_summary: o.items_summary,
    created_at: o.created_at,
    paid_at: o.paid_at,
    confirmed_at: o.confirmed_at,
    completed_at: o.completed_at,
    cancelled_at: o.cancelled_at,
  }))

  return jsonResponse(
    {
      items: dtos,
      next_cursor: nextCursor,
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

export async function handleGetOrderDetail(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  orderId: string
): Promise<Response> {
  // Explicit ownership predicate (Invariant V04): returns 404 if not found or owned by another customer
  const orderRes = await pool.query(
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
       o.table_name_snapshot,
       o.address_snapshot,
       o.zone_name_snapshot,
       o.customer_name,
       o.customer_phone,
       o.created_at,
       o.paid_at,
       o.confirmed_at,
       o.completed_at,
       o.cancelled_at,
       o.version
     FROM public.orders o
     WHERE o.id = $1 AND o.customer_user_id = $2`,
    [orderId, actor.userId]
  )

  if (orderRes.rows.length === 0) {
    throw AppError.notFound('Đơn hàng không tồn tại hoặc không thuộc quyền sở hữu')
  }

  const order = orderRes.rows[0]

  // Order Items
  const itemsRes = await pool.query(
    `SELECT
       id,
       menu_item_id,
       item_name,
       unit_price_vnd,
       quantity,
       line_total_vnd,
       note,
       position
     FROM public.order_items
     WHERE order_id = $1
     ORDER BY position ASC, created_at ASC`,
    [orderId]
  )

  // Safe Customer Timeline (strips actor_admin_id and internal notes per Invariant V04/V20)
  const timelineRes = await pool.query(
    `SELECT
       from_status,
       to_status,
       reason,
       created_at
     FROM public.order_status_history
     WHERE order_id = $1
     ORDER BY created_at ASC, id ASC`,
    [orderId]
  )

  const detailDto = {
    id: order.id,
    code: order.code,
    order_type: order.order_type,
    status: order.status,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    subtotal_vnd: Number(order.subtotal_vnd),
    shipping_fee_vnd: Number(order.shipping_fee_vnd),
    total_vnd: Number(order.total_vnd),
    note: order.note,
    table_name_snapshot: order.table_name_snapshot,
    address_snapshot: order.address_snapshot,
    zone_name_snapshot: order.zone_name_snapshot,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    created_at: order.created_at,
    paid_at: order.paid_at,
    confirmed_at: order.confirmed_at,
    completed_at: order.completed_at,
    cancelled_at: order.cancelled_at,
    version: Number(order.version),
    items: itemsRes.rows.map((it) => ({
      id: it.id,
      menu_item_id: it.menu_item_id,
      item_name: it.item_name,
      unit_price_vnd: Number(it.unit_price_vnd),
      quantity: Number(it.quantity),
      line_total_vnd: Number(it.line_total_vnd),
      note: it.note,
      position: Number(it.position),
    })),
    timeline: timelineRes.rows.map((h) => ({
      from_status: h.from_status,
      to_status: h.to_status,
      reason: h.reason,
      created_at: h.created_at,
    })),
  }

  return jsonResponse(detailDto, requestId, req, 200, PRIVATE_CACHE_HEADERS)
}

export async function handleClaimOrder(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  orderId: string
): Promise<Response> {
  const body = (await parseJsonBody(req)) as Record<string, unknown>
  const claimSecret = typeof body.claim_secret === 'string' ? body.claim_secret.trim() : ''

  if (!claimSecret || claimSecret.length < 16 || claimSecret.length > 128) {
    throw AppError.validation('Mã bí mật claim đơn (claim_secret) phải có độ dài từ 16 đến 128 ký tự')
  }

  const claimSecretHash = sha256(claimSecret)

  try {
    const res = await pool.query(
      `SELECT public.claim_guest_order($1, $2, $3) as result`,
      [orderId, actor.userId, claimSecretHash]
    )

    const result = res.rows[0]?.result

    return jsonResponse(result, requestId, req, 200, PRIVATE_CACHE_HEADERS)
  } catch (dbErr: unknown) {
    if (dbErr && typeof dbErr === 'object') {
      const errObj = dbErr as { code?: string; message?: string }
      const code = errObj.code || ''
      const msg = errObj.message || 'Lỗi nhận đơn hàng'

      if (code === 'P0002') {
        throw AppError.notFound(msg.replace(/^[^:]+:\s*/, ''))
      } else if (code === 'P0020') {
        throw new AppError('CUSTOMER_DELETING', msg.replace(/^[^:]+:\s*/, ''), 403)
      } else if (code === 'P0022') {
        throw new AppError('CLAIM_NOT_FOUND', msg.replace(/^[^:]+:\s*/, ''), 404)
      } else if (code === 'P0023') {
        throw new AppError('CLAIM_ALREADY_OWNED', msg.replace(/^[^:]+:\s*/, ''), 409)
      } else if (code === 'P0024') {
        throw new AppError('INVALID_CLAIM_SECRET', msg.replace(/^[^:]+:\s*/, ''), 403)
      } else if (code === 'P0025') {
        throw new AppError('CLAIM_EXPIRED', msg.replace(/^[^:]+:\s*/, ''), 410)
      }
    }
    throw dbErr
  }
}

// -----------------------------------------------------------------------------
// 4. RESERVATIONS HANDLERS: GET /me/reservations, GET /me/reservations/:id, POST /me/reservations/:id/cancel
// -----------------------------------------------------------------------------

export async function handleGetReservations(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  url: URL
): Promise<Response> {
  const limitParam = parseInt(url.searchParams.get('limit') || '20', 10)
  const limit = Math.min(Math.max(Number.isInteger(limitParam) ? limitParam : 20, 1), 100)
  const cursorParam = url.searchParams.get('cursor')?.trim()
  const statusParam = url.searchParams.get('status')?.trim()

  const conditions: string[] = ['customer_user_id = $1']
  const values: unknown[] = [actor.userId]
  let idx = 2

  if (statusParam) {
    conditions.push(`status = $${idx++}`)
    values.push(statusParam)
  }

  if (cursorParam) {
    try {
      const decoded = Buffer.from(cursorParam, 'base64').toString('utf-8')
      const [cursorStartsAt, cursorId] = decoded.split('|')
      if (cursorStartsAt && cursorId) {
        conditions.push(`(starts_at, id) < ($${idx++}, $${idx++})`)
        values.push(cursorStartsAt, cursorId)
      }
    } catch {
      // Ignore
    }
  }

  const query = `
    SELECT
      id, code, customer_name, customer_phone, starts_at, ends_at,
      guest_count, seating_area_id, area_name_snapshot, status, note, version, created_at, updated_at
    FROM public.reservations
    WHERE ${conditions.join(' AND ')}
    ORDER BY starts_at DESC, id DESC
    LIMIT $${idx}
  `
  values.push(limit + 1)

  const res = await pool.query(query, values)
  const hasMore = res.rows.length > limit
  const items = hasMore ? res.rows.slice(0, limit) : res.rows

  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1]
    nextCursor = Buffer.from(`${last.starts_at.toISOString()}|${last.id}`).toString('base64')
  }

  const dtos = items.map((r) => ({
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
    version: Number(r.version),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))

  return jsonResponse(
    {
      items: dtos,
      next_cursor: nextCursor,
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

export async function handleGetReservationDetail(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  reservationId: string
): Promise<Response> {
  // Explicit ownership predicate (Invariant V04): returns 404 if not found or owned by another user
  const res = await pool.query(
    `SELECT
       id, code, customer_name, customer_phone, starts_at, ends_at,
       guest_count, seating_area_id, area_name_snapshot, status, note, version, created_at, updated_at
     FROM public.reservations
     WHERE id = $1 AND customer_user_id = $2`,
    [reservationId, actor.userId]
  )

  if (res.rows.length === 0) {
    throw AppError.notFound('Đặt bàn không tồn tại hoặc không thuộc quyền sở hữu')
  }

  const r = res.rows[0]
  const dto = {
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
    version: Number(r.version),
    created_at: r.created_at,
    updated_at: r.updated_at,
  }

  return jsonResponse(dto, requestId, req, 200, PRIVATE_CACHE_HEADERS)
}

export async function handleCancelReservation(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  reservationId: string
): Promise<Response> {
  const rawBody = await parseBody<unknown>(req)
  const parseResult = CustomerCancelReservationSchema.safeParse(rawBody)

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'payload'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    throw AppError.validation('Dữ liệu hủy đặt bàn không hợp lệ', fieldErrors)
  }

  const { expected_version, reason } = parseResult.data

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
      `SELECT public.cancel_customer_reservation($1, $2, $3, $4, $5) as result`,
      [
        actor.userId,
        reservationId,
        expected_version,
        reason || null,
        testNow ? testNow.toISOString() : null,
      ]
    )

    const result = rpcRes.rows[0].result
    return jsonResponse(result, requestId, req, 200, PRIVATE_CACHE_HEADERS)
  } catch (err: unknown) {
    handleCustomerDbError(err)
  }
}

// -----------------------------------------------------------------------------
// 5. ADDRESSES HANDLERS: GET, POST /me/addresses, PATCH, DELETE /me/addresses/:id (Invariant V20)
// -----------------------------------------------------------------------------

export async function handleGetAddresses(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const res = await pool.query(
    `SELECT
       id, label, recipient_name, phone, address_line, ward, district, province,
       delivery_note, is_default, version, created_at, updated_at
     FROM public.customer_addresses
     WHERE user_id = $1
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`,
    [actor.userId]
  )

  const items = res.rows.map((a) => ({
    id: a.id,
    label: a.label,
    recipient_name: a.recipient_name,
    phone: a.phone,
    address_line: a.address_line,
    ward: a.ward,
    district: a.district,
    province: a.province,
    delivery_note: a.delivery_note,
    is_default: Boolean(a.is_default),
    version: Number(a.version),
    created_at: a.created_at,
    updated_at: a.updated_at,
  }))

  return jsonResponse({ items }, requestId, req, 200, PRIVATE_CACHE_HEADERS)
}

export async function handleCreateAddress(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const rawBody = await parseBody<unknown>(req)
  const parseResult = CustomerAddressCreateSchema.safeParse(rawBody)

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'payload'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    throw AppError.validation('Dữ liệu địa chỉ không hợp lệ', fieldErrors)
  }

  const d = parseResult.data

  try {
    const rpcRes = await pool.query(
      `SELECT public.upsert_customer_address($1, NULL, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result`,
      [
        actor.userId,
        d.label,
        d.recipient_name,
        d.phone,
        d.address_line,
        d.ward || null,
        d.district || null,
        d.province || null,
        d.delivery_note || '',
        d.is_default || false,
      ]
    )

    const result = rpcRes.rows[0].result
    return jsonResponse(result, requestId, req, 201, PRIVATE_CACHE_HEADERS)
  } catch (err: unknown) {
    handleCustomerDbError(err)
  }
}

export async function handleUpdateAddress(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  addressId: string
): Promise<Response> {
  const rawBody = await parseBody<unknown>(req)
  const parseResult = CustomerAddressUpdateSchema.safeParse(rawBody)

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'payload'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    throw AppError.validation('Dữ liệu cập nhật địa chỉ không hợp lệ', fieldErrors)
  }

  const d = parseResult.data

  // Fetch current address to merge optional fields
  const currentRes = await pool.query(
    `SELECT * FROM public.customer_addresses WHERE id = $1 AND user_id = $2`,
    [addressId, actor.userId]
  )

  if (currentRes.rows.length === 0) {
    throw AppError.notFound('Địa chỉ không tồn tại hoặc không thuộc quyền sở hữu')
  }

  const cur = currentRes.rows[0]
  const targetLabel = d.label !== undefined ? d.label : cur.label
  const targetRecipient = d.recipient_name !== undefined ? d.recipient_name : cur.recipient_name
  const targetPhone = d.phone !== undefined ? d.phone : cur.phone
  const targetLine = d.address_line !== undefined ? d.address_line : cur.address_line
  const targetWard = d.ward !== undefined ? d.ward : cur.ward
  const targetDistrict = d.district !== undefined ? d.district : cur.district
  const targetProvince = d.province !== undefined ? d.province : cur.province
  const targetNote = d.delivery_note !== undefined ? d.delivery_note : cur.delivery_note
  const targetDefault = d.is_default !== undefined ? d.is_default : cur.is_default

  try {
    const rpcRes = await pool.query(
      `SELECT public.upsert_customer_address($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) as result`,
      [
        actor.userId,
        addressId,
        d.expected_version,
        targetLabel,
        targetRecipient,
        targetPhone,
        targetLine,
        targetWard,
        targetDistrict,
        targetProvince,
        targetNote,
        targetDefault,
      ]
    )

    const result = rpcRes.rows[0].result
    return jsonResponse(result, requestId, req, 200, PRIVATE_CACHE_HEADERS)
  } catch (err: unknown) {
    handleCustomerDbError(err)
  }
}

export async function handleDeleteAddress(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  addressId: string
): Promise<Response> {
  try {
    const rpcRes = await pool.query(
      `SELECT public.delete_customer_address($1, $2) as result`,
      [actor.userId, addressId]
    )

    const result = rpcRes.rows[0].result
    return jsonResponse(result, requestId, req, 200, PRIVATE_CACHE_HEADERS)
  } catch (err: unknown) {
    handleCustomerDbError(err)
  }
}

// -----------------------------------------------------------------------------
// 6. FAVORITES HANDLERS: GET /me/favorites, PUT /me/favorites/:item_id, DELETE /me/favorites/:item_id
// -----------------------------------------------------------------------------

export async function handleGetFavorites(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const res = await pool.query(
    `SELECT
       cf.menu_item_id,
       mi.name,
       mi.slug,
       mi.price_vnd,
       mi.image_path,
       mi.available,
       mi.allow_dine_in,
       mi.allow_delivery,
       c.id as category_id,
       c.name as category_name,
       cf.created_at
     FROM public.customer_favorites cf
     JOIN public.menu_items mi ON mi.id = cf.menu_item_id
     JOIN public.categories c ON c.id = mi.category_id
     WHERE cf.user_id = $1
       AND mi.published = true
       AND c.active = true
     ORDER BY cf.created_at DESC`,
    [actor.userId]
  )

  const items = res.rows.map((r) => ({
    menu_item_id: r.menu_item_id,
    name: r.name,
    slug: r.slug,
    price_vnd: Number(r.price_vnd),
    image_path: r.image_path,
    available: Boolean(r.available),
    allow_dine_in: Boolean(r.allow_dine_in),
    allow_delivery: Boolean(r.allow_delivery),
    category_id: r.category_id,
    category_name: r.category_name,
    created_at: r.created_at,
  }))

  return jsonResponse({ items }, requestId, req, 200, PRIVATE_CACHE_HEADERS)
}

export async function handlePutFavorite(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  itemId: string
): Promise<Response> {
  // Check if item exists in published catalog of active category
  const itemRes = await pool.query(
    `SELECT mi.id
     FROM public.menu_items mi
     JOIN public.categories c ON c.id = mi.category_id
     WHERE mi.id = $1 AND mi.published = true AND c.active = true`,
    [itemId]
  )

  if (itemRes.rows.length === 0) {
    throw AppError.notFound('Món ăn không tồn tại hoặc đã ngừng kinh doanh')
  }

  // Idempotent insertion
  await pool.query(
    `INSERT INTO public.customer_favorites (user_id, menu_item_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, menu_item_id) DO NOTHING`,
    [actor.userId, itemId]
  )

  return jsonResponse(
    { favorited: true, menu_item_id: itemId },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

export async function handleDeleteFavorite(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string,
  itemId: string
): Promise<Response> {
  // Idempotent deletion
  await pool.query(
    `DELETE FROM public.customer_favorites
     WHERE user_id = $1 AND menu_item_id = $2`,
    [actor.userId, itemId]
  )

  return jsonResponse(
    { favorited: false, menu_item_id: itemId },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

// -----------------------------------------------------------------------------
// 7. REORDER HANDLER: POST /me/reorder (Invariant V21)
// -----------------------------------------------------------------------------

export interface ReorderWarning {
  type: 'ITEM_DELETED' | 'ITEM_UNPUBLISHED' | 'ITEM_OUT_OF_STOCK' | 'MODE_NOT_ALLOWED' | 'PRICE_CHANGED'
  menu_item_id?: string
  item_name: string
  old_price_vnd?: number
  new_price_vnd?: number
  message: string
}

export interface ReorderItemDto {
  menu_item_id: string
  item_name: string
  unit_price_vnd: number
  quantity: number
  line_total_vnd: number
  note: string
  available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
}

export async function handlePostReorder(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  requestId: string
): Promise<Response> {
  const rawBody = await parseBody<unknown>(req)
  const parseResult = CustomerReorderSchema.safeParse(rawBody)

  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join('.') || 'payload'
      if (!fieldErrors[field]) fieldErrors[field] = []
      fieldErrors[field].push(issue.message)
    }
    throw AppError.validation('Dữ liệu yêu cầu đặt lại món không hợp lệ', fieldErrors)
  }

  const { source_order_id, target_order_type } = parseResult.data

  // Verify ownership of the source order (Invariant V04/V21: 404 if not found or belongs to another user)
  const orderRes = await pool.query(
    `SELECT id, code, order_type
     FROM public.orders
     WHERE id = $1 AND customer_user_id = $2`,
    [source_order_id, actor.userId]
  )

  if (orderRes.rows.length === 0) {
    throw AppError.notFound('Đơn hàng gốc không tồn tại hoặc không thuộc quyền sở hữu')
  }

  const sourceOrder = orderRes.rows[0]
  const effectiveMode = target_order_type || sourceOrder.order_type

  // Fetch original order items
  const itemsRes = await pool.query(
    `SELECT id, menu_item_id, item_name, unit_price_vnd, quantity, note, position
     FROM public.order_items
     WHERE order_id = $1
     ORDER BY position ASC, created_at ASC`,
    [source_order_id]
  )

  const warnings: ReorderWarning[] = []
  const reorderLines: ReorderItemDto[] = []
  let newSubtotalVnd = 0

  for (const it of itemsRes.rows) {
    if (!it.menu_item_id) {
      warnings.push({
        type: 'ITEM_DELETED',
        item_name: it.item_name,
        message: `Món "${it.item_name}" không còn tồn tại trên thực đơn nhà hàng.`,
      })
      continue
    }

    // Query live menu item and category state
    const liveRes = await pool.query(
      `SELECT
         mi.id,
         mi.name,
         mi.price_vnd,
         mi.published,
         mi.available,
         mi.allow_dine_in,
         mi.allow_delivery,
         c.active as category_active
       FROM public.menu_items mi
       LEFT JOIN public.categories c ON c.id = mi.category_id
       WHERE mi.id = $1`,
      [it.menu_item_id]
    )

    if (liveRes.rows.length === 0) {
      warnings.push({
        type: 'ITEM_DELETED',
        item_name: it.item_name,
        menu_item_id: it.menu_item_id,
        message: `Món "${it.item_name}" đã bị xóa khỏi hệ thống.`,
      })
      continue
    }

    const live = liveRes.rows[0]

    // Check published & category active
    if (!live.published || !live.category_active) {
      warnings.push({
        type: 'ITEM_UNPUBLISHED',
        item_name: live.name,
        menu_item_id: live.id,
        message: `Món "${live.name}" hiện đã ngừng kinh doanh.`,
      })
      continue
    }

    // Check availability
    if (!live.available) {
      warnings.push({
        type: 'ITEM_OUT_OF_STOCK',
        item_name: live.name,
        menu_item_id: live.id,
        message: `Món "${live.name}" hiện đang tạm hết hàng.`,
      })
    }

    // Check order mode compatibility
    if (effectiveMode === 'dine_in' && !live.allow_dine_in) {
      warnings.push({
        type: 'MODE_NOT_ALLOWED',
        item_name: live.name,
        menu_item_id: live.id,
        message: `Món "${live.name}" không phục vụ dùng tại bàn.`,
      })
    }
    if (effectiveMode === 'delivery' && !live.allow_delivery) {
      warnings.push({
        type: 'MODE_NOT_ALLOWED',
        item_name: live.name,
        menu_item_id: live.id,
        message: `Món "${live.name}" không hỗ trợ giao hàng tận nơi.`,
      })
    }

    // Check price changes (Invariant V21)
    const oldPrice = Number(it.unit_price_vnd)
    const currentPrice = Number(live.price_vnd)
    if (oldPrice !== currentPrice) {
      warnings.push({
        type: 'PRICE_CHANGED',
        item_name: live.name,
        menu_item_id: live.id,
        old_price_vnd: oldPrice,
        new_price_vnd: currentPrice,
        message: `Giá món "${live.name}" đã cập nhật từ ${oldPrice.toLocaleString('vi-VN')} đ sang ${currentPrice.toLocaleString('vi-VN')} đ.`,
      })
    }

    const lineTotal = currentPrice * Number(it.quantity)
    newSubtotalVnd += lineTotal

    // Build fresh item line with LIVE price and current availability
    reorderLines.push({
      menu_item_id: live.id,
      item_name: live.name,
      unit_price_vnd: currentPrice,
      quantity: Number(it.quantity),
      line_total_vnd: lineTotal,
      note: it.note || '',
      available: Boolean(live.available),
      allow_dine_in: Boolean(live.allow_dine_in),
      allow_delivery: Boolean(live.allow_delivery),
    })
  }

  return jsonResponse(
    {
      source_order_id: sourceOrder.id,
      source_order_code: sourceOrder.code,
      target_order_type: effectiveMode,
      items: reorderLines,
      warnings,
      subtotal_vnd: newSubtotalVnd,
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}

// -----------------------------------------------------------------------------
// 8. DELETE PROFILE HANDLER: DELETE /me (Invariant V23)
// -----------------------------------------------------------------------------

export async function handleDeleteProfile(
  req: Request,
  actor: AuthActor,
  pool: pg.Pool,
  supabaseAdmin: SupabaseClient,
  requestId: string
): Promise<Response> {
  if (!actor.userId) {
    throw AppError.authRequired('Yêu cầu đăng nhập để thực hiện thao tác này')
  }

  // 1. Recent Authentication Gate: Check user.last_sign_in_at (<= 600s / 10m)
  const userRes = await pool.query(
    `SELECT last_sign_in_at FROM auth.users WHERE id = $1`,
    [actor.userId]
  )
  const lastSignInAt = userRes.rows[0]?.last_sign_in_at
  if (lastSignInAt) {
    const elapsedSeconds = (Date.now() - new Date(lastSignInAt).getTime()) / 1000
    if (elapsedSeconds > 600) {
      throw new AppError(
        'AUTH_RECENT_REQUIRED',
        'Vui lòng đăng nhập lại trước khi thực hiện thao tác xóa tài khoản bảo mật (phiên đăng nhập đã quá 10 phút)',
        401
      )
    }
  }

  // 2. Explicit User Confirmation Validation
  const body = await parseBody<{ confirmation?: string }>(req)
  const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim() : ''
  if (
    !confirmation ||
    (confirmation.toUpperCase() !== 'XÓA TÀI KHOẢN' && confirmation.toUpperCase() !== 'DELETE')
  ) {
    throw AppError.validation(
      'Xác nhận không hợp lệ. Vui lòng nhập chính xác cụm từ "XÓA TÀI KHOẢN" để xác nhận xóa vĩnh viễn',
      { confirmation: ['Cụm từ xác nhận phải là "XÓA TÀI KHOẢN"'] }
    )
  }

  // 3. Step 1: Request account deletion (marks deletion_requested_at, checks active admin)
  try {
    await pool.query(
      `SELECT public.request_account_deletion($1, $2) as result`,
      [actor.userId, actor.email || null]
    )
  } catch (dbErr: unknown) {
    if (dbErr && typeof dbErr === 'object') {
      const errObj = dbErr as { code?: string; message?: string }
      if (errObj.code === 'P0026') {
        throw new AppError(
          'ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN',
          errObj.message?.replace(/^[^:]+:\s*/, '') ||
            'Tài khoản quản trị viên không thể tự xóa qua cổng khách hàng',
          403
        )
      }
      if (errObj.code === 'P0002') {
        throw AppError.notFound(
          errObj.message?.replace(/^[^:]+:\s*/, '') || 'Không tìm thấy hồ sơ khách hàng'
        )
      }
    }
    throw dbErr
  }

  // 4. Step 2: Database phase cleanup & ownership detachment
  try {
    await pool.query(`SELECT public.process_account_deletion_db($1)`, [actor.userId])
  } catch (dbErr: unknown) {
    const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr)
    await pool.query(
      `SELECT public.complete_account_deletion_job($1, false, 'DB_CLEANUP_FAILED', $2)`,
      [actor.userId, errMsg]
    )
    throw dbErr
  }

  // 5. Step 3: Auth Provider deletion (Supabase GoTrue)
  let authSuccess = false
  let authErrorCode: string | null = null
  let authErrorMessage: string | null = null

  try {
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(actor.userId)
    if (authError) {
      authErrorCode = authError.name || 'AUTH_DELETE_FAILED'
      authErrorMessage = authError.message
    } else {
      authSuccess = true
    }
  } catch (authErr: unknown) {
    authErrorCode = 'AUTH_DELETE_EXCEPTION'
    authErrorMessage = authErr instanceof Error ? authErr.message : String(authErr)
  }

  // 6. Complete job status tracking
  await pool.query(
    `SELECT public.complete_account_deletion_job($1, $2, $3, $4)`,
    [actor.userId, authSuccess, authErrorCode, authErrorMessage]
  )

  if (!authSuccess) {
    return jsonResponse(
      {
        deleted: true,
        user_id: actor.userId,
        status: 'processing',
        step: 'auth_delete_pending',
        message:
          'Dữ liệu cá nhân đã được xóa. Tiến trình thu hồi tài khoản đang được hoàn tất trong nền.',
      },
      requestId,
      req,
      202,
      PRIVATE_CACHE_HEADERS
    )
  }

  return jsonResponse(
    {
      deleted: true,
      user_id: actor.userId,
      status: 'completed',
      message: 'Tài khoản và toàn bộ dữ liệu cá nhân của bạn đã được xóa thành công.',
    },
    requestId,
    req,
    200,
    PRIVATE_CACHE_HEADERS
  )
}
