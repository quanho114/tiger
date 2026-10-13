import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { configuredValue, readEnv } from '../_shared/environment.ts'
import { handleCorsPreflight } from '../_shared/cors.ts'
import { getOrCreateRequestId, getClientIp, jsonResponse } from '../_shared/request.ts'
import { toErrorResponse, AppError } from '../_shared/errors.ts'
import { requireAdmin } from '../_shared/auth.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import type { AuthActor } from '../_shared/types.ts'
import { handleContentRoutes } from './content-handlers.ts'
import { handleConciergeKnowledgeRoutes } from './concierge-knowledge-handlers.ts'
import { authorizeCron } from '../_shared/cron-auth.ts'
import { handleFinancialRoutes } from './financial-handlers.ts'
import { handleAccountRoutes } from './account-handlers.ts'
import { createAdminOrder } from './create-order-handler.ts'
import type { FunctionContext } from './context.ts'
import { handleRetentionRoutes } from './retention-handlers.ts'
import { handleReservationsRoutes } from './reservations-handlers.ts'
import { handleFeedbackRoutes } from './feedback-handlers.ts'
import { handleVisitsRoutes } from './visits-handlers.ts'
import { handleTablesRoutes } from './tables-handlers.ts'
import { handleOrdersRoutes } from './orders-handlers.ts'
import { handleDashboardRoutes } from './dashboard-handlers.ts'

/**
 * Tiger 345 - Admin API Edge Function Gateway
 * Handles admin-only endpoints: /dashboard, /orders, /tables, /visits, /reservations, /menu-items, /settings, /audit.
 * Verifies active admin status on EVERY request.
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

export async function handleAdminApi(req: Request, ctx: FunctionContext = {}): Promise<Response> {
  // 1. CORS Preflight
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  const requestId = getOrCreateRequestId(req)
  const pool = ctx.pool || getPool()
  const supabaseAdmin = ctx.supabaseAdmin || getSupabaseAdmin()

  try {
    const clientIp = getClientIp(req)

    // 2. Strict Active Admin or System Cron Verification
    const url = new URL(req.url)
    const path = url.pathname.replace(/^\/functions\/v1\/admin-api/, '').replace(/^\/admin-api/, '')
    const isCronAuthorized = authorizeCron(req, path, readEnv('CRON_SECRET'))

    let actor: AuthActor
    if (isCronAuthorized) {
      actor = {
        role: 'admin',
        userId: '00000000-0000-0000-0000-000000000000',
        displayName: 'System Retention Scheduler',
      }
    } else {
      // Verifies user JWT AND admin_profiles.active = true on EVERY request
      actor = await requireAdmin(req, supabaseAdmin, pool)
    }

    // 3. Admin Rate Limit (120 req / min)
    await assertRateLimit(pool, {
      key: `admin:${actor.userId || clientIp}`,
      limit: 120,
      windowSeconds: 60,
    })

    const routeContext = { req, path, url, actor, pool, supabaseAdmin, requestId, clientIp, ctx }

    // 4. Routing
    if (path === '/orders' && req.method === 'POST')
      return await createAdminOrder(req, actor, pool, requestId)
    const accountResponse = await handleAccountRoutes(
      req,
      path,
      actor,
      pool,
      supabaseAdmin,
      requestId
    )
    if (accountResponse) return accountResponse
    const financialResponse = await handleFinancialRoutes(req, path, pool, requestId)
    if (financialResponse) return financialResponse
    // Identity & Health: /health or /me returns the authenticated admin actor
    if (path === '/health' || path === '' || path === '/' || path === '/me') {
      return jsonResponse(
        {
          status: 'ok',
          service: 'admin-api',
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

    const dashboardResponse = await handleDashboardRoutes(routeContext)
    if (dashboardResponse) return dashboardResponse

    const ordersResponse = await handleOrdersRoutes(routeContext)
    if (ordersResponse) return ordersResponse

    const tablesResponse = await handleTablesRoutes(routeContext)
    if (tablesResponse) return tablesResponse

    const visitsResponse = await handleVisitsRoutes(routeContext)
    if (visitsResponse) return visitsResponse

    const feedbackResponse = await handleFeedbackRoutes(routeContext)
    if (feedbackResponse) return feedbackResponse

    const reservationsResponse = await handleReservationsRoutes(routeContext)
    if (reservationsResponse) return reservationsResponse

    const retentionResponse = await handleRetentionRoutes(routeContext)
    if (retentionResponse) return retentionResponse

    // 5. Content, Settings, Storage & Audit Handlers (Task T13)
    const contentRes = await handleContentRoutes(req, path, actor, pool, supabaseAdmin, requestId)
    if (contentRes) {
      return contentRes
    }

    // 6. Concierge Knowledge & Governance Handlers (Task C03)
    const conciergeKnowledgeRes = await handleConciergeKnowledgeRoutes(
      req,
      path,
      actor,
      pool,
      supabaseAdmin,
      requestId
    )
    if (conciergeKnowledgeRes) {
      return conciergeKnowledgeRes
    }

    throw AppError.notFound(`Không tìm thấy endpoint admin: ${req.method} ${path}`)
  } catch (err: unknown) {
    return toErrorResponse(err, requestId, req)
  }
}

// Deno Edge Runtime HTTP Entrypoint
if (typeof Deno !== 'undefined' && typeof Deno.serve === 'function') {
  Deno.serve((req: Request) => handleAdminApi(req))
}

export default handleAdminApi
