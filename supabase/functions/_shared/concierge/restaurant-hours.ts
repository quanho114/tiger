import type pg from 'pg'
import { getServiceTimeContext } from '../schedule.ts'
import { normalizeIntent } from './draft-intent.ts'

export function isRestaurantHoursQuestion(message: string): boolean {
  const text = normalizeIntent(message)
  return /\b(?:gio (?:mo|dong) cua|gio (?:hoat dong|phuc vu)|may gio (?:mo|dong|phuc vu)|luc nao (?:mo|dong)|thoi gian (?:mo|dong) cua|(?:mo|dong)(?: cua| den)? (?:may gio|luc nao))\b/.test(text)
}

export function isDeliveryFeeQuestion(message: string): boolean {
  const text = normalizeIntent(message)
  return /\b(?:phi (?:ship|giao(?: hang)?)|(?:ship|giao hang).{0,35}bao nhieu|bao nhieu.{0,35}(?:ship|giao hang))\b/.test(text)
}

export async function readRestaurantHours(pool: pg.Pool, message: string, now = new Date()): Promise<string> {
  const tomorrow = /\b(?:ngay mai|toi mai)\b/.test(normalizeIntent(message))
  const time = getServiceTimeContext({ trustedNow: tomorrow ? new Date(now.getTime() + 86_400_000) : now })
  const label = `${tomorrow ? 'Ngày mai' : 'Hôm nay'} (${time.dateStr.slice(8)}/${time.dateStr.slice(5, 7)})`
  const closures = await pool.query(`SELECT EXISTS (
    SELECT 1 FROM public.business_closures WHERE date = $1 AND service_type IN ('restaurant', 'all')
  ) AS closed`, [time.dateStr])
  if (closures.rows[0]?.closed !== false) {
    return closures.rows[0]?.closed ? `${label} nhà hàng tạm nghỉ.` : 'Mình chưa xác minh được lịch phục vụ. Bạn vui lòng liên hệ nhà hàng.'
  }
  const hours = await pool.query(`SELECT open_time::text AS open_time, close_time::text AS close_time
    FROM public.business_hours WHERE weekday = $1 AND service_type = 'restaurant' AND active = true
    ORDER BY open_time`, [time.weekday])
  const slots = hours.rows.map(row => {
    const open = String(row.open_time ?? '')
    const close = String(row.close_time ?? '')
    return /^\d{2}:\d{2}(?::\d{2})?$/.test(open) && /^\d{2}:\d{2}(?::\d{2})?$/.test(close)
      ? `${open.slice(0, 5)}–${close.slice(0, 5)}` : null
  })
  if (!slots.length || slots.includes(null)) return 'Mình chưa xác minh được giờ phục vụ. Bạn vui lòng liên hệ nhà hàng.'
  return `${label} nhà hàng phục vụ ${slots.join(', ')} theo lịch hiện tại.`
}
