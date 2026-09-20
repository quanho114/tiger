/**
 * Tiger 345 - Payment, Table Visit & Order Concurrency Integration Tests (F08 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * - Affected API:
 *   - public.settle_table_visit_payment
 *   - public.close_table_visit
 *   - public.record_order_payment
 *   - public.transition_order_status
 * - Data Schemas:
 *   - public.table_visits (id, table_id, status, version, capability_epoch, ended_at, updated_at)
 *   - public.orders (id, table_visit_id, status, payment_status, payment_method, paid_at, version, total_vnd, updated_at)
 *   - public.order_payment_events (id, order_id, event, amount_vnd, method, batch_id, created_at)
 *   - public.audit_logs
 * - Verbatim Instructions:
 *   - "BƯỚC 8 — F08: PAYMENT/VISIT CONCURRENCY"
 *   - "Khắc phục race condition trong luồng đóng bàn/thanh toán/gọi món đồng thời (table_visits, payments, orders)."
 *   - "Đảm bảo lock ordering rõ ràng, tránh deadlock và tránh over-payment / double-close."
 *   - "Kiểm tra và sửa các hàm DB liên quan (ví dụ: close_table_visit, process_payment, v.v.)."
 *   - "Viết integration test đồng thời (concurrency / barrier tests) chứng minh không bị duplicate payment hoặc race condition."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import crypto from 'node:crypto'
import pg from 'pg'
import { seedFixtureUsers, FIXTURE_USERS } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('F08: Payment, Table Visit & Order Concurrency Tests', () => {
  let pool: pg.Pool
  const adminId = FIXTURE_USERS.admin.id

  beforeAll(async () => {
    pool = new Pool({ connectionString, max: 10 })
    await seedFixtureUsers(pool)

    // Ensure test tables setup
    await pool.query(
      `INSERT INTO public.dining_tables (id, code, name, active)
       VALUES ('30000000-0000-0000-0000-000000000001', 'T-01', 'Bàn 01', true)
       ON CONFLICT (id) DO NOTHING`
    )
  })

  afterAll(async () => {
    if (pool) {
      try {
        await pool.query('DELETE FROM public.order_payment_events WHERE actor_admin_id = $1', [adminId])
        await pool.query('DELETE FROM public.order_status_history WHERE actor_admin_id = $1', [adminId])
        await pool.query("DELETE FROM public.orders WHERE table_name_snapshot LIKE 'Bàn Test Concurrency%'")
        await pool.query("DELETE FROM public.table_visits WHERE table_id IN (SELECT id FROM public.dining_tables WHERE name LIKE 'Bàn Test Concurrency%')")
        await pool.query("DELETE FROM public.dining_tables WHERE name LIKE 'Bàn Test Concurrency%'")
      } catch (err) {
        console.error('Error cleaning up test concurrency data:', err)
      }
      await pool.end()
    }
  })

  it('Test 1: Double Settle Concurrency - two concurrent settlement calls result in exactly one success, no over-payment', async () => {
    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      // Create unique dining table for this test
      const tableId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.dining_tables (id, code, name, active)
         VALUES ($1, $2, 'Bàn Test Concurrency 1', true)`,
        [tableId, `T-${Date.now().toString().slice(-6)}1`]
      )

      // 1. Create visit on this table and 2 dine-in orders
      const visitId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.table_visits (id, table_id, status, version)
         VALUES ($1, $2, 'open', 1)`,
        [visitId, tableId]
      )

      const order1Id = crypto.randomUUID()
      const order2Id = crypto.randomUUID()

      await pool.query(
        `INSERT INTO public.orders (
           id, code, order_type, table_id, table_visit_id, table_name_snapshot,
           status, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, version
         ) VALUES
         ($1, $2, 'dine_in', $3, $4, 'Bàn Test Concurrency 1', 'served', 'unpaid', 100000, 0, 100000, 1),
         ($5, $6, 'dine_in', $3, $4, 'Bàn Test Concurrency 1', 'served', 'unpaid', 150000, 0, 150000, 1)`,
        [
          order1Id, `DINE-${Date.now().toString().slice(-6)}1`, tableId, visitId,
          order2Id, `DINE-${Date.now().toString().slice(-6)}2`
        ]
      )

      const expectedOrders = JSON.stringify([
        { id: order1Id, version: 1 },
        { id: order2Id, version: 1 }
      ])

      // 2. Launch two concurrent settlements racing for the same visit at version 1
      const settlePromiseA = clientA.query(
        `SELECT public.settle_table_visit_payment(
           $1::uuid, 1, $2::jsonb, 'cash', $3::uuid
         ) AS result`,
        [visitId, expectedOrders, adminId]
      )

      const settlePromiseB = clientB.query(
        `SELECT public.settle_table_visit_payment(
           $1::uuid, 1, $2::jsonb, 'cash', $3::uuid
         ) AS result`,
        [visitId, expectedOrders, adminId]
      )

      const results = await Promise.allSettled([settlePromiseA, settlePromiseB])

      // Exactly one must succeed, one must fail with VERSION_CONFLICT (or NO_ORDERS_TO_SETTLE)
      const fulfilled = results.filter(r => r.status === 'fulfilled')
      const rejected = results.filter(r => r.status === 'rejected')

      expect(fulfilled.length).toBe(1)
      expect(rejected.length).toBe(1)

      const rejectionReason = (rejected[0] as PromiseRejectedResult).reason.message
      expect(rejectionReason).toMatch(/VERSION_CONFLICT|ORDER_LIST_MISMATCH|NO_ORDERS_TO_SETTLE/)

      // 3. Verify Database State: No double-payment or over-payment
      const eventsRes = await pool.query(
        `SELECT order_id, amount_vnd, event, count(*) as count
         FROM public.order_payment_events
         WHERE order_id IN ($1, $2)
         GROUP BY order_id, amount_vnd, event`,
        [order1Id, order2Id]
      )

      // Each order has exactly 1 'paid' event
      expect(eventsRes.rows.length).toBe(2)
      for (const row of eventsRes.rows) {
        expect(row.event).toBe('paid')
        expect(Number(row.count)).toBe(1)
      }

      // Check visit version is exactly 2 (incremented once)
      const visitRes = await pool.query(
        `SELECT status, version FROM public.table_visits WHERE id = $1`,
        [visitId]
      )
      expect(visitRes.rows[0].version).toBe(2)
      expect(visitRes.rows[0].status).toBe('open')

      // Check both orders are marked paid with version 2
      const ordersRes = await pool.query(
        `SELECT id, payment_status, version FROM public.orders WHERE table_visit_id = $1`,
        [visitId]
      )
      expect(ordersRes.rows.every(o => o.payment_status === 'paid' && o.version === 2)).toBe(true)
    } finally {
      clientA.release()
      clientB.release()
    }
  })

  it('Test 2: Settle vs Concurrent Order Mutation Barrier - order mutation blocked until settlement finishes and rejects stale version', async () => {
    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      const tableId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.dining_tables (id, code, name, active)
         VALUES ($1, $2, 'Bàn Test Concurrency 2', true)`,
        [tableId, `T-${Date.now().toString().slice(-6)}2`]
      )

      const visitId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.table_visits (id, table_id, status, version)
         VALUES ($1, $2, 'open', 1)`,
        [visitId, tableId]
      )

      const orderId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.orders (
           id, code, order_type, table_id, table_visit_id, table_name_snapshot,
           status, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, version
         ) VALUES ($1, $2, 'dine_in', $3, $4, 'Bàn Test Concurrency 2', 'served', 'unpaid', 80000, 0, 80000, 1)`,
        [orderId, `DINE-${Date.now().toString().slice(-6)}2`, tableId, visitId]
      )

      const expectedOrders = JSON.stringify([{ id: orderId, version: 1 }])

      // Start transaction in Client A and call settle_table_visit_payment
      await clientA.query('BEGIN')
      const settleRes = await clientA.query(
        `SELECT public.settle_table_visit_payment(
           $1::uuid, 1, $2::jsonb, 'cash', $3::uuid
         ) AS result`,
        [visitId, expectedOrders, adminId]
      )
      expect(settleRes.rows[0].result.receipt.total_settled_vnd).toBe(80000)

      // Client B now attempts to record payment on the order with expected_version = 1
      // Because Client A holds locks on table_visits and orders, Client B will wait or fail
      let clientBFinished = false
      const clientBPromise = clientB.query(
        `SELECT public.record_order_payment(
           $1::uuid, 1, 'paid', 'cash', $2::uuid
         ) AS result`,
        [orderId, adminId]
      ).then(
        () => { clientBFinished = true; return 'success' },
        (err) => { clientBFinished = true; return err.message }
      )

      // Verify that while Client A has not committed, Client B has not completed (blocked by locks)
      await new Promise(r => setTimeout(r, 100))
      expect(clientBFinished).toBe(false)

      // Client A commits transaction
      await clientA.query('COMMIT')

      // Now Client B unblocks and completes
      const clientBResult = await clientBPromise
      // Client B must fail with VERSION_CONFLICT or ALREADY_PAID
      expect(clientBResult).toMatch(/VERSION_CONFLICT|ALREADY_PAID/)

      // Final check: exactly one payment event exists
      const eventsRes = await pool.query(
        `SELECT count(*) FROM public.order_payment_events WHERE order_id = $1`,
        [orderId]
      )
      expect(Number(eventsRes.rows[0].count)).toBe(1)
    } finally {
      try { await clientA.query('ROLLBACK') } catch { /* ignore */ }
      clientA.release()
      clientB.release()
    }
  })

  it('Test 3: Settle vs Close Table Visit Concurrency - no double-close, cannot close unpaid visit', async () => {
    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      const tableId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.dining_tables (id, code, name, active)
         VALUES ($1, $2, 'Bàn Test Concurrency 3', true)`,
        [tableId, `T-${Date.now().toString().slice(-6)}3`]
      )

      const visitId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.table_visits (id, table_id, status, version)
         VALUES ($1, $2, 'open', 1)`,
        [visitId, tableId]
      )

      const orderId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.orders (
           id, code, order_type, table_id, table_visit_id, table_name_snapshot,
           status, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, version
         ) VALUES ($1, $2, 'dine_in', $3, $4, 'Bàn Test Concurrency 3', 'completed', 'unpaid', 120000, 0, 120000, 1)`,
        [orderId, `DINE-${Date.now().toString().slice(-6)}3`, tableId, visitId]
      )

      const expectedOrders = JSON.stringify([{ id: orderId, version: 1 }])

      // 1. Attempt close while unpaid -> MUST FAIL with VISIT_NOT_SETTLED
      await expect(
        pool.query(
          `SELECT public.close_table_visit($1::uuid, 1, $2::uuid)`,
          [visitId, adminId]
        )
      ).rejects.toThrow(/VISIT_NOT_SETTLED/)

      // 2. Race: Client A settles (version 1 -> 2), Client B tries to close with version 1
      const settlePromise = clientA.query(
        `SELECT public.settle_table_visit_payment(
           $1::uuid, 1, $2::jsonb, 'cash', $3::uuid
         )`,
        [visitId, expectedOrders, adminId]
      )

      const closePromise = clientB.query(
        `SELECT public.close_table_visit($1::uuid, 1, $2::uuid)`,
        [visitId, adminId]
      )

      const results = await Promise.allSettled([settlePromise, closePromise])

      const settleResult = results[0]
      const closeResult = results[1]

      // Settle succeeds
      expect(settleResult.status).toBe('fulfilled')

      // Close at version 1 fails (either because visit was not settled at start or version changed to 2)
      expect(closeResult.status).toBe('rejected')
      expect((closeResult as PromiseRejectedResult).reason.message).toMatch(/VERSION_CONFLICT|VISIT_NOT_SETTLED/)

      // 3. Now close with the updated visit version (version 2) -> MUST SUCCEED
      const closeSuccessRes = await pool.query(
        `SELECT public.close_table_visit($1::uuid, 2, $2::uuid) AS result`,
        [visitId, adminId]
      )
      expect(closeSuccessRes.rows[0].result.status).toBe('closed')
      expect(closeSuccessRes.rows[0].result.version).toBe(3)

      // 4. Double close attempt -> MUST FAIL with VISIT_ALREADY_CLOSED
      await expect(
        pool.query(
          `SELECT public.close_table_visit($1::uuid, 3, $2::uuid)`,
          [visitId, adminId]
        )
      ).rejects.toThrow(/VISIT_ALREADY_CLOSED/)
    } finally {
      clientA.release()
      clientB.release()
    }
  })

  it('Test 4: Concurrent Order Status Transitions on Separate Orders of Same Visit - no deadlocks', async () => {
    const clientA = await pool.connect()
    const clientB = await pool.connect()

    try {
      const tableId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.dining_tables (id, code, name, active)
         VALUES ($1, $2, 'Bàn Test Concurrency 4', true)`,
        [tableId, `T-${Date.now().toString().slice(-6)}4`]
      )

      const visitId = crypto.randomUUID()
      await pool.query(
        `INSERT INTO public.table_visits (id, table_id, status, version)
         VALUES ($1, $2, 'open', 1)`,
        [visitId, tableId]
      )

      const order1Id = crypto.randomUUID()
      const order2Id = crypto.randomUUID()

      await pool.query(
        `INSERT INTO public.orders (
           id, code, order_type, table_id, table_visit_id, table_name_snapshot,
           status, payment_status, subtotal_vnd, shipping_fee_vnd, total_vnd, version
         ) VALUES
         ($1, $2, 'dine_in', $3, $4, 'Bàn Test Concurrency 4', 'pending', 'unpaid', 50000, 0, 50000, 1),
         ($5, $6, 'dine_in', $3, $4, 'Bàn Test Concurrency 4', 'pending', 'unpaid', 70000, 0, 70000, 1)`,
        [
          order1Id, `DINE-${Date.now().toString().slice(-6)}4a`, tableId, visitId,
          order2Id, `DINE-${Date.now().toString().slice(-6)}4b`
        ]
      )

      // Concurrently transition Order 1 and Order 2 from pending -> confirmed
      const [resA, resB] = await Promise.all([
        clientA.query(
          `SELECT public.transition_order_status($1::uuid, 1, 'confirmed', $2::uuid)`,
          [order1Id, adminId]
        ),
        clientB.query(
          `SELECT public.transition_order_status($1::uuid, 1, 'confirmed', $2::uuid)`,
          [order2Id, adminId]
        )
      ])

      expect(resA.rows.length).toBe(1)
      expect(resB.rows.length).toBe(1)

      // Both orders are confirmed with version 2
      const ordersRes = await pool.query(
        `SELECT id, status, version FROM public.orders WHERE id IN ($1, $2) ORDER BY id`,
        [order1Id, order2Id]
      )
      expect(ordersRes.rows.every(o => o.status === 'confirmed' && o.version === 2)).toBe(true)
    } finally {
      clientA.release()
      clientB.release()
    }
  })
})

