/**
 * Tiger 345 - Test Database Isolation Guard (C00 / AT01)
 *
 * Importers/Callers:
 * - tests/integration/*.test.ts (concierge-workflow.test.ts, tables.test.ts, etc.)
 * - tests/fixtures/auth-users.ts (seedFixtureUsers)
 * - tests/integration/test-db-guard.test.ts
 *
 * Affected API:
 * - All integration test suites performing PostgreSQL mutations
 * - Rejects any mutation or fixture on unverified/shared databases
 *
 * Data Schemas:
 * - public._test_isolation_marker (id text, environment text, is_isolated_test_db boolean)
 *
 * Verbatim Instruction:
 * "Hoàn thành C00 test isolation trước mọi suite có write DB...
 *  C00: Tạo guard và DB test cô lập có marker định danh; từ chối target chưa xác minh trước mutation.
 *  Ghi command, fixture lifecycle, teardown và evidence convention; không reset DB dùng chung."
 */

import type pg from 'pg'

export const TEST_ISOLATION_MARKER_TABLE = '_test_isolation_marker'
export const EXPECTED_MARKER_ID = 'TIGER_345_TEST_ISOLATION_MARKER'
export const ALLOWED_TEST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
export const ALLOWED_TEST_PORTS = new Set(['54322', '54332'])
export const ALLOWED_TEST_ENVIRONMENTS = new Set([
  'disposable_test',
  'local_isolated_test',
  'ci_disposable_test',
])
export const ALLOWED_TEST_IDENTITIES = new Set([
  'tiger345_disposable_test_instance',
  'ci_disposable_test_instance',
  'local_disposable_test_instance',
])

export class TestDatabaseSecurityError extends Error {
  code: string
  constructor(message: string, code = 'TEST_DB_UNAUTHORIZED') {
    super(message)
    this.name = 'TestDatabaseSecurityError'
    this.code = code
  }
}

/**
 * Validates a connection string or parsed config before connecting.
 * Rejects any remote hosts, cloud URLs, or default non-test ports.
 */
