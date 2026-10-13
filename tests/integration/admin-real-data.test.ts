import crypto from 'node:crypto'
import pg from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.ts'
import { financialPeriod } from '../../supabase/functions/admin-api/financial-handlers.ts'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard'

describe('Admin API persisted data', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  let client: pg.PoolClient
  let db: pg.Pool
  let adminId: string
  let tableId: string
  let visitId: string
  let orderId: string
  let auth: SupabaseClient
  beforeAll(async () => { await assertIsolatedTestDatabase(pool) })
  afterAll(async () => { await pool.end() })
  beforeEach(async () => {
    client = await pool.connect()
    await client.query('BEGIN')
    db = { query: client.query.bind(client), connect: async () => ({
      query: (sql: string, values?: unknown[]) => client.query(sql === 'BEGIN' ? 'SAVEPOINT handler' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT handler' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT handler' : sql, values),
      release: () => {},
    }) } as unknown as pg.Pool
    adminId = crypto.randomUUID(); tableId = crypto.randomUUID(); visitId = crypto.randomUUID(); orderId = crypto.randomUUID()
    await client.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [adminId, `${adminId}@example.test`])
    await client.query('INSERT INTO public.admin_profiles (user_id, display_name) VALUES ($1, $2)', [adminId, 'Real Admin'])
    auth = { auth: { getUser: async () => ({ data: { user: { id: adminId } }, error: null }) } } as unknown as SupabaseClient
    await client.query('INSERT INTO public.dining_tables (id, code, name) VALUES ($1, $2, $3)', [tableId, `T-${tableId.slice(0, 8)}`, 'Real Table'])
    await client.query("INSERT INTO public.table_visits (id, table_id, status) VALUES ($1, $2, 'open')", [visitId, tableId])
    await client.query(`INSERT INTO public.orders (id, code, order_type, status, table_id, table_visit_id, table_name_snapshot, subtotal_vnd, total_vnd, payment_status, payment_method, paid_at)
      VALUES ($1, $2, 'dine_in', 'served', $3, $4, 'Real Table', 123456, 123456, 'paid', 'bank_transfer', now())`, [orderId, `REAL-${orderId.slice(0, 8)}`, tableId, visitId])
    await client.query("INSERT INTO public.order_items (order_id, item_name, unit_price_vnd, quantity, line_total_vnd) VALUES ($1, 'Actual Dish', 61728, 2, 123456)", [orderId])
    await client.query("INSERT INTO public.order_payment_events (order_id, event, amount_vnd, method, actor_admin_id) VALUES ($1, 'paid', 123456, 'bank_transfer', $2)", [orderId, adminId])
  })
  afterEach(async () => { if (client) { await client.query('ROLLBACK'); client.release() } })
  const request = async (path: string, body?: unknown, method?: string) => handleAdminApi(new Request(`http://localhost/functions/v1/admin-api${path}`, {
    method: method || (body ? 'POST' : 'GET'), headers: { Authorization: 'Bearer isolated-test', 'Content-Type': 'application/json', 'Idempotency-Key': orderId }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), { pool: db, supabaseAdmin: auth })

  it('returns actual invoice items/payment and excludes unpaid completed orders', async () => {
    const response = await request('/invoices')
    expect(response.status).toBe(200)
    const invoice = (await response.json()).data.items.find((i: { id: string }) => i.id === orderId)
    expect(invoice).toMatchObject({ payment_method: 'bank_transfer', total_vnd: 123456, cashier_name: 'Real Admin', items: [{ name: 'Actual Dish', quantity: 2, unit_price_vnd: 61728, line_total_vnd: 123456 }] })
    await client.query("UPDATE public.orders SET payment_status = 'unpaid', status = 'completed', paid_at = NULL WHERE id = $1", [orderId])
    expect((await (await request('/invoices')).json()).data.items.some((i: { id: string }) => i.id === orderId)).toBe(false)
  })
  it('deducts refunds and corrections on the ledger date', async () => {
    const before = (await (await request('/reports')).json()).data
    await client.query("INSERT INTO public.order_payment_events (order_id, event, amount_vnd, method) VALUES ($1, 'corrected', 123456, 'bank_transfer')", [orderId])
    const after = (await (await request('/reports')).json()).data
    expect(after.net_revenue).toBe(before.net_revenue - 123456)
    expect(after.reversed).toBe(before.reversed + 123456)
  })
  it('requires admin authentication and rejects malformed range/pagination', async () => {
    for (const path of ['/reports', '/invoices', '/accounts']) {
      const res = await handleAdminApi(new Request(`http://localhost/functions/v1/admin-api${path}`), { pool: db, supabaseAdmin: auth })
      expect(res.status).toBe(401)
    }
    expect((await request('/invoices?offset=-1')).status).toBe(400)
    expect((await request('/reports?range=invalid')).status).toBe(400)
  })
  it('lists persisted accounts and prevents self lockout', async () => {
    const result = await request('/accounts')
    expect((await result.json()).data.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: adminId, active: true })]))
    expect((await request(`/accounts/${adminId}`, { active: false }, 'PATCH')).status).toBe(403)
  })
  it('dashboard distinguishes enabled tables from open visits', async () => {
    const result = await request('/dashboard')
    expect(result.status).toBe(200)
    const data = (await result.json()).data
    const actual = await client.query("SELECT count(*)::int AS n FROM public.table_visits WHERE status = 'open'")
    expect(data.open_visits_count).toBe(actual.rows[0].n)
    expect(typeof data.confirmed_bookings_today_count).toBe('number')
  })
  it('persists full settings and rejects stale versions through the gateway', async () => {
    const current = (await (await request('/settings')).json()).data
    const changed = await request('/settings', { expected_version: current.version, name: 'Integration Restaurant', min_delivery_order_vnd: 76543 }, 'PATCH')
    expect(changed.status).toBe(200)
    const row = await client.query('SELECT name, min_delivery_order_vnd, version FROM public.restaurant_settings WHERE id = 1')
    expect(row.rows[0]).toMatchObject({ name: 'Integration Restaurant', min_delivery_order_vnd: '76543', version: current.version + 1 })
    expect((await request('/settings', { expected_version: current.version, name: 'Stale' }, 'PATCH')).status).toBe(409)
  })
  it('returns table and order fields consumed by the frontend', async () => {
    const tables = (await (await request('/tables')).json()).data.items
    expect(tables.find((t: { id: string }) => t.id === tableId)).toMatchObject({ current_visit_id: visitId, current_visit_version: 1 })
    const detail = (await (await request(`/orders/${orderId}`)).json()).data
    expect(detail.items[0]).toMatchObject({ name_snapshot: 'Actual Dish', price_vnd: 61728, subtotal_vnd: 123456 })
    expect(detail.order.table_name_snapshot).toBe('Real Table')
  })
  it('creates an order atomically and replays the same request without duplicates', async () => {
    // Transaction-scoped schedule changes are rolled back after this test.
    await client.query("UPDATE public.restaurant_settings SET accepting_orders = true, accepting_dine_in_orders = true WHERE id = 1")
    await client.query('DELETE FROM public.business_closures')
    await client.query('DELETE FROM public.business_hours')
    await client.query("INSERT INTO public.business_hours (weekday, service_type, open_time, close_time, active) SELECT d, 'restaurant', '00:00', '23:59:59', true FROM generate_series(0,6) d")
    const itemId = crypto.randomUUID()
    const category = await client.query('SELECT id FROM public.categories LIMIT 1')
    await client.query("INSERT INTO public.menu_items (id, category_id, name, slug, price_vnd, published, available, allow_dine_in) VALUES ($1,$2,'Actual Create Dish',$3,50000,true,true,true)", [itemId, category.rows[0].id, `test-${itemId}`])
    const body = { order_type: 'dine_in', table_id: tableId, items: [{ menu_item_id: itemId, quantity: 2, unit_price_vnd: 50000 }] }
    const first = await request('/orders', body)
    expect(first.status).toBe(201)
    const receipt = (await first.json()).data.receipt
    const again = await request('/orders', body)
    expect(again.status).toBe(200)
    expect((await again.json()).data.receipt.id).toBe(receipt.id)
    const persisted = await client.query('SELECT item_name, quantity, line_total_vnd FROM public.order_items WHERE order_id = $1', [receipt.id])
    expect(persisted.rows[0]).toMatchObject({ item_name: 'Actual Create Dish', quantity: 2, line_total_vnd: '100000' })
  })
})

describe('Vietnam financial calendar', () => {
  it('uses Vietnam midnight across UTC day boundaries', () => {
    expect(financialPeriod('today', new Date('2026-09-22T18:00:00Z'))).toEqual(['2026-09-22T17:00:00.000Z', '2026-09-23T17:00:00.000Z'])
  })
})
