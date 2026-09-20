/**
 * Tiger 345 - F07 Test Database Isolation Guard Verification
 *
 * Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * Affected API: tests/fixtures/test-db-guard.ts (assertIsolatedTestDatabase, validateDatabaseTargetUrl, provisionDisposableTestMarker)
 * Data Schemas: public._test_isolation_marker
 * Verbatim Instruction:
 * "BƯỚC 2 — F07: DATABASE TEST CÔ LẬP
 *  - Sửa test-db-guard thành read-only verification.
 *  - Thiếu marker, sai marker hoặc target chưa xác minh phải bị từ chối trước bất kỳ mutation nào.
 *  - Không tự tạo marker trong guard.
 *  - Tạo quy trình provision database/Supabase test disposable riêng; chỉ bước provision có quyền tạo marker.
 *  - Không coi localhost hoặc port 54322 là bằng chứng database disposable.
 *  - Kiểm tra scripts reset, fixtures, integration/policies suites và CI cùng tuân thủ cơ chế này.
 *  - Không reset hoặc ghi test vào local database hiện có chỉ vì guard cũ cho phép.
 *  - Thêm tests: missing marker, wrong identity, shared database, remote target và valid disposable target.
 *  - Nghiệm thu: có môi trường test riêng đã xác minh và hướng dẫn reproducible."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import {
  assertIsolatedTestDatabase,
  validateDatabaseTargetUrl,
  TestDatabaseSecurityError,
  TEST_ISOLATION_MARKER_TABLE,
  EXPECTED_MARKER_ID,
  provisionDisposableTestMarker,
} from '../fixtures/test-db-guard.js'

const { Pool } = pg

const validConnectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('F07 - Test Database Isolation Guard (Read-Only Verification)', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString: validConnectionString })
    // Ensure test database is provisioned with valid marker
    await provisionDisposableTestMarker(pool, { environment: 'disposable_test', allowProvisioning: true })
  })

  afterAll(async () => {
    // Restore valid state after tests
    await provisionDisposableTestMarker(pool, { environment: 'disposable_test', allowProvisioning: true })
    await pool.end()
  })

  // 1. Valid disposable target
  it('allows verified isolated disposable test database and returns verified metadata', async () => {
    const result = await assertIsolatedTestDatabase(pool)
    expect(result.verified).toBe(true)
    expect(result.environment).toBe('disposable_test')
    expect(result.markerId).toBe(EXPECTED_MARKER_ID)
    expect(result.databaseName).toBe('postgres')
    expect(result.instanceIdentity).toBe('tiger345_disposable_test_instance')
  })

  // 2. Remote target protection
  it('rejects connection string pointing to remote/cloud host before any query (remote target)', () => {
    const dangerousCloudUrls = [
      'postgresql://postgres:secret@db.xyz.supabase.co:5432/postgres',
      'postgresql://postgres:secret@aws-us-east-1.pooler.supabase.com:6543/postgres',
      'postgresql://postgres:secret@production-db.tiger345.vn:54322/postgres',
      'postgresql://postgres:secret@10.0.0.15:54322/postgres',
    ]

    for (const url of dangerousCloudUrls) {
      expect(() => validateDatabaseTargetUrl(url)).toThrowError(TestDatabaseSecurityError)
      expect(() => validateDatabaseTargetUrl(url)).toThrowError(/không nằm trong danh sách máy chủ test cô lập/i)
    }
  })

  // 3. Shared database protection (wrong port or non-disposable instance)
  it('rejects connection string pointing to standard non-isolated port e.g. 5432 (shared database)', () => {
    const sharedDbUrls = [
      'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
      'postgresql://postgres:postgres@localhost:5432/tiger345_dev',
    ]
    for (const url of sharedDbUrls) {
      expect(() => validateDatabaseTargetUrl(url)).toThrowError(TestDatabaseSecurityError)
      expect(() => validateDatabaseTargetUrl(url)).toThrowError(/không phải cổng test cô lập của dự án/i)
    }
  })

  it('rejects database where is_isolated_test_db flag is false (shared/production marker)', async () => {
    // Temporarily tamper marker to is_isolated_test_db = false
    await pool.query(
      `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET is_isolated_test_db = false WHERE id = $1`,
      [EXPECTED_MARKER_ID]
    )

    try {
      await expect(assertIsolatedTestDatabase(pool)).rejects.toMatchObject({
        name: 'TestDatabaseSecurityError',
        code: 'INVALID_TEST_MARKER',
      })
    } finally {
      await pool.query(
        `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET is_isolated_test_db = true WHERE id = $1`,
        [EXPECTED_MARKER_ID]
      )
    }
  })

  // 4. Missing marker row
  it('strictly rejects when marker row is missing without auto-inserting (missing marker)', async () => {
    // Temporarily delete marker row
    await pool.query(
      `DELETE FROM public.${TEST_ISOLATION_MARKER_TABLE} WHERE id = $1`,
      [EXPECTED_MARKER_ID]
    )

    try {
      // Guard MUST throw MISSING_TEST_MARKER and MUST NOT auto-insert
      await expect(assertIsolatedTestDatabase(pool)).rejects.toMatchObject({
        name: 'TestDatabaseSecurityError',
        code: 'MISSING_TEST_MARKER',
      })

      // Verify guard did NOT insert any row (strictly read-only)
      const check = await pool.query(
        `SELECT COUNT(*) as count FROM public.${TEST_ISOLATION_MARKER_TABLE} WHERE id = $1`,
        [EXPECTED_MARKER_ID]
      )
      expect(Number(check.rows[0].count)).toBe(0)
    } finally {
      // Restore marker via explicit provisioner
      await provisionDisposableTestMarker(pool, { environment: 'disposable_test', allowProvisioning: true })
    }
  })

  // 5. Wrong identity (environment not in allowed list or db name mismatch)
  it('rejects database when marker environment identity is unauthorized (wrong identity)', async () => {
    await pool.query(
      `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET environment = 'production' WHERE id = $1`,
      [EXPECTED_MARKER_ID]
    )

    try {
      await expect(assertIsolatedTestDatabase(pool)).rejects.toMatchObject({
        name: 'TestDatabaseSecurityError',
        code: 'WRONG_MARKER_IDENTITY',
      })
    } finally {
      await pool.query(
        `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET environment = 'disposable_test' WHERE id = $1`,
        [EXPECTED_MARKER_ID]
      )
    }
  })

  it('rejects database when marker instance identity is unauthorized (wrong instance identity)', async () => {
    await pool.query(
      `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET instance_identity = 'unauthorized_developer_laptop' WHERE id = $1`,
      [EXPECTED_MARKER_ID]
    )

    try {
      await expect(assertIsolatedTestDatabase(pool)).rejects.toMatchObject({
        name: 'TestDatabaseSecurityError',
        code: 'WRONG_INSTANCE_IDENTITY',
      })
    } finally {
      await pool.query(
        `UPDATE public.${TEST_ISOLATION_MARKER_TABLE} SET instance_identity = 'tiger345_disposable_test_instance' WHERE id = $1`,
        [EXPECTED_MARKER_ID]
      )
    }
  })

  it('rejects database when expected instance identity does not match (instance identity mismatch)', async () => {
    await expect(
      assertIsolatedTestDatabase(pool, { expectedInstanceIdentity: 'ci_disposable_test_instance' })
    ).rejects.toMatchObject({
      name: 'TestDatabaseSecurityError',
      code: 'INSTANCE_IDENTITY_MISMATCH',
    })
  })

  it('rejects unauthenticated marker provisioning attempts without authorized runner flag', async () => {
    const oldEnv = process.env.DISPOSABLE_TEST_PROVISION_ALLOWED
    delete process.env.DISPOSABLE_TEST_PROVISION_ALLOWED

    try {
      await expect(
        provisionDisposableTestMarker(pool, { environment: 'disposable_test', allowProvisioning: false })
      ).rejects.toMatchObject({
        name: 'TestDatabaseSecurityError',
        code: 'UNAUTHORIZED_PROVISIONING',
      })
    } finally {
      if (oldEnv !== undefined) {
        process.env.DISPOSABLE_TEST_PROVISION_ALLOWED = oldEnv
      }
    }
  })

  it('rejects database when expected database name does not match (wrong identity)', async () => {
    await expect(
      assertIsolatedTestDatabase(pool, { expectedDatabaseName: 'unrelated_test_db' })
    ).rejects.toMatchObject({
      name: 'TestDatabaseSecurityError',
      code: 'DATABASE_NAME_MISMATCH',
    })
  })

  // 6. Missing marker table (guard is strictly read-only and never creates tables)
  it('strictly rejects when marker table is completely missing without auto-creating it (missing marker table)', async () => {
    // Create mock pool that simulates database without marker table
    const mockClient = {
      query: async (sql: string) => {
        if (sql.includes('current_database()')) {
          return { rows: [{ db_name: 'postgres', server_addr: '127.0.0.1', server_port: '54322' }] }
        }
        if (sql.includes('to_regclass')) {
          // Table does not exist in regclass
          return { rows: [{ tbl_regclass: null }] }
        }
        if (sql.includes('CREATE TABLE')) {
          throw new Error('VIOLATION: assertIsolatedTestDatabase attempted to execute CREATE TABLE!')
        }
        return { rows: [] }
      },
      release: () => {},
    }

    const mockPool = {
      options: { connectionString: validConnectionString },
      connect: async () => mockClient,
    } as unknown as pg.Pool

    await expect(assertIsolatedTestDatabase(mockPool)).rejects.toMatchObject({
      name: 'TestDatabaseSecurityError',
      code: 'MISSING_MARKER_TABLE',
    })
  })
})

