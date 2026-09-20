/**
 * Tiger 345 - Public API Edge Function Gateway
 * Handles public endpoints: /health, /menu, /settings, /tables/resolve, /order-quotes, /orders, /reservations.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { handleCorsPreflight } from '../_shared/cors.ts'
import { getOrCreateRequestId, getClientIp, jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { toErrorResponse, AppError } from '../_shared/errors.ts'
import { getPublicActor } from '../_shared/auth.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import {
  createVisitCapability,
  verifyVisitCapability,
  CAPABILITY_DEFAULT_TTL_SECONDS,
} from '../_shared/capability.ts'
import {
  normalizeLineItems,
  computeCanonicalRequestHash,
  createOrderQuote,
  verifyOrderQuote,
  extractQuotePayloadUnchecked,
  type RawLineItem,
  type QuotedLineItem,
  type OrderQuoteContext,
} from '../_shared/quote.ts'
import { assertServiceOperating, isTrustedTestEnvironment } from '../_shared/schedule.ts'
import { processConciergeTurn } from '../_shared/concierge/runtime.ts'
import type { ConciergeRequestPayload } from '../_shared/concierge/types.ts'
import type { MenuItemCatalogRecord } from '../_shared/concierge/validator.ts'
import type { ConciergeLlmOrchestrator } from '../_shared/concierge/llm.ts'
import { submitConciergeFeedbackAsync } from '../_shared/concierge/feedback.ts'

const { Pool } = pg

export interface FunctionContext {
  supabaseAdmin?: SupabaseClient
  pool?: pg.Pool
  orchestrator?: ConciergeLlmOrchestrator
  trustedNow?: Date
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

export async function handlePublicApi(
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

    // 2. Global IP Rate Limit (60 req / min, 600 for local test loopback)
    const limit = clientIp === '127.0.0.1' || clientIp === '::1' ? 600 : 60
    await assertRateLimit(pool, {
      key: `public:${clientIp}`,
      limit,
      windowSeconds: 60,
    })

    // 3. Auth Check (Guest allowed; invalid token must throw 401; tombstoned token must throw 403)
    const actor = await getPublicActor(req, supabaseAdmin, pool)

    const url = new URL(req.url)
    // Normalize path by stripping function prefix if present
    const path = url.pathname.replace(/^\/functions\/v1\/public-api/, '').replace(/^\/public-api/, '')

    // 4. Routing
    if (path === '/health' || path === '' || path === '/') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'public-api',
          actor: {
            role: actor.role,
            userId: actor.userId,
          },
          time: new Date().toISOString(),
        },
        requestId,
        req
      )
    }

    if (path === '/menu' && req.method === 'GET') {
      const mode = url.searchParams.get('mode') // 'dine_in' | 'delivery' | null
      const categoryParam = url.searchParams.get('category') // slug or id

      // 1. Fetch active categories
      const categoriesRes = await pool.query(
        `SELECT id, name, slug, sort_order
         FROM public.categories
         WHERE active = true
         ORDER BY sort_order ASC, name ASC`
      )

      // 2. Fetch published menu items in active categories
      let itemQuery = `
        SELECT
          m.id,
          m.category_id,
          m.name,
          m.slug,
          m.description,
          m.price_vnd::numeric as price_vnd,
          m.image_path,
          m.published,
          m.available,
          m.allow_dine_in,
          m.allow_delivery,
          m.featured_rank,
          m.tags,
          m.serving_size,
          m.pairing_note,
          m.delivery_eta,
          m.spice_level,
          m.is_signature,
          m.is_bestseller,
          m.is_new,
          c.sort_order as category_sort_order
        FROM public.menu_items m
        JOIN public.categories c ON m.category_id = c.id
        WHERE c.active = true AND m.published = true
      `
      const params: unknown[] = []

      if (mode === 'dine_in') {
        itemQuery += ` AND m.allow_dine_in = true`
      } else if (mode === 'delivery') {
        itemQuery += ` AND m.allow_delivery = true`
      }

      if (categoryParam) {
        params.push(categoryParam)
        itemQuery += ` AND (c.slug = $${params.length} OR c.id::text = $${params.length})`
      }

      itemQuery += ` ORDER BY c.sort_order ASC, m.featured_rank ASC NULLS LAST, m.name ASC`

      const itemsRes = await pool.query(itemQuery, params)

      const categories = categoriesRes.rows.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        sort_order: Number(row.sort_order),
      }))

      const items = itemsRes.rows.map((row) => ({
        id: row.id,
        category_id: row.category_id,
        name: row.name,
        slug: row.slug,
        description: row.description || '',
        price_vnd: Number(row.price_vnd),
        image_path: row.image_path || '',
        image_url: row.image_path || '',
        available: Boolean(row.available),
        is_available: Boolean(row.available),
        allow_dine_in: Boolean(row.allow_dine_in),
        allow_delivery: Boolean(row.allow_delivery),
        featured_rank: row.featured_rank ? Number(row.featured_rank) : null,
        is_featured: row.featured_rank !== null && row.featured_rank !== undefined,
        tags: Array.isArray(row.tags) ? row.tags : [],
        serving_size: row.serving_size || '',
        pairing_note: row.pairing_note || '',
        delivery_eta: row.delivery_eta || '',
        spice_level: Number(row.spice_level || 0),
        is_signature: Boolean(row.is_signature),
        is_bestseller: Boolean(row.is_bestseller),
        is_new: Boolean(row.is_new),
      }))

      return jsonResponse(
        {
          categories,
          items,
        },
        requestId,
        req,
        200,
        {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        }
      )
    }

    if (path === '/settings' && req.method === 'GET') {
      const [settingsRes, hoursRes, closuresRes, zonesRes, areasRes] = await Promise.all([
        pool.query(`SELECT * FROM public.restaurant_settings LIMIT 1`),
        pool.query(
          `SELECT id, weekday, service_type, open_time, close_time
           FROM public.business_hours
           WHERE active = true
           ORDER BY weekday ASC, open_time ASC`
        ),
        pool.query(
          `SELECT id, date, service_type, reason
           FROM public.business_closures
           WHERE date >= CURRENT_DATE
           ORDER BY date ASC`
        ),
        pool.query(
          `SELECT id, name, description, fee_vnd::numeric, free_threshold_vnd::numeric
           FROM public.delivery_zones
           WHERE active = true
           ORDER BY sort_order ASC, name ASC`
        ),
        pool.query(
          `SELECT id, code, name
           FROM public.seating_areas
           WHERE active = true
           ORDER BY sort_order ASC, name ASC`
        ),
      ])

      const raw = settingsRes.rows[0] || {}

      const settings = {
        name: raw.name || 'Tiger 345',
        phone: raw.phone || '0902809929',
        zalo: raw.zalo || 'https://zalo.me/0902809929',
        facebook: raw.facebook || 'https://www.facebook.com/Tiger345HT/',
        maps_url: raw.maps_url || 'https://maps.google.com/?q=Tiger+345+Duong+So+1+Vinh+An+Vinh+Cuu+Dong+Nai',
        address: raw.address || '17, Đường Số 1, Tổ 6, Khu Phố 2, Thị Trấn Vĩnh An, Huyện Vĩnh Cửu, Tỉnh Đồng Nai',
        timezone: raw.timezone || 'Asia/Ho_Chi_Minh',
        accepting_orders: Boolean(raw.accepting_orders),
        accepting_dine_in_orders: Boolean(raw.accepting_dine_in_orders),
        accepting_delivery_orders: Boolean(raw.accepting_delivery_orders),
        booking_enabled: Boolean(raw.booking_enabled),
        min_delivery_order_vnd: Number(raw.min_delivery_order_vnd || 0),
        reservation_policy: {
          min_notice_minutes: Number(raw.reservation_min_notice_minutes || 30),
          max_days_ahead: Number(raw.reservation_max_days_ahead || 30),
          duration_minutes: Number(raw.reservation_duration_minutes || 120),
          cancel_notice_minutes: Number(raw.reservation_cancel_notice_minutes || 60),
          no_show_grace_minutes: Number(raw.reservation_no_show_grace_minutes || 15),
        },
        business_hours: hoursRes.rows.map((row) => ({
          id: row.id,
          weekday: Number(row.weekday),
          service_type: row.service_type,
          open_time: row.open_time,
          close_time: row.close_time,
        })),
        business_closures: closuresRes.rows.map((row) => ({
          id: row.id,
          date: row.date,
          service_type: row.service_type,
          reason: row.reason || '',
        })),
        delivery_zones: zonesRes.rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description || '',
          fee_vnd: Number(row.fee_vnd),
          free_threshold_vnd: row.free_threshold_vnd ? Number(row.free_threshold_vnd) : null,
        })),
        seating_areas: areasRes.rows.map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
        })),
      }

      return jsonResponse(
        settings,
        requestId,
        req,
        200,
        {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        }
      )
    }

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

    if (path === '/order-quotes' && req.method === 'POST') {
      // 1. IP rate limit (60 req / min)
      await assertRateLimit(pool, {
        key: `quote:${clientIp}`,
        limit: 60,
        windowSeconds: 60,
      })

      // 2. Parse body
      const body = await parseJsonBody<Record<string, unknown>>(req)
      if (!body || typeof body !== 'object') {
        throw AppError.validation('Dữ liệu yêu cầu báo giá không hợp lệ')
      }

      // Check forbidden client price/status injection
      const forbiddenFields = [
        'price',
        'price_vnd',
        'subtotal',
        'subtotal_vnd',
        'shipping_fee_vnd',
        'total',
        'total_vnd',
        'status',
        'payment_status',
        'customer_user_id',
        'internal_note',
      ]
      for (const field of forbiddenFields) {
        if (body[field] !== undefined) {
          throw AppError.validation(`Trường '${field}' không được phép gửi từ client`)
        }
      }

      const orderType = typeof body.order_type === 'string' ? body.order_type.trim() : ''
      if (orderType !== 'dine_in' && orderType !== 'delivery') {
        throw AppError.validation("Loại đơn hàng phải là 'dine_in' hoặc 'delivery'")
      }

      let verifiedCap: { table_id: string; visit_id: string; table_name: string; epoch: number } | null = null
      let deliveryZone: { id: string; name: string; fee_vnd: number; free_threshold_vnd: number | null } | null = null
      let minDeliveryOrderVnd = 100000

      if (orderType === 'dine_in') {
        // Dine-in: reject forbidden delivery fields
        if (
          body.delivery_zone_id !== undefined ||
          body.address !== undefined ||
          body.customer !== undefined ||
          body.customer_name !== undefined ||
          body.customer_phone !== undefined
        ) {
          throw AppError.validation('Đơn phục vụ tại bàn không nhận thông tin giao hàng hoặc khách hàng')
        }

        const visitCapability =
          typeof body.visit_capability === 'string' ? body.visit_capability.trim() : ''
        if (!visitCapability) {
          throw AppError.validation('Mã xác thực bàn (visit_capability) không được để trống', {
            visit_capability: ['Bắt buộc phải có visit_capability'],
          })
        }

        // 3. Check operating hours & closures for dine-in
        await assertServiceOperating(pool, 'restaurant', { req, trustedNow: ctx.trustedNow })

        // 4. Verify visit capability against DB
        verifiedCap = await verifyVisitCapability(visitCapability, pool)

        // 5. Check restaurant settings for intake
        const settingsRes = await pool.query(
          `SELECT accepting_orders, accepting_dine_in_orders
           FROM public.restaurant_settings
           WHERE id = 1`
        )
        if (settingsRes.rows.length === 0 || !settingsRes.rows[0].accepting_orders) {
          throw new AppError('SERVICE_CLOSED', 'Quán hiện đang tạm ngưng nhận đơn', 409)
        }
        if (!settingsRes.rows[0].accepting_dine_in_orders) {
          throw new AppError('SERVICE_CLOSED', 'Quán hiện đang tạm ngưng phục vụ tại bàn', 409)
        }
      } else {
        // Delivery: reject forbidden dine-in fields
        if (
          body.visit_capability !== undefined ||
          body.table_id !== undefined ||
          body.table_visit_id !== undefined
        ) {
          throw AppError.validation('Đơn giao tận nơi không nhận thông tin bàn ăn')
        }

        // Check operating hours & closures for delivery
        await assertServiceOperating(pool, 'delivery', { req, trustedNow: ctx.trustedNow })

        // Check delivery settings
        const settingsRes = await pool.query(
          `SELECT accepting_orders, accepting_delivery_orders, min_delivery_order_vnd::numeric as min_delivery_order_vnd
           FROM public.restaurant_settings
           WHERE id = 1`
        )
        if (settingsRes.rows.length === 0 || !settingsRes.rows[0].accepting_orders) {
          throw new AppError('SERVICE_CLOSED', 'Quán hiện đang tạm ngưng nhận đơn', 409)
        }
        if (!settingsRes.rows[0].accepting_delivery_orders) {
          throw new AppError('SERVICE_CLOSED', 'Quán hiện đang tạm ngưng nhận đơn giao tận nơi', 409)
        }
        minDeliveryOrderVnd = Number(settingsRes.rows[0].min_delivery_order_vnd || 100000)

        // Validate delivery_zone_id
        const zoneId = typeof body.delivery_zone_id === 'string' ? body.delivery_zone_id.trim() : ''
        if (!zoneId || !/^[0-9a-fA-F-]{36}$/.test(zoneId)) {
          throw AppError.validation('Mã khu vực giao hàng (delivery_zone_id) không hợp lệ hoặc để trống', {
            delivery_zone_id: ['Bắt buộc phải chọn khu vực giao hàng'],
          })
        }

        const zoneRes = await pool.query(
          `SELECT id, name, fee_vnd::numeric as fee_vnd, free_threshold_vnd::numeric as free_threshold_vnd, active
           FROM public.delivery_zones
           WHERE id = $1`,
          [zoneId]
        )
        if (zoneRes.rows.length === 0) {
          throw new AppError('ZONE_UNAVAILABLE', 'Khu vực giao hàng không tồn tại', 409)
        }
        const zRow = zoneRes.rows[0]
        if (!zRow.active) {
          throw new AppError('ZONE_UNAVAILABLE', `Khu vực giao hàng "${zRow.name}" hiện đang tạm ngưng phục vụ`, 409)
        }

        deliveryZone = {
          id: zRow.id,
          name: zRow.name,
          fee_vnd: Number(zRow.fee_vnd),
          free_threshold_vnd: zRow.free_threshold_vnd !== null ? Number(zRow.free_threshold_vnd) : null,
        }
      }

      // 5. Normalize items
      const rawItems = body.items as RawLineItem[]
      const normalizedItems = normalizeLineItems(rawItems)

      // 6. Query menu items from DB
      const itemIds = normalizedItems.map((i) => i.menu_item_id)
      const menuRes = await pool.query(
        `SELECT id, name, price_vnd::numeric as price_vnd, published, available, allow_dine_in, allow_delivery
         FROM public.menu_items
         WHERE id = ANY($1)`,
        [itemIds]
      )

      const menuMap = new Map<
        string,
        {
          id: string
          name: string
          price_vnd: number
          published: boolean
          available: boolean
          allow_dine_in: boolean
          allow_delivery: boolean
        }
      >()
      for (const row of menuRes.rows) {
        menuMap.set(row.id, {
          id: row.id,
          name: row.name,
          price_vnd: Number(row.price_vnd),
          published: Boolean(row.published),
          available: Boolean(row.available),
          allow_dine_in: Boolean(row.allow_dine_in),
          allow_delivery: Boolean(row.allow_delivery),
        })
      }

      let subtotalVnd = 0
      const quotedItems: QuotedLineItem[] = []

      for (const line of normalizedItems) {
        const item = menuMap.get(line.menu_item_id)
        if (!item) {
          throw new AppError('ITEM_UNAVAILABLE', 'Món ăn không tồn tại', 409)
        }
        if (!item.published || !item.available) {
          throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" hiện không khả dụng`, 409)
        }
        if (orderType === 'dine_in' && !item.allow_dine_in) {
          throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" không phục vụ tại bàn`, 409)
        }
        if (orderType === 'delivery' && !item.allow_delivery) {
          throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" không áp dụng giao tận nơi`, 409)
        }

        const lineTotal = item.price_vnd * line.quantity
        subtotalVnd += lineTotal
        quotedItems.push({
          menu_item_id: line.menu_item_id,
          item_name: item.name,
          quantity: line.quantity,
          note: line.note,
          unit_price_vnd: item.price_vnd,
          line_total_vnd: lineTotal,
        })
      }

      if (subtotalVnd > 1000000000) {
        throw AppError.validation('Tổng tiền đơn hàng vượt quá hạn mức 1 tỷ VND')
      }

      let shippingFeeVnd = 0
      if (orderType === 'delivery') {
        if (subtotalVnd < minDeliveryOrderVnd) {
          throw AppError.validation(
            `Đơn hàng chưa đạt mức tối thiểu ${minDeliveryOrderVnd.toLocaleString('vi-VN')} đ để giao tận nơi (hiện tại: ${subtotalVnd.toLocaleString('vi-VN')} đ)`
          )
        }

        if (deliveryZone!.free_threshold_vnd !== null && subtotalVnd >= deliveryZone!.free_threshold_vnd) {
          shippingFeeVnd = 0
        } else {
          shippingFeeVnd = deliveryZone!.fee_vnd
        }
      }

      const totalVnd = subtotalVnd + shippingFeeVnd
      const actorScope = actor.userId ? `user:${actor.userId}` : `guest:${sha256(clientIp)}`

      const quoteContext: OrderQuoteContext =
        orderType === 'dine_in'
          ? {
              table_id: verifiedCap!.table_id,
              table_visit_id: verifiedCap!.visit_id,
              table_name: verifiedCap!.table_name,
              epoch: verifiedCap!.epoch,
            }
          : {
              delivery_zone_id: deliveryZone!.id,
              zone_name: deliveryZone!.name,
              fee_vnd: deliveryZone!.fee_vnd,
              free_threshold_vnd: deliveryZone!.free_threshold_vnd,
            }

      const { quote_token, expires_at } = createOrderQuote({
        actor_scope: actorScope,
        order_type: orderType,
        context: quoteContext,
        items: quotedItems,
        subtotal_vnd: subtotalVnd,
        shipping_fee_vnd: shippingFeeVnd,
        total_vnd: totalVnd,
      })

      return jsonResponse(
        {
          quote_token,
          expires_at,
          items: quotedItems,
          subtotal_vnd: subtotalVnd,
          shipping_fee_vnd: shippingFeeVnd,
          total_vnd: totalVnd,
        },
        requestId,
        req,
        200,
        {
          'Cache-Control': 'no-store',
        }
      )
    }

    if (path === '/orders' && req.method === 'POST') {
      // 1. IP rate limit (10 req / 5 min)
      await assertRateLimit(pool, {
        key: `create_order_ip:${clientIp}`,
        limit: 10,
        windowSeconds: 300,
      })

      // 2. Idempotency-Key Header verification
      const idempotencyKey =
        req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key')
      if (!idempotencyKey || idempotencyKey.trim().length < 16) {
        throw AppError.validation(
          'Header Idempotency-Key là bắt buộc (tối thiểu 128-bit / 16 ký tự)',
          { 'idempotency-key': ['Cần Idempotency-Key ngẫu nhiên có độ dài tối thiểu 16 ký tự'] }
        )
      }
      const idempotencyKeyHash = sha256(idempotencyKey.trim())

      // 3. Parse body
      const body = await parseJsonBody<Record<string, unknown>>(req)
      if (!body || typeof body !== 'object') {
        throw AppError.validation('Dữ liệu tạo đơn hàng không hợp lệ')
      }

      // Check forbidden injection fields
      const forbiddenFields = [
        'customer_user_id',
        'status',
        'payment_status',
        'subtotal',
        'subtotal_vnd',
        'shipping_fee_vnd',
        'total',
        'total_vnd',
        'price',
        'price_vnd',
        'internal_note',
        'code',
        'id',
        'created_at',
        'table_id',
        'table_visit_id',
      ]
      for (const field of forbiddenFields) {
        if (body[field] !== undefined) {
          throw AppError.validation(`Trường '${field}' không được phép gửi từ client`)
        }
      }

      const quoteToken = typeof body.quote_token === 'string' ? body.quote_token.trim() : ''
      if (!quoteToken) {
        throw AppError.validation('Token báo giá (quote_token) không được để trống')
      }

      const rawItems = body.items as RawLineItem[]
      const normalizedItems = normalizeLineItems(rawItems)

      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
      const claimSecret =
        typeof body.claim_secret === 'string' ? body.claim_secret.trim() : ''
      if (claimSecret && (claimSecret.length < 16 || claimSecret.length > 128)) {
        throw AppError.validation('Mã bí mật claim đơn (claim_secret) phải có độ dài từ 16 đến 128 ký tự')
      }
      const claimSecretHash = claimSecret ? sha256(claimSecret) : null

      const actorScope = actor.userId ? `user:${actor.userId}` : `guest:${sha256(clientIp)}`

      // 4. Extract quote context unchecked to compute request hash and inspect idempotency
      const unverifiedQuote = extractQuotePayloadUnchecked(quoteToken)
      if (!unverifiedQuote || !unverifiedQuote.context) {
        throw new AppError('QUOTE_CHANGED', 'Cấu trúc token báo giá không hợp lệ', 409)
      }

      let customerName = ''
      let customerPhone = ''
      let customerAddress = ''

      if (unverifiedQuote.order_type === 'delivery') {
        if (body.customer && typeof body.customer === 'object') {
          const c = body.customer as Record<string, unknown>
          customerName = typeof c.name === 'string' ? c.name.trim() : ''
          customerPhone = typeof c.phone === 'string' ? c.phone.trim() : ''
          customerAddress = typeof c.address === 'string' ? c.address.trim() : ''
        } else {
          customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : ''
          customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : ''
          customerAddress = typeof body.address === 'string' ? body.address.trim() : ''
        }

        if (customerName.length < 2) {
          throw AppError.validation('Tên khách hàng phải có ít nhất 2 ký tự', {
            customer_name: ['Tối thiểu 2 ký tự'],
          })
        }
        if (customerPhone.length < 9) {
          throw AppError.validation('Số điện thoại phải có ít nhất 9 ký tự', {
            customer_phone: ['Tối thiểu 9 ký tự'],
          })
        }
        if (customerAddress.length < 5) {
          throw AppError.validation('Địa chỉ giao hàng phải có ít nhất 5 ký tự', {
            address: ['Tối thiểu 5 ký tự'],
          })
        }
      } else if (unverifiedQuote.order_type === 'dine_in') {
        if (
          body.customer !== undefined ||
          body.customer_name !== undefined ||
          body.customer_phone !== undefined ||
          body.address !== undefined ||
          body.delivery_zone_id !== undefined
        ) {
          throw AppError.validation('Đơn phục vụ tại bàn không nhận thông tin giao hàng hoặc khách hàng')
        }
      }

      const quoteCtx = unverifiedQuote.context as Record<string, unknown>
      const requestHash = computeCanonicalRequestHash({
        order_type: unverifiedQuote.order_type,
        context: {
          table_id: typeof quoteCtx.table_id === 'string' ? quoteCtx.table_id : null,
          table_visit_id: typeof quoteCtx.table_visit_id === 'string' ? quoteCtx.table_visit_id : null,
          delivery_zone_id: typeof quoteCtx.delivery_zone_id === 'string' ? quoteCtx.delivery_zone_id : null,
          address: customerAddress || null,
          customer_name: customerName || null,
          customer_phone: customerPhone || null,
        },
        items: normalizedItems,
        note,
        claim_secret_hash: claimSecretHash,
      })

      // 5. Early check in idempotency_requests for replay
      const existingReqRes = await pool.query(
        `SELECT response_json, actor_scope, request_hash
         FROM public.idempotency_requests
         WHERE operation = 'create_order' AND key_hash = $1`,
        [idempotencyKeyHash]
      )
      if (existingReqRes.rows.length > 0) {
        const row = existingReqRes.rows[0]
        if (row.actor_scope === actorScope && row.request_hash === requestHash) {
          return jsonResponse(row.response_json, requestId, req, 200, {
            'Cache-Control': 'no-store',
          })
        } else {
          throw new AppError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency-Key đã được sử dụng với payload hoặc đối tượng khác',
            409
          )
        }
      }

      // 6. If not replayed, verify quote signature, expiration and contents
      const verifiedQuote = verifyOrderQuote(quoteToken)
      if (verifiedQuote.actor_scope !== actorScope) {
        throw new AppError(
          'QUOTE_CHANGED',
          'Báo giá thuộc về tài khoản hoặc người dùng khác. Vui lòng lấy báo giá mới.',
          409
        )
      }

      // Verify items match quote exactly
      if (verifiedQuote.items.length !== normalizedItems.length) {
        throw new AppError('QUOTE_CHANGED', 'Danh sách món trong đơn không khớp với báo giá', 409)
      }
      for (let idx = 0; idx < normalizedItems.length; idx++) {
        const qItem = verifiedQuote.items[idx]
        const nItem = normalizedItems[idx]
        if (
          qItem.menu_item_id !== nItem.menu_item_id ||
          qItem.quantity !== nItem.quantity ||
          qItem.note !== nItem.note
        ) {
          throw new AppError('QUOTE_CHANGED', 'Chi tiết món hoặc số lượng không khớp với báo giá', 409)
        }
      }

      // Check operating hours for delivery or dine-in
      if (verifiedQuote.order_type === 'delivery') {
        await assertServiceOperating(pool, 'delivery', { req, trustedNow: ctx.trustedNow })
      } else if (verifiedQuote.order_type === 'dine_in') {
        await assertServiceOperating(pool, 'restaurant', { req, trustedNow: ctx.trustedNow })
      }

      // 7. Visit rate limit (20 req / 5 min per visit for dine-in)
      const vCtx = verifiedQuote.context as Record<string, unknown>
      if (verifiedQuote.order_type === 'dine_in' && vCtx.table_visit_id) {
        await assertRateLimit(pool, {
          key: `create_order_visit:${vCtx.table_visit_id}`,
          limit: 20,
          windowSeconds: 300,
        })
      }

      // 8. Execute atomic RPC public.create_order
      const dineInContext =
        verifiedQuote.order_type === 'dine_in' ? verifiedQuote.context : null
      const deliveryContext =
        verifiedQuote.order_type === 'delivery'
          ? {
              delivery_zone_id: (verifiedQuote.context as Record<string, unknown>).delivery_zone_id,
              customer_name: customerName,
              customer_phone: customerPhone,
              address: customerAddress,
              expected_shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
            }
          : null

      let testNow: Date | null = ctx.trustedNow || null
      if (!testNow && isTrustedTestEnvironment()) {
        const testNowHeader = req.headers.get('x-test-now') || req.headers.get('X-Test-Now')
        if (testNowHeader) {
          const parsed = new Date(testNowHeader.trim())
          if (!isNaN(parsed.getTime())) {
            testNow = parsed
          }
        }
      }

      let rpcRes: pg.QueryResult
      try {
        rpcRes = await pool.query(
          `SELECT public.create_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            idempotencyKeyHash,
            actorScope,
            requestHash,
            verifiedQuote.order_type,
            actor.userId || null,
            dineInContext ? JSON.stringify(dineInContext) : null,
            deliveryContext ? JSON.stringify(deliveryContext) : null,
            JSON.stringify(verifiedQuote.items),
            note,
            claimSecretHash,
            testNow ? testNow.toISOString() : null,
          ]
        )
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object') {
          const errObj = dbErr as { code?: string; message?: string }
          const code = errObj.code || ''
          const msg = errObj.message || 'Lỗi xử lý đơn hàng'
          if (code === 'P0001') {
            throw new AppError('TABLE_UNAVAILABLE', msg, 409)
          } else if (code === 'P0010') {
            throw new AppError('IDEMPOTENCY_CONFLICT', msg, 409)
          } else if (code === 'P0011') {
            throw new AppError('SERVICE_CLOSED', msg, 409)
          } else if (code === 'P0012') {
            throw new AppError('VALIDATION_ERROR', msg, 422)
          } else if (code === 'P0013') {
            throw new AppError('VISIT_CLOSED', msg, 409)
          } else if (code === 'P0014') {
            throw new AppError('CAPABILITY_REVOKED', msg, 401)
          } else if (code === 'P0015') {
            throw new AppError('UNSUPPORTED_ORDER_TYPE', msg, 422)
          } else if (code === 'P0016') {
            throw new AppError('QUOTE_CHANGED', msg, 409)
          } else if (code === 'P0017') {
            throw new AppError('ITEM_UNAVAILABLE', msg, 409)
          } else if (code === 'P0021') {
            throw new AppError('ZONE_UNAVAILABLE', msg, 409)
          }
        }
        throw dbErr
      }

      const result = rpcRes.rows[0].result as { replayed: boolean; receipt: Record<string, unknown> }
      return jsonResponse(result.receipt, requestId, req, result.replayed ? 200 : 201, {
        'Cache-Control': 'no-store',
      })
    }

    if ((path === '/concierge/chat' || path === '/concierge/action') && req.method === 'POST') {
      await assertRateLimit(pool, {
        key: `concierge_ip:${clientIp}`,
        limit: 30,
        windowSeconds: 60,
      })

      const body = await parseJsonBody<ConciergeRequestPayload>(req)
      if (!body || typeof body !== 'object') {
        throw AppError.validation('Payload yêu cầu concierge không hợp lệ')
      }

      // Fetch active catalog from database
      const menuRes = await pool.query(
        `SELECT id, name, price_vnd::numeric as price_vnd, available
         FROM public.menu_items
         WHERE published = true`
      )

      let catalog: MenuItemCatalogRecord[] = menuRes.rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        price_vnd: Number(r.price_vnd),
        is_available: Boolean(r.available),
      }))

      const actorScope = actor.userId ? `user:${actor.userId}` : `guest:${sha256(clientIp)}`
      const toolContext = {
        catalog,
        actor_scope: actorScope,
        pool,
        orchestrator: ctx.orchestrator,
      }

      const acceptsSse =
        req.headers.get('accept')?.includes('text/event-stream') ||
        url.searchParams.get('stream') === 'true'

      if (acceptsSse && path === '/concierge/chat') {
        const encoder = new TextEncoder()
        let isCancelled = false
        const stream = new ReadableStream({
          async start(controller) {
            try {
              controller.enqueue(
                encoder.encode(
                  `event: progress\ndata: ${JSON.stringify({ step: 'processing', message: 'Đang xử lý yêu cầu...' })}\n\n`
                )
              )

              const envelope = await processConciergeTurn(body, toolContext, actor.userId || null)
              if (isCancelled) return

              if (envelope.cards && envelope.cards.length > 0) {
                for (const card of envelope.cards) {
                  controller.enqueue(encoder.encode(`event: card\ndata: ${JSON.stringify(card)}\n\n`))
                }
              }

              controller.enqueue(
                encoder.encode(`event: message\ndata: ${JSON.stringify({ text: envelope.message })}\n\n`)
              )
              controller.enqueue(
                encoder.encode(`event: complete\ndata: ${JSON.stringify(envelope)}\n\n`)
              )
              controller.close()
            } catch (err: unknown) {
              const appErr =
                err instanceof AppError
                  ? err
                  : new AppError(
                      'INTERNAL_ERROR',
                      err instanceof Error ? err.message : 'Lỗi hệ thống',
                      500
                    )
              controller.enqueue(
                encoder.encode(
                  `event: error\ndata: ${JSON.stringify({
                    code: appErr.code,
                    message: appErr.message,
                    status: appErr.statusCode,
                  })}\n\n`
                )
              )
              controller.close()
            }
          },
          cancel() {
            isCancelled = true
          },
        })

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Request-Id': requestId,
          },
        })
      }

      const envelope = await processConciergeTurn(body, toolContext, actor.userId || null)

      return jsonResponse(envelope, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    }

    if (path === '/concierge/feedback' && req.method === 'POST') {
      const body = await parseJsonBody<Record<string, unknown>>(req)
      const actorScope = actor.userId ? `user:${actor.userId}` : `guest:${sha256(clientIp)}`

      const record = await submitConciergeFeedbackAsync(pool, {
        conversation_id: body.conversation_id as string | undefined,
        proposal_id: body.proposal_id as string | undefined,
        proposal_version: body.proposal_version as number | undefined,
        config_version: body.config_version as string | number | undefined,
        rating: body.rating as string | undefined,
        feedback_text: body.feedback_text as string | undefined,
        customer_user_id: actor.userId || null,
        actor_scope: actorScope,
      })

      return jsonResponse(
        {
          success: true,
          feedback_id: record.id,
          message: 'Cảm ơn quý khách đã gửi phản hồi cho Tiger Concierge!',
          received_at: record.created_at,
        },
        requestId,
        req,
        200
      )
    }

    // --------------------------------------------------------------------------
    // RESERVATIONS ENDPOINT (Task T12, Invariants V15, V16, V24)
    // --------------------------------------------------------------------------
    if (path === '/reservations' && req.method === 'POST') {
      const clientIp = getClientIp(req)
      await assertRateLimit(pool, {
        key: `create_reservation_ip:${clientIp}`,
        limit: 30,
        windowSeconds: 300,
      })

      const idempotencyKey = req.headers.get('Idempotency-Key') || req.headers.get('idempotency-key')
      if (!idempotencyKey || idempotencyKey.trim().length < 16) {
        throw AppError.validation(
          'Yêu cầu phải có tiêu đề Idempotency-Key hợp lệ (tối thiểu 16 ký tự)',
          { 'Idempotency-Key': ['Bắt buộc phải có Idempotency-Key'] }
        )
      }
      const idempotencyKeyHash = sha256(idempotencyKey.trim())

      const body = await parseJsonBody<Record<string, unknown>>(req)
      const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : ''
      const customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : ''
      const startsAtRaw = typeof body.starts_at === 'string' ? body.starts_at.trim() : ''
      const guestCount = typeof body.guest_count === 'number' ? body.guest_count : Number(body.guest_count)
      const seatingAreaId =
        typeof body.seating_area_id === 'string' && body.seating_area_id.trim().length > 0
          ? body.seating_area_id.trim()
          : null
      const note = typeof body.note === 'string' ? body.note.trim() : ''

      const fieldErrors: Record<string, string[]> = {}
      if (customerName.length < 2) {
        fieldErrors.customer_name = ['Tên khách hàng phải có ít nhất 2 ký tự']
      }
      if (!/^(0|\+84)[1-9][0-9]{8}$/.test(customerPhone.replace(/\s+/g, ''))) {
        fieldErrors.customer_phone = ['Số điện thoại không hợp lệ (10 số di động Việt Nam)']
      }
      if (!startsAtRaw || isNaN(new Date(startsAtRaw).getTime())) {
        fieldErrors.starts_at = ['Thời gian đặt bàn không hợp lệ (định dạng ISO)']
      }
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30) {
        fieldErrors.guest_count = ['Số lượng khách phải từ 1 đến 30 người']
      }
      if (seatingAreaId && !/^[0-9a-fA-F-]{36}$/.test(seatingAreaId)) {
        fieldErrors.seating_area_id = ['Mã khu vực ngồi không hợp lệ']
      }

      if (Object.keys(fieldErrors).length > 0) {
        throw AppError.validation('Thông tin đặt bàn không hợp lệ', fieldErrors)
      }

      const startsAtDate = new Date(startsAtRaw)
      const actorScope = actor.userId ? `user:${actor.userId}` : `guest:${sha256(clientIp)}`
      const requestHash = sha256(
        JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          starts_at: startsAtDate.toISOString(),
          guest_count: guestCount,
          seating_area_id: seatingAreaId,
          note,
        })
      )

      let testNow: Date | null = ctx.trustedNow || null
      if (!testNow && isTrustedTestEnvironment()) {
        const testNowHeader = req.headers.get('x-test-now') || req.headers.get('X-Test-Now')
        if (testNowHeader) {
          const parsed = new Date(testNowHeader.trim())
          if (!isNaN(parsed.getTime())) {
            testNow = parsed
          }
        }
      }

      let rpcRes: pg.QueryResult
      try {
        rpcRes = await pool.query(
          `SELECT public.create_reservation($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) as result`,
          [
            idempotencyKeyHash,
            requestHash,
            actorScope,
            customerName,
            customerPhone,
            startsAtDate.toISOString(),
            guestCount,
            seatingAreaId,
            note,
            actor.userId || null,
            testNow ? testNow.toISOString() : null,
          ]
        )
      } catch (dbErr: unknown) {
        if (dbErr && typeof dbErr === 'object') {
          const errObj = dbErr as { code?: string; message?: string }
          const code = errObj.code || ''
          const msg = errObj.message || 'Lỗi đặt bàn'
          if (code === 'P0001') {
            throw new AppError('AREA_UNAVAILABLE', msg.replace(/^[^:]+:\s*/, ''), 409)
          } else if (code === 'P0010') {
            throw new AppError('IDEMPOTENCY_CONFLICT', msg.replace(/^[^:]+:\s*/, ''), 409)
          } else if (code === 'P0011') {
            throw new AppError('SERVICE_CLOSED', msg.replace(/^[^:]+:\s*/, ''), 409)
          } else if (code === 'P0012') {
            throw new AppError('VALIDATION_ERROR', msg.replace(/^[^:]+:\s*/, ''), 422)
          } else if (code === 'P0020') {
            throw new AppError('BOOKING_DISABLED', msg.replace(/^[^:]+:\s*/, ''), 409)
          } else if (code === 'P0021') {
            throw new AppError('RESERVATION_NOTICE_TOO_SHORT', msg.replace(/^[^:]+:\s*/, ''), 422)
          } else if (code === 'P0022') {
            throw new AppError('RESERVATION_TOO_FAR_AHEAD', msg.replace(/^[^:]+:\s*/, ''), 422)
          }
        }
        throw dbErr
      }

      const result = rpcRes.rows[0].result as { replayed: boolean; receipt: Record<string, unknown> }
      return jsonResponse(result.receipt, requestId, req, result.replayed ? 200 : 201, {
        'Cache-Control': 'no-store',
      })
    }

    // Unmatched path
    throw AppError.notFound(`Không tìm thấy endpoint public: ${req.method} ${path}`)
  } catch (err: unknown) {
    return toErrorResponse(err, requestId, req)
  }
}

// Deno Edge Runtime HTTP Entrypoint
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req: Request) => handlePublicApi(req))
}

// Default export for Deno / Edge Runtime
export default handlePublicApi

