import pg from 'pg'
import { recoverOrder } from '../_shared/order-recovery.ts'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import {
  normalizeLineItems,
  computeCanonicalRequestHash,
  verifyOrderQuote,
  extractQuotePayloadUnchecked,
  type RawLineItem,
} from '../_shared/quote.ts'
import { assertServiceOperating, isTrustedTestEnvironment } from '../_shared/schedule.ts'
import type { RouteContext } from './context.ts'

export async function handleOrdersRoutes({
  req,
  path,
  actor,
  pool,
  requestId,
  clientIp,
  ctx,
}: RouteContext): Promise<Response | null> {
  if (path === '/orders/recover' && req.method === 'POST') {
    await assertRateLimit(pool, { key: `recover_order:${clientIp}`, limit: 20, windowSeconds: 300 })
    const body = await parseJsonBody<Record<string, unknown>>(req)
    if (!body || typeof body !== 'object') throw AppError.validation('Dữ liệu không hợp lệ')
    return jsonResponse({ receipt: await recoverOrder(pool, body) }, requestId, req, 200, {
      'Cache-Control': 'no-store',
    })
  }

  if (path === '/orders' && req.method === 'POST') {
    // 1. IP rate limit (10 req / 5 min)
    await assertRateLimit(pool, {
      key: `create_order_ip:${clientIp}`,
      limit: 10,
      windowSeconds: 300,
    })

    // 2. Idempotency-Key Header verification
    const idempotencyKey = req.headers.get('idempotency-key') || req.headers.get('Idempotency-Key')
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
    const claimSecret = typeof body.claim_secret === 'string' ? body.claim_secret.trim() : ''
    if (claimSecret && (claimSecret.length < 16 || claimSecret.length > 128)) {
      throw AppError.validation(
        'Mã bí mật claim đơn (claim_secret) phải có độ dài từ 16 đến 128 ký tự'
      )
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
    } else if (unverifiedQuote.order_type === 'takeaway') {
      if (body.delivery_zone_id !== undefined || body.address !== undefined) {
        throw AppError.validation('Đơn mang đi không nhận thông tin giao hàng')
      }
      if (body.customer && typeof body.customer === 'object') {
        const c = body.customer as Record<string, unknown>
        customerName = typeof c.name === 'string' ? c.name.trim() : ''
        customerPhone = typeof c.phone === 'string' ? c.phone.trim() : ''
      } else {
        customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : ''
        customerPhone = typeof body.customer_phone === 'string' ? body.customer_phone.trim() : ''
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
    } else if (unverifiedQuote.order_type === 'dine_in') {
      if (
        body.customer !== undefined ||
        body.customer_name !== undefined ||
        body.customer_phone !== undefined ||
        body.address !== undefined ||
        body.delivery_zone_id !== undefined
      ) {
        throw AppError.validation(
          'Đơn phục vụ tại bàn không nhận thông tin giao hàng hoặc khách hàng'
        )
      }
    }

    const quoteCtx = unverifiedQuote.context as Record<string, unknown>
    const requestHash = computeCanonicalRequestHash({
      order_type: unverifiedQuote.order_type,
      context: {
        table_id: typeof quoteCtx.table_id === 'string' ? quoteCtx.table_id : null,
        table_visit_id:
          typeof quoteCtx.table_visit_id === 'string' ? quoteCtx.table_visit_id : null,
        delivery_zone_id:
          typeof quoteCtx.delivery_zone_id === 'string' ? quoteCtx.delivery_zone_id : null,
        address: customerAddress || null,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        pickup_time: typeof quoteCtx.pickup_time === 'string' ? quoteCtx.pickup_time : null,
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
        throw new AppError(
          'QUOTE_CHANGED',
          'Chi tiết món hoặc số lượng không khớp với báo giá',
          409
        )
      }
    }

    // Check operating hours for delivery, dine-in or takeaway
    if (verifiedQuote.order_type === 'delivery') {
      await assertServiceOperating(pool, 'delivery', { req, trustedNow: ctx.trustedNow })
    } else if (
      verifiedQuote.order_type === 'dine_in' ||
      verifiedQuote.order_type === 'takeaway'
    ) {
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
    const dineInContext = verifiedQuote.order_type === 'dine_in' ? verifiedQuote.context : null
    const deliveryContext =
      verifiedQuote.order_type === 'delivery'
        ? {
            delivery_zone_id: (verifiedQuote.context as Record<string, unknown>).delivery_zone_id,
            customer_name: customerName,
            customer_phone: customerPhone,
            address: customerAddress,
            expected_shipping_fee_vnd: verifiedQuote.shipping_fee_vnd,
          }
        : verifiedQuote.order_type === 'takeaway'
          ? {
              customer_name: customerName,
              customer_phone: customerPhone,
              pickup_time: (verifiedQuote.context as Record<string, unknown>).pickup_time ?? null,
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

  return null
}
