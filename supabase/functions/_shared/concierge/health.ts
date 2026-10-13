import type pg from 'pg'
import { AppError } from '../errors.ts'

export async function assertConciergeHealthy(pool: pg.Pool) {
  const result = await pool.query('SELECT open_until > now() AS paused FROM public.concierge_v2_health WHERE singleton')
  if (result.rows[0]?.paused) throw new AppError('SERVICE_UNAVAILABLE', 'Trợ lý đang tạm nghỉ sau lỗi kết nối. Vui lòng thử lại sau một phút.', 503)
}

export async function recordConciergeDependencyFailure(pool: pg.Pool) {
  await pool.query(`UPDATE public.concierge_v2_health SET
    failure_count = CASE WHEN window_started_at < now() - interval '1 minute' THEN 1 ELSE failure_count + 1 END,
    open_until = CASE WHEN window_started_at >= now() - interval '1 minute' AND failure_count >= 4 THEN now() + interval '1 minute' ELSE open_until END,
    window_started_at = CASE WHEN window_started_at < now() - interval '1 minute' THEN now() ELSE window_started_at END
    WHERE singleton AND (open_until IS NULL OR open_until <= now())`)
}
