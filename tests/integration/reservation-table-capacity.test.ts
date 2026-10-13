import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.ts'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres', max: 4 })
const marker = crypto.randomUUID().slice(0, 8)
let areaId = ''

beforeAll(async () => {
  await assertIsolatedTestDatabase(pool)
  const column = await pool.query(`SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dining_tables' AND column_name = 'capacity'`)
  if (!column.rowCount) await pool.query(await readFile('supabase/migrations/20260924000002_reservation_table_capacity.sql', 'utf8'))
  const area = await pool.query(`INSERT INTO public.seating_areas (code, name)
    VALUES ($1, 'Capacity test area') RETURNING id`, [`CAP-${marker}`])
  areaId = area.rows[0].id
  await pool.query(`INSERT INTO public.dining_tables (code, name, seating_area_id, capacity)
    VALUES ($1, 'Capacity test table', $2, 6)`, [`CAP-${marker}`, areaId])
})

afterAll(async () => {
  if (areaId) {
    await pool.query(`DELETE FROM public.reservations WHERE code LIKE $1`, [`CAP-${marker}-%`])
    await pool.query(`DELETE FROM public.dining_tables WHERE seating_area_id = $1`, [areaId])
    await pool.query(`DELETE FROM public.seating_areas WHERE id = $1`, [areaId])
  }
  await pool.end()
})

it('assigns at most one overlapping pending request to a six-seat table', async () => {
  const insert = (suffix: string) => pool.query(`INSERT INTO public.reservations
    (code, customer_name, customer_phone, starts_at, ends_at, guest_count, seating_area_id, status)
    VALUES ($1, 'Capacity Test', '0900000000', '2040-07-11T12:00:00Z', '2040-07-11T14:00:00Z', 6, $2, 'pending')
    RETURNING assigned_table_id`, [`CAP-${marker}-${suffix}`, areaId])
  const results = await Promise.allSettled([insert('A'), insert('B')])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  const failure = results.find(result => result.status === 'rejected')
  expect(failure?.status === 'rejected' && (failure.reason as { code?: string }).code).toBe('P0023')
  const saved = await pool.query(`SELECT assigned_table_id FROM public.reservations WHERE code LIKE $1`, [`CAP-${marker}-%`])
  expect(saved.rows).toHaveLength(1)
  expect(saved.rows[0].assigned_table_id).toBeTruthy()
})
