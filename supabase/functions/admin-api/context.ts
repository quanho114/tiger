import type pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthActor } from '../_shared/types.ts'

export interface FunctionContext {
  supabaseAdmin?: SupabaseClient
  pool?: pg.Pool
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
