import pg from 'pg'
import { assertIsolatedTestDatabase, validateDatabaseTargetUrl } from './test-db-guard'

// Run before test collection, so even teardown hooks cannot write to an unverified DB.
export default async function setup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
  validateDatabaseTargetUrl(connectionString)
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 })
  try {
    await assertIsolatedTestDatabase(pool)
  } finally {
    await pool.end()
  }
}
