import { jsonResponse, parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { sha256, generateSecureToken } from '../_shared/crypto.ts'
import { handleDbError } from './db-errors.ts'
import type { RouteContext } from './context.ts'

export async function handleTablesRoutes({
  req,
  path,
  actor,
  pool,
  requestId,
}: RouteContext): Promise<Response | null> {
  // --------------------------------------------------------------------------
  // SETTINGS & MENU ITEMS ENDPOINTS
  // --------------------------------------------------------------------------

  // GET /tables: list all tables with open visit & unpaid summaries
  if (path === '/tables' && req.method === 'GET') {
    const tablesRes = await pool.query(
      `SELECT
         t.id,
         t.code,
         t.name,
         t.seating_area_id,
         sa.name as seating_area_name,
         t.active,
         t.capacity,
         t.sort_order,
         t.version,
         t.created_at,
         t.updated_at,
         v.id as current_visit_id,
         v.status as current_visit_status,
         v.capability_epoch as current_visit_epoch,
         v.opened_at as current_visit_opened_at,
         v.version as current_visit_version,
         COALESCE((
           SELECT count(*) FROM public.orders o
           WHERE o.table_visit_id = v.id AND o.status NOT IN ('completed', 'cancelled')
         ), 0)::int as active_orders_count,
         COALESCE((
           SELECT count(*) FROM public.orders o
           WHERE o.table_visit_id = v.id AND o.payment_status = 'unpaid' AND o.status != 'cancelled'
         ), 0)::int as unpaid_orders_count,
         COALESCE((
           SELECT sum(o.total_vnd) FROM public.orders o
           WHERE o.table_visit_id = v.id AND o.payment_status = 'unpaid' AND o.status != 'cancelled'
         ), 0)::numeric as unpaid_total_vnd
       FROM public.dining_tables t
       LEFT JOIN public.seating_areas sa ON t.seating_area_id = sa.id
       LEFT JOIN public.table_visits v ON v.table_id = t.id AND v.status = 'open'
       ORDER BY t.sort_order ASC, t.code ASC`
    )

    const items = tablesRes.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      seating_area_id: row.seating_area_id,
      seating_area_name: row.seating_area_name,
      active: Boolean(row.active),
      capacity: row.capacity === null ? null : Number(row.capacity),
      sort_order: Number(row.sort_order),
      version: Number(row.version),
      created_at: row.created_at,
      updated_at: row.updated_at,
      area_name: row.seating_area_name,
      current_visit_id: row.current_visit_id,
      current_visit_version: row.current_visit_version ? Number(row.current_visit_version) : null,
      visit_opened_at: row.current_visit_opened_at,
      unpaid_orders_count: Number(row.unpaid_orders_count),
      unpaid_total_vnd: Number(row.unpaid_total_vnd),
      current_visit: row.current_visit_id
        ? {
            id: row.current_visit_id,
            status: row.current_visit_status,
            capability_epoch: Number(row.current_visit_epoch),
            opened_at: row.current_visit_opened_at,
            version: Number(row.current_visit_version),
            active_orders_count: Number(row.active_orders_count),
            unpaid_orders_count: Number(row.unpaid_orders_count),
            unpaid_total_vnd: Number(row.unpaid_total_vnd),
          }
        : null,
    }))

    return jsonResponse({ items }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }

  // POST /tables: create table + generate first QR token (hash only in DB, raw returned once)
  if (path === '/tables' && req.method === 'POST') {
    const body = await parseJsonBody<{
      code?: string
      name?: string
      seating_area_id?: string | null
      active?: boolean
      sort_order?: number
      capacity?: number | null
    }>(req)

    const code = typeof body.code === 'string' ? body.code.trim() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!code || !name) {
      throw AppError.validation('Mã bàn và tên bàn là bắt buộc', {
        code: !code ? ['Mã bàn không được để trống'] : [],
        name: !name ? ['Tên bàn không được để trống'] : [],
      })
    }

    const active = body.active !== undefined ? Boolean(body.active) : true
    const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0
    const seatingAreaId = body.seating_area_id || null
    if (body.capacity !== undefined && body.capacity !== null &&
        (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 30)) {
      throw AppError.validation('Sức chứa bàn phải từ 1 đến 30 khách')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Generate raw QR token & hash
      const rawToken = generateSecureToken(32)
      const tokenHash = sha256(rawToken)

      const insertTableRes = await client.query(
        `INSERT INTO public.dining_tables (
           id, code, name, seating_area_id, active, sort_order, capacity, version
         ) VALUES (
           gen_random_uuid(), $1, $2, $3, $4, $5, $6, 1
         ) RETURNING *`,
        [code, name, seatingAreaId, active, sortOrder, body.capacity ?? null]
      )
      const newTable = insertTableRes.rows[0]

      const insertQrRes = await client.query(
        `INSERT INTO public.table_qr_tokens (
           id, table_id, token_hash, active, created_at
         ) VALUES (
           gen_random_uuid(), $1, $2, true, now()
         ) RETURNING id`,
        [newTable.id, tokenHash]
      )
      const newQrId = insertQrRes.rows[0].id

      await client.query(
        `INSERT INTO public.audit_logs (
           admin_id, actor_kind, action, entity_type, entity_id, metadata
         ) VALUES (
           $1, 'admin', 'create_table', 'dining_table', $2, $3
         )`,
        [
          actor.userId,
          newTable.id,
          JSON.stringify({
            code: newTable.code,
            name: newTable.name,
            qr_token_id: newQrId,
          }),
        ]
      )

      await client.query('COMMIT')

      const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
      return jsonResponse(
        {
          table: newTable,
          qr_token_id: newQrId,
          qr_token: rawToken, // Returned ONE-TIME only
          qr_url: `${siteUrl}/table/${rawToken}`,
        },
        requestId,
        req,
        201,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      await client.query('ROLLBACK')
      handleDbError(err)
    } finally {
      client.release()
    }
  }

  // Dynamic routing for /tables/:id sub-paths
  const tablesQrMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)\/qr(?:\/rotate)?$/)
  if (tablesQrMatch && req.method === 'POST') {
    const tableId = tablesQrMatch[1]
    const body = await parseJsonBody<{ expected_version?: number }>(req)

    const rawToken = generateSecureToken(32)
    const tokenHash = sha256(rawToken)

    try {
      const res = await pool.query(`SELECT public.rotate_table_qr($1, $2, $3, $4) as result`, [
        tableId,
        tokenHash,
        actor.userId,
        body.expected_version ?? null,
      ])
      const result = res.rows[0].result
      const siteUrl = process.env.PUBLIC_SITE_URL || 'http://localhost:5173'

      return jsonResponse(
        {
          table: result.table,
          table_id: tableId,
          qr_token_id: result.qr_token_id,
          qr_token: rawToken, // Returned ONE-TIME only
          qr_url: `${siteUrl}/table/${rawToken}`,
          epoch_bumped: result.epoch_bumped,
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    } catch (err) {
      handleDbError(err)
    }
  }

  const tablesVisitsMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)\/visits$/)
  if (tablesVisitsMatch && req.method === 'POST') {
    const tableId = tablesVisitsMatch[1]
    const body = await parseJsonBody<{ expected_table_version?: number }>(req)

    try {
      const res = await pool.query(`SELECT public.open_table_visit($1, $2, $3) as result`, [
        tableId,
        actor.userId,
        body.expected_table_version ?? null,
      ])
      const newVisit = res.rows[0].result
      return jsonResponse(newVisit, requestId, req, 201, { 'Cache-Control': 'no-store' })
    } catch (err) {
      handleDbError(err)
    }
  }

  const tablesIdMatch = path.match(/^\/tables\/([0-9a-fA-F-]+)$/)
  if (tablesIdMatch && req.method === 'PATCH') {
    const tableId = tablesIdMatch[1]
    const body = await parseJsonBody<{
      expected_version: number
      code?: string
      name?: string
      seating_area_id?: string | null
      active?: boolean
      sort_order?: number
      capacity?: number | null
    }>(req)

    if (typeof body.expected_version !== 'number') {
      throw AppError.validation('expected_version là bắt buộc để cập nhật thông tin bàn')
    }
    if (body.capacity !== undefined && body.capacity !== null &&
        (!Number.isInteger(body.capacity) || body.capacity < 1 || body.capacity > 30)) {
      throw AppError.validation('Sức chứa bàn phải từ 1 đến 30 khách')
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const currentRes = await client.query(
        `SELECT * FROM public.dining_tables WHERE id = $1 FOR UPDATE`,
        [tableId]
      )
      if (currentRes.rows.length === 0) {
        throw AppError.notFound('Bàn không tồn tại')
      }
      const current = currentRes.rows[0]
      if (current.version !== body.expected_version) {
        throw AppError.versionConflict('Thông tin bàn đã bị thay đổi bởi người khác')
      }

      const updatedCode = body.code !== undefined ? body.code.trim() : current.code
      const updatedName = body.name !== undefined ? body.name.trim() : current.name
      const updatedSeatingAreaId =
        body.seating_area_id !== undefined ? body.seating_area_id : current.seating_area_id
      const updatedActive = body.active !== undefined ? Boolean(body.active) : current.active
      const updatedSortOrder = body.sort_order !== undefined ? body.sort_order : current.sort_order
      const updatedCapacity = body.capacity !== undefined ? body.capacity : current.capacity

      // Updating table (deactivation guard trigger will fire if active true -> false while visit is open)
      const updateRes = await client.query(
        `UPDATE public.dining_tables
         SET code = $1,
             name = $2,
             seating_area_id = $3,
             active = $4,
             sort_order = $5,
             capacity = $8,
             version = version + 1,
             updated_at = now()
         WHERE id = $6 AND version = $7
         RETURNING *`,
        [
          updatedCode,
          updatedName,
          updatedSeatingAreaId,
          updatedActive,
          updatedSortOrder,
          tableId,
          body.expected_version,
          updatedCapacity,
        ]
      )

      if (updateRes.rows.length === 0) {
        throw AppError.versionConflict('Thông tin bàn đã bị thay đổi (version mismatch)')
      }

      const updatedTable = updateRes.rows[0]

      await client.query(
        `INSERT INTO public.audit_logs (
           admin_id, actor_kind, action, entity_type, entity_id, metadata
         ) VALUES (
           $1, 'admin', 'update_table', 'dining_table', $2, $3
         )`,
        [
          actor.userId,
          tableId,
          JSON.stringify({
            old_version: body.expected_version,
            new_version: updatedTable.version,
            active: updatedTable.active,
          }),
        ]
      )

      await client.query('COMMIT')
      return jsonResponse(updatedTable, requestId, req, 200, { 'Cache-Control': 'no-store' })
    } catch (err) {
      await client.query('ROLLBACK')
      handleDbError(err)
    } finally {
      client.release()
    }
  }

  return null
}
