#!/usr/bin/env node

/**
 * Tiger 345 - Disposable Test Database Provisioning Script (F07)
 *
 * Exclusively responsible for provisioning the isolation marker on
 * isolated/disposable local test databases.
 *
 * Invariant:
 * - Only this provisioning step has permission to create or stamp the isolation marker.
 * - Test guards (assertIsolatedTestDatabase) are strictly read-only and will fail
 *   if this script has not been executed on the target database.
 */

import pg from 'pg'

const { Pool } = pg

const TARGET_HOST = process.env.PGHOST || '127.0.0.1'
const TARGET_PORT = Number(process.env.PGPORT || 54322)
const DB_NAME = process.env.PGDATABASE || 'postgres'
const DB_USER = process.env.PGUSER || 'postgres'
const DB_PASSWORD = process.env.PGPASSWORD || 'postgres'
const ENVIRONMENT = process.env.TEST_ENVIRONMENT || 'disposable_test'
const INSTANCE_IDENTITY = process.env.TEST_INSTANCE_IDENTITY || 'tiger345_disposable_test_instance'

// Guard 1: Verify this script is invoked by an authorized disposable test runner
if (process.env.DISPOSABLE_TEST_PROVISION_ALLOWED !== 'true') {
  console.error(
    `❌ ERROR: Provisioning rejected! DISPOSABLE_TEST_PROVISION_ALLOWED=true is required.\n` +
    `Marker provisioning is strictly reserved for environments created and verified by the automated disposable test runner.\n` +
    `Refusing to stamp arbitrary databases!`
  )
  process.exit(1)
}

// Guard 2: Strict loopback check
if (TARGET_HOST !== '127.0.0.1' && TARGET_HOST !== 'localhost' && TARGET_HOST !== '::1') {
  console.error(
    `❌ ERROR: Target host is '${TARGET_HOST}'. Test provisioning is strictly guarded to run only on 127.0.0.1 or localhost!`
  )
  process.exit(1)
}

if (TARGET_PORT !== 54322 && TARGET_PORT !== 54332) {
  console.error(
    `❌ ERROR: Target port is '${TARGET_PORT}'. Allowed isolated test ports are 54322 or 54332. Refusing to stamp marker on unverified port!`
  )
  process.exit(1)
}

const pool = new Pool({
  host: TARGET_HOST,
  port: TARGET_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
})

async function provisionMarker() {
  const client = await pool.connect()
  try {
    const info = await client.query('SELECT current_database() as db_name')
    const currentDb = info.rows[0]?.db_name || DB_NAME

    console.log(`🔒 Provisioning isolation marker on database '${currentDb}' at ${TARGET_HOST}:${TARGET_PORT}...`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS public._test_isolation_marker (
        id text PRIMARY KEY,
        environment text NOT NULL,
        is_isolated_test_db boolean NOT NULL DEFAULT true,
        instance_identity text NOT NULL DEFAULT 'tiger345_disposable_test_instance',
        database_name text NOT NULL DEFAULT current_database(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)

    // Ensure database_name and instance_identity columns exist if table was pre-existing
    await client.query(`
      ALTER TABLE public._test_isolation_marker
      ADD COLUMN IF NOT EXISTS database_name text NOT NULL DEFAULT current_database(),
      ADD COLUMN IF NOT EXISTS instance_identity text NOT NULL DEFAULT 'tiger345_disposable_test_instance';
    `)

    await client.query(`
      INSERT INTO public._test_isolation_marker (id, environment, is_isolated_test_db, instance_identity, database_name)
      VALUES ('TIGER_345_TEST_ISOLATION_MARKER', $1, true, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        environment = EXCLUDED.environment,
        is_isolated_test_db = EXCLUDED.is_isolated_test_db,
        instance_identity = EXCLUDED.instance_identity,
        database_name = EXCLUDED.database_name,
        updated_at = now();
    `, [ENVIRONMENT, INSTANCE_IDENTITY, currentDb])

    console.log(`✅ Test isolation marker stamped successfully: [id=TIGER_345_TEST_ISOLATION_MARKER, env=${ENVIRONMENT}, identity=${INSTANCE_IDENTITY}, db=${currentDb}].`)
  } finally {
    client.release()
    await pool.end()
  }
}

provisionMarker().catch((err) => {
  console.error('❌ Failed to provision test isolation marker:', err)
  process.exit(1)
})
