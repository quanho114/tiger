/**
 * Tiger 345 - AT02 & AT03 State and Session Integration Test Suite
 *
 * Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * Affected API:
 * - Public Concierge API (/concierge/chat, /concierge/action)
 * - supabase/functions/_shared/concierge/persistence.ts (getConversationRecord, updateConversationCasRecord)
 * - supabase/functions/_shared/concierge/state-machine.ts (getOrCreateConversationAsync, resetConversationStateAsync)
 * Data Schemas:
 * - public.concierge_conversations
 * - public.concierge_events
 * - public.concierge_proposals
 * Verbatim Instruction:
 * "Acceptance: AT02, AT03 trong ACCEPTANCE.md.
 *  Hai instance cùng version chỉ một write thành công; đọc qua instance mới thấy state;
 *  DB down không success; token cũ sau reset và cross-user đều bị từ chối."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'
import { getConversationRecord } from '../../supabase/functions/_shared/concierge/persistence.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('AT02 & AT03 - Concierge State & Session Verification Suite', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let customerAToken: string
  let customerBToken: string

  const createdConversationIds: string[] = []

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    customerAToken = getUserToken('customerA')
    customerBToken = getUserToken('customerB')

    await pool.query('DELETE FROM public.rate_limit_buckets')
  })

  afterAll(async () => {
    if (createdConversationIds.length > 0) {
      await pool.query(`DELETE FROM public.concierge_feedback WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_events WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_proposals WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_conversations WHERE id = ANY($1)`, [createdConversationIds])
    }
    await pool.end()
  })

  // =========================================================================
  // AT02: State Persistence, Atomic CAS & Fail Closed
  // =========================================================================
  describe('AT02 - State Persistence, Atomic CAS and Fail Closed', () => {
    it('persists conversation state to PostgreSQL and allows fresh process to read accurate version', async () => {
      const clientIp = '198.51.100.10'

      // Instance 1 creates conversation
      const req1 = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ message: 'Xin chào quán' }),
      })
      const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
      expect(res1.status).toBe(200)
      const body1 = await res1.json()
      const convId = body1.data.conversation_id
      const sessionToken = body1.data.session_token
      const version1 = body1.data.state_version
      createdConversationIds.push(convId)

      // Fresh direct DB read (simulating separate worker/instance)
      const stateFromDb = await getConversationRecord(pool, convId)
      expect(stateFromDb).not.toBeNull()
      expect(stateFromDb?.conversation_id).toBe(convId)
      expect(stateFromDb?.session_token).toBe(sessionToken)
      expect(stateFromDb?.state_version).toBe(version1)
    })

    it('enforces atomic CAS: two concurrent writes on same state_version results in exactly one success and one 409 conflict', async () => {
      const clientIp = '198.51.100.11'

      const reqInit = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ message: 'Gợi ý món ăn' }),
      })
      const resInit = await handlePublicApi(reqInit, { pool, supabaseAdmin })
      const bodyInit = await resInit.json()
      const convId = bodyInit.data.conversation_id
      const sessionToken = bodyInit.data.session_token
      const currentVersion = bodyInit.data.state_version
      createdConversationIds.push(convId)

      // Concurrent conflicting turns on same state_version
      const sendTurn = (msg: string) =>
        new Request('http://localhost/functions/v1/public-api/concierge/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': clientIp,
          },
          body: JSON.stringify({
            conversation_id: convId,
            session_token: sessionToken,
            state_version: currentVersion,
            message: msg,
          }),
        })

      const [resA, resB] = await Promise.all([
        handlePublicApi(sendTurn('Nhánh A'), { pool, supabaseAdmin }),
        handlePublicApi(sendTurn('Nhánh B'), { pool, supabaseAdmin }),
      ])

      const statuses = [resA.status, resB.status].sort()
      expect(statuses).toEqual([200, 409])

      const conflictRes = resA.status === 409 ? resA : resB
      const conflictBody = await conflictRes.json()
      expect(conflictBody.error.code).toBe('CONCIERGE_STATE_CONFLICT')
    })

    it('fails closed when database is unavailable instead of falling back to RAM success', async () => {
      // Create a broken mock pool where query throws database connection error
      const brokenPool = {
        query: async () => {
          throw new Error('Connection terminated unexpectedly')
        },
      } as unknown as pg.Pool

      // Verify getConversationRecord throws directly without RAM fallback
      await expect(getConversationRecord(brokenPool, 'some-conv-id')).rejects.toThrow(
        'Connection terminated unexpectedly'
      )

      // Verify handlePublicApi returns 500 when DB query fails instead of fake 200
      const req = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.12',
        },
        body: JSON.stringify({ message: 'Thử nghiệm lỗi DB' }),
      })

      const res = await handlePublicApi(req, { pool: brokenPool, supabaseAdmin })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error).toBeDefined()
    })
  })

  // =========================================================================
  // AT03: Ownership, Guest Upgrade, Token Rotation & Reset
  // =========================================================================
  describe('AT03 - Ownership, Guest Upgrade, Token Rotation and Reset', () => {
    it('denies cross-user access: User B cannot access or mutate User A conversation', async () => {
      const clientIp = '198.51.100.20'

      // 1. User A creates conversation
      const reqA = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({ message: 'Tư vấn tiệc sinh nhật' }),
      })
      const resA = await handlePublicApi(reqA, { pool, supabaseAdmin })
      expect(resA.status).toBe(200)
      const bodyA = await resA.json()
      const convId = bodyA.data.conversation_id
      const tokenA = bodyA.data.session_token
      const versionA = bodyA.data.state_version
      createdConversationIds.push(convId)

      // 2. User B tries to access User A's conversation
      const reqB = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.21',
          Authorization: `Bearer ${customerBToken}`,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: tokenA,
          state_version: versionA,
          message: 'Tấn công cross-user',
        }),
      })
      const resB = await handlePublicApi(reqB, { pool, supabaseAdmin })
      expect(resB.status).toBe(403)
      const bodyB = await resB.json()
      expect(bodyB.error.message).toMatch(/người dùng khác/i)

      // 3. Unauthenticated guest tries to access User A's conversation
      const reqGuest = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': '198.51.100.22',
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: tokenA,
          state_version: versionA,
          message: 'Guest đọc trộm',
        }),
      })
      const resGuest = await handlePublicApi(reqGuest, { pool, supabaseAdmin })
      expect(resGuest.status).toBe(403)
      const bodyGuest = await resGuest.json()
      expect(bodyGuest.error.message).toMatch(/yêu cầu đăng nhập/i)
    })

    it('upgrades guest conversation to authenticated user when valid token is presented, and binds customer_user_id', async () => {
      const clientIp = '198.51.100.30'

      // 1. Guest creates conversation
      const guestReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ message: 'Tôi là khách vãng lai' }),
      })
      const guestRes = await handlePublicApi(guestReq, { pool, supabaseAdmin })
      expect(guestRes.status).toBe(200)
      const guestBody = await guestRes.json()
      const convId = guestBody.data.conversation_id
      const sessionToken = guestBody.data.session_token
      const version = guestBody.data.state_version
      createdConversationIds.push(convId)

      // 2. User A logs in and continues the guest conversation (upgrade)
      const upgradeReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: sessionToken,
          state_version: version,
          message: 'Tôi vừa đăng nhập tài khoản',
        }),
      })
      const upgradeRes = await handlePublicApi(upgradeReq, { pool, supabaseAdmin })
      expect(upgradeRes.status).toBe(200)

      // 3. Verify in PostgreSQL that customer_user_id is now bound
      const convDb = await pool.query(
        `SELECT customer_user_id FROM public.concierge_conversations WHERE id = $1`,
        [convId]
      )
      expect(convDb.rows[0].customer_user_id).toBeDefined()
      expect(convDb.rows[0].customer_user_id).not.toBeNull()

      // 4. Now, unauthenticated guest can NO LONGER access this upgraded conversation
      const unauthReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: sessionToken,
          state_version: version + 1,
          message: 'Guest muốn truy cập lại',
        }),
      })
      const unauthRes = await handlePublicApi(unauthReq, { pool, supabaseAdmin })
      expect(unauthRes.status).toBe(403)
    })

    it('rotates session token on reset, invalidates old token, clears pending action, and persists to PostgreSQL', async () => {
      const clientIp = '198.51.100.40'

      // 1. Create conversation
      const initReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({ message: 'Tư vấn món ăn' }),
      })
      const initRes = await handlePublicApi(initReq, { pool, supabaseAdmin })
      const initBody = await initRes.json()
      const convId = initBody.data.conversation_id
      const oldToken = initBody.data.session_token
      const oldVersion = initBody.data.state_version
      createdConversationIds.push(convId)

      // 2. Perform reset action
      const resetReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: oldToken,
          state_version: oldVersion,
          action: { type: 'reset_conversation' },
        }),
      })
      const resetRes = await handlePublicApi(resetReq, { pool, supabaseAdmin })
      expect(resetRes.status).toBe(200)
      const resetBody = await resetRes.json()
      const newToken = resetBody.data.session_token
      const newVersion = resetBody.data.state_version

      // Token MUST rotate and version MUST increment
      expect(newToken).not.toBe(oldToken)
      expect(newVersion).toBe(oldVersion + 1)
      expect(resetBody.data.current_step).toBe('IDLE')

      // Verify PostgreSQL state: session_token must be updated to newToken, pending_action must be null
      const dbCheck = await pool.query(
        `SELECT session_token, state_version, pending_action, active_proposal_id
         FROM public.concierge_conversations
         WHERE id = $1`,
        [convId]
      )
      expect(dbCheck.rows[0].session_token).toBe(newToken)
      expect(dbCheck.rows[0].state_version).toBe(newVersion)
      expect(dbCheck.rows[0].pending_action).toBeNull()
      expect(dbCheck.rows[0].active_proposal_id).toBeNull()

      // 3. Attempting to continue using OLD token must be rejected with 403 FORBIDDEN
      const oldTokenReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: oldToken, // OLD ROTATED TOKEN
          state_version: newVersion,
          message: 'Gửi tin nhắn với token cũ',
        }),
      })
      const oldTokenRes = await handlePublicApi(oldTokenReq, { pool, supabaseAdmin })
      expect(oldTokenRes.status).toBe(403)
      const oldTokenBody = await oldTokenRes.json()
      expect(oldTokenBody.error.message).toMatch(/Mã phiên trò chuyện không hợp lệ/i)

      // 4. Attempting to continue using OLD state_version must be rejected with 409 CONFLICT
      const oldVersionReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: newToken,
          state_version: oldVersion, // OLD VERSION
          message: 'Gửi tin nhắn với version cũ',
        }),
      })
      const oldVersionRes = await handlePublicApi(oldVersionReq, { pool, supabaseAdmin })
      expect(oldVersionRes.status).toBe(409)
      const oldVersionBody = await oldVersionRes.json()
      expect(oldVersionBody.error.code).toBe('CONCIERGE_STATE_CONFLICT')

      // 5. Continuing with NEW token and NEW version succeeds
      const validReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: newToken,
          state_version: newVersion,
          message: 'Bắt đầu cuộc trò chuyện mới',
        }),
      })
      const validRes = await handlePublicApi(validReq, { pool, supabaseAdmin })
      expect(validRes.status).toBe(200)

      // 6. Verify reset audit event is recorded in public.concierge_events
      const eventCheck = await pool.query(
        `SELECT action_type, state_version_before, state_version_after
         FROM public.concierge_events
         WHERE conversation_id = $1 AND action_type = 'reset_conversation'`,
        [convId]
      )
      expect(eventCheck.rows.length).toBeGreaterThan(0)
      expect(eventCheck.rows[0].state_version_before).toBe(oldVersion)
      expect(eventCheck.rows[0].state_version_after).toBe(newVersion)
    })
  })
})
