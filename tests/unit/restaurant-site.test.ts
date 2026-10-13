import { expect, it } from 'vitest'
import { getSiteInfo } from '@/features/restaurant/site'
import type { RestaurantSettings } from '@/features/catalog/types'

const settings: RestaurantSettings = {
  name: 'Tiger 345', phone: '0902000100', zalo: 'https://zalo.me/current', facebook: 'https://facebook.com/current',
  address: 'Địa chỉ mới từ cơ sở dữ liệu', maps_url: 'https://maps.google.com/?q=current', timezone: 'Asia/Ho_Chi_Minh',
  accepting_orders: true, accepting_dine_in_orders: true, accepting_delivery_orders: true, booking_enabled: true,
  min_delivery_order_vnd: 0, reservation_policy: { min_notice_minutes: 30, max_days_ahead: 30,
    duration_minutes: 120, cancel_notice_minutes: 60, no_show_grace_minutes: 15 },
  business_hours: Array.from({ length: 7 }, (_, weekday) => ({ id: String(weekday), weekday,
    service_type: 'restaurant' as const, open_time: '11:00:00', close_time: '20:00:00' })),
  business_closures: [], delivery_zones: [], seating_areas: [],
}

it('displays database-backed contacts and hours, including changed values', () => {
  expect(getSiteInfo(settings)).toMatchObject({ phoneDisplay: '090 200 0100',
    addressFull: 'Địa chỉ mới từ cơ sở dữ liệu', hours: '11:00 – 20:00', zalo: 'https://zalo.me/current' })
  expect(getSiteInfo({ ...settings, phone: '0902000200', business_hours: settings.business_hours.map(hour =>
    ({ ...hour, close_time: '21:00:00' })) })).toMatchObject({ phoneDisplay: '090 200 0200', hours: '11:00 – 21:00' })
})

it('never supplies a stale phone, contact link or hours while settings are unavailable', () => {
  expect(getSiteInfo(null)).toMatchObject({ phoneDisplay: 'Chưa cập nhật', phoneHref: '',
    zalo: '', facebook: '', mapsUrl: '', hours: 'Chưa cập nhật' })
})
