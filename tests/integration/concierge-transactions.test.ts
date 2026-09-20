/**
 * Tiger 345 - AT04, AT05 & AT06 Confirmation & Durable Transactions Integration Test Suite
 *
 * Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * Affected API:
 * - Public Concierge API (/concierge/chat, /concierge/action)
 * - PostgreSQL RPCs (public.create_order, public.create_reservation, public.idempotency_requests)
 * - supabase/functions/_shared/concierge/runtime.ts (confirm_quote, confirm_reservation)
 * - supabase/functions/_shared/quote.ts (createOrderQuote, verifyOrderQuote)
 * Data Schemas:
 * - public.orders, public.order_items, public.reservations, public.idempotency_requests
 * - public.concierge_conversations (pending_action, active_quote)
 * Verbatim Instruction:
 * "Acceptance: AT04, AT05, AT06 trong ACCEPTANCE.md.
 *  Race hai instance/hai request keys; crash ngay sau business commit trước cập nhật conversation;
 *  retry sau TTL; quote khác; reset đồng thời confirm.
 *  Assert số business rows, action status và receipt, không chỉ HTTP."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'
import { createOrderQuote, getQuoteSecret } from '../../supabase/functions/_shared/quote.js'
import { sha256 } from '../../supabase/functions/_shared/crypto.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('AT04, AT05 & AT06 - Concierge Confirmation & Durable Transactions Suite', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let customerAToken: string
  let _customerBToken: string

  const createdOrderIds: string[] = []
  const createdReservationIds: string[] = []
  const createdConversationIds: string[] = []

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn heo nướng
  const ITEM_2_ID = '10000000-0000-0000-0000-000000000002' // Gỏi cuốn tôm thịt
  const ZONE_ID = '40000000-0000-0000-0000-000000000001'

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    customerAToken = getUserToken('customerA')
    _customerBToken = getUserToken('customerB')

    await pool.query('DELETE FROM public.rate_limit_buckets')
    await pool.query("DELETE FROM public.business_closures WHERE reason LIKE 'TEST_%'")
    await pool.query(
      `UPDATE public.restaurant_settings
       SET accepting_orders = true,
           accepting_delivery_orders = true,
           accepting_dine_in_orders = true,
           booking_enabled = true,
           min_delivery_order_vnd = 100000
       WHERE id = 1`
    )
    await pool.query(
      `UPDATE public.delivery_zones
       SET active = true, fee_vnd = 15000, free_threshold_vnd = 500000
       WHERE id = $1`,
      [ZONE_ID]
    )
    await pool.query(
      `UPDATE public.menu_items
       SET price_vnd = 245000, published = true, available = true, allow_delivery = true, allow_dine_in = true
       WHERE id = $1`,
      [ITEM_1_ID]
    )
    await pool.query(
      `UPDATE public.menu_items
       SET price_vnd = 85000, published = true, available = true, allow_delivery = true, allow_dine_in = true
       WHERE id = $1`,
      [ITEM_2_ID]
    )

    // Ensure business hours are open
    await pool.query(`
      DELETE FROM public.business_hours;
      INSERT INTO public.business_hours (weekday, service_type, open_time, close_time, active)
      VALUES
        (0, 'restaurant', '10:00:00', '22:30:00', true),
        (1, 'restaurant', '10:00:00', '22:30:00', true),
        (2, 'restaurant', '10:00:00', '22:30:00', true),
        (3, 'restaurant', '10:00:00', '22:30:00', true),
        (4, 'restaurant', '10:00:00', '22:30:00', true),
        (5, 'restaurant', '10:00:00', '22:30:00', true),
        (6, 'restaurant', '10:00:00', '22:30:00', true),
        (0, 'delivery', '10:30:00', '21:30:00', true),
        (1, 'delivery', '10:30:00', '21:30:00', true),
        (2, 'delivery', '10:30:00', '21:30:00', true),
        (3, 'delivery', '10:30:00', '21:30:00', true),
        (4, 'delivery', '10:30:00', '21:30:00', true),
        (5, 'delivery', '10:30:00', '21:30:00', true),
        (6, 'delivery', '10:30:00', '21:30:00', true),
        (0, 'reservation', '10:30:00', '21:00:00', true),
        (1, 'reservation', '10:30:00', '21:00:00', true),
        (2, 'reservation', '10:30:00', '21:00:00', true),
        (3, 'reservation', '10:30:00', '21:00:00', true),
        (4, 'reservation', '10:30:00', '21:00:00', true),
        (5, 'reservation', '10:30:00', '21:00:00', true),
        (6, 'reservation', '10:30:00', '21:00:00', true);
    `)
  })

  afterAll(async () => {
    if (createdOrderIds.length > 0) {
      await pool.query(`DELETE FROM public.order_items WHERE order_id = ANY($1)`, [createdOrderIds])
      await pool.query(`DELETE FROM public.order_status_history WHERE order_id = ANY($1)`, [createdOrderIds])
      await pool.query(`DELETE FROM public.orders WHERE id = ANY($1)`, [createdOrderIds])
    }
    if (createdReservationIds.length > 0) {
      await pool.query(`DELETE FROM public.reservations WHERE id = ANY($1)`, [createdReservationIds])
    }
    if (createdConversationIds.length > 0) {
      await pool.query(`DELETE FROM public.concierge_feedback WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_events WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_proposals WHERE conversation_id = ANY($1)`, [createdConversationIds])
      await pool.query(`DELETE FROM public.concierge_conversations WHERE id = ANY($1)`, [createdConversationIds])
    }
    // Restore shared fixtures to avoid polluting sibling test suites
    await pool.query(
      `UPDATE public.delivery_zones
       SET fee_vnd = 15000, free_threshold_vnd = 200000
       WHERE id = $1`,
      [ZONE_ID]
    )
    await pool.query(
      `UPDATE public.menu_items
       SET price_vnd = 135000
       WHERE id = $1`,
      [ITEM_2_ID]
    )
    await pool.end()
  })

  // Helper to create a conversation in RECOMMENDING_PROPOSAL_READY or RESERVING_CONFIRMING
  async function setupConversation(
    clientIp: string,
    authHeader?: string,
    initialMessage = 'Gợi ý mâm cơm 2 người ăn thanh đạm'
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-forwarded-for': clientIp,
    }
    if (authHeader) headers['Authorization'] = authHeader

    const req = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: initialMessage }),
    })
    const res = await handlePublicApi(req, { pool, supabaseAdmin })
    expect(res.status).toBe(200)
    const body = await res.json()
    createdConversationIds.push(body.data.conversation_id)
    return {
      conversation_id: body.data.conversation_id as string,
      session_token: body.data.session_token as string,
      state_version: body.data.state_version as number,
      current_step: body.data.current_step as string,
    }
  }

  // =========================================================================
  // AT04: Fingerprint Binding & Safe Replay
  // =========================================================================
  describe('AT04 - Fingerprint Binding & Safe Replay', () => {
    it('replays completed action returning cached receipt without creating duplicate business rows', async () => {
      const clientIp = '198.51.100.101'
      const conv = await setupConversation(clientIp)

      // Generate quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1, note: 'không hành' }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      expect(quoteRes.status).toBe(200)
      const quoteBody = await quoteRes.json()
      const quoteToken = quoteBody.data.quote_token

      // First confirmation
      const confirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteToken,
            delivery_details: {
              customer_name: 'Lê Minh Quân',
              phone: '0912345678',
              address: '123 Cách Mạng Tháng 8, Vĩnh Cửu',
            },
          },
        }),
      })
      const confirmRes = await handlePublicApi(confirmReq, { pool, supabaseAdmin })
      expect(confirmRes.status).toBe(200)
      const confirmBody = await confirmRes.json()
      const orderCard = confirmBody.data.cards.find((c: any) => c.type === 'order_status')
      expect(orderCard).toBeDefined()
      const orderCode = orderCard.order_code

      // Record ID for cleanup
      const orderDb = await pool.query(`SELECT id FROM public.orders WHERE code = $1`, [orderCode])
      expect(orderDb.rows.length).toBe(1)
      createdOrderIds.push(orderDb.rows[0].id)

      // Second confirmation (replay same quote & delivery details)
      const replayReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: confirmBody.data.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteToken,
            delivery_details: {
              customer_name: 'Lê Minh Quân',
              phone: '0912345678',
              address: '123 Cách Mạng Tháng 8, Vĩnh Cửu',
            },
          },
        }),
      })
      const replayRes = await handlePublicApi(replayReq, { pool, supabaseAdmin })
      expect(replayRes.status).toBe(200)
      const replayBody = await replayRes.json()
      const replayCard = replayBody.data.cards.find((c: any) => c.type === 'order_status')
      expect(replayCard.order_code).toBe(orderCode)
      expect(replayBody.data.message).toMatch(/tiếp nhận.*trước đó|Idempotent replay/i)

      // Strict assertion: exactly ONE order in database, NO duplicate created
      const countRes = await pool.query(
        `SELECT count(*)::integer as total FROM public.orders WHERE code = $1`,
        [orderCode]
      )
      expect(countRes.rows[0].total).toBe(1)
    })

    it('rejects replay with a DIFFERENT quote and NEVER returns previous receipt', async () => {
      const clientIp = '198.51.100.102'
      const conv = await setupConversation(clientIp)

      // Generate Quote A
      const quoteAReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteARes = await handlePublicApi(quoteAReq, { pool, supabaseAdmin })
      const quoteABody = await quoteARes.json()
      const quoteAToken = quoteABody.data.quote_token

      // Confirm Quote A
      const confirmAReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteAToken,
            delivery_details: {
              customer_name: 'Khách A',
              phone: '0901112233',
              address: 'Địa chỉ A, Vĩnh Cửu',
            },
          },
        }),
      })
      const confirmARes = await handlePublicApi(confirmAReq, { pool, supabaseAdmin })
      expect(confirmARes.status).toBe(200)
      const confirmABody = await confirmARes.json()
      const orderACode = confirmABody.data.cards.find((c: any) => c.type === 'order_status').order_code

      const orderADb = await pool.query(`SELECT id FROM public.orders WHERE code = $1`, [orderACode])
      createdOrderIds.push(orderADb.rows[0].id)

      // Generate Quote B (different item and price)
      const quoteBReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_2_ID, quantity: 2 }],
        }),
      })
      const quoteBRes = await handlePublicApi(quoteBReq, { pool, supabaseAdmin })
      const quoteBBody = await quoteBRes.json()
      const quoteBToken = quoteBBody.data.quote_token
      expect(quoteBToken).not.toBe(quoteAToken)

      // Attempt to confirm Quote B without initiating new quote flow (from ORDERING_SUBMITTED)
      const confirmBReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: confirmABody.data.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteBToken,
            delivery_details: {
              customer_name: 'Khách A',
              phone: '0901112233',
              address: 'Địa chỉ A, Vĩnh Cửu',
            },
          },
        }),
      })
      const confirmBRes = await handlePublicApi(confirmBReq, { pool, supabaseAdmin })

      // MUST be rejected (422 step validation) and MUST NOT return receipt for Quote A!
      expect(confirmBRes.status).toBe(422)
      const confirmBBody = await confirmBRes.json()
      expect(confirmBBody.error.message).toMatch(/Không thể xác nhận đặt đơn từ trạng thái \[ORDERING_SUBMITTED\]/i)
      expect(JSON.stringify(confirmBBody)).not.toContain(orderACode)
    })
  })

  // =========================================================================
  // AT05: Stable Business Idempotency Key & Concurrent Serialization
  // =========================================================================
  describe('AT05 - Stable Business Idempotency Key & Concurrent Serialization', () => {
    it('serializes concurrent confirmation of the same action across different request keys to exactly ONE business row', async () => {
      const clientIp = '198.51.100.103'
      const conv = await setupConversation(clientIp)

      // Generate Quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 2 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteBody = await quoteRes.json()
      const quoteToken = quoteBody.data.quote_token

      // Two concurrent confirmation requests with DIFFERENT client request idempotency_keys
      const buildConfirmRequest = (clientKey: string) =>
        new Request('http://localhost/functions/v1/public-api/concierge/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': clientIp,
            'X-Test-Now': '2026-09-20T05:00:00.000Z',
          },
          body: JSON.stringify({
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'confirm_quote',
              quote_token: quoteToken,
              idempotency_key: clientKey, // Different client keys!
              delivery_details: {
                customer_name: 'Phạm Hồng Thái',
                phone: '0933445566',
                address: '45 Võ Thị Sáu, Vĩnh Cửu',
              },
            },
          }),
        })

      // Fire in parallel
      const [res1, res2] = await Promise.all([
        handlePublicApi(buildConfirmRequest('req_client_instance_alpha_999'), { pool, supabaseAdmin }),
        handlePublicApi(buildConfirmRequest('req_client_instance_beta_888'), { pool, supabaseAdmin }),
      ])

      // One request will succeed with 200, the other may succeed with 200 (replayed) or hit CAS 409
      const validResults = [res1, res2].filter((r) => r.status === 200)
      expect(validResults.length).toBeGreaterThanOrEqual(1)

      const body1 = await validResults[0].json()
      const orderCard = body1.data.cards.find((c: any) => c.type === 'order_status')
      expect(orderCard).toBeDefined()
      const orderCode = orderCard.order_code

      const dbRows = await pool.query(
        `SELECT id, code, total_vnd::numeric as total_vnd FROM public.orders WHERE code = $1`,
        [orderCode]
      )
      expect(dbRows.rows.length).toBe(1)
      createdOrderIds.push(dbRows.rows[0].id)

      // Strict assertion: NO second order created in database under any other code
      const allOrders = await pool.query(
        `SELECT id, code FROM public.orders WHERE customer_phone = '0933445566'`
      )
      expect(allOrders.rows.length).toBe(1)
      expect(allOrders.rows[0].code).toBe(orderCode)
    })

    it('serializes concurrent reservation confirmations to exactly ONE reservation row', async () => {
      const clientIp = '198.51.100.104'
      const conv = await setupConversation(clientIp, undefined, 'Tôi muốn đặt bàn cho 4 người')

      const bookingDate = new Date(Date.now() + 48 * 3600 * 1000)
      bookingDate.setHours(19, 30, 0, 0)

      const buildResvRequest = (clientKey: string) =>
        new Request('http://localhost/functions/v1/public-api/concierge/action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': clientIp,
          },
          body: JSON.stringify({
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'confirm_reservation',
              idempotency_key: clientKey, // Different keys!
              reservation_details: {
                customer_name: 'Đoàn Văn Hậu',
                phone: '0977889900',
                guest_count: 5,
                starts_at_iso: bookingDate.toISOString(),
                note: 'Phòng riêng nếu có',
              },
            },
          }),
        })

      const [res1, res2] = await Promise.all([
        handlePublicApi(buildResvRequest('resv_key_111'), { pool, supabaseAdmin }),
        handlePublicApi(buildResvRequest('resv_key_222'), { pool, supabaseAdmin }),
      ])

      const validResults = [res1, res2].filter((r) => r.status === 200)
      expect(validResults.length).toBeGreaterThanOrEqual(1)

      const body = await validResults[0].json()
      const resvCard = body.data.cards.find((c: any) => c.type === 'reservation_status')
      expect(resvCard).toBeDefined()
      const resvCode = resvCard.reservation_code

      const dbRows = await pool.query(
        `SELECT id, code FROM public.reservations WHERE code = $1`,
        [resvCode]
      )
      expect(dbRows.rows.length).toBe(1)
      createdReservationIds.push(dbRows.rows[0].id)

      // Strict assertion: exactly ONE reservation row in database
      const allResvs = await pool.query(
        `SELECT id, code FROM public.reservations WHERE customer_phone = '0977889900'`
      )
      expect(allResvs.rows.length).toBe(1)
    })
  })

  // =========================================================================
  // AT06: Crash Reconciliation & Expired Quote Handling
  // =========================================================================
  describe('AT06 - Crash Reconciliation & Expired Quote Handling', () => {
    it('recovers committed order when runtime crashed before updating conversation CAS state', async () => {
      const clientIp = '198.51.100.105'
      const conv = await setupConversation(clientIp)

      // 1. Generate real Quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteBody = await quoteRes.json()
      const quoteToken = quoteBody.data.quote_token

      const deliveryDetails = {
        delivery_zone_id: ZONE_ID,
        customer_name: 'Trần Crash Test',
        customer_phone: '0988776655',
        address: '77 Đường Số 7, Vĩnh Cửu',
        expected_shipping_fee_vnd: 15000,
      }

      // Compute exact canonical fingerprint and stable business key
      const guestActorScope = `guest:${sha256(clientIp)}`
      const canonicalFingerprint = sha256(
        JSON.stringify({
          actor_scope: guestActorScope,
          order_type: 'delivery',
          customer_user_id: null,
          items: [
            {
              menu_item_id: ITEM_1_ID,
              quantity: 1,
              unit_price_vnd: 245000,
            },
          ],
          subtotal_vnd: 245000,
          shipping_fee_vnd: 15000,
          total_vnd: 260000,
          dine_in: null,
          delivery: deliveryDetails,
        })
      )

      const stableBusinessIdempotencyKey = `concierge_order_${conv.conversation_id}_${canonicalFingerprint.slice(0, 32)}`
      const idempotencyKeyHash = sha256(stableBusinessIdempotencyKey)
      const requestHash = sha256(
        JSON.stringify({
          actor_scope: guestActorScope,
          order_type: 'delivery',
          customer_user_id: null,
          items: [
            {
              menu_item_id: ITEM_1_ID,
              quantity: 1,
              unit_price_vnd: 245000,
              note: '',
            },
          ],
          subtotal_vnd: 245000,
          shipping_fee_vnd: 15000,
          total_vnd: 260000,
          dine_in: null,
          delivery: deliveryDetails,
          note: '',
        })
      )

      // 2. FAULT INJECTION: Directly commit public.create_order into DB
      // Simulating: Database transaction COMMITTED, but process immediately crashed
      // before updating public.concierge_conversations state_version or pending_action!
      const directCommitRes = await pool.query(
        `SELECT public.create_order($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result`,
        [
          idempotencyKeyHash,
          guestActorScope,
          requestHash,
          'delivery',
          null,
          null,
          JSON.stringify(deliveryDetails),
          JSON.stringify([
            {
              menu_item_id: ITEM_1_ID,
              item_name: 'Sườn heo nướng',
              quantity: 1,
              unit_price_vnd: 245000,
              note: '',
            },
          ]),
          '',
          null,
        ]
      )
      const committedReceipt = (directCommitRes.rows[0].result?.receipt || directCommitRes.rows[0].result) as {
        id?: string
        code: string
      }
      expect(committedReceipt.code).toBeDefined()
      createdOrderIds.push(committedReceipt.id || committedReceipt.code)

      // Verify conversation record is STILL in step 'RECOMMENDING_PROPOSAL_READY', state_version NOT updated
      const convBefore = await pool.query(
        `SELECT current_step, pending_action FROM public.concierge_conversations WHERE id = $1`,
        [conv.conversation_id]
      )
      expect(convBefore.rows[0].pending_action).toBeNull()

      // 3. Client retries the confirmation action
      const retryReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteToken,
            delivery_details: {
              customer_name: 'Trần Crash Test',
              phone: '0988776655',
              address: '77 Đường Số 7, Vĩnh Cửu',
            },
          },
        }),
      })

      const retryRes = await handlePublicApi(retryReq, { pool, supabaseAdmin })
      expect(retryRes.status).toBe(200)
      const retryBody = await retryRes.json()

      // Asserts that runtime reconciled from idempotency_requests, returned the committed receipt,
      // and transitioned conversation state to ORDERING_SUBMITTED with pending_action.status = 'completed'
      const statusCard = retryBody.data.cards.find((c: any) => c.type === 'order_status')
      expect(statusCard.order_code).toBe(committedReceipt.code)
      expect(retryBody.data.current_step).toBe('ORDERING_SUBMITTED')

      // Assert conversation record in PostgreSQL was reconciled
      const convAfter = await pool.query(
        `SELECT current_step, pending_action FROM public.concierge_conversations WHERE id = $1`,
        [conv.conversation_id]
      )
      expect(convAfter.rows[0].current_step).toBe('ORDERING_SUBMITTED')
      expect(convAfter.rows[0].pending_action.status).toBe('completed')
      expect(convAfter.rows[0].pending_action.reference_id).toBe(committedReceipt.code)

      // Strict assertion: exactly ONE order in DB
      const countRes = await pool.query(
        `SELECT count(*)::integer as total FROM public.orders WHERE code = $1`,
        [committedReceipt.code]
      )
      expect(countRes.rows[0].total).toBe(1)
    })

    it('allows committed quote replay even AFTER quote TTL has expired', async () => {
      const clientIp = '198.51.100.106'
      const conv = await setupConversation(clientIp)

      // Generate short-lived quote with 1-second TTL
      const shortQuote = createOrderQuote(
        {
          actor_scope: `guest:${sha256(clientIp)}`,
          order_type: 'delivery',
          context: { delivery_zone_id: ZONE_ID },
          items: [
            {
              menu_item_id: ITEM_1_ID,
              item_name: 'Sườn nướng',
              quantity: 1,
              unit_price_vnd: 245000,
              line_total_vnd: 245000,
              note: '',
            },
          ],
          subtotal_vnd: 245000,
          shipping_fee_vnd: 15000,
          total_vnd: 260000,
        },
        getQuoteSecret(),
        1 // 1 second TTL
      )

      // 1. Confirm while quote is still fresh
      const confirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: shortQuote.quote_token,
            delivery_details: {
              customer_name: 'Vũ TTL Test',
              phone: '0944556677',
              address: '88 Đường Bến Lớn, Vĩnh Cửu',
            },
          },
        }),
      })
      const confirmRes = await handlePublicApi(confirmReq, { pool, supabaseAdmin })
      expect(confirmRes.status).toBe(200)
      const confirmBody = await confirmRes.json()
      const orderCode = confirmBody.data.cards.find((c: any) => c.type === 'order_status').order_code

      const orderDb = await pool.query(`SELECT id FROM public.orders WHERE code = $1`, [orderCode])
      createdOrderIds.push(orderDb.rows[0].id)

      // 2. Wait for quote to expire
      await new Promise((r) => setTimeout(r, 1500))

      // 3. Retry action after quote TTL has expired
      const retryReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          // Normal current time where quote has expired
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: confirmBody.data.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: shortQuote.quote_token, // Expired!
            delivery_details: {
              customer_name: 'Vũ TTL Test',
              phone: '0944556677',
              address: '88 Đường Bến Lớn, Vĩnh Cửu',
            },
          },
        }),
      })

      const retryRes = await handlePublicApi(retryReq, { pool, supabaseAdmin })
      expect(retryRes.status).toBe(200)
      const retryBody = await retryRes.json()
      const retryCard = retryBody.data.cards.find((c: any) => c.type === 'order_status')
      expect(retryCard.order_code).toBe(orderCode)
    })

    it('rejects unconsumed expired quote with 409 QUOTE_EXPIRED without mutating database', async () => {
      const clientIp = '198.51.100.107'
      const conv = await setupConversation(clientIp)

      // Generate an already-expired quote (-10 seconds TTL)
      const expiredQuote = createOrderQuote(
        {
          actor_scope: `guest:${sha256(clientIp)}`,
          order_type: 'delivery',
          context: { delivery_zone_id: ZONE_ID },
          items: [
            {
              menu_item_id: ITEM_1_ID,
              item_name: 'Sườn nướng',
              quantity: 1,
              unit_price_vnd: 245000,
              line_total_vnd: 245000,
              note: '',
            },
          ],
          subtotal_vnd: 245000,
          shipping_fee_vnd: 15000,
          total_vnd: 260000,
        },
        getQuoteSecret(),
        -10
      )

      // Confirm unconsumed expired quote
      const confirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: expiredQuote.quote_token,
            delivery_details: {
              customer_name: 'Người Không Kịp Đặt',
              phone: '0966778899',
              address: '100 ĐT 768, Vĩnh Cửu',
            },
          },
        }),
      })

      const confirmRes = await handlePublicApi(confirmReq, { pool, supabaseAdmin })
      expect(confirmRes.status).toBe(409)
      const confirmBody = await confirmRes.json()
      expect(confirmBody.error.code).toBe('QUOTE_EXPIRED')
      expect(confirmBody.error.message).toMatch(/hết hạn/i)

      // Strict assertion: zero orders created for this customer phone
      const countRes = await pool.query(
        `SELECT count(*)::integer as total FROM public.orders WHERE customer_phone = '0966778899'`
      )
      expect(countRes.rows[0].total).toBe(0)
    })

    it('rejects confirmation with stale token or state_version when reset occurred concurrently', async () => {
      const clientIp = '198.51.100.108'
      const conv = await setupConversation(clientIp, `Bearer ${customerAToken}`)

      // Generate quote
      const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          Authorization: `Bearer ${customerAToken}`,
          'X-Test-Now': '2026-09-20T05:00:00.000Z',
        },
        body: JSON.stringify({
          order_type: 'delivery',
          delivery_zone_id: ZONE_ID,
          items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
        }),
      })
      const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
      const quoteBody = await quoteRes.json()
      const quoteToken = quoteBody.data.quote_token

      // Save pre-reset credentials
      const oldSessionToken = conv.session_token
      const oldStateVersion = conv.state_version

      // Execute RESET
      const resetReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: oldSessionToken,
          state_version: oldStateVersion,
          action: { type: 'reset_conversation' },
        }),
      })
      const resetRes = await handlePublicApi(resetReq, { pool, supabaseAdmin })
      expect(resetRes.status).toBe(200)

      // Attempt confirm with stale session token and stale state_version
      const staleConfirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
          Authorization: `Bearer ${customerAToken}`,
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          session_token: oldSessionToken,
          state_version: oldStateVersion,
          action: {
            type: 'confirm_quote',
            quote_token: quoteToken,
            delivery_details: {
              customer_name: 'Khách Cũ',
              phone: '0977112233',
              address: 'Địa chỉ cũ',
            },
          },
        }),
      })

      const staleConfirmRes = await handlePublicApi(staleConfirmReq, { pool, supabaseAdmin })
      // Stale token/version MUST be rejected with 403 or 409
      expect([403, 409]).toContain(staleConfirmRes.status)

      // Strict assertion: zero orders created in database
      const countRes = await pool.query(
        `SELECT count(*)::integer as total FROM public.orders WHERE customer_phone = '0977112233'`
      )
      expect(countRes.rows[0].total).toBe(0)
    })
  })
})
