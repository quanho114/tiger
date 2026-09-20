/**
 * Tiger 345 - RLS Policies & Access Control Integration Tests (V04 & V19)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by vitest runner via vitest.policies.config.ts (npm run test:policies)
 * - Affected API: PostgreSQL Row Level Security (RLS) & Table Permissions (REVOKE ALL on admin_profiles)
 * - Data Schemas: public.admin_profiles, public.orders, public.reservations, public.audit_logs
 * - Verbatim Instruction: "Hoàn thành toàn bộ C00–C11 bằng implementation thực tế, kiểm chứng đúng đường chạy và evidence có thể review. Không dừng ở khảo sát, đề xuất hoặc sửa báo cáo."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import {
  FIXTURE_USERS,
  seedFixtureUsers,
} from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('Tiger 345 - RLS Policies & Access Control Integration Tests (V04 & V19)', () => {
  let pool: pg.Pool

  async function cleanupTestData() {
    await pool.query(`
      DELETE FROM customer_favorites WHERE user_id IN ('${FIXTURE_USERS.customerA.id}', '${FIXTURE_USERS.customerB.id}');
      DELETE FROM customer_addresses WHERE user_id IN ('${FIXTURE_USERS.customerA.id}', '${FIXTURE_USERS.customerB.id}');
      DELETE FROM orders WHERE customer_user_id IN ('${FIXTURE_USERS.customerA.id}', '${FIXTURE_USERS.customerB.id}');
      DELETE FROM menu_items WHERE id IN ('10000000-0000-0000-0000-000000000098', '10000000-0000-0000-0000-000000000099');
      DELETE FROM categories WHERE id = '00000000-0000-0000-0000-000000000099';
    `)
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await cleanupTestData()
    await seedFixtureUsers(pool)
  })

  afterAll(async () => {
    await cleanupTestData()
    await pool.end()
  })

  /**
   * Helper to run queries as a specific role and authenticated user
   */
  async function runAs(
    role: 'anon' | 'authenticated',
    userId?: string,
    callback?: (client: pg.PoolClient) => Promise<unknown>
  ): Promise<unknown> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL ROLE ${role}`)
      if (userId) {
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ sub: userId, role })]
        )
      } else {
        await client.query(
          `SELECT set_config('request.jwt.claims', $1, true)`,
          [JSON.stringify({ role: 'anon' })]
        )
      }

      const result = await callback!(client)
      await client.query('ROLLBACK')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async function expectRejection(
    client: pg.PoolClient,
    sql: string,
    errorRegex: RegExp
  ): Promise<void> {
    await client.query('SAVEPOINT sp_test')
    try {
      await client.query(sql)
      expect.fail('Expected query to throw an error, but it succeeded')
    } catch (err: unknown) {
      await client.query('ROLLBACK TO SAVEPOINT sp_test')
      const message = err instanceof Error ? err.message : String(err)
      expect(message).toMatch(errorRegex)
    }
  }

  describe('1. Public Catalog & Settings Accessibility', () => {
    it('anon can read active categories and published menu items belonging to active categories', async () => {
      await runAs('anon', undefined, async (client) => {
        const categories = await client.query('SELECT count(*) as count FROM categories')
        expect(Number(categories.rows[0].count)).toBe(6)

        const menuItems = await client.query('SELECT count(*) as count FROM menu_items')
        expect(Number(menuItems.rows[0].count)).toBe(13)
      })
    })

    it('anon cannot see unpublished menu items or items belonging to inactive categories', async () => {
      // Setup unpublished item and inactive category via admin/superuser connection
      const setupClient = await pool.connect()
      try {
        await setupClient.query(`
          INSERT INTO categories (id, name, slug, active)
          VALUES ('00000000-0000-0000-0000-000000000099', 'Danh mục ẩn', 'danh-muc-an', false)
          ON CONFLICT (id) DO NOTHING;

          INSERT INTO menu_items (id, category_id, name, slug, price_vnd, published, available)
          VALUES
            ('10000000-0000-0000-0000-000000000098', '00000000-0000-0000-0000-000000000001', 'Món chưa công bố', 'mon-chua-cong-bo', 100000, false, true),
            ('10000000-0000-0000-0000-000000000099', '00000000-0000-0000-0000-000000000099', 'Món trong danh mục ẩn', 'mon-danh-muc-an', 100000, true, true)
          ON CONFLICT (id) DO NOTHING;
        `)
      } finally {
        setupClient.release()
      }

      await runAs('anon', undefined, async (client) => {
        // Querying unpublished item must return 0 rows
        const unpublished = await client.query(
          "SELECT * FROM menu_items WHERE slug = 'mon-chua-cong-bo'"
        )
        expect(unpublished.rows.length).toBe(0)

        // Querying item in inactive category must return 0 rows
        const inactiveCatItem = await client.query(
          "SELECT * FROM menu_items WHERE slug = 'mon-danh-muc-an'"
        )
        expect(inactiveCatItem.rows.length).toBe(0)

        // Inactive category itself must return 0 rows
        const inactiveCat = await client.query(
          "SELECT * FROM categories WHERE slug = 'danh-muc-an'"
        )
        expect(inactiveCat.rows.length).toBe(0)
      })
    })

    it('anon can read restaurant settings and business hours', async () => {
      await runAs('anon', undefined, async (client) => {
        const settings = await client.query('SELECT name, phone FROM restaurant_settings WHERE id = 1')
        expect(settings.rows.length).toBe(1)
        expect(settings.rows[0].name).toBe('Tiger 345')

        const hours = await client.query('SELECT count(*) as count FROM business_hours')
        expect(Number(hours.rows[0].count)).toBe(21)
      })
    })
  })

  describe('2. Public/Anon Denied Access to Business, Internal & PII Tables (V04)', () => {
    it('anon cannot read orders, reservations, audit logs, or admin profiles', async () => {
      await runAs('anon', undefined, async (client) => {
        await expectRejection(
          client,
          'SELECT * FROM orders',
          /permission denied/i
        )

        await expectRejection(
          client,
          'SELECT * FROM reservations',
          /permission denied/i
        )

        await expectRejection(
          client,
          'SELECT * FROM admin_profiles',
          /permission denied/i
        )

        const auditLogs = await client.query('SELECT * FROM audit_logs')
        expect(auditLogs.rows.length).toBe(0)

        const customerProfiles = await client.query('SELECT * FROM customer_profiles')
        expect(customerProfiles.rows.length).toBe(0)

        const customerAddresses = await client.query('SELECT * FROM customer_addresses')
        expect(customerAddresses.rows.length).toBe(0)
      })
    })

    it('anon cannot write or insert into categories, menu_items, or orders', async () => {
      await runAs('anon', undefined, async (client) => {
        await expectRejection(
          client,
          `INSERT INTO categories (id, name, slug)
           VALUES (gen_random_uuid(), 'Hack Category', 'hack-cat')`,
          /permission denied/
        )

        await expectRejection(
          client,
          `INSERT INTO orders (id, code, order_type, status, subtotal_vnd, shipping_fee_vnd, total_vnd)
           VALUES (gen_random_uuid(), 'ORD-HACK-01', 'delivery', 'pending', 100000, 15000, 115000)`,
          /permission denied/
        )
      })
    })
  })

  describe('3. Customer Isolation & Cross-Account Protection (V04)', () => {
    it('Customer A can read and update their own profile, but cannot read Customer B profile', async () => {
      // Customer A queries
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        const ownProfile = await client.query('SELECT * FROM customer_profiles')
        expect(ownProfile.rows.length).toBe(1)
        expect(ownProfile.rows[0].user_id).toBe(FIXTURE_USERS.customerA.id)
        expect(ownProfile.rows[0].display_name).toBe(FIXTURE_USERS.customerA.displayName)

        // Customer A queries specifically Customer B's profile -> gets 0 rows
        const targetB = await client.query(
          'SELECT * FROM customer_profiles WHERE user_id = $1',
          [FIXTURE_USERS.customerB.id]
        )
        expect(targetB.rows.length).toBe(0)

        // Customer A can update own display_name
        await client.query(
          "UPDATE customer_profiles SET display_name = 'Khách A Mới' WHERE user_id = $1",
          [FIXTURE_USERS.customerA.id]
        )

        // Customer A attempts to update Customer B's profile -> 0 rows affected
        const updateB = await client.query(
          "UPDATE customer_profiles SET display_name = 'Hacked Name' WHERE user_id = $1",
          [FIXTURE_USERS.customerB.id]
        )
        expect(updateB.rowCount).toBe(0)
      })

      // Customer B queries
      await runAs('authenticated', FIXTURE_USERS.customerB.id, async (client) => {
        const ownProfile = await client.query('SELECT * FROM customer_profiles')
        expect(ownProfile.rows.length).toBe(1)
        expect(ownProfile.rows[0].user_id).toBe(FIXTURE_USERS.customerB.id)
        expect(ownProfile.rows[0].display_name).toBe(FIXTURE_USERS.customerB.displayName)
      })
    })

    it('Customer A can manage own addresses, but cannot access Customer B addresses', async () => {
      let addressAId: string

      // Customer A inserts address
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        const insertRes = await client.query(`
          INSERT INTO customer_addresses (
            user_id, label, recipient_name, phone, address_line, is_default
          ) VALUES (
            '${FIXTURE_USERS.customerA.id}', 'Nhà riêng A', 'Khách A', '0911000001', '123 Đường A, Vĩnh An', true
          ) RETURNING id
        `)
        addressAId = insertRes.rows[0].id

        const ownAddresses = await client.query('SELECT * FROM customer_addresses')
        expect(ownAddresses.rows.length).toBe(1)
        expect(ownAddresses.rows[0].recipient_name).toBe('Khách A')

        // Customer A cannot insert address pointing to Customer B's user_id
        await expectRejection(
          client,
          `INSERT INTO customer_addresses (
             user_id, label, recipient_name, phone, address_line
           ) VALUES (
             '${FIXTURE_USERS.customerB.id}', 'Nhà lén B', 'Lén', '0922000002', '456 Đường B'
           )`,
          /new row violates row-level security policy/
        )
      })

      // Customer B cannot see or modify Customer A's address
      await runAs('authenticated', FIXTURE_USERS.customerB.id, async (client) => {
        const readA = await client.query(
          'SELECT * FROM customer_addresses WHERE id = $1',
          [addressAId]
        )
        expect(readA.rows.length).toBe(0)

        const updateA = await client.query(
          "UPDATE customer_addresses SET recipient_name = 'Hacked' WHERE id = $1",
          [addressAId]
        )
        expect(updateA.rowCount).toBe(0)

        const deleteA = await client.query(
          'DELETE FROM customer_addresses WHERE id = $1',
          [addressAId]
        )
        expect(deleteA.rowCount).toBe(0)
      })
    })

    it('enforces partial unique index: customer cannot have two default addresses simultaneously', async () => {
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        // First default address
        await client.query(`
          INSERT INTO customer_addresses (
            user_id, label, recipient_name, phone, address_line, is_default
          ) VALUES (
            '${FIXTURE_USERS.customerA.id}', 'Văn phòng 1', 'Khách A', '0911000001', '100 Đường 1', true
          )
        `)

        // Second default address for the same user must be rejected
        await expectRejection(
          client,
          `INSERT INTO customer_addresses (
             user_id, label, recipient_name, phone, address_line, is_default
           ) VALUES (
             '${FIXTURE_USERS.customerA.id}', 'Văn phòng 2', 'Khách A', '0911000001', '200 Đường 2', true
           )`,
          /idx_customer_addresses_default_unique/
        )
      })
    })

    it('Customer A can favorite published items, but cannot favorite unpublished items or favorite for Customer B', async () => {
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        // Favorite published signature dish
        await client.query(`
          INSERT INTO customer_favorites (user_id, menu_item_id)
          VALUES ('${FIXTURE_USERS.customerA.id}', '10000000-0000-0000-0000-000000000001')
        `)

        const favs = await client.query('SELECT * FROM customer_favorites')
        expect(favs.rows.length).toBe(1)

        // Attempt to favorite unpublished dish -> rejected by WITH CHECK policy
        await expectRejection(
          client,
          `INSERT INTO customer_favorites (user_id, menu_item_id)
           VALUES ('${FIXTURE_USERS.customerA.id}', '10000000-0000-0000-0000-000000000098')`,
          /new row violates row-level security policy/
        )

        // Attempt to favorite on behalf of Customer B -> rejected by WITH CHECK policy
        await expectRejection(
          client,
          `INSERT INTO customer_favorites (user_id, menu_item_id)
           VALUES ('${FIXTURE_USERS.customerB.id}', '10000000-0000-0000-0000-000000000001')`,
          /new row violates row-level security policy/
        )
      })
    })
  })

  describe('4. Orders & Reservations Ownership & Direct Write Revocation (V04)', () => {
    let orderAId: string
    let orderBId: string
    let codeA: string
    let codeB: string

    beforeAll(async () => {
      // Seed orders for customer A and customer B via direct superuser connection
      const adminClient = await pool.connect()
      try {
        const timestamp = Date.now()
        codeA = `ORD-A-${timestamp}`
        codeB = `ORD-B-${timestamp}`

        const resA = await adminClient.query(`
          INSERT INTO orders (
            id, code, customer_user_id, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd, internal_note
          ) VALUES (
            gen_random_uuid(), '${codeA}', '${FIXTURE_USERS.customerA.id}', 'delivery', 'confirmed', 'unpaid',
            'Khách A', '0911000001', '123 Đường A',
            '40000000-0000-0000-0000-000000000001', 'Khu vực 1',
            245000, 15000, 260000, 'Secret note for staff only'
          ) RETURNING id
        `)
        orderAId = resA.rows[0].id

        const resB = await adminClient.query(`
          INSERT INTO orders (
            id, code, customer_user_id, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            gen_random_uuid(), '${codeB}', '${FIXTURE_USERS.customerB.id}', 'delivery', 'pending', 'unpaid',
            'Khách B', '0922000002', '456 Đường B',
            '40000000-0000-0000-0000-000000000001', 'Khu vực 1',
            150000, 15000, 165000
          ) RETURNING id
        `)
        orderBId = resB.rows[0].id
      } finally {
        adminClient.release()
      }
    })

    it('Customer A can read their own order, but cannot read Customer B order', async () => {
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        const ownOrder = await client.query(
          'SELECT id, code, total_vnd FROM orders WHERE id = $1',
          [orderAId]
        )
        expect(ownOrder.rows.length).toBe(1)
        expect(ownOrder.rows[0].code).toBe(codeA)

        // Customer A querying Customer B's order receives 0 rows (no error, no disclosure of existence)
        const orderB = await client.query(
          'SELECT id, code FROM orders WHERE id = $1',
          [orderBId]
        )
        expect(orderB.rows.length).toBe(0)
      })
    })

    it('Authenticated customers cannot insert, update, or delete orders directly via PostgREST/table write', async () => {
      await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
        // Attempt direct update of payment_status or total
        await expectRejection(
          client,
          `UPDATE orders SET payment_status = 'paid' WHERE id = '${orderAId}'`,
          /permission denied/
        )

        // Attempt direct insert of order
        await expectRejection(
          client,
          `INSERT INTO orders (
             id, code, customer_user_id, order_type, status,
             customer_name, customer_phone, address_snapshot,
             delivery_zone_id, zone_name_snapshot,
             subtotal_vnd, shipping_fee_vnd, total_vnd
           ) VALUES (
             gen_random_uuid(), 'ORD-DIRECT-FAIL', '${FIXTURE_USERS.customerA.id}', 'delivery', 'confirmed',
             'Khách A', '0911000001', 'Dia chi',
             '40000000-0000-0000-0000-000000000001', 'Khu 1',
             100000, 0, 100000
           )`,
          /permission denied/
        )
      })
    })
  })

  describe('5. Admin Role Separation & Signup Privilege Escalation Prevention (V04)', () => {
    it('signup trigger automatically creates customer_profiles and NEVER creates admin_profiles', async () => {
      const adminClient = await pool.connect()
      try {
        const testUserId = 'f0000000-0000-0000-0000-000000000001'
        // Simulate new user registration with spoofed metadata trying to claim admin role
        await adminClient.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
          ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            '${testUserId}',
            'authenticated',
            'authenticated',
            'attacker@evil.com',
            crypt('Password123!', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"role":"admin","admin":true,"is_admin":true,"full_name":"Attacker"}'::jsonb,
            now(),
            now()
          ) ON CONFLICT (id) DO NOTHING;
        `)

        // Check customer_profiles: profile exists with display_name 'Attacker'
        const profile = await adminClient.query(
          'SELECT * FROM customer_profiles WHERE user_id = $1',
          [testUserId]
        )
        expect(profile.rows.length).toBe(1)
        expect(profile.rows[0].display_name).toBe('Attacker')

        // Check admin_profiles: NO record exists! Privilege escalation has 0 effect!
        const adminCheck = await adminClient.query(
          'SELECT * FROM admin_profiles WHERE user_id = $1',
          [testUserId]
        )
        expect(adminCheck.rows.length).toBe(0)
      } finally {
        adminClient.release()
      }
    })
  })

  describe('6. Account Deletion Cascade & Order Preservation Invariant (V19)', () => {
    it('deleting an auth user deletes profile and addresses, but preserves orders with customer_user_id = NULL', async () => {
      const adminClient = await pool.connect()
      try {
        const doomedUserId = 'd0000000-0000-0000-0000-000000000001'
        const doomedOrderId = 'd0000000-0000-0000-0000-000000000002'

        // 1. Create temporary user in auth.users
        await adminClient.query(`
          INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
          ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            '${doomedUserId}',
            'authenticated',
            'authenticated',
            'doomed@example.com',
            crypt('Password123!', gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            '{"full_name":"Doomed User"}'::jsonb,
            now(),
            now()
          ) ON CONFLICT (id) DO NOTHING;
        `)

        // 2. Add address and favorite for doomed user
        await adminClient.query(`
          INSERT INTO customer_addresses (
            user_id, label, recipient_name, phone, address_line
          ) VALUES (
            '${doomedUserId}', 'Nha doomed', 'Doomed', '0933000003', '789 Đường Doomed'
          );

          INSERT INTO customer_favorites (user_id, menu_item_id)
          VALUES ('${doomedUserId}', '10000000-0000-0000-0000-000000000001');
        `)

        // 3. Create order for doomed user
        await adminClient.query(`
          INSERT INTO orders (
            id, code, customer_user_id, order_type, status, payment_status,
            customer_name, customer_phone, address_snapshot,
            delivery_zone_id, zone_name_snapshot,
            subtotal_vnd, shipping_fee_vnd, total_vnd
          ) VALUES (
            '${doomedOrderId}', 'ORD-DOOMED-001', '${doomedUserId}', 'delivery', 'completed', 'paid',
            'Doomed User', '0933000003', '789 Đường Doomed',
            '40000000-0000-0000-0000-000000000001', 'Khu vực 1',
            245000, 15000, 260000
          ) ON CONFLICT (id) DO NOTHING;
        `)

        // 4. Delete user from auth.users
        await adminClient.query('DELETE FROM auth.users WHERE id = $1', [doomedUserId])

        // 5. Verify customer_profiles was deleted (CASCADE)
        const profile = await adminClient.query(
          'SELECT * FROM customer_profiles WHERE user_id = $1',
          [doomedUserId]
        )
        expect(profile.rows.length).toBe(0)

        // 6. Verify customer_addresses was deleted (CASCADE)
        const addresses = await adminClient.query(
          'SELECT * FROM customer_addresses WHERE user_id = $1',
          [doomedUserId]
        )
        expect(addresses.rows.length).toBe(0)

        // 7. Verify customer_favorites was deleted (CASCADE)
        const favorites = await adminClient.query(
          'SELECT * FROM customer_favorites WHERE user_id = $1',
          [doomedUserId]
        )
        expect(favorites.rows.length).toBe(0)

        // 8. CRITICAL INVARIANT (V19): Order was NOT deleted! It still exists with customer_user_id = NULL
        const order = await adminClient.query(
          'SELECT * FROM orders WHERE id = $1',
          [doomedOrderId]
        )
        expect(order.rows.length).toBe(1)
        expect(order.rows[0].customer_user_id).toBeNull()
        expect(order.rows[0].customer_name).toBe('Doomed User')
        expect(order.rows[0].total_vnd).toBe('260000')
      } finally {
        adminClient.release()
      }
    })
  })

  describe('7. Storage Bucket & Objects Access Control (V17)', () => {
    it('anon can select media from restaurant-media bucket, but cannot insert or delete', async () => {
      // 1. Insert a test media object using superuser pool
      const testObjectId = 'media-test-public.webp'
      await pool.query(`
        INSERT INTO storage.objects (
          id, bucket_id, name, owner, metadata
        ) VALUES (
          gen_random_uuid(), 'restaurant-media', '${testObjectId}', '${FIXTURE_USERS.admin.id}',
          '{"mimetype": "image/webp", "size": 1024}'::jsonb
        ) ON CONFLICT DO NOTHING;
      `)

      try {
        // Anon SELECT should succeed
        await runAs('anon', undefined, async (client) => {
          const res = await client.query(
            "SELECT name, bucket_id FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = $1",
            [testObjectId]
          )
          expect(res.rows.length).toBe(1)
          expect(res.rows[0].name).toBe(testObjectId)
        })

        // Anon INSERT should fail
        await runAs('anon', undefined, async (client) => {
          await expectRejection(
            client,
            `INSERT INTO storage.objects (id, bucket_id, name) VALUES (gen_random_uuid(), 'restaurant-media', 'anon-evil.jpg')`,
            /permission denied|violates row-level security policy/
          )
        })

        // Anon DELETE should not affect any rows (RLS USING filter yields 0 rows)
        await runAs('anon', undefined, async (client) => {
          await client.query(`SELECT set_config('storage.allow_delete_query', 'true', true)`)
          const deleteRes = await client.query(
            `DELETE FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = '${testObjectId}'`
          )
          expect(deleteRes.rowCount).toBe(0)
        })

        // Verify object still exists
        const checkRes = await pool.query(
          "SELECT name FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = $1",
          [testObjectId]
        )
        expect(checkRes.rows.length).toBe(1)
      } finally {
        await pool.query("SELECT set_config('storage.allow_delete_query', 'true', false)")
        await pool.query("DELETE FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = $1", [testObjectId])
      }
    })

    it('authenticated customer cannot insert, update, or delete media in restaurant-media', async () => {
      const testObjectId = 'media-test-cust-protect.webp'
      await pool.query(`
        INSERT INTO storage.objects (
          id, bucket_id, name, owner, metadata
        ) VALUES (
          gen_random_uuid(), 'restaurant-media', '${testObjectId}', '${FIXTURE_USERS.admin.id}',
          '{"mimetype": "image/webp", "size": 1024}'::jsonb
        ) ON CONFLICT DO NOTHING;
      `)

      try {
        await runAs('authenticated', FIXTURE_USERS.customerA.id, async (client) => {
          // Attempt insert (violates WITH CHECK)
          await expectRejection(
            client,
            `INSERT INTO storage.objects (id, bucket_id, name) VALUES (gen_random_uuid(), 'restaurant-media', 'customer-upload.jpg')`,
            /violates row-level security policy/
          )

          // Attempt update (RLS USING filter yields 0 rows updated)
          const updateRes = await client.query(
            `UPDATE storage.objects SET name = 'hacked.webp' WHERE bucket_id = 'restaurant-media' AND name = '${testObjectId}'`
          )
          expect(updateRes.rowCount).toBe(0)

          // Attempt delete (RLS USING filter yields 0 rows deleted)
          await client.query(`SELECT set_config('storage.allow_delete_query', 'true', true)`)
          const deleteRes = await client.query(
            `DELETE FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = '${testObjectId}'`
          )
          expect(deleteRes.rowCount).toBe(0)
        })

        // Verify object still untouched
        const checkRes = await pool.query(
          "SELECT name FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = $1",
          [testObjectId]
        )
        expect(checkRes.rows.length).toBe(1)
      } finally {
        await pool.query("SELECT set_config('storage.allow_delete_query', 'true', false)")
        await pool.query("DELETE FROM storage.objects WHERE bucket_id = 'restaurant-media' AND name = $1", [testObjectId])
      }
    })

    it('disabled admin cannot insert media in restaurant-media', async () => {
      await runAs('authenticated', FIXTURE_USERS.disabledAdmin.id, async (client) => {
        await expectRejection(
          client,
          `INSERT INTO storage.objects (id, bucket_id, name) VALUES (gen_random_uuid(), 'restaurant-media', 'disabled-admin-upload.jpg')`,
          /violates row-level security policy/
        )
      })
    })

    it('active admin can insert, update, and delete media in restaurant-media', async () => {
      const adminObjectId = 'admin-authorized-upload.webp'
      await runAs('authenticated', FIXTURE_USERS.admin.id, async (client) => {
        // Insert
        const insertRes = await client.query(`
          INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
          VALUES (gen_random_uuid(), 'restaurant-media', '${adminObjectId}', '${FIXTURE_USERS.admin.id}', '{"mimetype": "image/webp"}'::jsonb)
          RETURNING name
        `)
        expect(insertRes.rows.length).toBe(1)
        expect(insertRes.rows[0].name).toBe(adminObjectId)

        // Update
        const updateRes = await client.query(`
          UPDATE storage.objects
          SET metadata = '{"mimetype": "image/webp", "size": 2048}'::jsonb
          WHERE bucket_id = 'restaurant-media' AND name = '${adminObjectId}'
          RETURNING name
        `)
        expect(updateRes.rows.length).toBe(1)

        // Delete
        await client.query(`SELECT set_config('storage.allow_delete_query', 'true', true)`)
        const deleteRes = await client.query(`
          DELETE FROM storage.objects
          WHERE bucket_id = 'restaurant-media' AND name = '${adminObjectId}'
          RETURNING name
        `)
        expect(deleteRes.rows.length).toBe(1)
      })
    })
  })
})
