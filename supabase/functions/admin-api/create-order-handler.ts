import type pg from 'pg'
import { z } from 'zod'
import type { AuthActor } from '../_shared/types.ts'
import { AppError } from '../_shared/errors.ts'
import { sha256 } from '../_shared/crypto.ts'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'

const schema = z.object({
  order_type: z.enum(['dine_in', 'delivery', 'takeaway']),
  pickup_time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Giờ lấy món phải có định dạng HH:mm')
    .optional(),
  table_id: z.string().uuid().optional(),
  delivery_zone_id: z.string().uuid().optional(),
  customer_name: z.string().trim().max(100).optional(),
  customer_phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  note: z.string().trim().max(1000).default(''),
  items: z.array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(99), unit_price_vnd: z.number().int().nonnegative() }).strict()).min(1).max(100),
}).strict()

export async function createAdminOrder(req: Request, actor: AuthActor, pool: pg.Pool, requestId: string) {
  const parsed = schema.safeParse(await parseJsonBody(req))
  if (!parsed.success) throw AppError.validation('Thông tin đơn hàng không hợp lệ.')
  const body = parsed.data
  const key = req.headers.get('Idempotency-Key')
  if (!key || !z.string().uuid().safeParse(key).success) throw AppError.validation('Thiếu mã chống tạo trùng đơn.')
  const keyHash = sha256(key)
  const scope = `admin:${actor.userId}`
  const hash = sha256(JSON.stringify(body))
  const prior = await pool.query("SELECT actor_scope, request_hash, response_json FROM public.idempotency_requests WHERE operation = 'create_order' AND key_hash = $1", [keyHash])
  if (prior.rows[0]) {
    if (prior.rows[0].actor_scope !== scope || prior.rows[0].request_hash !== hash) throw AppError.idempotencyConflict()
    return jsonResponse({ receipt: prior.rows[0].response_json, replayed: true }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }
  let dineIn = null
  let delivery = null
  if (body.order_type === 'dine_in') {
    if (!body.table_id) throw AppError.validation('Vui lòng chọn bàn đang phục vụ.')
    const visit = await pool.query("SELECT id, capability_epoch FROM public.table_visits WHERE table_id = $1 AND status = 'open'", [body.table_id])
    if (!visit.rows[0]) throw AppError.validation('Cần mở phiên phục vụ cho bàn trước khi tạo đơn.')
    dineIn = { table_id: body.table_id, table_visit_id: visit.rows[0].id, epoch: visit.rows[0].capability_epoch }
  } else if (body.order_type === 'delivery') {
    if (!body.delivery_zone_id || !body.customer_name || !/^0[0-9]{9}$/.test(body.customer_phone || '') || !body.address) throw AppError.validation('Điền tên, số điện thoại 10 chữ số, địa chỉ và khu vực giao hàng.')
    const zone = await pool.query('SELECT fee_vnd, free_threshold_vnd FROM public.delivery_zones WHERE id = $1 AND active', [body.delivery_zone_id])
    if (!zone.rows[0]) throw AppError.validation('Khu vực giao hàng không khả dụng.')
    const subtotal = body.items.reduce((sum, i) => sum + i.quantity * i.unit_price_vnd, 0)
    const row = zone.rows[0]
    delivery = { delivery_zone_id: body.delivery_zone_id, customer_name: body.customer_name, customer_phone: body.customer_phone, address: body.address,
      expected_shipping_fee_vnd: row.free_threshold_vnd !== null && subtotal >= Number(row.free_threshold_vnd) ? 0 : Number(row.fee_vnd) }
  } else {
    if (body.delivery_zone_id || body.address) throw AppError.validation('Đơn mang đi không nhận địa chỉ hoặc khu vực giao hàng.')
    if (!body.customer_name || !/^0[0-9]{9}$/.test(body.customer_phone || '')) throw AppError.validation('Điền tên và số điện thoại 10 chữ số cho đơn mang đi.')
    delivery = { customer_name: body.customer_name, customer_phone: body.customer_phone, pickup_time: body.pickup_time ?? null }
  }
  const menu = await pool.query('SELECT id, name FROM public.menu_items WHERE id = ANY($1::uuid[])', [body.items.map(i => i.menu_item_id)])
  const items = body.items.map(i => ({ ...i, item_name: menu.rows.find(row => row.id === i.menu_item_id)?.name || '' }))
  try {
    const result = await pool.query(`WITH created AS (
      SELECT public.create_order($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result
    ), audited AS (
      INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
      SELECT $12, 'admin', 'create_admin_order', 'orders', result->'receipt'->>'id', '{}'::jsonb
      FROM created WHERE (result->>'replayed')::boolean IS NOT TRUE RETURNING id
    ) SELECT result FROM created`, [keyHash, scope, hash, body.order_type, null,
      dineIn ? JSON.stringify(dineIn) : null, delivery ? JSON.stringify(delivery) : null, JSON.stringify(items), body.note, null, null, actor.userId])
    return jsonResponse(result.rows[0].result, requestId, req, 201, { 'Cache-Control': 'no-store' })
  } catch (err) {
    const dbError = err as { code?: string; message?: string }
    if (/^P00\d\d$/.test(dbError.code || '')) throw new AppError('ORDER_REJECTED', dbError.message || 'Không thể tạo đơn.', 409)
    throw err
  }
}
