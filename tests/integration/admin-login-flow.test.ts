/**
 * Tiger 345 - Admin Login Flow Integration Test Suite (F03 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * - Affected API:
 *   - Supabase Auth: POST /auth/v1/token?grant_type=password
 *   - PostgREST: GET /rest/v1/admin_profiles
 *   - Supabase Edge Functions: GET /functions/v1/admin-api/me, GET /functions/v1/admin-api/health
 * - Data Schemas:
 *   - public.admin_profiles (user_id uuid, display_name text, active boolean)
 *   - Admin identity payload { role: 'admin', userId: string, displayName: string }
 * - Verbatim Instructions:
 *   - "BƯỚC 4 — F03: ADMIN LOGIN THẬT"
 *   - "Khắc phục cơ chế authorization/RLS để admin đăng nhập thật thành công, không bị RLS chặn chính mình."
 *   - "Viết integration test đăng nhập admin thật qua Supabase client / Edge Function (không dùng service_role key để bypass auth)."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { seedFixtureUsers, FIXTURE_USERS, ANON_KEY } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'

describe('F03: Admin Login & RLS Authorization Flow', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await seedFixtureUsers(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  describe('Database RLS Policy: admin_profiles isolation', () => {
    it('blocks anonymous access to admin_profiles (returns empty or rejected)', async () => {
      const anonClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data, error } = await anonClient
        .from('admin_profiles')
        .select('user_id, active, display_name')

      // With REVOKE SELECT FROM anon, PostgREST returns permission denied or empty rows
      if (error) {
        expect(['42501', 'PGRST301']).toContain(error.code)
      } else {
        expect(data).toEqual([])
      }
    })

    it('prevents regular customer user from reading admin_profiles', async () => {
      const customerClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData, error: authError } = await customerClient.auth.signInWithPassword({
        email: FIXTURE_USERS.customerA.email,
        password: 'TestPassword123!',
      })

      expect(authError).toBeNull()
      expect(authData.user).toBeDefined()

      // Customer attempts to read admin profile (own ID and known admin ID)
      const { data: ownAdminProfile } = await customerClient
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', authData.user!.id)
        .maybeSingle()

      expect(ownAdminProfile).toBeNull()

      const { data: foreignAdminProfile } = await customerClient
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', FIXTURE_USERS.admin.id)
        .maybeSingle()

      expect(foreignAdminProfile).toBeNull()
    })
  })

  describe('Real Admin Client Login (No service_role bypass)', () => {
    it('successfully logs in active admin and reads own profile via RLS self-read', async () => {
      // Create fresh browser-like client using anon key
      const adminClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      // 1. Real password authentication through Supabase Auth
      const { data: authData, error: authError } = await adminClient.auth.signInWithPassword({
        email: FIXTURE_USERS.admin.email,
        password: 'TestPassword123!',
      })

      expect(authError).toBeNull()
      expect(authData.user).toBeDefined()
      expect(authData.session).toBeDefined()
      expect(authData.user!.id).toBe(FIXTURE_USERS.admin.id)

      // 2. Query admin_profiles directly as the authenticated client (reproducing AdminLoginPage line 49)
      const { data: profile, error: profileError } = await adminClient
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', authData.user!.id)
        .maybeSingle()

      expect(profileError).toBeNull()
      expect(profile).toBeDefined()
      expect(profile?.user_id).toBe(FIXTURE_USERS.admin.id)
      expect(profile?.active).toBe(true)
      expect(profile?.display_name).toBe(FIXTURE_USERS.admin.displayName)
    })

    it('enforces self-read: admin cannot read another admin profile row via direct PostgREST', async () => {
      const adminClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData } = await adminClient.auth.signInWithPassword({
        email: FIXTURE_USERS.admin.email,
        password: 'TestPassword123!',
      })

      expect(authData.user).toBeDefined()

      // Attempt to query disabled admin's profile
      const { data: foreignProfile } = await adminClient
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', FIXTURE_USERS.disabledAdmin.id)
        .maybeSingle()

      // RLS self-read policy (user_id = auth.uid()) ensures other rows are invisible
      expect(foreignProfile).toBeNull()
    })

    it('detects disabled admin account and permits client-side rejection with signout', async () => {
      const disabledAdminClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData, error: authError } = await disabledAdminClient.auth.signInWithPassword({
        email: FIXTURE_USERS.disabledAdmin.email,
        password: 'TestPassword123!',
      })

      expect(authError).toBeNull()
      expect(authData.user).toBeDefined()

      // Reads own profile row
      const { data: profile, error: profileError } = await disabledAdminClient
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', authData.user!.id)
        .maybeSingle()

      expect(profileError).toBeNull()
      expect(profile).toBeDefined()
      expect(profile?.user_id).toBe(FIXTURE_USERS.disabledAdmin.id)
      expect(profile?.active).toBe(false) // Account is disabled

      // Simulates AdminLoginPage logic: if (!adminProfile || !adminProfile.active) signOut()
      const isActive = Boolean(profile && profile.active)
      expect(isActive).toBe(false)

      await disabledAdminClient.auth.signOut()
    })
  })

  describe('Edge Functions Gateway Identity Verification (/functions/v1/admin-api)', () => {
    it('verifies active admin identity via GET /functions/v1/admin-api/me and /health', async () => {
      // 1. Authenticate to get real JWT access token
      const authClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData } = await authClient.auth.signInWithPassword({
        email: FIXTURE_USERS.admin.email,
        password: 'TestPassword123!',
      })

      const accessToken = authData.session!.access_token
      expect(accessToken).toBeTruthy()

      // 2. Call GET /admin-api/me via real HTTP Edge Runtime
      const meRes = await fetch(`${supabaseUrl}/functions/v1/admin-api/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      expect(meRes.status).toBe(200)
      const meJson = await meRes.json()
      expect(meJson.data.status).toBe('ok')
      expect(meJson.data.service).toBe('admin-api')
      expect(meJson.data.actor.role).toBe('admin')
      expect(meJson.data.actor.userId).toBe(FIXTURE_USERS.admin.id)
      expect(meJson.data.actor.displayName).toBe(FIXTURE_USERS.admin.displayName)

      // 3. Call GET /admin-api/health via real HTTP Edge Runtime
      const healthRes = await fetch(`${supabaseUrl}/functions/v1/admin-api/health`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      expect(healthRes.status).toBe(200)
      const healthJson = await healthRes.json()
      expect(healthJson.data.actor.role).toBe('admin')
      expect(healthJson.data.actor.userId).toBe(FIXTURE_USERS.admin.id)
    })

    it('rejects regular customer token on /functions/v1/admin-api/me with 403 FORBIDDEN', async () => {
      const authClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData } = await authClient.auth.signInWithPassword({
        email: FIXTURE_USERS.customerA.email,
        password: 'TestPassword123!',
      })

      const accessToken = authData.session!.access_token

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-api/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.error.code).toBe('FORBIDDEN')
      expect(json.error.message).toContain('Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa')
    })

    it('rejects disabled admin token on /functions/v1/admin-api/me with 403 FORBIDDEN', async () => {
      const authClient = createClient(supabaseUrl, ANON_KEY, {
        auth: { persistSession: false },
      })

      const { data: authData } = await authClient.auth.signInWithPassword({
        email: FIXTURE_USERS.disabledAdmin.email,
        password: 'TestPassword123!',
      })

      const accessToken = authData.session!.access_token

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-api/me`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.error.code).toBe('FORBIDDEN')
      expect(json.error.message).toContain('Tài khoản quản trị không tồn tại hoặc đã bị vô hiệu hóa')
    })
  })
})
