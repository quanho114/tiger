import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import {
  createVisitCapability,
  verifyVisitCapability,
  getCapabilitySecret,
} from '../../supabase/functions/_shared/capability.js'
import { sha256 } from '../../supabase/functions/_shared/crypto.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('Server Visit Capability Engine', () => {
  let pool: pg.Pool
  let testTableId: string
  let testQrTokenId: string
  let testVisitId: string
  const secret = getCapabilitySecret()

  beforeAll(async () => {
    pool = new Pool({ connectionString })

    // Setup test table
    const tableRes = await pool.query(
      `INSERT INTO public.dining_tables (
         id, code, name, active, sort_order, version
       ) VALUES (
         gen_random_uuid(), 'TEST-CAP-1', 'Bàn Test Capability', true, 999, 1
       ) RETURNING id`
    )
    testTableId = tableRes.rows[0].id

    // Setup active QR token
    const rawQr = 'test-raw-qr-token-for-capability-testing-123'
    const qrRes = await pool.query(
      `INSERT INTO public.table_qr_tokens (
         id, table_id, token_hash, active, created_at
       ) VALUES (
         gen_random_uuid(), $1, $2, true, now()
       ) RETURNING id`,
      [testTableId, sha256(rawQr)]
    )
    testQrTokenId = qrRes.rows[0].id

    // Setup open visit
    const visitRes = await pool.query(
      `INSERT INTO public.table_visits (
         id, table_id, status, capability_epoch, opened_at, version
       ) VALUES (
         gen_random_uuid(), $1, 'open', 1, now(), 1
       ) RETURNING id`,
      [testTableId]
    )
    testVisitId = visitRes.rows[0].id
  })

  afterAll(async () => {
    if (pool) {
      if (testVisitId) {
        await pool.query('DELETE FROM public.table_visits WHERE id = $1', [testVisitId])
      }
      if (testTableId) {
        await pool.query('DELETE FROM public.table_qr_tokens WHERE table_id = $1', [testTableId])
        await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [testTableId])
      }
      await pool.end()
    }
  })

  it('creates and verifies a valid visit capability token against live database', async () => {
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const verified = await verifyVisitCapability(token, pool, secret)
    expect(verified.visit_id).toBe(testVisitId)
    expect(verified.table_id).toBe(testTableId)
    expect(verified.table_code).toBe('TEST-CAP-1')
    expect(verified.qr_token_id).toBe(testQrTokenId)
    expect(verified.epoch).toBe(1)
  })

  it('rejects tampered capability token signatures with 401 CAPABILITY_INVALID', async () => {
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    const [header, payload, sig] = token.split('.')
    const tampered = `${header}.${payload}.${sig.slice(0, -4)}abcd`

    await expect(verifyVisitCapability(tampered, pool, secret)).rejects.toMatchObject({
      code: 'CAPABILITY_INVALID',
      status: 401,
    })
  })

  it('rejects expired capability tokens with 401 CAPABILITY_INVALID', async () => {
    // Create token with -1 second TTL (already expired)
    const token = createVisitCapability(
      {
        visit_id: testVisitId,
        table_id: testTableId,
        qr_token_id: testQrTokenId,
        epoch: 1,
      },
      secret,
      { expiresInSeconds: -5 }
    )

    await expect(verifyVisitCapability(token, pool, secret)).rejects.toMatchObject({
      code: 'CAPABILITY_INVALID',
      status: 401,
    })
  })

  it('rejects token when visit capability_epoch has been bumped with 401 CAPABILITY_REVOKED', async () => {
    // Create token with epoch 1
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    // Bump epoch in DB
    await pool.query('UPDATE public.table_visits SET capability_epoch = 2 WHERE id = $1', [
      testVisitId,
    ])

    try {
      await expect(verifyVisitCapability(token, pool, secret)).rejects.toMatchObject({
        code: 'CAPABILITY_REVOKED',
        status: 401,
      })
    } finally {
      // Revert epoch
      await pool.query('UPDATE public.table_visits SET capability_epoch = 1 WHERE id = $1', [
        testVisitId,
      ])
    }
  })

  it('rejects token when active QR token has been rotated with 401 QR_REVOKED', async () => {
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    // Deactivate old QR and insert new QR
    await pool.query('UPDATE public.table_qr_tokens SET active = false WHERE id = $1', [
      testQrTokenId,
    ])
    const newQrRes = await pool.query(
      `INSERT INTO public.table_qr_tokens (
         id, table_id, token_hash, active, created_at
       ) VALUES (
         gen_random_uuid(), $1, 'rotated-hash-999', true, now()
       ) RETURNING id`,
      [testTableId]
    )
    const newQrId = newQrRes.rows[0].id

    try {
      await expect(verifyVisitCapability(token, pool, secret)).rejects.toMatchObject({
        code: 'QR_REVOKED',
        status: 401,
      })
    } finally {
      // Revert QR tokens
      await pool.query('DELETE FROM public.table_qr_tokens WHERE id = $1', [newQrId])
      await pool.query('UPDATE public.table_qr_tokens SET active = true WHERE id = $1', [
        testQrTokenId,
      ])
    }
  })

  it('rejects token when visit is closed with 409 VISIT_CLOSED', async () => {
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    // Mark visit closed
    await pool.query(
      "UPDATE public.table_visits SET status = 'closed', closed_at = now() WHERE id = $1",
      [testVisitId]
    )

    try {
      await expect(verifyVisitCapability(token, pool, secret)).rejects.toMatchObject({
        code: 'VISIT_CLOSED',
        status: 409,
      })
    } finally {
      // Revert visit to open
      await pool.query(
        "UPDATE public.table_visits SET status = 'open', closed_at = NULL WHERE id = $1",
        [testVisitId]
      )
    }
  })

  it('rejects token when table is deactivated with 409 TABLE_UNAVAILABLE', async () => {
    const token = createVisitCapability({
      visit_id: testVisitId,
      table_id: testTableId,
      qr_token_id: testQrTokenId,
      epoch: 1,
    })

    // Note: Table deactivation trigger prevents deactivating if open visit exists.
    // So to test capability verification when table is inactive, close visit temporarily, deactivate table, set visit open, then verify
    await pool.query(
      "UPDATE public.table_visits SET status = 'closed', closed_at = now() WHERE id = $1",
      [testVisitId]
    )
    await pool.query('UPDATE public.dining_tables SET active = false WHERE id = $1', [testTableId])
    await pool.query(
      "UPDATE public.table_visits SET status = 'open', closed_at = NULL WHERE id = $1",
      [testVisitId]
    )

    try {
      await expect(verifyVisitCapability(token, pool, secret)).rejects.toMatchObject({
        code: 'TABLE_UNAVAILABLE',
        status: 409,
      })
    } finally {
      await pool.query(
        "UPDATE public.table_visits SET status = 'closed', closed_at = now() WHERE id = $1",
        [testVisitId]
      )
      await pool.query('UPDATE public.dining_tables SET active = true WHERE id = $1', [testTableId])
      await pool.query(
        "UPDATE public.table_visits SET status = 'open', closed_at = NULL WHERE id = $1",
        [testVisitId]
      )
    }
  })
})
