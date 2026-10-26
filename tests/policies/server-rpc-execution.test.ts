import { afterAll, describe, expect, it } from 'vitest'
import pg from 'pg'

const serverOnlyFunctions = [
  'create_order',
  'create_reservation',
  'upsert_customer_address',
  'delete_customer_address',
  'cancel_customer_reservation',
  'replace_business_hours',
  'replace_business_closures',
  'settle_table_visit_payment',
]

// The policy suite's global setup verifies an isolated test database first.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  connectionTimeoutMillis: 5000,
})

afterAll(() => pool.end())

describe('Server-only RPC execution permissions after all migrations', () => {
  it('blocks client execution for every overload and retains backend execution', async () => {
    const result = await pool.query<{
      function_name: string
      signature: string
      anon_execute: boolean
      customer_execute: boolean
      backend_execute: boolean
    }>(
      `SELECT p.proname AS function_name,
              p.oid::regprocedure::text AS signature,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS customer_execute,
              has_function_privilege('service_role', p.oid, 'EXECUTE') AS backend_execute
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prokind = 'f'
         AND p.proname::text = ANY($1::text[])`,
      [serverOnlyFunctions]
    )

    expect([...new Set(result.rows.map(row => row.function_name))].sort())
      .toEqual([...serverOnlyFunctions].sort())

    for (const row of result.rows) {
      expect(row.anon_execute, `${row.signature}: anon`).toBe(false)
      expect(row.customer_execute, `${row.signature}: authenticated`).toBe(false)
      expect(row.backend_execute, `${row.signature}: service_role`).toBe(true)
    }
  })
})
