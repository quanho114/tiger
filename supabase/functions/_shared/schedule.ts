/**
 * Tiger 345 - Operating Hours and Closures Checker
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers:
 *   - supabase/functions/public-api/index.ts
 *   - supabase/functions/customer-api/customer-handlers.ts
 *   - supabase/functions/admin-api/index.ts
 * - Affected API:
 *   - POST /functions/v1/public-api/order-quotes
 *   - POST /functions/v1/public-api/orders
 *   - POST /functions/v1/public-api/reservations
 * - Data Schemas:
 *   - public.business_closures (date date, service_type text, reason text)
 *   - public.business_hours (weekday int, service_type text, open_time time, close_time time, active boolean)
 * - Verbatim Instructions:
 *   - "BƯỚC 6 — F04: TRUSTED CLOCK VÀ LỊCH PHỤC VỤ"
 *   - "Xóa bỏ việc tin cậy X-Test-Now tùy tiện từ HTTP header trong production/Edge logic."
 *   - "Nếu cần inject time cho test, đóng gói qua trusted context/dependency injection nội bộ hoặc mock có kiểm soát môi trường test rõ ràng, không mở cửa cho client bất kỳ gửi header này."
 *   - "Kiểm tra lại logic lịch: validate business hours / closures một cách atomic / transaction-safe khi tạo order/reservation, không để lọt trường hợp restaurant closure phủ nhận delivery service (all vs restaurant scope)."
 *   - "Viết integration test chứng minh client không thể bypass giờ đóng cửa bằng X-Test-Now."
 */

import type pg from 'pg'
import { AppError } from './errors.ts'

export interface ServiceTimeContext {
  now: Date
  dateStr: string // YYYY-MM-DD in Asia/Ho_Chi_Minh
  timeStr: string // HH:mm:ss in Asia/Ho_Chi_Minh
  weekday: number // 0 (Sun) .. 6 (Sat)
}

export interface ServiceTimeOptions {
  trustedNow?: Date
  req?: Request
}

export function isTrustedTestEnvironment(): boolean {
  if (typeof process !== 'undefined' && process.env) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
      return true
    }
  }
  if (typeof Deno !== 'undefined' && Deno.env) {
    if (Deno.env.get('DENO_ENV') === 'test' || Deno.env.get('ENABLE_TEST_CLOCK') === 'true') {
      return true
    }
  }
  return false
}

export function getServiceTimeContext(options?: ServiceTimeOptions | Request): ServiceTimeContext {
  let now = new Date()
  let req: Request | undefined
  let trustedNow: Date | undefined

  if (options) {
    if (options instanceof Request) {
      req = options
    } else {
      req = options.req
      trustedNow = options.trustedNow
    }
  }

  // 1. Direct trusted context / dependency injection has highest precedence
  if (trustedNow && !isNaN(trustedNow.getTime())) {
    now = trustedNow
  } else if (req && isTrustedTestEnvironment()) {
    // 2. In controlled test environments only, allow header injection for deterministic testing
    const testNowHeader = req.headers.get('x-test-now') || req.headers.get('X-Test-Now')
    if (testNowHeader) {
      const parsed = new Date(testNowHeader.trim())
      if (!isNaN(parsed.getTime())) {
        now = parsed
      }
    }
  }

  // Vietnam is UTC+7 all year (no DST)
  const vnTime = new Date(now.getTime() + 7 * 3600 * 1000)
  const dateStr = vnTime.toISOString().slice(0, 10)
  const timeStr = vnTime.toISOString().slice(11, 19)
  const weekday = vnTime.getUTCDay()

  return { now, dateStr, timeStr, weekday }
}

