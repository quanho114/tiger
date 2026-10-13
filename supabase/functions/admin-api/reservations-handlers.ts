import { Buffer } from 'node:buffer'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { isTrustedTestEnvironment } from '../_shared/schedule.ts'
import { handleDbError } from './db-errors.ts'
import type { RouteContext } from './context.ts'

export async function handleReservationsRoutes({
  req,
  path,
  url,
  actor,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  // --------------------------------------------------------------------------
  // RESERVATIONS ENDPOINTS (Task T12, Invariants V15, V16, V24)
  // --------------------------------------------------------------------------

  // GET /reservations - List reservations with date/status filters and pagination
  if (path === '/reservations' && req.method === 'GET') {
    const dateParam = url.searchParams.get('date')?.trim() // YYYY-MM-DD
    const statusParam = url.searchParams.get('status')?.trim()
    const searchParam = url.searchParams.get('search')?.trim()
    const limitParam = parseInt(url.searchParams.get('limit') || '20', 10)
    const limit = Math.min(Math.max(Number.isInteger(limitParam) ? limitParam : 20, 1), 100)
    const cursorParam = url.searchParams.get('cursor')?.trim()

    const conditions: string[] = []
    const values: unknown[] = []

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      values.push(dateParam)
      conditions.push(`(starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $${values.length}`)
    }

    if (statusParam) {
      values.push(statusParam)
      conditions.push(`status = $${values.length}`)
    }

    if (searchParam) {
      values.push(`%${searchParam}%`)
      conditions.push(
        `(code ILIKE $${values.length} OR customer_phone ILIKE $${values.length} OR customer_name ILIKE $${values.length})`
      )
    }

    if (cursorParam) {
      try {
        const decoded = Buffer.from(cursorParam, 'base64').toString('utf8')
        const [cursorStartsAt, cursorId] = decoded.split('|')
        if (cursorStartsAt && cursorId) {
          values.push(cursorStartsAt, cursorId)
          conditions.push(`(starts_at, id) > ($${values.length - 1}, $${values.length})`)
        }
      } catch {
        // ignore malformed cursor
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    values.push(limit + 1)
    const queryStr = `
      SELECT
        id, code, customer_name, customer_phone,
        starts_at, ends_at, guest_count,
        seating_area_id, area_name_snapshot,
        status, note, internal_note,
        contact_outcome, contacted_at,
        version, created_at, updated_at
      FROM public.reservations
      ${whereClause}
      ORDER BY starts_at ASC, id ASC
      LIMIT $${values.length}
    `

    const res = await pool.query(queryStr, values)
    const hasMore = res.rows.length > limit
    const items = hasMore ? res.rows.slice(0, limit) : res.rows

    let nextCursor: string | null = null
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]
      nextCursor = Buffer.from(`${lastItem.starts_at.toISOString()}|${lastItem.id}`).toString(
        'base64'
      )
    }

    return jsonResponse(
      {
        items: items.map((r) => ({
          id: r.id,
          code: r.code,
          customer_name: r.customer_name,
          customer_phone: r.customer_phone,
          starts_at: r.starts_at,
          ends_at: r.ends_at,
          guest_count: Number(r.guest_count),
          seating_area_id: r.seating_area_id,
          area_name_snapshot: r.area_name_snapshot,
          status: r.status,
          note: r.note,
          internal_note: r.internal_note,
          contact_outcome: r.contact_outcome,
          contacted_at: r.contacted_at,
          version: Number(r.version),
          created_at: r.created_at,
          updated_at: r.updated_at,
        })),
        next_cursor: nextCursor,
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // GET /reservations/:id - Reservation detail
  const singleResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})$/)
  if (singleResvMatch && req.method === 'GET') {
    const reservationId = singleResvMatch[1]
    const res = await pool.query(
      `SELECT
        id, code, customer_user_id, customer_name, customer_phone,
        starts_at, ends_at, guest_count,
        seating_area_id, area_name_snapshot,
        status, note, internal_note,
        contact_outcome, contacted_at,
        version, created_at, updated_at
      FROM public.reservations
      WHERE id = $1`,
      [reservationId]
    )
    if (res.rows.length === 0) {
      throw AppError.notFound('Đặt bàn không tồn tại')
    }
    const r = res.rows[0]
    return jsonResponse(
      {
        id: r.id,
        code: r.code,
        customer_user_id: r.customer_user_id,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        guest_count: Number(r.guest_count),
        seating_area_id: r.seating_area_id,
        area_name_snapshot: r.area_name_snapshot,
        status: r.status,
        note: r.note,
        internal_note: r.internal_note,
        contact_outcome: r.contact_outcome,
        contacted_at: r.contacted_at,
        version: Number(r.version),
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      requestId,
      req,
      200,
      { 'Cache-Control': 'no-store' }
    )
  }

  // POST /reservations/:id/transition - Transition reservation state
  const transitionResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/transition$/)
  if (transitionResvMatch && req.method === 'POST') {
    const reservationId = transitionResvMatch[1]
    const body = await parseJsonBody<Record<string, unknown>>(req)
    const expectedVersion =
      typeof body.expected_version === 'number'
        ? body.expected_version
        : Number(body.expected_version)
    const targetStatus = typeof body.target_status === 'string' ? body.target_status.trim() : ''
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_version không hợp lệ (phải là số nguyên >= 1)', {
        expected_version: ['Bắt buộc phải có expected_version'],
      })
    }
    const allowedStatuses = ['confirmed', 'rejected', 'cancelled', 'seated', 'completed', 'no_show']
    if (!allowedStatuses.includes(targetStatus)) {
      throw AppError.validation(`target_status không hợp lệ (${targetStatus})`, {
        target_status: [`Phải thuộc một trong: ${allowedStatuses.join(', ')}`],
      })
    }

    let testNow: Date | null = null
    if (isTrustedTestEnvironment()) {
      const testNowHeader = req.headers.get('x-test-now') || req.headers.get('X-Test-Now')
      if (testNowHeader) {
        const parsed = new Date(testNowHeader.trim())
        if (!isNaN(parsed.getTime())) {
          testNow = parsed
        }
      }
    }

    try {
      const rpcRes = await pool.query(
        `SELECT public.transition_reservation($1, $2, $3, $4, $5, $6) as result`,
        [
          reservationId,
          expectedVersion,
          targetStatus,
          actor.userId,
          reason,
          testNow ? testNow.toISOString() : null,
        ]
      )
      const result = rpcRes.rows[0].result
      return jsonResponse(result, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err: unknown) {
      handleDbError(err)
    }
  }

  // PATCH /reservations/:id/contact - Record phone call outcome
  const contactResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/contact$/)
  if (contactResvMatch && req.method === 'PATCH') {
    const reservationId = contactResvMatch[1]
    const body = await parseJsonBody<Record<string, unknown>>(req)
    const expectedVersion =
      typeof body.expected_version === 'number'
        ? body.expected_version
        : Number(body.expected_version)
    const outcome = typeof body.outcome === 'string' ? body.outcome.trim() : ''
    const contactedAt = typeof body.contacted_at === 'string' ? new Date(body.contacted_at) : null

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_version không hợp lệ', {
        expected_version: ['Bắt buộc'],
      })
    }
    if (outcome.length === 0) {
      throw AppError.validation('Kết quả liên hệ (outcome) không được để trống', {
        outcome: ['Bắt buộc'],
      })
    }

    try {
      const rpcRes = await pool.query(
        `SELECT public.update_reservation_contact($1, $2, $3, $4, $5) as result`,
        [
          reservationId,
          expectedVersion,
          outcome,
          actor.userId,
          contactedAt ? contactedAt.toISOString() : null,
        ]
      )
      return jsonResponse(rpcRes.rows[0].result, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    } catch (err: unknown) {
      handleDbError(err)
    }
  }

  // PATCH /reservations/:id/note - Update staff internal note
  const noteResvMatch = path.match(/^\/reservations\/([0-9a-fA-F-]{36})\/note$/)
  if (noteResvMatch && req.method === 'PATCH') {
    const reservationId = noteResvMatch[1]
    const body = await parseJsonBody<Record<string, unknown>>(req)
    const expectedVersion =
      typeof body.expected_version === 'number'
        ? body.expected_version
        : Number(body.expected_version)
    const internalNote = typeof body.internal_note === 'string' ? body.internal_note.trim() : ''

    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      throw AppError.validation('expected_version không hợp lệ', {
        expected_version: ['Bắt buộc'],
      })
    }

    try {
      const rpcRes = await pool.query(
        `SELECT public.update_reservation_internal_note($1, $2, $3, $4) as result`,
        [reservationId, expectedVersion, internalNote, actor.userId]
      )
      return jsonResponse(rpcRes.rows[0].result, requestId, req, 200, {
        'Cache-Control': 'no-store',
      })
    } catch (err: unknown) {
      handleDbError(err)
    }
  }

  return null
}
