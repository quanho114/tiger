import type pg from 'pg'
import { z } from 'zod'
import { normalizeIntent } from './draft-intent.ts'
import { readRestaurantHours } from './restaurant-hours.ts'

export const RestaurantInfoFieldSchema = z.enum([
  'phone', 'zalo', 'facebook', 'address', 'opening_hours', 'delivery_information', 'reservation_information',
])
export type RestaurantInfoField = z.infer<typeof RestaurantInfoFieldSchema>
export type RestaurantInfoResult = { status: 'known' | 'unknown' | 'unavailable'; answer: string }

const unknown = 'Mình chưa xác minh được thông tin này. Bạn vui lòng liên hệ nhà hàng.'

export function restaurantFactField(message: string): RestaurantInfoField | null {
  const text = normalizeIntent(message)
  if (/\b(?:zalo|za lo)\b/.test(text)) return 'zalo'
  if (/\b(?:facebook|fanpage|fb)\b/.test(text)) return 'facebook'
  if (/\b(?:so dien thoai|dien thoai|hotline|lien he|goi dien)\b/.test(text)) return 'phone'
  if (/\b(?:dia chi|o dau|vi tri|duong di|ban do)\b/.test(text) && !/\b(?:cua toi|cua minh|da luu|giao hang|giao mon)\b/.test(text)) return 'address'
  if (/\b(?:gio mo|gio dong|mo cua|dong cua|may gio|gio hoat dong|gio phuc vu|thoi gian mo|thoi gian dong)\b/.test(text) ||
      /\b(?:hoat dong|phuc vu|mo|dong)\b.{0,35}\b(?:ngay nao|hom nao|thu may|khi nao|luc nao)\b/.test(text)) return 'opening_hours'
  if (/\b(?:ship|giao(?: hang| mon| tan noi)?|khu vuc giao)\b/.test(text)) return 'delivery_information'
  if (/\b(?:dat ban|giu cho|booking|reservation)\b/.test(text)) return 'reservation_information'
  return null
}

export function isRestaurantFactQuestion(message: string): boolean {
  const text = normalizeIntent(message)
  return restaurantFactField(message) !== null ||
    /\b(?:nha hang|quan|tiger|ben minh)\b.{0,90}\b(?:co|gia|bao nhieu|nhan|phuc vu|the nao|khong|duoc)\b/.test(text) ||
    (/\b(?:nha hang|quan|tiger|ben minh)\b/.test(text) && /\?\s*$/.test(message)) ||
    /\b(?:wifi|bai xe|do xe|phong rieng|phong vip|chi nhanh|khuyen mai|hoan tien|huy don|chinh sach)\b/.test(text)
}

export async function getRestaurantInfo(pool: pg.Pool, rawField: RestaurantInfoField, question = ''): Promise<RestaurantInfoResult> {
  const field = RestaurantInfoFieldSchema.parse(rawField)
  try {
    if (field === 'opening_hours') {
      const answer = await readRestaurantHours(pool, question)
      return { status: answer.startsWith('Mình chưa') ? 'unknown' : 'known', answer }
    }
    const settings = await pool.query(`SELECT phone, zalo, facebook, address, accepting_delivery_orders, booking_enabled,
      reservation_min_notice_minutes, reservation_max_days_ahead, reservation_cancel_notice_minutes
      FROM public.restaurant_settings WHERE id = 1`)
    const row = settings.rows[0]
    if (!row) return { status: 'unknown', answer: unknown }
    if (field === 'delivery_information') {
      if (row.accepting_delivery_orders === false) return { status: 'known', answer: 'Nhà hàng hiện không nhận đơn giao hàng.' }
      if (row.accepting_delivery_orders !== true) return { status: 'unknown', answer: unknown }
      const zones = await pool.query(`SELECT name FROM public.delivery_zones WHERE active = true ORDER BY sort_order, name`)
      const names = zones.rows.map(zone => String(zone.name ?? '').trim()).filter(Boolean)
      if (!names.length) return { status: 'unknown', answer: unknown }
      const text = normalizeIntent(question)
      const namedArea = /\b(?:co giao|ship|giao(?: hang| mon)?)\b.{0,70}\b(?:o|tai|den|khu vuc|quan|huyen|phuong)\b/.test(text)
      const matched = names.filter(name => text.includes(normalizeIntent(name)))
      if (namedArea && !matched.length) return { status: 'unknown', answer: 'Mình chưa xác minh được nhà hàng có giao tới khu vực bạn hỏi. Bạn hãy kiểm tra địa chỉ trong giỏ hàng.' }
      return { status: 'known', answer: `Khu vực giao hàng đang hoạt động: ${names.join(', ')}. Phí giao cụ thể được báo trong giỏ hàng theo địa chỉ.` }
    }
    if (field === 'reservation_information') {
      if (typeof row.booking_enabled !== 'boolean') return { status: 'unknown', answer: unknown }
      if (/\b(?:chinh sach|quy dinh|huy ban|huy dat ban)\b/.test(normalizeIntent(question)) && row.booking_enabled) {
        const notice = Number(row.reservation_min_notice_minutes)
        const advance = Number(row.reservation_max_days_ahead)
        const cancel = Number(row.reservation_cancel_notice_minutes)
        if (![notice, advance, cancel].every(Number.isInteger)) return { status: 'unknown', answer: unknown }
        return { status: 'known', answer: `Nhà hàng nhận yêu cầu đặt bàn trước ít nhất ${notice} phút và tối đa ${advance} ngày. Yêu cầu hủy trước ít nhất ${cancel} phút.` }
      }
      return { status: 'known', answer: row.booking_enabled
        ? 'Nhà hàng hiện nhận yêu cầu đặt bàn. Bạn có thể kiểm tra thời gian và gửi yêu cầu trên trang đặt bàn.'
        : 'Nhà hàng hiện không nhận yêu cầu đặt bàn trực tuyến.' }
    }
    const value = row[field]
    if (typeof value !== 'string' || !value.trim()) return { status: 'unknown', answer: unknown }
    const labels = { phone: 'Số điện thoại', zalo: 'Zalo', facebook: 'Facebook', address: 'Địa chỉ' }
    return { status: 'known', answer: `${labels[field]} nhà hàng: ${value.trim()}` }
  } catch {
    return { status: 'unavailable', answer: 'Mình chưa kiểm tra được thông tin nhà hàng lúc này. Bạn vui lòng thử lại sau.' }
  }
}
