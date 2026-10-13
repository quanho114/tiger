import type pg from 'pg'

export type ReservationAvailability = {
  status: 'available' | 'unavailable' | 'unverified'
  starts_at: string
  guest_count: number
  reason: string
}

export async function checkReservationAvailability(
  pool: pg.Pool, startsAt: Date, guestCount: number, now = new Date()
): Promise<ReservationAvailability> {
  const start = startsAt.toISOString()
  const outcome = (status: ReservationAvailability['status'], reason: string): ReservationAvailability =>
    ({ status, starts_at: start, guest_count: guestCount, reason })
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 30 || !Number.isFinite(startsAt.getTime()))
    return outcome('unverified', 'Cần xác nhận ngày, giờ và số khách hợp lệ.')

  const settings = await pool.query(`SELECT booking_enabled, reservation_min_notice_minutes,
    reservation_max_days_ahead, reservation_duration_minutes FROM public.restaurant_settings WHERE id = 1`)
  const policy = settings.rows[0]
  if (!policy) return outcome('unverified', 'Chưa đọc được cấu hình đặt bàn.')
  if (!policy.booking_enabled) return outcome('unavailable', 'Nhà hàng đang tạm ngưng nhận đặt bàn trực tuyến.')
  const notice = Number(policy.reservation_min_notice_minutes)
  const horizon = Number(policy.reservation_max_days_ahead)
  const duration = Number(policy.reservation_duration_minutes)
  if (!Number.isFinite(notice) || !Number.isFinite(horizon) || !Number.isFinite(duration))
    return outcome('unverified', 'Chưa xác minh được chính sách đặt bàn.')
  if (startsAt.getTime() < now.getTime() + notice * 60_000 ||
      startsAt.getTime() > now.getTime() + horizon * 86_400_000)
    return outcome('unavailable', 'Thời điểm này nằm ngoài khoảng thời gian nhận đặt bàn.')
  const endsAt = new Date(startsAt.getTime() + duration * 60_000)
  const schedule = await pool.query(`SELECT
    EXISTS (SELECT 1 FROM public.business_closures
      WHERE date = ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
      AND service_type IN ('reservation', 'restaurant', 'all')) AS closed,
    EXISTS (SELECT 1 FROM public.business_hours WHERE active AND service_type = 'reservation'
      AND weekday = EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int
      AND ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::time BETWEEN open_time AND close_time) AS intake_open,
    EXISTS (SELECT 1 FROM public.business_hours WHERE active AND service_type = 'restaurant'
      AND weekday = EXTRACT(DOW FROM ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int
      AND ($1::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= open_time
      AND ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= close_time) AS service_open`,
    [start, endsAt.toISOString()])
  if (schedule.rows[0]?.closed || !schedule.rows[0]?.intake_open || !schedule.rows[0]?.service_open)
    return outcome('unavailable', 'Nhà hàng không nhận đặt bàn ở khung giờ này.')

  const seats = await pool.query(`SELECT
    EXISTS (SELECT 1 FROM public.reservations r WHERE r.status IN ('pending', 'confirmed')
      AND r.assigned_table_id IS NULL AND r.starts_at < $2 AND r.ends_at > $1) AS legacy_overlap,
    EXISTS (SELECT 1 FROM public.dining_tables t WHERE t.active AND t.capacity IS NULL) AS unknown_capacity,
    EXISTS (SELECT 1 FROM public.dining_tables t WHERE t.active AND t.capacity >= $3
      AND NOT EXISTS (SELECT 1 FROM public.reservations r WHERE r.assigned_table_id = t.id
        AND r.status IN ('pending', 'confirmed') AND r.starts_at < $2 AND r.ends_at > $1)
      AND NOT EXISTS (SELECT 1 FROM public.table_visits v WHERE v.table_id = t.id AND v.status = 'open')) AS suitable_table,
    EXISTS (SELECT 1 FROM public.dining_tables t WHERE t.active AND t.capacity >= $3
      AND EXISTS (SELECT 1 FROM public.table_visits v WHERE v.table_id = t.id AND v.status = 'open')) AS open_visit`,
    [start, endsAt.toISOString(), guestCount])
  const row = seats.rows[0]
  if (!row) return outcome('unverified', 'Chưa kiểm tra được tình trạng bàn.')
  if (row.legacy_overlap) return outcome('unverified', 'Có yêu cầu đặt bàn cũ chưa được gán bàn; nhà hàng cần xác nhận.')
  if (row.suitable_table) return outcome('available', 'Hiện có bàn phù hợp để gửi yêu cầu; nhà hàng sẽ xác nhận sau khi nhận đặt bàn.')
  if (row.unknown_capacity || row.open_visit)
    return outcome('unverified', 'Chưa xác minh được sức chứa hoặc thời điểm bàn trống.')
  return outcome('unavailable', 'Hiện chưa có bàn phù hợp ở khung giờ này.')
}
