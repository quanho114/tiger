/**
 * Tiger 345 - Authentication & Authorization Middleware
 * Verifies user JWT server-side, enforces customer deletion check and active admin profile check.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type pg from 'pg'
import { AppError } from './errors.ts'
import type { AuthActor } from './types.ts'

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const parts = authHeader.trim().split(' ')
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
    return parts[1].trim()
  }

  return null
}

/**
 * Public Gateway Actor:
 * - If no token: returns guest actor.
 * - If Bearer token provided but invalid/expired: THROWS 401 AUTH_REQUIRED (does NOT fall back to guest!).
 * - If Bearer token valid: checks tombstones and active deletions before returning customer actor.
 */
export async function getPublicActor(
  req: Request,
  supabaseAdmin: SupabaseClient,
  pool?: pg.Pool
): Promise<AuthActor> {
  const token = extractBearerToken(req)
  if (!token) {
    return {
      role: 'guest',
      userId: null,
    }
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) {
    throw AppError.authRequired('Phiên đăng nhập không hợp lệ hoặc đã hết hạn')
  }

  const userId = data.user.id

  // F05 Remediation: If pool is provided, enforce independent tombstone gate & deletion checks
  if (pool) {
    // 1. Independent Tombstone Gate
    const tombstoneRes = await pool.query(
      `SELECT user_id FROM public.customer_tombstones WHERE user_id = $1`,
      [userId]
    )
    if (tombstoneRes.rows.length > 0) {
      throw AppError.forbidden(
        'Tài khoản đã bị xóa hoặc đang trong quá trình thu hồi theo yêu cầu'
      )
    }

    // 2. Active account deletion jobs
    const jobRes = await pool.query(
      `SELECT status FROM public.account_deletion_jobs WHERE user_id = $1 AND status != 'cancelled'`,
      [userId]
    )
    if (jobRes.rows.length > 0) {
      throw AppError.forbidden(
        'Tài khoản đang trong quá trình xóa hoặc đã bị khóa theo yêu cầu'
      )
    }

    // 3. Customer profile deletion gate
    const profileRes = await pool.query(
      `SELECT deletion_requested_at FROM public.customer_profiles WHERE user_id = $1`,
      [userId]
    )
    if (profileRes.rows.length > 0 && profileRes.rows[0].deletion_requested_at) {
      throw AppError.forbidden(
        'Tài khoản đang trong quá trình xóa hoặc đã bị khóa theo yêu cầu'
      )
    }
  }

  return {
    role: 'customer',
    userId,
    email: data.user.email,
  }
}

/**
 * Customer Gateway:
 * - Requires valid customer JWT.
 * - Checks customer_tombstones table (Independent Tombstone Gate).
 * - Checks account_deletion_jobs table.
 * - Checks customer_profiles table (must exist, must not have deletion_requested_at).
 * - If deleted, deleting, or missing profile: denies with 403 FORBIDDEN.
 */
export async function requireCustomer(
  req: Request,
  supabaseAdmin: SupabaseClient,
  pool: pg.Pool
): Promise<AuthActor> {
  const token = extractBearerToken(req)
  if (!token) {
    throw AppError.authRequired('Vui lòng đăng nhập để thực hiện thao tác này')
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) {
    throw AppError.authRequired('Phiên đăng nhập không hợp lệ hoặc đã hết hạn')
  }

  const userId = data.user.id

  // 1. Independent Tombstone Gate (Survives profile deletion)
  const tombstoneRes = await pool.query(
    `SELECT user_id FROM public.customer_tombstones WHERE user_id = $1`,
    [userId]
  )
  if (tombstoneRes.rows.length > 0) {
    throw AppError.forbidden(
      'Tài khoản đã bị xóa hoặc đang trong quá trình thu hồi theo yêu cầu'
    )
  }

  // 2. Active deletion jobs check
  const jobRes = await pool.query(
    `SELECT status FROM public.account_deletion_jobs WHERE user_id = $1 AND status != 'cancelled'`,
    [userId]
  )
  if (jobRes.rows.length > 0) {
    throw AppError.forbidden(
      'Tài khoản đang trong quá trình xóa hoặc đã bị khóa theo yêu cầu'
    )
  }

  // 3. Check customer profile (must exist and must not be in deletion)
  const profileRes = await pool.query(
    `SELECT display_name, deletion_requested_at
     FROM public.customer_profiles
     WHERE user_id = $1`,
    [userId]
  )

  if (profileRes.rows.length === 0) {
    throw AppError.forbidden(
      'Hồ sơ khách hàng không tồn tại hoặc tài khoản đã bị xóa'
    )
  }

  if (profileRes.rows[0].deletion_requested_at) {
    throw AppError.forbidden(
      'Tài khoản đang trong quá trình xóa hoặc đã bị khóa theo yêu cầu'
    )
  }

  const displayName = profileRes.rows[0]?.display_name

  return {
    role: 'customer',
    userId,
    email: data.user.email,
    displayName,
  }
}

/**
 * Admin Gateway:
 * - Requires valid user JWT.
 * - Queries admin_profiles table to verify active = true on EVERY request.
 * - If not found or active = false: throws 403 FORBIDDEN immediately.
 */
export async function requireAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient,
  pool: pg.Pool
): Promise<AuthActor> {
  const token = extractBearerToken(req)
  if (!token) {
    throw AppError.authRequired('Yêu cầu xác thực tài khoản quản trị')
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) {
    throw AppError.authRequired('Phiên đăng nhập quản trị không hợp lệ hoặc đã hết hạn')
  }

  // Check admin_profiles table
  const adminRes = await pool.query(
    `SELECT display_name, active
     FROM public.admin_profiles
     WHERE user_id = $1`,
    [data.user.id]
  )

  if (adminRes.rows.length === 0 || !adminRes.rows[0].active) {
    throw AppError.forbidden(
      'Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa'
    )
  }

  return {
    role: 'admin',
    userId: data.user.id,
    email: data.user.email,
    displayName: adminRes.rows[0].display_name,
  }
}