export async function assertServiceOperating(
  pool: pg.Pool,
  serviceType: 'delivery' | 'restaurant' | 'reservation',
  options?: ServiceTimeOptions | Request
): Promise<ServiceTimeContext> {
  const timeCtx = getServiceTimeContext(options)

  // 1. Determine which closure service_types affect this service:
  // - restaurant closure: blocks ALL services (restaurant, delivery, reservation)
  // - delivery closure: ONLY blocks delivery (does NOT block dine-in / restaurant)
  // - reservation closure: ONLY blocks reservation
  // - all closure: blocks ALL services
  const closureTypes =
    serviceType === 'delivery'
      ? ['delivery', 'restaurant', 'all']
      : serviceType === 'restaurant'
        ? ['restaurant', 'all']
        : ['reservation', 'restaurant', 'all']

  // Check business closures for the date
  const closureRes = await pool.query(
    `SELECT reason
     FROM public.business_closures
     WHERE date = $1 AND service_type = ANY($2::text[])`,
    [timeCtx.dateStr, closureTypes]
  )
  if (closureRes.rows.length > 0) {
    const reason = closureRes.rows[0].reason ? `: ${closureRes.rows[0].reason}` : ''
    const serviceLabel =
      serviceType === 'delivery'
        ? 'giao hàng'
        : serviceType === 'reservation'
          ? 'đặt bàn'
          : 'phục vụ tại quán'
    throw new AppError(
      'SERVICE_CLOSED',
      `Quán tạm ngưng dịch vụ ${serviceLabel} vào ngày ${timeCtx.dateStr}${reason}`,
      409
    )
  }

  // 2. Check business hours for weekday (Multi-shift support)
  const hoursRes = await pool.query(
    `SELECT open_time, close_time
     FROM public.business_hours
     WHERE weekday = $1 AND service_type = $2 AND active = true
     ORDER BY open_time ASC`,
    [timeCtx.weekday, serviceType]
  )

  const serviceLabel =
    serviceType === 'delivery'
      ? 'giao hàng'
      : serviceType === 'reservation'
        ? 'đặt bàn'
        : 'phục vụ tại quán'

  if (hoursRes.rows.length === 0) {
    throw new AppError(
      'SERVICE_CLOSED',
      `Quán không hoạt động dịch vụ ${serviceLabel} vào thứ ${timeCtx.weekday === 0 ? 'Chủ Nhật' : timeCtx.weekday + 1}`,
      409
    )
  }

  // Check if current time falls within at least ONE active shift interval [open_time, close_time]
  const isInShift = hoursRes.rows.some((row: { open_time: string; close_time: string }) => {
    const openStr = String(row.open_time).slice(0, 8)
    const closeStr = String(row.close_time).slice(0, 8)
    return timeCtx.timeStr >= openStr && timeCtx.timeStr <= closeStr
  })

  if (!isInShift) {
    const shiftsDesc = hoursRes.rows
      .map((r: { open_time: string; close_time: string }) => `${String(r.open_time).slice(0, 5)} - ${String(r.close_time).slice(0, 5)}`)
      .join(', ')
    throw new AppError(
      'SERVICE_CLOSED',
      `Ngoài khung giờ ${serviceLabel} (${shiftsDesc}). Hiện tại là ${timeCtx.timeStr.slice(0, 5)}.`,
      409
    )
  }

  // 3. If service is delivery, it MUST also satisfy restaurant operating hours (kitchen must be open)
  if (serviceType === 'delivery') {
    const restHoursRes = await pool.query(
      `SELECT open_time, close_time
       FROM public.business_hours
       WHERE weekday = $1 AND service_type = 'restaurant' AND active = true
       ORDER BY open_time ASC`,
      [timeCtx.weekday]
    )

    if (restHoursRes.rows.length > 0) {
      const isRestOpen = restHoursRes.rows.some((row: { open_time: string; close_time: string }) => {
        const openStr = String(row.open_time).slice(0, 8)
        const closeStr = String(row.close_time).slice(0, 8)
        return timeCtx.timeStr >= openStr && timeCtx.timeStr <= closeStr
      })

      if (!isRestOpen) {
        throw new AppError(
          'SERVICE_CLOSED',
          `Nhà hàng hiện đang đóng cửa (bếp không hoạt động), không thể nhận đơn giao tận nơi lúc ${timeCtx.timeStr.slice(0, 5)}.`,
          409
        )
      }
    }
  }

  return timeCtx
}