export function validateDatabaseTargetUrl(connectionString: string): {
  host: string
  port: string
  database: string
} {
  try {
    const url = new URL(connectionString)
    const host = url.hostname.toLowerCase()
    const port = url.port || '5432'
    const database = url.pathname.replace(/^\//, '')

    // Guard 1: Reject cloud or external hostnames
    if (!ALLOWED_TEST_HOSTS.has(host)) {
      throw new TestDatabaseSecurityError(
        `[F07] Từ chối kết nối: Host '${host}' không nằm trong danh sách máy chủ test cô lập (127.0.0.1/localhost). Nguy cơ trỏ nhầm shared/production database!`,
        'FORBIDDEN_TEST_HOST'
      )
    }

    // Guard 2: Reject standard port 5432 unless explicitly isolated port 54322 is used
    if (!ALLOWED_TEST_PORTS.has(port)) {
      throw new TestDatabaseSecurityError(
        `[F07] Từ chối kết nối: Cổng '${port}' không phải cổng test cô lập của dự án (yêu cầu port 54322). Nguy cơ trỏ nhầm shared PostgreSQL instance!`,
        'FORBIDDEN_TEST_PORT'
      )
    }

    return { host, port, database }
  } catch (err) {
    if (err instanceof TestDatabaseSecurityError) {
      throw err
    }
    throw new TestDatabaseSecurityError(
      `[F07] Chuỗi kết nối cơ sở dữ liệu không hợp lệ: ${err instanceof Error ? err.message : String(err)}`,
      'INVALID_CONNECTION_STRING'
    )
  }
}

/**
 * Asserts that the PostgreSQL pool is connected to a verified isolated test database.
 * STRICTLY READ-ONLY: Never creates tables, never inserts records, and never modifies database state.
 * If the database fails verification, immediately throws and prevents any mutation.
 */
export async function assertIsolatedTestDatabase(
  pool: pg.Pool,
  options?: { expectedDatabaseName?: string; expectedInstanceIdentity?: string }
): Promise<{
  verified: true
  environment: string
  markerId: string
  databaseName: string
  instanceIdentity: string
}> {
  // 1. Connection string / client parameter verification
  const connString = (pool as unknown as { options?: { connectionString?: string } }).options?.connectionString
  if (connString) {
    validateDatabaseTargetUrl(connString)
  }

  // 2. Query live database connection info (read-only)
  const client = await pool.connect()
  try {
    const infoRes = await client.query(`
      SELECT current_database() as db_name,
             inet_server_addr() as server_addr,
             inet_server_port() as server_port
    `)
    const row = infoRes.rows[0] || {}
    const dbName = String(row.db_name || '')
    const serverPort = String(row.server_port || '')

    if (options?.expectedDatabaseName && dbName !== options.expectedDatabaseName) {
      throw new TestDatabaseSecurityError(
        `[F07] Tên database '${dbName}' không khớp với tên dự kiến '${options.expectedDatabaseName}'!`,
        'DATABASE_NAME_MISMATCH'
      )
    }

    // 3. Check if marker table exists (READ-ONLY: do NOT create table!)
    const tableCheckRes = await client.query(`
      SELECT to_regclass('public.${TEST_ISOLATION_MARKER_TABLE}') as tbl_regclass
    `)
    if (!tableCheckRes.rows[0]?.tbl_regclass) {
      throw new TestDatabaseSecurityError(
        `[F07] Database chưa được provision marker cô lập (bảng public.${TEST_ISOLATION_MARKER_TABLE} không tồn tại). Guard là READ-ONLY và từ chối tự tạo marker để bảo vệ shared database!`,
        'MISSING_MARKER_TABLE'
      )
    }

    // Check if database_name and instance_identity columns exist
    const colsRes = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `, [TEST_ISOLATION_MARKER_TABLE])
    const cols = new Set(colsRes.rows.map((r: { column_name: string }) => r.column_name))
    const hasDbNameCol = cols.has('database_name')
    const hasIdentityCol = cols.has('instance_identity')

    const markerQuery = `
      SELECT id, environment, is_isolated_test_db,
             ${hasDbNameCol ? 'database_name' : "'' as database_name"},
             ${hasIdentityCol ? 'instance_identity' : "'tiger345_disposable_test_instance' as instance_identity"}
      FROM public.${TEST_ISOLATION_MARKER_TABLE}
      WHERE id = $1
    `

    // 4. Query marker record (READ-ONLY: do NOT insert record!)
    const markerRes = await client.query(markerQuery, [EXPECTED_MARKER_ID])

    if (markerRes.rows.length === 0) {
      throw new TestDatabaseSecurityError(
        `[F07] Không tìm thấy bản ghi marker định danh '${EXPECTED_MARKER_ID}' trong bảng public.${TEST_ISOLATION_MARKER_TABLE}. Database chưa được provision hợp lệ!`,
        'MISSING_TEST_MARKER'
      )
    }

    const markerRow = markerRes.rows[0]
    if (!markerRow.is_isolated_test_db) {
      throw new TestDatabaseSecurityError(
        `[F07] Marker tại public.${TEST_ISOLATION_MARKER_TABLE} có is_isolated_test_db = false. Cơ sở dữ liệu này bị từ chối phục vụ test có ghi!`,
        'INVALID_TEST_MARKER'
      )
    }

    if (!ALLOWED_TEST_ENVIRONMENTS.has(markerRow.environment)) {
      throw new TestDatabaseSecurityError(
        `[F07] Môi trường marker không hợp lệ ('${markerRow.environment}'). Yêu cầu môi trường test cô lập trong: ${Array.from(ALLOWED_TEST_ENVIRONMENTS).join(', ')}`,
        'WRONG_MARKER_IDENTITY'
      )
    }

    const instanceIdentity = String(markerRow.instance_identity || '')
    if (!ALLOWED_TEST_IDENTITIES.has(instanceIdentity)) {
      throw new TestDatabaseSecurityError(
        `[F07] Định danh instance marker ('${instanceIdentity}') không hợp lệ. Phải thuộc danh sách container/instance test cô lập: ${Array.from(ALLOWED_TEST_IDENTITIES).join(', ')}`,
        'WRONG_INSTANCE_IDENTITY'
      )
    }

    if (options?.expectedInstanceIdentity && instanceIdentity !== options.expectedInstanceIdentity) {
      throw new TestDatabaseSecurityError(
        `[F07] Định danh instance '${instanceIdentity}' không khớp với dự kiến '${options.expectedInstanceIdentity}'!`,
        'INSTANCE_IDENTITY_MISMATCH'
      )
    }

    if (markerRow.database_name && markerRow.database_name !== dbName) {
      throw new TestDatabaseSecurityError(
        `[F07] Marker database_name ('${markerRow.database_name}') không khớp với database hiện tại ('${dbName}')!`,
        'DATABASE_NAME_MISMATCH'
      )
    }

    return {
      verified: true,
      environment: markerRow.environment,
      markerId: markerRow.id,
      databaseName: dbName,
      instanceIdentity,
    }
  } finally {
    client.release()
  }
}

/**
 * Explicit Provisioning Helper - ONLY called by dedicated database provisioning scripts
 * (e.g. scripts/provision-test-db.mjs, scripts/db-reset-test.sh).
 * NEVER called by assertIsolatedTestDatabase!
 */
export async function provisionDisposableTestMarker(
  pool: pg.Pool,
  options?: { environment?: string; instanceIdentity?: string; allowProvisioning?: boolean }
): Promise<void> {
  if (!options?.allowProvisioning && process.env.DISPOSABLE_TEST_PROVISION_ALLOWED !== 'true') {
    throw new TestDatabaseSecurityError(
      '[F07] Từ chối tạo marker: Không có ủy quyền từ quy trình test disposable chuyên dụng (DISPOSABLE_TEST_PROVISION_ALLOWED)',
      'UNAUTHORIZED_PROVISIONING'
    )
  }

  const env = options?.environment || 'disposable_test'
  const identity = options?.instanceIdentity || process.env.TEST_INSTANCE_IDENTITY || 'tiger345_disposable_test_instance'
  const client = await pool.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.${TEST_ISOLATION_MARKER_TABLE} (
        id text PRIMARY KEY,
        environment text NOT NULL,
        is_isolated_test_db boolean NOT NULL DEFAULT true,
        instance_identity text NOT NULL DEFAULT 'tiger345_disposable_test_instance',
        database_name text NOT NULL DEFAULT current_database(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `)

    await client.query(`
      ALTER TABLE public._test_isolation_marker
      ADD COLUMN IF NOT EXISTS database_name text NOT NULL DEFAULT current_database(),
      ADD COLUMN IF NOT EXISTS instance_identity text NOT NULL DEFAULT 'tiger345_disposable_test_instance';
    `)

    await client.query(
      `INSERT INTO public.${TEST_ISOLATION_MARKER_TABLE} (id, environment, is_isolated_test_db, instance_identity, database_name)
       VALUES ($1, $2, true, $3, current_database())
       ON CONFLICT (id) DO UPDATE SET
         environment = EXCLUDED.environment,
         is_isolated_test_db = EXCLUDED.is_isolated_test_db,
         instance_identity = EXCLUDED.instance_identity,
         database_name = EXCLUDED.database_name,
         updated_at = now()`,
      [EXPECTED_MARKER_ID, env, identity]
    )
  } finally {
    client.release()
  }
}
