/**
 * Tiger 345 - Test Auth Users Fixtures & Seed Helper
 *
 * Importers/Callers:
 * - tests/integration/*.test.ts
 *
 * Affected API:
 * - seedFixtureUsers: seeds fixture customer/admin accounts into auth.users and profile tables
 *
 * Data Schemas:
 * - auth.users, public.customer_profiles, public.admin_profiles
 *
 * Verbatim Instruction:
 * "Tạo guard và DB test cô lập có marker định danh; từ chối target chưa xác minh trước mutation."
 */

import crypto from 'node:crypto'
import pg from 'pg'
import { assertIsolatedTestDatabase } from './test-db-guard.js'

export const JWT_SECRET =
  process.env.JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long'

export const ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const FIXTURE_USERS = {
  customerA: {
    id: 'a0000000-0000-0000-0000-000000000001',
    email: 'customera@example.com',
    displayName: 'Khách Hàng A',
    phone: '0911000001',
  },
  customerB: {
    id: 'b0000000-0000-0000-0000-000000000002',
    email: 'customerb@example.com',
    displayName: 'Khách Hàng B',
    phone: '0922000002',
  },
  customerDelete: {
    id: 'c0000000-0000-0000-0000-000000000099',
    email: 'customer_delete_test@tiger345.vn',
    displayName: 'Khách Hàng Xóa Test',
    phone: '0988776655',
  },
  admin: {
    id: 'ad000000-0000-0000-0000-000000000001',
    email: 'admin_active@tiger345.vn',
    displayName: 'Bếp Trưởng Admin',
    active: true,
  },
  disabledAdmin: {
    id: 'ad000000-0000-0000-0000-000000000002',
    email: 'admin_disabled@tiger345.vn',
    displayName: 'Cựu Quản Lý',
    active: false,
  },
} as const

export const ADMIN_ACTIVE_EMAIL = FIXTURE_USERS.admin.email
export const ADMIN_PASSWORD = 'TestPassword123!'

export function createJwtToken(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const b64Url = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')
  const content = `${b64Url(header)}.${b64Url(payload)}`
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(content)
    .digest('base64url')
  return `${content}.${signature}`
}

export function getUserToken(userKey: keyof typeof FIXTURE_USERS): string {
  const user = FIXTURE_USERS[userKey]
  const now = Math.floor(Date.now() / 1000)
  return createJwtToken({
    aud: 'authenticated',
    role: 'authenticated',
    sub: user.id,
    email: user.email,
    exp: now + 3600 * 24,
    iss: 'supabase-demo',
  })
}

/**
 * Ensures fixture users exist in auth.users and public tables
 */
export async function seedFixtureUsers(pool: pg.Pool): Promise<void> {
  // AT01 Guard: Verify target database is isolated test database before any write/mutation
  await assertIsolatedTestDatabase(pool)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const [, user] of Object.entries(FIXTURE_USERS)) {
      // Upsert into auth.users
      await client.query(
        `INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          confirmation_token,
          recovery_token,
          email_change_token_new,
          email_change,
          created_at,
          updated_at
        ) VALUES (
          '00000000-0000-0000-0000-000000000000',
          $1,
          'authenticated',
          'authenticated',
          $2,
          crypt('TestPassword123!', gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          jsonb_build_object('full_name', $3::text),
          '',
          '',
          '',
          '',
          now(),
          now()
        )
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            raw_user_meta_data = EXCLUDED.raw_user_meta_data,
            updated_at = now()`,
        [user.id, user.email, user.displayName]
      )

      if ('active' in user) {
        // Admin user
        await client.query(
          `INSERT INTO public.admin_profiles (user_id, display_name, active)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               active = EXCLUDED.active,
               updated_at = now()`,
          [user.id, user.displayName, user.active]
        )
      } else {
        // Customer user
        await client.query(
          `INSERT INTO public.customer_profiles (user_id, display_name, phone)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               phone = EXCLUDED.phone,
               updated_at = now()`,
          [user.id, user.displayName, user.phone]
        )
      }
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
