import crypto from 'node:crypto'
import pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { handlePublicApi } from '../../supabase/functions/public-api/index.ts'
import { sha256 } from '../../supabase/functions/_shared/crypto.ts'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard'

describe('Order recovery authorization against PostgreSQL', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  let client: pg.PoolClient | undefined
  let db: pg.Pool
  let key: string
  let secret: string
  let receipt: { id: string; code: string; order_type: string; total_vnd: number }

  beforeAll(async () => { await assertIsolatedTestDatabase(pool) })
  afterAll(async () => { await pool.end() })
  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
    db = { query: client.query.bind(client) } as unknown as pg.Pool
    const tableId = crypto.randomUUID()
    const visitId = crypto.randomUUID()
    const orderId = crypto.randomUUID()
    key = crypto.randomUUID()
    secret = crypto.randomBytes(32).toString('hex')
    const code = `REC-${orderId.slice(0, 8)}`
    await client.query('INSERT INTO public.dining_tables (id, code, name) VALUES ($1, $2, $3)', [tableId, code, 'Recovery Test'])
    await client.query("INSERT INTO public.table_visits (id, table_id, status) VALUES ($1, $2, 'open')", [visitId, tableId])
    await client.query(
      `INSERT INTO public.orders (id, code, order_type, status, table_id, table_visit_id, table_name_snapshot, subtotal_vnd, total_vnd)
       VALUES ($1, $2, 'dine_in', 'pending', $3, $4, 'Recovery Test', 150000, 150000)`,
      [orderId, code, tableId, visitId],
    )
    receipt = { id: orderId, code, order_type: 'dine_in', total_vnd: 150000 }
    await client.query(
      `INSERT INTO public.idempotency_requests (operation, key_hash, actor_scope, request_hash, result_id, response_json, expires_at)
       VALUES ('create_order', $1, 'guest:original-network', $2, $3, $4, now() + interval '24 hours')`,
      [sha256(key), sha256('request'), orderId, JSON.stringify(receipt)],
    )
    await client.query(
      `INSERT INTO public.guest_order_claims (order_id, secret_hash, expires_at)
       VALUES ($1, $2, now() + interval '24 hours')`, [orderId, sha256(secret)],
    )
  })
  afterEach(async () => {
    if (client) {
      try { await client.query('ROLLBACK') } finally { client.release(); client = undefined }
    }
  })

  async function recover(body: unknown) {
    return handlePublicApi(new Request('http://localhost/functions/v1/public-api/orders/recover', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.0.2.45' },
      body: JSON.stringify(body),
    }), { pool: db, supabaseAdmin: {} as SupabaseClient })
  }

  it('recovers a receipt on a different network without inserting a second order', async () => {
    const before = await client!.query('SELECT count(*) FROM public.orders')
    const response = await recover({ idempotency_key: key, claim_secret: secret })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect((await response.json()).data.receipt).toEqual(receipt)
    const after = await client!.query('SELECT count(*) FROM public.orders')
    expect(after.rows[0].count).toBe(before.rows[0].count)
  })

  it.each(['key', 'secret'] as const)('does not expose receipts when the %s is incorrect', async (field) => {
    const response = await recover({
      idempotency_key: field === 'key' ? crypto.randomUUID() : key,
      claim_secret: field === 'secret' ? crypto.randomBytes(32).toString('hex') : secret,
    })
    expect(response.status).toBe(200)
    expect((await response.json()).data.receipt).toBeNull()
  })

  it.each(['guest_order_claims', 'idempotency_requests'])('does not recover expired %s', async (table) => {
    await client!.query(`UPDATE public.${table} SET expires_at = now() - interval '1 second' WHERE ${table === 'guest_order_claims' ? 'order_id' : 'result_id'} = $1`, [receipt.id])
    const response = await recover({ idempotency_key: key, claim_secret: secret })
    expect((await response.json()).data.receipt).toBeNull()
  })

  it.each([null, {}, { idempotency_key: 'short', claim_secret: 'short' }])('rejects malformed recovery requests', async (body) => {
    const response = await recover(body)
    expect(response.status).toBe(400)
  })
})
