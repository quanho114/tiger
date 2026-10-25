import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { it, expect } from 'vitest'
import pg from 'pg'
import { handlePublicApi } from '../../supabase/functions/public-api/index'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard'

it('quotes and commits selected portion prices; rejects invalid, substituted and stale prices', async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
  await assertIsolatedTestDatabase(pool)
  const client = await pool.connect()
  // All fixtures, orders and function replacement are transaction-local and rolled back.
  const transactionPool = { query: client.query.bind(client) } as unknown as pg.Pool
  const id = randomUUID()
  const request = async (path: string, body: object, key?: string) => {
    const req = new Request(`http://localhost/functions/v1/public-api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '192.168.1.141', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body) })
    return handlePublicApi(req, { pool: transactionPool })
  }
  try {
    await client.query('BEGIN')
    await client.query(await readFile(new URL('../../supabase/migrations/20261022000001_range_portion_orders.sql', import.meta.url), 'utf8'))
    const category = (await client.query("INSERT INTO public.categories (name, slug) VALUES ('Range test', $1) RETURNING id", [`range-${id}`])).rows[0].id
    await client.query("INSERT INTO public.menu_items (id, category_id, name, slug, price_vnd, pricing_mode, price_min, price_max) VALUES ($1,$2,'Range fixture',$3,280000,'range',280000,300000)", [id, category, `range-${id}`])
    await client.query('UPDATE public.restaurant_settings SET accepting_orders = true WHERE id = 1')
    await client.query("UPDATE public.business_hours SET open_time = '00:00:00', close_time = '23:59:59' WHERE service_type = 'restaurant'")
    await client.query('DELETE FROM public.business_closures')
    const items = [{ menu_item_id: id, quantity: 2, selected_price_vnd: 290000 }]
    for (const price of [undefined, 270000, 285000, 310000]) {
      const res = await request('order-quotes', { order_type: 'takeaway', items: [{ ...items[0], selected_price_vnd: price }] })
      expect(res.status).toBe(400)
    }
    const res = await request('order-quotes', { order_type: 'takeaway', items })
    expect(res.status).toBe(200)
    const quote = (await res.json()).data
    expect(quote.total_vnd).toBe(580000)
    const body = { quote_token: quote.quote_token, items, customer_name: 'Test Guest', customer_phone: '0900000000' }
    const changed = await request('orders', { ...body, items: [{ ...items[0], selected_price_vnd: 300000 }] }, randomUUID())
    expect(changed.status).toBe(409)
    const created = await request('orders', body, randomUUID())
    expect(created.status).toBe(201)
    const receipt = (await created.json()).data
    const line = (await client.query('SELECT unit_price_vnd, line_total_vnd FROM public.order_items WHERE order_id = $1', [receipt.id])).rows[0]
    expect(Number(line.unit_price_vnd)).toBe(290000)
    expect(Number(line.line_total_vnd)).toBe(580000)
    await client.query('UPDATE public.menu_items SET price_min = 300000 WHERE id = $1', [id])
    await client.query('SAVEPOINT stale_price')
    const stale = await request('orders', body, randomUUID())
    expect(stale.status).toBe(409)
    await client.query('ROLLBACK TO SAVEPOINT stale_price')
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
})
