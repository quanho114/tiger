import { readFile } from 'node:fs/promises'
import type pg from 'pg'
import { assertIsolatedTestDatabase } from './test-db-guard.ts'

export async function ensureConciergePostgresSessionTable(pool: pg.Pool): Promise<void> {
  await assertIsolatedTestDatabase(pool)
  const result = await pool.query("SELECT to_regclass('public.concierge_v2_sessions') AS name")
  if (!result.rows[0].name) {
    await pool.query(await readFile('supabase/migrations/20260923000001_concierge_v2_postgres_sessions.sql', 'utf8'))
  }
}
