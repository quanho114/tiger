import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { configuredValue } from '../_shared/environment.ts'
import { handleCorsPreflight } from '../_shared/cors.ts'
import { getOrCreateRequestId, getClientIp, jsonResponse } from '../_shared/request.ts'
import { toErrorResponse, AppError } from '../_shared/errors.ts'
import { getPublicActor } from '../_shared/auth.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import type { FunctionContext } from './context.ts'
import { handleReservationsRoutes } from './reservations-handlers.ts'
import { handleOrdersRoutes } from './orders-handlers.ts'
import { handleQuotesRoutes } from './quotes-handlers.ts'
import { handleTablesRoutes } from './tables-handlers.ts'
import { handleCatalogRoutes } from './catalog-handlers.ts'
import { handleConciergeRoutes } from './concierge-handlers.ts'

/**
 * Tiger 345 - Public API Edge Function Gateway
 * Handles public endpoints: /health, /menu, /settings, /tables/resolve, /order-quotes, /orders, /reservations.
 */

const { Pool } = pg

export type { FunctionContext } from './context.ts'

let cachedPool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (!cachedPool) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('DATABASE_URL') || Deno.env.get('SUPABASE_DB_URL')
        : typeof process !== 'undefined'
          ? process.env?.DATABASE_URL
          : undefined
    const connectionString = configuredValue(
      'DATABASE_URL',
      envUrl,
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
    )
    cachedPool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idleTimeoutMillis: 30000,
    })
  }
  return cachedPool
}

let cachedAdmin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (!cachedAdmin) {
    const envUrl =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_URL')
        : typeof process !== 'undefined'
          ? process.env?.SUPABASE_URL
          : undefined
    const url = configuredValue('SUPABASE_URL', envUrl, 'http://127.0.0.1:54321')
    const envKey =
      typeof Deno !== 'undefined'
        ? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        : typeof process !== 'undefined'
          ? process.env?.SUPABASE_SERVICE_ROLE_KEY
          : undefined
    const serviceRoleKey = configuredValue(
      'SUPABASE_SERVICE_ROLE_KEY',
      envKey,
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
    )
    cachedAdmin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false },
    })
  }
  return cachedAdmin
}

export async function handlePublicApi(req: Request, ctx: FunctionContext = {}): Promise<Response> {
  // 1. CORS Preflight
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const requestId = getOrCreateRequestId(req)
  const pool = ctx.pool || getPool()
  const supabaseAdmin = ctx.supabaseAdmin || getSupabaseAdmin()

  try {
    const clientIp = getClientIp(req)

    // 2. Global IP Rate Limit (60 req / min, 600 for local test loopback)
    const limit = clientIp === '127.0.0.1' || clientIp === '::1' ? 600 : 60
    await assertRateLimit(pool, {
      key: `public:${clientIp}`,
      limit,
      windowSeconds: 60,
    })

    // 3. Auth Check (Guest allowed; invalid token must throw 401; tombstoned token must throw 403)
    const actor = await getPublicActor(req, supabaseAdmin, pool)

    const url = new URL(req.url)
    // Normalize path by stripping function prefix if present
    const path = url.pathname
      .replace(/^\/functions\/v1\/public-api/, '')
      .replace(/^\/public-api/, '')

    const routeContext = { req, path, url, actor, pool, supabaseAdmin, requestId, clientIp, ctx }

    const conciergeResponse = await handleConciergeRoutes(routeContext)
    if (conciergeResponse) return conciergeResponse

    // 4. Routing
    if (path === '/health' || path === '' || path === '/') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'public-api',
          actor: {
            role: actor.role,
            userId: actor.userId,
          },
          time: new Date().toISOString(),
        },
        requestId,
        req
      )
    }

    const catalogResponse = await handleCatalogRoutes(routeContext)
    if (catalogResponse) return catalogResponse

    const tablesResponse = await handleTablesRoutes(routeContext)
    if (tablesResponse) return tablesResponse

    const quotesResponse = await handleQuotesRoutes(routeContext)
    if (quotesResponse) return quotesResponse

    const ordersResponse = await handleOrdersRoutes(routeContext)
    if (ordersResponse) return ordersResponse

    const reservationsResponse = await handleReservationsRoutes(routeContext)
    if (reservationsResponse) return reservationsResponse

    // Unmatched path
    throw AppError.notFound(`Không tìm thấy endpoint public: ${req.method} ${path}`)
  } catch (err: unknown) {
    return toErrorResponse(err, requestId, req)
  }
}

// Deno Edge Runtime HTTP Entrypoint
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req: Request) => handlePublicApi(req))
}

// Default export for Deno / Edge Runtime
export default handlePublicApi
