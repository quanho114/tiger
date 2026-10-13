import pg from 'pg'
import { getClientIp, jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import { isTrustedTestEnvironment } from '../_shared/schedule.ts'
import type { RouteContext } from './context.ts'

export async function handleReservationsRoutes({
  req,
  path,
  actor,
  pool,
  requestId,
  ctx,
}: RouteContext): Promise<Response | null> {
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
    const guestCount =
      typeof body.guest_count === 'number' ? body.guest_count : Number(body.guest_count)
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
        } else if (code === 'P0023' || code === '23P01') {
          throw new AppError('AREA_UNAVAILABLE', 'Khung giờ này chưa có bàn phù hợp. Vui lòng chọn giờ khác hoặc liên hệ nhà hàng.', 409)
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
