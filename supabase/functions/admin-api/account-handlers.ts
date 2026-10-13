import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { AuthActor } from '../_shared/types.ts'
import { AppError } from '../_shared/errors.ts'
import { jsonResponse, parseJsonBody } from '../_shared/request.ts'

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
}).strict()

export async function handleAccountRoutes(req: Request, path: string, actor: AuthActor, pool: pg.Pool, auth: SupabaseClient, requestId: string): Promise<Response | null> {
  if (path !== '/accounts' && !/^\/accounts\/[0-9a-f-]+$/.test(path)) return null
  if (path === '/accounts' && req.method === 'GET') {
    const result = await pool.query(`SELECT a.user_id AS id, a.display_name AS name, u.email,
      a.active, u.last_sign_in_at, a.created_at FROM public.admin_profiles a
      JOIN auth.users u ON u.id = a.user_id ORDER BY a.created_at, a.user_id`)
    return jsonResponse({ items: result.rows }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }
  if (path === '/accounts' && req.method === 'POST') {
    const parsed = createSchema.safeParse(await parseJsonBody(req))
    if (!parsed.success) throw AppError.validation('Tên tối thiểu 2 ký tự, email hợp lệ và mật khẩu tối thiểu 12 ký tự.')
    const { name, email, password } = parsed.data
    const { data, error } = await auth.auth.admin.createUser({ email, password, email_confirm: true })
    if (error || !data.user) throw AppError.validation('Không thể tạo tài khoản. Kiểm tra email và yêu cầu mật khẩu.')
    try {
      await pool.query(`WITH inserted AS (
        INSERT INTO public.admin_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id
      ) INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
        SELECT $3, 'admin', 'create_admin_account', 'admin_profiles', id::text, '{}'::jsonb FROM inserted`, [data.user.id, name, actor.userId])
    } catch (err) {
      await auth.auth.admin.deleteUser(data.user.id)
      throw err
    }
    return jsonResponse({ id: data.user.id }, requestId, req, 201, { 'Cache-Control': 'no-store' })
  }
  if (path !== '/accounts' && req.method === 'PATCH') {
    const id = path.split('/')[2]
    if (!z.string().uuid().safeParse(id).success) throw AppError.validation()
    const parsed = z.object({ active: z.boolean() }).strict().safeParse(await parseJsonBody(req))
    if (!parsed.success) throw AppError.validation()
    if (id === actor.userId && !parsed.data.active) throw AppError.forbidden('Không thể tự khóa tài khoản đang sử dụng.')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Serialize account changes and recheck the caller after acquiring the lock.
      await client.query('LOCK TABLE public.admin_profiles IN SHARE ROW EXCLUSIVE MODE')
      const caller = await client.query('SELECT active FROM public.admin_profiles WHERE user_id = $1', [actor.userId])
      if (!caller.rows[0]?.active) throw AppError.forbidden()
      const result = await client.query('UPDATE public.admin_profiles SET active = $2 WHERE user_id = $1 RETURNING user_id', [id, parsed.data.active])
      if (!result.rowCount) throw AppError.notFound()
      await client.query(`INSERT INTO public.audit_logs (admin_id, actor_kind, action, entity_type, entity_id, metadata)
        VALUES ($1, 'admin', 'update_admin_access', 'admin_profiles', $2, $3::jsonb)`, [actor.userId, id, JSON.stringify({ active: parsed.data.active })])
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally { client.release() }
    return jsonResponse({ id, active: parsed.data.active }, requestId, req, 200, { 'Cache-Control': 'no-store' })
  }
  return null
}
