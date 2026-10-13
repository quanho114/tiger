import type pg from 'pg'
import { sha256 } from '../crypto.ts'

// Transaction-scoped advisory lock works across Edge isolates and releases on disconnect.
export async function withConciergeTurnLease<T>(pool: pg.Pool, sessionId: string, work: (queryPool: pg.Pool) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '35s'")
    const result = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired', [sha256(`concierge-v2:${sessionId}`)])
    if (!result.rows[0]?.acquired) throw new Error('STATE_CONFLICT')
    const value = await work(client as unknown as pg.Pool)
    await client.query('COMMIT')
    return value
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
  finally { client.release() }
}
