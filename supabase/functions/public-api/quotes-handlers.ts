import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import { verifyVisitCapability } from '../_shared/capability.ts'
import {
  normalizeLineItems,
  createOrderQuote,
  type RawLineItem,
  type QuotedLineItem,
  type OrderQuoteContext,
} from '../_shared/quote.ts'
import { assertServiceOperating } from '../_shared/schedule.ts'
import type { RouteContext } from './context.ts'

export async function handleQuotesRoutes({
  req,
  path,
  actor,
  pool,
  requestId,
  clientIp,
  ctx,
}: RouteContext): Promise<Response | null> {
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
    if (orderType !== 'dine_in' && orderType !== 'delivery' && orderType !== 'takeaway') {
      throw AppError.validation("Loại đơn hàng phải là 'dine_in', 'delivery' hoặc 'takeaway'")
    }

    let verifiedCap: {
      table_id: string
      visit_id: string
      table_name: string
      epoch: number
    } | null = null
    let deliveryZone: {
      id: string
      name: string
      fee_vnd: number
      free_threshold_vnd: number | null
    } | null = null
    let minDeliveryOrderVnd = 100000
    let pickupTime: string | null = null

    if (orderType === 'dine_in') {
      // Dine-in: reject forbidden delivery fields
      if (
        body.delivery_zone_id !== undefined ||
        body.address !== undefined ||
        body.customer !== undefined ||
        body.customer_name !== undefined ||
        body.customer_phone !== undefined
      ) {
        throw AppError.validation(
          'Đơn phục vụ tại bàn không nhận thông tin giao hàng hoặc khách hàng'
        )
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
    } else if (orderType === 'delivery') {
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
        throw AppError.validation(
          'Mã khu vực giao hàng (delivery_zone_id) không hợp lệ hoặc để trống',
          {
            delivery_zone_id: ['Bắt buộc phải chọn khu vực giao hàng'],
          }
        )
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
        throw new AppError(
          'ZONE_UNAVAILABLE',
          `Khu vực giao hàng "${zRow.name}" hiện đang tạm ngưng phục vụ`,
          409
        )
      }

      deliveryZone = {
        id: zRow.id,
        name: zRow.name,
        fee_vnd: Number(zRow.fee_vnd),
        free_threshold_vnd:
          zRow.free_threshold_vnd !== null ? Number(zRow.free_threshold_vnd) : null,
      }
    } else {
      // Takeaway: reject forbidden dine-in and delivery fields
      if (
        body.visit_capability !== undefined ||
        body.table_id !== undefined ||
        body.table_visit_id !== undefined ||
        body.delivery_zone_id !== undefined ||
        body.address !== undefined
      ) {
        throw AppError.validation('Đơn mang đi không nhận thông tin bàn ăn hoặc giao hàng')
      }

      // Takeaway operates under restaurant hours/closures
      await assertServiceOperating(pool, 'restaurant', { req, trustedNow: ctx.trustedNow })

      const settingsRes = await pool.query(
        `SELECT accepting_orders
         FROM public.restaurant_settings
         WHERE id = 1`
      )
      if (settingsRes.rows.length === 0 || !settingsRes.rows[0].accepting_orders) {
        throw new AppError('SERVICE_CLOSED', 'Quán hiện đang tạm ngưng nhận đơn', 409)
      }

      const rawPickupTime = typeof body.pickup_time === 'string' ? body.pickup_time.trim() : ''
      if (rawPickupTime) {
        if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(rawPickupTime)) {
          throw AppError.validation('Giờ lấy món (pickup_time) không hợp lệ', {
            pickup_time: ['Định dạng phải là HH:mm'],
          })
        }
        pickupTime = rawPickupTime
      }
    }

    // 5. Normalize items
    const rawItems = body.items as RawLineItem[]
    const normalizedItems = normalizeLineItems(rawItems)

    // 6. Query menu items from DB
    const itemIds = normalizedItems.map((i) => i.menu_item_id)
    const menuRes = await pool.query(
      `SELECT id, name, price_vnd::numeric as price_vnd, pricing_mode, price_min, price_max, published, available, allow_dine_in, allow_delivery
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
        price_min: number | null
        price_max: number | null
        pricing_mode: string
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
        price_min: row.price_min == null ? null : Number(row.price_min),
        price_max: row.price_max == null ? null : Number(row.price_max),
        pricing_mode: (row.pricing_mode as string) || 'fixed',
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
      if (item.pricing_mode && !['fixed', 'range'].includes(item.pricing_mode)) {
        throw new AppError(
          'ITEM_UNAVAILABLE',
          `Món "${item.name}" có hình thức giá không cố định, vui lòng liên hệ nhân viên hoặc hotline quán để được báo giá trực tiếp`,
          409
        )
      }
      if (orderType === 'dine_in' && !item.allow_dine_in) {
        throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" không phục vụ tại bàn`, 409)
      }
      if (orderType === 'delivery' && !item.allow_delivery) {
        throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" không áp dụng giao tận nơi`, 409)
      }
      if (orderType === 'takeaway' && !item.allow_delivery) {
        throw new AppError('ITEM_UNAVAILABLE', `Món "${item.name}" không áp dụng mang đi`, 409)
      }

      let unitPrice = item.price_vnd
      if (item.pricing_mode === 'range') {
        const min = item.price_min
        const max = item.price_max
        const price = line.selected_price_vnd
        const step = min != null && max != null && min % 10000 === 0 && max % 10000 === 0 ? 10000 : 5000
        if (min == null || max == null || price === undefined || price < min || price > max || ((price - min) % step !== 0 && price !== max)) {
          throw AppError.validation('Giá phần đã chọn không nằm trong các mức giá hiện tại')
        }
        unitPrice = price
      } else if (line.selected_price_vnd !== undefined) {
        throw AppError.validation('Món giá cố định không nhận giá phần tùy chọn')
      }
      const lineTotal = unitPrice * line.quantity
      subtotalVnd += lineTotal
      quotedItems.push({
        menu_item_id: line.menu_item_id,
        item_name: item.name,
        quantity: line.quantity,
        note: line.note,
        ...(line.selected_price_vnd !== undefined ? { selected_price_vnd: line.selected_price_vnd } : {}),
        unit_price_vnd: unitPrice,
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

      if (
        deliveryZone!.free_threshold_vnd !== null &&
        subtotalVnd >= deliveryZone!.free_threshold_vnd
      ) {
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
        : orderType === 'delivery'
          ? {
              delivery_zone_id: deliveryZone!.id,
              zone_name: deliveryZone!.name,
              fee_vnd: deliveryZone!.fee_vnd,
              free_threshold_vnd: deliveryZone!.free_threshold_vnd,
            }
          : { pickup_time: pickupTime }

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

  return null
}
