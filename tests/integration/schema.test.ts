import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('Tiger 345 - PostgreSQL Schema & Constraint Integration Tests', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString })
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('1. Deterministic Seed Data Integrity', () => {
    it('should have 6 active categories seeded', async () => {
      const res = await pool.query('SELECT count(*) as count FROM categories WHERE active = true')
      expect(Number(res.rows[0].count)).toBe(6)
    })

    it('should have 13 active menu items seeded with full fields', async () => {
      const res = await pool.query('SELECT count(*) as count FROM menu_items WHERE published = true')
      expect(Number(res.rows[0].count)).toBe(13)

      // Verify specific signature dish
      const signature = await pool.query(
        "SELECT * FROM menu_items WHERE slug = 'suon-nuong-mat-ong-hoa-ca-phe'"
      )
      expect(signature.rows.length).toBe(1)
      const dish = signature.rows[0]
      expect(Number(dish.price_vnd)).toBe(245000)
      expect(dish.is_signature).toBe(true)
      expect(dish.is_bestseller).toBe(true)
      expect(dish.delivery_eta).toBe('25-30 phút')
      expect(dish.tags).toEqual(['Signature', 'Bếp trưởng khuyên thử'])
    })

    it('should have 3 seating areas and 6 demo dining tables', async () => {
      const areas = await pool.query('SELECT count(*) as count FROM seating_areas WHERE active = true')
      expect(Number(areas.rows[0].count)).toBe(3)

      const tables = await pool.query('SELECT count(*) as count FROM dining_tables WHERE active = true')
      expect(Number(tables.rows[0].count)).toBe(6)
    })

    it('should have 3 delivery zones and restaurant settings id=1', async () => {
      const zones = await pool.query('SELECT count(*) as count FROM delivery_zones WHERE active = true')
      expect(Number(zones.rows[0].count)).toBe(3)

      const settings = await pool.query('SELECT * FROM restaurant_settings WHERE id = 1')
      expect(settings.rows.length).toBe(1)
      expect(settings.rows[0].name).toBe('Tiger 345')
      expect(settings.rows[0].phone).toBe('0902809929')
      expect(settings.rows[0].timezone).toBe('Asia/Ho_Chi_Minh')
    })
  })

  describe('2. Negative Money & Currency Boundary Rejection', () => {
    it('should reject negative menu item price', async () => {
      await expect(
        pool.query(`
          INSERT INTO menu_items (
            id, category_id, name, slug, price_vnd, published, available, allow_dine_in, allow_delivery
          ) VALUES (
            gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
            'Invalid Negative Dish', 'invalid-negative-dish', -1000,
            true, true, true, true
          )
        `)
      ).rejects.toThrow(/menu_items_price_vnd_check/)
    })

    it('should reject menu item price exceeding 1,000,000,000 VND', async () => {
      await expect(
        pool.query(`
          INSERT INTO menu_items (
            id, category_id, name, slug, price_vnd, published, available, allow_dine_in, allow_delivery
          ) VALUES (
            gen_random_uuid(), '00000000-0000-0000-0000-000000000001',
            'Exorbitant Dish', 'exorbitant-dish', 1000000001,
            true, true, true, true
          )
        `)
      ).rejects.toThrow(/menu_items_price_vnd_check/)
    })
  })

  describe('3. Order Context Validation Invariants (Dine-in vs Delivery)', () => {
    it('should reject dine-in order missing table_id', async () => {
      await expect(
        pool.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-001', 'dine_in', 'pending', 'unpaid',
            100000, 0, 100000
          )
        `)
      ).rejects.toThrow(/chk_orders_dine_in_context/)
    })

    it('should reject dine-in order containing customer_phone or shipping fee', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Create visit for table 1
        const visit = await client.query(`
          INSERT INTO table_visits (id, table_id, status)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000001', 'open')
          RETURNING id
        `)
        const visitId = visit.rows[0].id

        await client.query('SAVEPOINT sp1')
        // Attempt dine-in order with customer phone
        await expect(
          client.query(`
            INSERT INTO orders (
              id, code, order_type, status, payment_status,
              table_id, table_visit_id, table_name_snapshot, customer_phone,
              subtotal_vnd, shipping_fee_vnd, total_vnd
            ) VALUES (
              gen_random_uuid(), 'ORD-TEST-002', 'dine_in', 'pending', 'unpaid',
              '30000000-0000-0000-0000-000000000001', '${visitId}', 'Bàn 01', '0901234567',
              100000, 0, 100000
            )
          `)
        ).rejects.toThrow(/chk_orders_dine_in_context/)
        await client.query('ROLLBACK TO SAVEPOINT sp1')

        await client.query('SAVEPOINT sp2')
        // Attempt dine-in order with shipping fee > 0
        await expect(
          client.query(`
            INSERT INTO orders (
              id, code, order_type, status, payment_status,
              table_id, table_visit_id, table_name_snapshot,
              subtotal_vnd, shipping_fee_vnd, total_vnd
            ) VALUES (
              gen_random_uuid(), 'ORD-TEST-003', 'dine_in', 'pending', 'unpaid',
              '30000000-0000-0000-0000-000000000001', '${visitId}', 'Bàn 01',
              100000, 15000, 115000
            )
          `)
        ).rejects.toThrow(/chk_orders_dine_in_context/)
        await client.query('ROLLBACK TO SAVEPOINT sp2')
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })

    it('should reject dine-in order with status "delivering"', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const visit = await client.query(`
          INSERT INTO table_visits (id, table_id, status)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000001', 'open')
          RETURNING id
        `)
        const visitId = visit.rows[0].id

        await expect(
          client.query(`
            INSERT INTO orders (
              id, code, order_type, status, payment_status,
              table_id, table_visit_id, table_name_snapshot,
              subtotal_vnd, shipping_fee_vnd, total_vnd
            ) VALUES (
              gen_random_uuid(), 'ORD-TEST-004', 'dine_in', 'delivering', 'unpaid',
              '30000000-0000-0000-0000-000000000001', '${visitId}', 'Bàn 01',
              100000, 0, 100000
            )
          `)
        ).rejects.toThrow(/chk_orders_no_delivering_for_dine_in/)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })

    it('should reject delivery order missing required customer fields or zone', async () => {
      await expect(
        pool.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            customer_name, customer_phone,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-005', 'delivery', 'pending', 'unpaid',
            'Nguyen Van A', '0901234567',
            150000, 15000, 165000
          )
        `)
      ).rejects.toThrow(/chk_orders_delivery_context/)
    })

    it('should reject delivery order with table_id or status "served"', async () => {
      await expect(
        pool.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot, table_id,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-006', 'delivery', 'pending', 'unpaid',
            'Nguyen Van A', '0901234567', '123 Đường Số 1, Vĩnh An',
            '40000000-0000-0000-0000-000000000001', 'Khu vực 1', '30000000-0000-0000-0000-000000000001',
            150000, 15000, 165000
          )
        `)
      ).rejects.toThrow(/chk_orders_delivery_context/)

      await expect(
        pool.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-007', 'delivery', 'served', 'unpaid',
            'Nguyen Van A', '0901234567', '123 Đường Số 1, Vĩnh An',
            '40000000-0000-0000-0000-000000000001', 'Khu vực 1',
            150000, 15000, 165000
          )
        `)
      ).rejects.toThrow(/chk_orders_no_served_for_delivery/)
    })
  })

  describe('4. Composite Foreign Key Guarantee (Table Visit Mismatch Protection)', () => {
    it('should reject order pointing to visit that belongs to a different table', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // Create visit belonging to Table 1 (T01)
        const visit = await client.query(`
          INSERT INTO table_visits (id, table_id, status)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000001', 'open')
          RETURNING id
        `)
        const visitIdForTable1 = visit.rows[0].id

        // Attempt to insert order with Table 2 (T02) but pointing to visit of Table 1
        await expect(
          client.query(`
            INSERT INTO orders (
              id, code, order_type, status, payment_status,
              table_id, table_visit_id, table_name_snapshot,
              subtotal_vnd, shipping_fee_vnd, total_vnd
            ) VALUES (
              gen_random_uuid(), 'ORD-TEST-MISMATCH', 'dine_in', 'pending', 'unpaid',
              '30000000-0000-0000-0000-000000000002', '${visitIdForTable1}', 'Bàn 02',
              100000, 0, 100000
            )
          `)
        ).rejects.toThrow(/fk_orders_table_visit/)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })
  })

  describe('5. Table Visit Status Invariants & Single Open Visit Invariant', () => {
    it('should reject table visit with status "open" and non-null closed_at', async () => {
      await expect(
        pool.query(`
          INSERT INTO table_visits (id, table_id, status, closed_at)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000001', 'open', NOW())
        `)
      ).rejects.toThrow(/chk_table_visits_status_closure/)
    })

    it('should reject table visit with status "closed" and NULL closed_at', async () => {
      await expect(
        pool.query(`
          INSERT INTO table_visits (id, table_id, status, closed_at)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000001', 'closed', NULL)
        `)
      ).rejects.toThrow(/chk_table_visits_status_closure/)
    })

    it('should prevent two concurrent open visits on the same table via partial unique index', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // First open visit
        await client.query(`
          INSERT INTO table_visits (id, table_id, status)
          VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000003', 'open')
        `)

        // Second open visit on the same table must fail
        await expect(
          client.query(`
            INSERT INTO table_visits (id, table_id, status)
            VALUES (gen_random_uuid(), '30000000-0000-0000-0000-000000000003', 'open')
          `)
        ).rejects.toThrow(/idx_table_visits_single_open/)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })
  })

  describe('6. Calculation Integrity (Order Total & Order Item Line Total)', () => {
    it('should reject order_item where line_total != unit_price * quantity', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const order = await client.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-LINE', 'delivery', 'pending', 'unpaid',
            'Test Customer', '0901234567', 'Dia chi test',
            '40000000-0000-0000-0000-000000000001', 'Zone 1',
            100000, 15000, 115000
          ) RETURNING id
        `)
        const orderId = order.rows[0].id

        // Attempt invalid line total (100000 * 2 != 150000)
        await expect(
          client.query(`
            INSERT INTO order_items (
              id, order_id, menu_item_id, item_name,
              unit_price_vnd, quantity, line_total_vnd
            ) VALUES (
              gen_random_uuid(), '${orderId}', '10000000-0000-0000-0000-000000000001',
              'Mon test', 100000, 2, 150000
            )
          `)
        ).rejects.toThrow(/chk_order_items_line_total/)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })

    it('should reject order where total != subtotal + shipping_fee', async () => {
      await expect(
        pool.query(`
          INSERT INTO orders (
            id, code, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), 'ORD-TEST-SUM', 'delivery', 'pending', 'unpaid',
            'Test Customer', '0901234567', 'Dia chi test',
            '40000000-0000-0000-0000-000000000001', 'Zone 1',
            100000, 15000, 200000
          )
        `)
      ).rejects.toThrow(/chk_orders_total_sum/)
    })
  })

  describe('7. Table QR Token Active Invariant', () => {
    it('should prevent two active QR tokens on the same table via partial unique index', async () => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        // First active token
        await client.query(`
          INSERT INTO table_qr_tokens (
            id, table_id, token_hash, active
          ) VALUES (
            gen_random_uuid(), '30000000-0000-0000-0000-000000000004', 'HASH_ACTIVE_1', true
          )
        `)

        // Second active token on the same table must fail
        await expect(
          client.query(`
            INSERT INTO table_qr_tokens (
              id, table_id, token_hash, active
            ) VALUES (
              gen_random_uuid(), '30000000-0000-0000-0000-000000000004', 'HASH_ACTIVE_2', true
            )
          `)
        ).rejects.toThrow(/idx_table_qr_tokens_active_unique/)
      } finally {
        await client.query('ROLLBACK')
        client.release()
      }
    })
  })
})
