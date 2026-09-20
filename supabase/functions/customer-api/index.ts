/**
 * Tiger 345 - Customer API Edge Function Gateway
 * Handles customer-only endpoints: /me, /me/home, /me/orders, /me/reservations, /me/addresses, /me/favorites.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { handleCorsPreflight } from '../_shared/cors.ts'
import { getOrCreateRequestId, getClientIp, jsonResponse } from '../_shared/request.ts'
import { toErrorResponse, AppError } from '../_shared/errors.ts'
import { requireCustomer } from '../_shared/auth.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import {
  handleGetProfile,
  handlePatchProfile,
  handleGetHome,
  handleGetOrders,
  handleGetOrderDetail,
  handleClaimOrder,
  handleGetReservations,
  handleGetReservationDetail,
  handleCancelReservation,
  handleGetAddresses,
  handleCreateAddress,
  handleUpdateAddress,
  handleDeleteAddress,
  handleGetFavorites,
  handlePutFavorite,
  handleDeleteFavorite,
  handlePostReorder,
  handleDeleteProfile,
} from './customer-handlers.ts'

const { Pool } = pg

export interface FunctionContext {
  supabaseAdmin?: SupabaseClient
  pool?: pg.Pool
}

let cachedPool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (!cachedPool) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL')
        : (typeof process !== 'undefined' ? process.env?.DATABASE_URL : undefined)
    const connectionString =
      envUrl || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    cachedPool = new Pool({ connectionString })
  }
  return cachedPool
}

let cachedAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!cachedAdmin) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_URL')
        : (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined)
    const url = envUrl || 'http://127.0.0.1:54321'
    const envKey =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        : (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined)
    const serviceRoleKey =
      envKey ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    cachedAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return cachedAdmin
}

export async function handleCustomerApi(
  req: Request,
  ctx: FunctionContext = {}
): Promise<Response> {
  // 1. CORS Preflight
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const requestId = getOrCreateRequestId(req)
  const pool = ctx.pool || getPool()
  const supabaseAdmin = ctx.supabaseAdmin || getSupabaseAdmin()

  try {
    const clientIp = getClientIp(req)

    // 2. Customer Auth Verification & Deletion Check (Invariant V04)
    const actor = await requireCustomer(req, supabaseAdmin, pool)

    // 3. User & IP Rate Limit (60 req / min)
    await assertRateLimit(pool, {
      key: `customer:${actor.userId || clientIp}`,
      limit: 60,
      windowSeconds: 60,
    })

    const url = new URL(req.url)
    const rawPath = url.pathname
      .replace(/^\/functions\/v1\/customer-api/, '')
      .replace(/^\/customer-api/, '')
    // Normalize /customer/ prefix to /me/ for consistency with client API and tests
    const normalizedRawPath = rawPath
      .replace(/^\/customer\/profile/, '/me')
      .replace(/^\/customer\//, '/me/')
      .replace(/^\/customer$/, '/me')
    const path = normalizedRawPath.replace(/\/+$/, '') || '/'

    // 4. Routing

    // Health check
    if (path === '/health' || path === '/') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'customer-api',
          actor: {
            role: actor.role,
            userId: actor.userId,
            displayName: actor.displayName,
          },
          time: new Date().toISOString(),
        },
        requestId,
        req,
        200,
        { 'Cache-Control': 'no-store' }
      )
    }

    // Profile: GET /me, PATCH /me, DELETE /me
    if (path === '/me') {
      if (req.method === 'GET') {
        return await handleGetProfile(req, actor, pool, requestId)
      }
      if (req.method === 'PATCH') {
        return await handlePatchProfile(req, actor, pool, requestId)
      }
      if (req.method === 'DELETE') {
        return await handleDeleteProfile(req, actor, pool, supabaseAdmin, requestId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me`)
    }

    // Home Aggregates: GET /me/home (Invariant V21)
    if (path === '/me/home') {
      if (req.method === 'GET') {
        return await handleGetHome(req, actor, pool, requestId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/home`)
    }

    // Orders: GET /me/orders, GET /me/orders/:id
    if (path === '/me/orders') {
      if (req.method === 'GET') {
        return await handleGetOrders(req, actor, pool, requestId, url)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/orders`)
    }

    const orderDetailMatch = path.match(/^\/me\/orders\/([0-9a-fA-F-]+)$/)
    if (orderDetailMatch) {
      if (req.method === 'GET') {
        return await handleGetOrderDetail(req, actor, pool, requestId, orderDetailMatch[1])
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    const orderClaimMatch = path.match(/^\/me\/orders\/([0-9a-fA-F-]+)\/claim$/)
    if (orderClaimMatch) {
      if (req.method === 'POST') {
        return await handleClaimOrder(req, actor, pool, requestId, orderClaimMatch[1])
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    // Reservations: GET /me/reservations, GET /me/reservations/:id, POST /me/reservations/:id/cancel
    if (path === '/me/reservations') {
      if (req.method === 'GET') {
        return await handleGetReservations(req, actor, pool, requestId, url)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/reservations`)
    }

    const resvCancelMatch = path.match(/^\/me\/reservations\/([0-9a-fA-F-]+)\/cancel$/)
    if (resvCancelMatch) {
      if (req.method === 'POST') {
        return await handleCancelReservation(req, actor, pool, requestId, resvCancelMatch[1])
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    const resvDetailMatch = path.match(/^\/me\/reservations\/([0-9a-fA-F-]+)$/)
    if (resvDetailMatch) {
      if (req.method === 'GET') {
        return await handleGetReservationDetail(req, actor, pool, requestId, resvDetailMatch[1])
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    // Addresses: GET /me/addresses, POST /me/addresses, PATCH /me/addresses/:id, DELETE /me/addresses/:id
    if (path === '/me/addresses') {
      if (req.method === 'GET') {
        return await handleGetAddresses(req, actor, pool, requestId)
      }
      if (req.method === 'POST') {
        return await handleCreateAddress(req, actor, pool, requestId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/addresses`)
    }

    const addressMatch = path.match(/^\/me\/addresses\/([0-9a-fA-F-]+)$/)
    if (addressMatch) {
      const addressId = addressMatch[1]
      if (req.method === 'PATCH') {
        return await handleUpdateAddress(req, actor, pool, requestId, addressId)
      }
      if (req.method === 'DELETE') {
        return await handleDeleteAddress(req, actor, pool, requestId, addressId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    // Favorites: GET /me/favorites, PUT /me/favorites/:item_id, DELETE /me/favorites/:item_id
    if (path === '/me/favorites') {
      if (req.method === 'GET') {
        return await handleGetFavorites(req, actor, pool, requestId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/favorites`)
    }

    const favMatch = path.match(/^\/me\/favorites\/([0-9a-fA-F-]+)$/)
    if (favMatch) {
      const itemId = favMatch[1]
      if (req.method === 'PUT') {
        return await handlePutFavorite(req, actor, pool, requestId, itemId)
      }
      if (req.method === 'DELETE') {
        return await handleDeleteFavorite(req, actor, pool, requestId, itemId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} ${path}`)
    }

    // Reorder: POST /me/reorder (Invariant V21)
    if (path === '/me/reorder') {
      if (req.method === 'POST') {
        return await handlePostReorder(req, actor, pool, requestId)
      }
      throw AppError.notFound(`Phương thức không được hỗ trợ: ${req.method} /me/reorder`)
    }

    throw AppError.notFound(`Không tìm thấy endpoint customer: ${req.method} ${path}`)
  } catch (err: unknown) {
    return toErrorResponse(err, requestId, req)
  }
}

// Deno Edge Runtime HTTP Entrypoint
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req: Request) => handleCustomerApi(req))
}

export default handleCustomerApi

