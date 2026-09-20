/**
 * Tiger 345 - Concierge Workflow Integration Test Suite
 *
 * Importers/Callers: Executed by Vitest runner via vitest.integration.config.ts (npm run test:integration)
 * Affected API: Public Concierge API (/concierge/chat, /concierge/action) connected to live PostgreSQL
 * Data Schemas: ConciergeRequestPayload, ConciergeResponseEnvelope, public.orders, public.reservations
 * Verbatim Instruction:
 * "Regression bắt buộc:
 * - Quote của actor khác bị từ chối.
 * - Reservation ngày 01/01/2000 hoặc -4 khách bị từ chối.
 * - Khi service tạo giao dịch lỗi, không trả SUBMITTED/CONFIRMED/PENDING thành công.
 * - Giao dịch thành công có bản ghi thật trong database và đọc lại được qua service/status endpoint.
 * - Retry cùng hành động không tạo bản ghi thứ hai."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { handlePublicApi } from '../../supabase/functions/public-api/index.js'
import { handleAdminApi } from '../../supabase/functions/admin-api/index.js'
import { seedFixtureUsers, getUserToken } from '../fixtures/auth-users.js'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

describe('Concierge Live Database Transaction Integration Suite', () => {
  let pool: pg.Pool
  let supabaseAdmin: SupabaseClient
  let adminToken: string
  let _customerToken: string

  const createdOrderIds: string[] = []
  const createdReservationIds: string[] = []
  const createdConversationIds: string[] = []

  const ITEM_1_ID = '10000000-0000-0000-0000-000000000001' // Sườn nướng

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    await seedFixtureUsers(pool)
    adminToken = getUserToken('admin')
    _customerToken = getUserToken('customerA')

    // Ensure database settings and test records are clean
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
       SET active = true, fee_vnd = 15000, free_threshold_vnd = 200000
       WHERE id = '40000000-0000-0000-0000-000000000001'`
    )
    await pool.query(
      `UPDATE public.menu_items
       SET price_vnd = 245000, published = true, available = true, allow_delivery = true, allow_dine_in = true
       WHERE id = $1`,
      [ITEM_1_ID]
    )

    // Ensure standard business hours are active
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
    // Cleanup created test records
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
    await pool.end()
  })

  it('executes full delivery order workflow through Concierge API into live PostgreSQL database', async () => {
    const clientIp = '198.51.100.42'

    // Turn 1: Ask for meal recommendation
    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Gợi ý mâm cơm 2 người ăn thanh đạm',
      }),
    })

    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    expect(chatRes.status).toBe(200)

    const chatBody = await chatRes.json()
    expect(chatBody.data.conversation_id).toBeDefined()
    expect(chatBody.data.session_token).toBeDefined()
    expect(chatBody.data.state_version).toBeGreaterThanOrEqual(1)
    expect(chatBody.data.cards.length).toBeGreaterThan(0)

    const convId = chatBody.data.conversation_id
    const sessionToken = chatBody.data.session_token
    let stateVersion = chatBody.data.state_version

    // Turn 2: Generate a real quote through public-api quote endpoint
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        order_type: 'delivery',
        delivery_zone_id: '40000000-0000-0000-0000-000000000001',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 2, note: 'ít cay' }],
      }),
    })

    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    expect(quoteRes.status).toBe(200)
    const quoteBody = await quoteRes.json()
    expect(quoteBody.data.quote_token).toBeDefined()
    const quoteToken = quoteBody.data.quote_token

    // Turn 3: Confirm quote through concierge action endpoint
    const confirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        conversation_id: convId,
        session_token: sessionToken,
        state_version: stateVersion,
        action: {
          type: 'confirm_quote',
          quote_token: quoteToken,
          note: 'Giao trước 18h nhé',
          delivery_details: {
            customer_name: 'Nguyễn Văn Test',
            phone: '0901234567',
            address: '17 Đường Số 1, TT. Vĩnh An, Vĩnh Cửu',
          },
        },
      }),
    })

    const confirmRes = await handlePublicApi(confirmReq, { pool, supabaseAdmin })
    expect(confirmRes.status).toBe(200)
    const confirmBody = await confirmRes.json()
    expect(confirmBody.data.current_step).toBe('ORDERING_SUBMITTED')

    const orderStatusCard = confirmBody.data.cards.find((c: any) => c.type === 'order_status')
    expect(orderStatusCard).toBeDefined()
    expect(orderStatusCard.order_code).toMatch(/^TG-[A-Z0-9-]+$/)
    expect(orderStatusCard.status).toBe('pending')

    const orderCode = orderStatusCard.order_code

    // Verify real PostgreSQL record exists in public.orders
    const dbOrderRes = await pool.query(
      `SELECT id, code, status, order_type, total_vnd::numeric as total_vnd, customer_name, customer_phone
       FROM public.orders
       WHERE code = $1`,
      [orderCode]
    )
    expect(dbOrderRes.rows.length).toBe(1)
    const dbOrder = dbOrderRes.rows[0]
    createdOrderIds.push(dbOrder.id)

    expect(dbOrder.code).toBe(orderCode)
    expect(dbOrder.status).toBe('pending')
    expect(dbOrder.order_type).toBe('delivery')
    expect(dbOrder.customer_name).toBe('Nguyễn Văn Test')
    expect(dbOrder.customer_phone).toBe('0901234567')
    expect(Number(dbOrder.total_vnd)).toBe(quoteBody.data.total_vnd)

    // Verify order items exist
    const dbItemsRes = await pool.query(
      `SELECT menu_item_id, quantity, unit_price_vnd::numeric as unit_price_vnd
       FROM public.order_items
       WHERE order_id = $1`,
      [dbOrder.id]
    )
    expect(dbItemsRes.rows.length).toBe(1)
    expect(dbItemsRes.rows[0].menu_item_id).toBe(ITEM_1_ID)
    expect(dbItemsRes.rows[0].quantity).toBe(2)

    stateVersion = confirmBody.data.state_version

    // Turn 4: Retry same action (idempotency deduplication check)
    const retryReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: convId,
        session_token: sessionToken,
        state_version: stateVersion,
        action: {
          type: 'confirm_quote',
          quote_token: quoteToken,
          delivery_details: {
            customer_name: 'Nguyễn Văn Test',
            phone: '0901234567',
            address: '17 Đường Số 1, TT. Vĩnh An, Vĩnh Cửu',
          },
        },
      }),
    })

    const retryRes = await handlePublicApi(retryReq, { pool, supabaseAdmin })
    expect(retryRes.status).toBe(200)
    const retryBody = await retryRes.json()
    const retryCard = retryBody.data.cards.find((c: any) => c.type === 'order_status')
    expect(retryCard.order_code).toBe(orderCode)

    // Verify no duplicate order was created in DB
    const dbCountRes = await pool.query(
      `SELECT count(*)::integer as total FROM public.orders WHERE code = $1`,
      [orderCode]
    )
    expect(dbCountRes.rows[0].total).toBe(1)
  })

  it('rejects quote confirmation when executed by a different actor scope', async () => {
    const originalIp = '198.51.100.77'
    const attackerIp = '203.0.113.88'

    // 1. Create quote as original user
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': originalIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        order_type: 'delivery',
        delivery_zone_id: '40000000-0000-0000-0000-000000000001',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })

    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    expect(quoteRes.status).toBe(200)
    const quoteBody = await quoteRes.json()
    const quoteToken = quoteBody.data.quote_token

    // 2. Attacker starts their own conversation
    const attackerChatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': attackerIp,
      },
      body: JSON.stringify({ message: 'Tư vấn món ăn' }),
    })
    const attackerChatRes = await handlePublicApi(attackerChatReq, { pool, supabaseAdmin })
    expect(attackerChatRes.status).toBe(200)
    const attackerChatBody = await attackerChatRes.json()

    // 3. Attacker attempts to confirm the victim's quote under attacker session
    const attackerReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': attackerIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        conversation_id: attackerChatBody.data.conversation_id,
        session_token: attackerChatBody.data.session_token,
        state_version: attackerChatBody.data.state_version,
        action: {
          type: 'confirm_quote',
          quote_token: quoteToken,
        },
      }),
    })

    const attackerRes = await handlePublicApi(attackerReq, { pool, supabaseAdmin })
    expect(attackerRes.status).toBe(403)
    const attackerBody = await attackerRes.json()
    expect(attackerBody.error.message).toMatch(/người dùng.*khác|phiên khác/i)
  })

  it('executes real reservation workflow into live PostgreSQL database', async () => {
    const clientIp = '198.51.100.199'

    // Turn 1: Initialize conversation
    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Tôi muốn đặt bàn cho 4 người',
      }),
    })

    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    expect(chatRes.status).toBe(200)
    const chatBody = await chatRes.json()
    const convId = chatBody.data.conversation_id
    const sessionToken = chatBody.data.session_token
    const stateVersion = chatBody.data.state_version

    // Booking time: tomorrow at 18:00
    const bookingDate = new Date(Date.now() + 24 * 3600 * 1000)
    bookingDate.setHours(18, 0, 0, 0)

    // Turn 2: Confirm reservation
    const resvReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: convId,
        session_token: sessionToken,
        state_version: stateVersion,
        action: {
          type: 'confirm_reservation',
          reservation_details: {
            customer_name: 'Trần Thị Thu Thảo',
            phone: '0987654321',
            guest_count: 4,
            starts_at_iso: bookingDate.toISOString(),
            note: 'Bàn ngoài trời gần hồ',
          },
        },
      }),
    })

    const resvRes = await handlePublicApi(resvReq, { pool, supabaseAdmin })
    expect(resvRes.status).toBe(200)
    const resvBody = await resvRes.json()
    expect(resvBody.data.current_step).toBe('RESERVING_SUBMITTED')

    const resvCard = resvBody.data.cards.find((c: any) => c.type === 'reservation_status')
    expect(resvCard).toBeDefined()
    expect(resvCard.reservation_code).toMatch(/^TG-RESV-\d{6}-[A-Z0-9]{4}$/)
    expect(resvCard.status).toBe('pending')

    const resvCode = resvCard.reservation_code

    // Verify real PostgreSQL record exists in public.reservations
    const dbResvRes = await pool.query(
      `SELECT id, code, status, customer_name, customer_phone, guest_count
       FROM public.reservations
       WHERE code = $1`,
      [resvCode]
    )
    expect(dbResvRes.rows.length).toBe(1)
    const dbResv = dbResvRes.rows[0]
    createdReservationIds.push(dbResv.id)

    expect(dbResv.customer_name).toBe('Trần Thị Thu Thảo')
    expect(dbResv.customer_phone).toBe('0987654321')
    expect(dbResv.guest_count).toBe(4)
    expect(dbResv.status).toBe('pending')
  })

  it('rejects reservation with invalid past date (01/01/2000)', async () => {
    const clientIp = '198.51.100.200'

    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ message: 'Đặt bàn nhé' }),
    })
    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    const chatBody = await chatRes.json()

    const resvReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: chatBody.data.conversation_id,
        session_token: chatBody.data.session_token,
        state_version: chatBody.data.state_version,
        action: {
          type: 'confirm_reservation',
          reservation_details: {
            customer_name: 'Nguyễn Văn Test',
            phone: '0901234567',
            guest_count: 2,
            starts_at_iso: '2000-01-01T12:00:00.000Z',
          },
        },
      }),
    })

    const resvRes = await handlePublicApi(resvReq, { pool, supabaseAdmin })
    expect(resvRes.status).toBe(422)
    const body = await resvRes.json()
    expect(body.error.message).toMatch(/tương lai/i)
  })

  it('rejects reservation with negative guest count (-4 guests)', async () => {
    const clientIp = '198.51.100.201'

    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ message: 'Đặt bàn nhé' }),
    })
    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    const chatBody = await chatRes.json()

    const resvReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: chatBody.data.conversation_id,
        session_token: chatBody.data.session_token,
        state_version: chatBody.data.state_version,
        action: {
          type: 'confirm_reservation',
          reservation_details: {
            customer_name: 'Nguyễn Văn Test',
            phone: '0901234567',
            guest_count: -4,
            starts_at_iso: new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
          },
        },
      }),
    })

    const resvRes = await handlePublicApi(resvReq, { pool, supabaseAdmin })
    expect(resvRes.status).toBe(422)
    const body = await resvRes.json()
    expect(body.error.message).toMatch(/1 đến 30/i)
  })

  it('creates and verifies real PostgreSQL records in public.concierge_conversations, public.concierge_proposals, and public.concierge_events', async () => {
    const clientIp = '198.51.100.202'

    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Gợi ý mâm cơm 4 người ăn hải sản',
      }),
    })

    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    expect(chatRes.status).toBe(200)
    const chatBody = await chatRes.json()
    const convId = chatBody.data.conversation_id
    expect(convId).toBeDefined()
    createdConversationIds.push(convId)

    // 1. Verify conversation record in PostgreSQL
    const convRowRes = await pool.query(
      `SELECT id, current_step, state_version, active_proposal_id
       FROM public.concierge_conversations
       WHERE id = $1`,
      [convId]
    )
    expect(convRowRes.rows.length).toBe(1)
    const convRow = convRowRes.rows[0]
    expect(convRow.id).toBe(convId)
    expect(convRow.current_step).toBe('RECOMMENDING_PROPOSAL_READY')
    expect(convRow.state_version).toBeGreaterThanOrEqual(1)

    // 2. Verify proposals saved in PostgreSQL
    const proposalRowRes = await pool.query(
      `SELECT id, proposal_version, conversation_id, items, total_estimated_vnd
       FROM public.concierge_proposals
       WHERE conversation_id = $1`,
      [convId]
    )
    expect(proposalRowRes.rows.length).toBeGreaterThan(0)
    const pRow = proposalRowRes.rows[0]
    expect(pRow.conversation_id).toBe(convId)
    expect(pRow.id).toBeDefined()
    expect(pRow.items).toBeDefined()

    // 3. Verify turn audit event saved in PostgreSQL
    const eventRowRes = await pool.query(
      `SELECT id, conversation_id, turn_type, intent
       FROM public.concierge_events
       WHERE conversation_id = $1`,
      [convId]
    )
    expect(eventRowRes.rows.length).toBeGreaterThan(0)
    expect(eventRowRes.rows[0].conversation_id).toBe(convId)
  })

  it('allows independent API instance to continue existing conversation via persistent state', async () => {
    const clientIp = '198.51.100.203'

    // Turn 1 on "Instance A"
    const req1 = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Gợi ý món ăn nhẹ',
      }),
    })
    const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()
    const convId = body1.data.conversation_id
    const sessionToken = body1.data.session_token
    const stateVersion1 = body1.data.state_version
    createdConversationIds.push(convId)

    // Turn 2 simulated on "Instance B" (independent request, same conversation, persisted in DB)
    const req2 = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: convId,
        session_token: sessionToken,
        state_version: stateVersion1,
        message: 'Có món nào không cay không?',
      }),
    })
    const res2 = await handlePublicApi(req2, { pool, supabaseAdmin })
    expect(res2.status).toBe(200)
    const body2 = await res2.json()
    expect(body2.data.conversation_id).toBe(convId)
    expect(body2.data.state_version).toBe(stateVersion1 + 1)

    // Confirm state_version in DB matches
    const convRow = await pool.query(
      `SELECT state_version FROM public.concierge_conversations WHERE id = $1`,
      [convId]
    )
    expect(convRow.rows[0].state_version).toBe(body2.data.state_version)
  })

  it('rejects concurrent requests with identical state_version producing HTTP 409 CONCIERGE_STATE_CONFLICT', async () => {
    const clientIp = '198.51.100.204'

    // Initial turn
    const req1 = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Tư vấn mâm cơm gia đình',
      }),
    })
    const res1 = await handlePublicApi(req1, { pool, supabaseAdmin })
    expect(res1.status).toBe(200)
    const body1 = await res1.json()
    const convId = body1.data.conversation_id
    const sessionToken = body1.data.session_token
    const stateVersion = body1.data.state_version
    createdConversationIds.push(convId)

    // Fire 2 concurrent turns both with state_version = stateVersion
    const makeConcurrentReq = (msg: string) =>
      new Request('http://localhost/functions/v1/public-api/concierge/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': clientIp,
        },
        body: JSON.stringify({
          conversation_id: convId,
          session_token: sessionToken,
          state_version: stateVersion,
          message: msg,
        }),
      })

    const [resA, resB] = await Promise.all([
      handlePublicApi(makeConcurrentReq('Cho thêm sườn nướng'), { pool, supabaseAdmin }),
      handlePublicApi(makeConcurrentReq('Đổi sang cá hồi'), { pool, supabaseAdmin }),
    ])

    const statuses = [resA.status, resB.status].sort()
    // Exactly one must succeed (200) and one must be rejected with state conflict (409)
    expect(statuses).toEqual([200, 409])

    const conflictRes = resA.status === 409 ? resA : resB
    const conflictBody = await conflictRes.json()
    expect(conflictBody.error.code).toBe('CONCIERGE_STATE_CONFLICT')
    expect(conflictBody.error.message).toMatch(/lượt khác|xung đột phiên/i)
  })

  it('rejects order confirmation when required delivery details are missing (HTTP 422 VALIDATION_ERROR) and creates no order', async () => {
    const clientIp = '198.51.100.205'

    // 1. Create a valid quote
    const quoteReq = new Request('http://localhost/functions/v1/public-api/order-quotes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        order_type: 'delivery',
        delivery_zone_id: '40000000-0000-0000-0000-000000000001',
        items: [{ menu_item_id: ITEM_1_ID, quantity: 1 }],
      }),
    })
    const quoteRes = await handlePublicApi(quoteReq, { pool, supabaseAdmin })
    expect(quoteRes.status).toBe(200)
    const quoteBody = await quoteRes.json()
    const quoteToken = quoteBody.data.quote_token

    // 2. Start concierge conversation
    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({ message: 'Đặt giao món này giúp tôi' }),
    })
    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    const chatBody = await chatRes.json()
    const convId = chatBody.data.conversation_id
    createdConversationIds.push(convId)

    // 3. Confirm quote with missing customer_name and customer_phone
    const confirmReq = new Request('http://localhost/functions/v1/public-api/concierge/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
        'X-Test-Now': '2026-09-20T05:00:00.000Z',
      },
      body: JSON.stringify({
        conversation_id: convId,
        session_token: chatBody.data.session_token,
        state_version: chatBody.data.state_version,
        action: {
          type: 'confirm_quote',
          quote_token: quoteToken,
          delivery_details: {
            // Missing name, phone, and address
            note: 'TEST_NO_ORDER_SHOULD_BE_CREATED_123',
          },
        },
      }),
    })

    const confirmRes = await handlePublicApi(confirmReq, { pool, supabaseAdmin })
    expect(confirmRes.status).toBe(422)
    const confirmBody = await confirmRes.json()
    expect(confirmBody.error.code).toBe('VALIDATION_ERROR')
    expect(confirmBody.error.message).toMatch(/họ và tên/i)

    // 4. Confirm NO order was created in DB
    const orderCountRes = await pool.query(
      `SELECT count(*)::integer as count FROM public.orders WHERE note LIKE '%TEST_NO_ORDER_SHOULD_BE_CREATED_123%'`
    )
    expect(orderCountRes.rows[0].count).toBe(0)
  })

  it('submits proposal feedback via public API, enforces ownership, and allows independent admin API to review it', async () => {
    const clientIp = '198.51.100.206'
    const attackerIp = '198.51.100.207'

    // 1. Customer initiates chat requesting a proposal
    const chatReq = new Request('http://localhost/functions/v1/public-api/concierge/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        message: 'Gợi ý mâm cơm 2 người nhiều rau củ thanh mát',
      }),
    })

    const chatRes = await handlePublicApi(chatReq, { pool, supabaseAdmin })
    expect(chatRes.status).toBe(200)
    const chatBody = await chatRes.json()
    const convId = chatBody.data.conversation_id
    createdConversationIds.push(convId)

    const proposalCard = chatBody.data.cards.find((c: any) => c.type === 'meal_recommendation')
    expect(proposalCard).toBeDefined()
    const proposalId = proposalCard.proposal.id
    const proposalVersion = proposalCard.proposal.version || 1

    // 2. Attacker attempts to submit feedback for this conversation (cross-user check)
    const attackerFeedbackReq = new Request('http://localhost/functions/v1/public-api/concierge/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': attackerIp,
      },
      body: JSON.stringify({
        conversation_id: convId,
        proposal_id: proposalId,
        proposal_version: proposalVersion,
        rating: 'dislike',
        feedback_text: 'Spam review',
      }),
    })

    const attackerFeedbackRes = await handlePublicApi(attackerFeedbackReq, { pool, supabaseAdmin })
    expect(attackerFeedbackRes.status).toBe(403)
    const attackerFeedbackBody = await attackerFeedbackRes.json()
    expect(attackerFeedbackBody.error.message).toMatch(/quyền|phiên/i)

    // 3. Legitimate customer submits feedback
    const feedbackReq = new Request('http://localhost/functions/v1/public-api/concierge/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': clientIp,
      },
      body: JSON.stringify({
        conversation_id: convId,
        proposal_id: proposalId,
        proposal_version: proposalVersion,
        rating: 'perfect',
        feedback_text: 'Mâm cơm gợi ý rất hợp vị và thanh đạm!',
      }),
    })

    const feedbackRes = await handlePublicApi(feedbackReq, { pool, supabaseAdmin })
    expect(feedbackRes.status).toBe(200)
    const feedbackBody = await feedbackRes.json()
    expect(feedbackBody.data.success).toBe(true)
    const feedbackId = feedbackBody.data.feedback_id
    expect(feedbackId).toBeDefined()

    // 4. Verify feedback record in database
    const fbDbRes = await pool.query(
      `SELECT id, conversation_id, proposal_id, rating, status, feedback_text
       FROM public.concierge_feedback
       WHERE id = $1`,
      [feedbackId]
    )
    expect(fbDbRes.rows.length).toBe(1)
    expect(fbDbRes.rows[0].status).toBe('NEW')
    expect(fbDbRes.rows[0].rating).toBe('perfect')

    // 5. Admin lists feedback via admin-api
    const adminListReq = new Request('http://localhost:54321/functions/v1/admin-api/concierge/feedback?status=NEW', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const adminListRes = await handleAdminApi(adminListReq, { pool, supabaseAdmin })
    expect(adminListRes.status).toBe(200)
    const adminListBody = await adminListRes.json()
    const items = adminListBody.items || adminListBody.data?.items
    expect(items).toBeDefined()
    const foundFeedback = items.find((f: any) => f.id === feedbackId)
    expect(foundFeedback).toBeDefined()
    expect(foundFeedback.feedback_text).toBe('Mâm cơm gợi ý rất hợp vị và thanh đạm!')

    // 6. Admin reviews/resolves feedback via admin-api
    const adminReviewReq = new Request(`http://localhost:54321/functions/v1/admin-api/concierge/feedback/${feedbackId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        status: 'REVIEWED',
        admin_notes: 'Đã tiếp nhận và bổ sung vào thực đơn ưa thích',
      }),
    })
    const adminReviewRes = await handleAdminApi(adminReviewReq, { pool, supabaseAdmin })
    expect(adminReviewRes.status).toBe(200)
    const adminReviewBody = await adminReviewRes.json()
    const updatedRecord = adminReviewBody.data || adminReviewBody
    expect(updatedRecord.status).toBe('REVIEWED')
    expect(updatedRecord.admin_notes).toBe('Đã tiếp nhận và bổ sung vào thực đơn ưa thích')

    // 7. Verify updated status and audit log in PostgreSQL
    const fbUpdatedDbRes = await pool.query(
      `SELECT status, admin_notes, reviewed_by FROM public.concierge_feedback WHERE id = $1`,
      [feedbackId]
    )
    expect(fbUpdatedDbRes.rows[0].status).toBe('REVIEWED')
    expect(fbUpdatedDbRes.rows[0].admin_notes).toBe('Đã tiếp nhận và bổ sung vào thực đơn ưa thích')
    expect(fbUpdatedDbRes.rows[0].reviewed_by).toBeDefined()

    const auditLogRes = await pool.query(
      `SELECT id, action, entity_type, entity_id FROM public.audit_logs WHERE entity_id = $1`,
      [feedbackId]
    )
    expect(auditLogRes.rows.length).toBeGreaterThan(0)
    expect(auditLogRes.rows[0].action).toBe('review_concierge_feedback')
  })
})
