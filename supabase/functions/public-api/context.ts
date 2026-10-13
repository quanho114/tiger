import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthActor } from '../_shared/types.ts'
import type { ConciergeLlmOrchestrator } from '../_shared/concierge/llm.ts'
import type { ConciergeV2SessionStore } from '../_shared/contracts/concierge-v2.ts'

export interface FunctionContext {
  supabaseAdmin?: SupabaseClient
  pool?: pg.Pool
  orchestrator?: ConciergeLlmOrchestrator
  trustedNow?: Date
  conciergeSessionStore?: ConciergeV2SessionStore
}

export interface RouteContext {
  req: Request
  path: string
  url: URL
  actor: AuthActor
  pool: pg.Pool
  supabaseAdmin: SupabaseClient
  requestId: string
  clientIp: string
  ctx: FunctionContext
}
