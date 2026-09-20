/**
 * Tiger 345 - Concierge Reservation UI & Multi-turn Flow Test Suite (Task C07 - AT15)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.server.config.ts (npm run test:server)
 * - Affected API:
 *   - supabase/functions/_shared/concierge/date-resolver.ts (resolveReservationDateTime, extractReservationDetails)
 *   - supabase/functions/_shared/concierge/runtime.ts (processConciergeTurn, prepare_reservation_summary, confirm_reservation)
 *   - supabase/functions/_shared/concierge/tools.ts (toolPrepareReservationSummary)
 *   - supabase/functions/_shared/quote.ts (createReservationHoldToken, verifyReservationHoldToken)
 * - Data Schemas:
 *   - ReservationSummaryCardData: { type: 'reservation_summary', customer_name, phone, guest_count, starts_at_iso, starts_at_formatted, seating_area_name?, note?, disclaimer, hold_token }
 *   - ReservationStatusCardData: { type: 'reservation_status', reservation_code, status, customer_name, guest_count, starts_at_formatted, seating_area_name? }
 * - Verbatim Instructions (C07 / AT15):
 *   - "Thu thập tên/phone/guests/ngày giờ thật; area/note theo policy, không fake fallback."
 *   - "Resolve ngày tương đối bằng Asia/Ho_Chi_Minh và clock server; ngày giờ mơ hồ hỏi lại; xác nhận ngày tuyệt đối."
 *   - "Áp dụng giờ mở cửa/cutoff/số khách/horizon từ policy nguồn thật; không hardcode giới hạn chưa được duyệt."
 *   - "Summary server bind pending action; client không sửa payload sau confirm; sửa bất cứ dữ liệu giao dịch phát summary mới."
 *   - "Submit qua C02, trạng thái pending; status lookup auth; không cam kết giữ bàn khi chưa được quán xác nhận."
 *   - "AT15: Ngày mai 19h, đổi giờ, chen FAQ, reload; gần nửa đêm; thiếu tên/phone. Ngày tuyệt đối đúng Asia/Ho_Chi_Minh; thiếu hỏi lại; DB khớp summary và pending. Tự +2h/Quý khách; đổi payload sau confirm; khẳng định đã giữ bàn."
 */

import { describe, it, expect } from 'vitest'
import {
  processConciergeTurn,
} from '../../supabase/functions/_shared/concierge/runtime.js'
import {
  createInitialState,
} from '../../supabase/functions/_shared/concierge/state-machine.js'
import {
  saveInitialConversationRecord,
} from '../../supabase/functions/_shared/concierge/persistence.js'
import {
  type MenuItemCatalogRecord,
} from '../../supabase/functions/_shared/concierge/validator.js'
import {
  type ToolContext,
} from '../../supabase/functions/_shared/concierge/tools.js'
import {
  resolveReservationDateTime,
  extractReservationDetails,
} from '../../supabase/functions/_shared/concierge/date-resolver.js'
import {
  createReservationHoldToken,
  verifyReservationHoldToken,
  getQuoteSecret,
} from '../../supabase/functions/_shared/quote.js'
import { sha256 } from '../../supabase/functions/_shared/crypto.js'

describe('Task C07: Reservation UI & Multi-turn Flow (AT15)', () => {
  const baseCatalog: MenuItemCatalogRecord[] = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Gà Hấp Nước Mắm Nhĩ',
      price_vnd: 240000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Lẩu Cá Kèo Lá Giang',
      price_vnd: 280000,
      is_available: true,
    },
  ]

  const defaultContext: ToolContext = {
    actor_scope: 'guest:session-bob-456',
    catalog: baseCatalog,
  }

  // Anchor test clock: 2026-09-20 05:00:00 UTC = 2026-09-20 12:00:00 in Asia/Ho_Chi_Minh (Sunday noon)
  const refClock = new Date('2026-09-20T05:00:00.000Z')

  describe('Part 1: Relative Vietnamese Date/Time Resolution in Asia/Ho_Chi_Minh (UTC+7)', () => {
    it('resolves "ngày mai 19h" to absolute ISO in Asia/Ho_Chi_Minh (+07:00)', () => {
      const res = resolveReservationDateTime('ngày mai 19h', refClock)
      expect(res.success).toBe(true)
      expect(res.startsAtIso).toBe('2026-09-21T19:00:00+07:00')
      expect(res.startsAtFormatted).toContain('19:00')
      expect(res.startsAtFormatted).toContain('21/09/2026')
    })

    it('resolves "tối nay lúc 19h30" to absolute ISO in Asia/Ho_Chi_Minh (+07:00)', () => {
      const res = resolveReservationDateTime('tối nay lúc 19h30', refClock)
      expect(res.success).toBe(true)
      expect(res.startsAtIso).toBe('2026-09-20T19:30:00+07:00')
      expect(res.startsAtFormatted).toContain('19:30')
      expect(res.startsAtFormatted).toContain('20/09/2026')
    })

    it('resolves "ngày mốt 18h" to absolute ISO (+2 days)', () => {
      const res = resolveReservationDateTime('ngày mốt lúc 18:00', refClock)
      expect(res.success).toBe(true)
      expect(res.startsAtIso).toBe('2026-09-22T18:00:00+07:00')
      expect(res.startsAtFormatted).toContain('18:00')
      expect(res.startsAtFormatted).toContain('22/09/2026')
    })

    it('rejects near midnight requests ("gần nửa đêm", "24h", "23:00") with operating hours policy', () => {
      const res1 = resolveReservationDateTime('đặt bàn gần nửa đêm', refClock)
      expect(res1.success).toBe(false)
      expect(res1.isOutOfHours).toBe(true)
      expect(res1.reason).toMatch(/22:30|20:30|10:30/i)

      const res2 = resolveReservationDateTime('ngày mai lúc 23h', refClock)
      expect(res2.success).toBe(false)
      expect(res2.isOutOfHours).toBe(true)
    })

    it('rejects times outside operating intake hours (10:30 - 20:30)', () => {
      // Early morning before 10:30
      const early = resolveReservationDateTime('ngày mai lúc 8h sáng', refClock)
      expect(early.success).toBe(false)
      expect(early.isOutOfHours).toBe(true)

      // After intake cutoff 20:30
      const late = resolveReservationDateTime('ngày mai lúc 21h', refClock)
      expect(late.success).toBe(false)
      expect(late.isOutOfHours).toBe(true)
    })

    it('rejects past reservations and notices under 30 minutes', () => {
      // At refClock 12:00 VN time, 12:15 is under 30 minutes
      const shortNotice = resolveReservationDateTime('hôm nay lúc 12:15 trưa', refClock)
      expect(shortNotice.success).toBe(false)
      expect(shortNotice.isNoticeTooShort).toBe(true)

      // 11:00 VN time is in the past relative to refClock 12:00
      const past = resolveReservationDateTime('hôm nay lúc 11:00 trưa', refClock)
      expect(past.success).toBe(false)
      expect(past.isPast).toBe(true)
    })

    it('rejects booking horizon beyond 30 days', () => {
      const farAhead = resolveReservationDateTime('25/11/2026 lúc 18h', refClock)
      expect(farAhead.success).toBe(false)
      expect(farAhead.isTooFarAhead).toBe(true)
      expect(farAhead.reason).toMatch(/30 ngày/i)
    })

    it('identifies ambiguous requests missing date or time without guessing', () => {
      const noTime = resolveReservationDateTime('ngày mai', refClock)
      expect(noTime.success).toBe(false)
      expect(noTime.missingField).toBe('time')

      const noDate = resolveReservationDateTime('lúc 19h', refClock)
      expect(noDate.success).toBe(false)
      expect(noDate.missingField).toBe('date')
    })
  })

  describe('Part 2: Multi-turn Reservation Data Gathering & Prohibited Defaults', () => {
    it('does NOT default to "Quý khách" or +2h when user starts reservation without full details', async () => {
      const conv = createInitialState(undefined, null)
      await saveInitialConversationRecord(undefined, conv)

      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          message: 'Mình muốn đặt bàn',
        },
        defaultContext
      )

      expect(envelope.current_step).toBe('RESERVING_COLLECTING')
      expect(envelope.intent).toBe('reservation')
      // Must NOT contain a premature reservation summary card
      const hasSummaryCard = envelope.cards.some((c) => c.type === 'reservation_summary')
      expect(hasSummaryCard).toBe(false)
      // Must NOT default to "Quý khách"
      expect(envelope.message).not.toContain('Quý khách')
      expect(envelope.message).toMatch(/họ tên|số điện thoại|giờ|người/i)
    })

    it('collects guest count and preserves in-flight draft across turns', async () => {
      const conv = createInitialState(undefined, null)
      await saveInitialConversationRecord(undefined, conv)

      // Turn 1: User specifies guest count
      const env1 = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          message: 'Mình muốn đặt bàn 4 người',
        },
        defaultContext
      )

      expect(env1.current_step).toBe('RESERVING_COLLECTING')
      // Still missing name, phone, time -> no summary card yet
      expect(env1.cards.some((c) => c.type === 'reservation_summary')).toBe(false)

      // Turn 2: User specifies time
      const env2 = await processConciergeTurn(
        {
          conversation_id: env1.conversation_id,
          session_token: env1.session_token,
          state_version: env1.state_version,
          message: 'Tối mai lúc 19h',
        },
        defaultContext
      )

      expect(env2.current_step).toBe('RESERVING_COLLECTING')
      // Still missing name and phone -> asks for them
      expect(env2.message).toMatch(/họ tên|số điện thoại/i)
    })

    it('preserves in-flight reservation draft during interleaved FAQ inquiry (AT15)', async () => {
      const conv = createInitialState(undefined, null)
      await saveInitialConversationRecord(undefined, conv)

      // Step 1: User initiates reservation with guest count and time
      const env1 = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          message: 'Mình muốn đặt bàn 6 người vào ngày mai lúc 19h',
        },
        defaultContext
      )
      expect(env1.current_step).toBe('RESERVING_COLLECTING')

      // Step 2: Interleaved FAQ: User asks about parking
      const env2 = await processConciergeTurn(
        {
          conversation_id: env1.conversation_id,
          session_token: env1.session_token,
          state_version: env1.state_version,
          message: 'Nhà hàng có chỗ đậu xe ô tô không?',
        },
        defaultContext
      )

      // FAQ is answered accurately with references
      expect(env2.message).toMatch(/đỗ xe|bãi xe|ô tô|xe máy/i)
      expect(env2.references.length).toBeGreaterThan(0)
      expect(env2.suggested_actions).toContain('Tiếp tục đặt bàn')

      // Step 3: User provides contact info to complete reservation
      const env3 = await processConciergeTurn(
        {
          conversation_id: env2.conversation_id,
          session_token: env2.session_token,
          state_version: env2.state_version,
          message: 'Tên mình là Hoàng Minh, sđt 0912345678',
        },
        defaultContext
      )

      // Now all fields are complete: guest_count=6, time=tomorrow 19h, name=Hoàng Minh, phone=0912345678
      expect(env3.current_step).toBe('RESERVING_CONFIRMING')
      const summaryCard = env3.cards.find((c) => c.type === 'reservation_summary')
      expect(summaryCard).toBeDefined()
      if (summaryCard && summaryCard.type === 'reservation_summary') {
        expect(summaryCard.customer_name).toBe('Hoàng Minh')
        expect(summaryCard.phone).toBe('0912345678')
        expect(summaryCard.guest_count).toBe(6)
        expect(summaryCard.hold_token).toBeDefined()
        expect(typeof summaryCard.hold_token).toBe('string')
      }
    })

    it('rejects generic names ("Quý khách", "khách", "guest") and requires real customer name', () => {
      const extracted1 = extractReservationDetails('Đặt bàn cho Quý khách lúc 19h ngày mai sđt 0912345678 4 người')
      expect(extracted1.missing_fields).toContain('customer_name')

      const extracted2 = extractReservationDetails('Tên tôi là Nguyễn Văn An, sđt 0987654321, 4 người tối mai 19h')
      expect(extracted2.customer_name).toBe('Nguyễn Văn An')
      expect(extracted2.missing_fields).not.toContain('customer_name')
    })
  })

  describe('Part 3: Cryptographic Anti-Tamper Hold Token & Confirmation (C02 / AT15)', () => {
    it('creates and verifies reservation hold token with HMAC-SHA256 signature', () => {
      const hold = createReservationHoldToken({
        actor_scope: 'guest:session-bob-456',
        customer_name: 'Trần Văn Bình',
        phone: '0903123456',
        guest_count: 4,
        starts_at_iso: '2026-09-25T19:00:00+07:00',
        seating_area_name: 'Khu vực sân vườn thoáng mát',
      })

      expect(hold.hold_token).toBeDefined()
      expect(hold.hold_token.split('.')).toHaveLength(3)

      const verified = verifyReservationHoldToken(hold.hold_token, getQuoteSecret())
      expect(verified.customer_name).toBe('Trần Văn Bình')
      expect(verified.phone).toBe('0903123456')
      expect(verified.guest_count).toBe(4)
      expect(verified.starts_at_iso).toBe('2026-09-25T19:00:00+07:00')
    })

    it('blocks confirmation with 409 RESERVATION_PAYLOAD_CHANGED if client modifies guest count after summary', async () => {
      const conv = createInitialState(undefined, null)
      conv.current_step = 'RESERVING_CONFIRMING'
      conv.current_intent = 'reservation'

      const holdResult = createReservationHoldToken({
        actor_scope: defaultContext.actor_scope,
        customer_name: 'Lê Thị Mai',
        phone: '0918765432',
        guest_count: 4,
        starts_at_iso: '2026-09-22T19:00:00+07:00',
      })

      conv.pending_reservation = {
        type: 'reservation_summary',
        customer_name: 'Lê Thị Mai',
        phone: '0918765432',
        guest_count: 4,
        starts_at_iso: '2026-09-22T19:00:00+07:00',
        starts_at_formatted: '19:00 ngày 22/09/2026',
        disclaimer: 'Nhà hàng giữ bàn tối đa 15 phút...',
        hold_token: holdResult.hold_token,
      } as any

      conv.pending_action = {
        id: 'pa_test_001',
        action_type: 'confirm_reservation',
        actor_scope: defaultContext.actor_scope,
        conversation_id: conv.conversation_id,
        state_version: conv.state_version,
        content_fingerprint: 'fp_test_001',
        reference_id: 'draft_001',
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        status: 'pending',
        payload: { reservation_details: conv.pending_reservation },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      await saveInitialConversationRecord(undefined, conv)

      // Malicious client tries to confirm with guest_count = 8 instead of 4
      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'confirm_reservation',
              hold_token: holdResult.hold_token,
              reservation_details: {
                customer_name: 'Lê Thị Mai',
                phone: '0918765432',
                guest_count: 8, // TAMPERED from 4 to 8
                starts_at_iso: '2026-09-22T19:00:00+07:00',
              },
            },
          },
          defaultContext
        )
      ).rejects.toThrowError(/RESERVATION_PAYLOAD_CHANGED|thay đổi so với phiếu tóm tắt/i)
    })

    it('blocks confirmation with 409 RESERVATION_PAYLOAD_CHANGED if client modifies starts_at_iso after summary', async () => {
      const conv = createInitialState(undefined, null)
      conv.current_step = 'RESERVING_CONFIRMING'
      conv.current_intent = 'reservation'

      const holdResult = createReservationHoldToken({
        actor_scope: defaultContext.actor_scope,
        customer_name: 'Lê Thị Mai',
        phone: '0918765432',
        guest_count: 4,
        starts_at_iso: '2026-09-22T19:00:00+07:00',
      })

      conv.pending_reservation = {
        type: 'reservation_summary',
        customer_name: 'Lê Thị Mai',
        phone: '0918765432',
        guest_count: 4,
        starts_at_iso: '2026-09-22T19:00:00+07:00',
        starts_at_formatted: '19:00 ngày 22/09/2026',
        disclaimer: 'Nhà hàng giữ bàn tối đa 15 phút...',
        hold_token: holdResult.hold_token,
      } as any

      await saveInitialConversationRecord(undefined, conv)

      // Malicious client tries to confirm with a different time
      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'confirm_reservation',
              hold_token: holdResult.hold_token,
              reservation_details: {
                customer_name: 'Lê Thị Mai',
                phone: '0918765432',
                guest_count: 4,
                starts_at_iso: '2026-09-23T20:00:00+07:00', // TAMPERED date/time
              },
            },
          },
          defaultContext
        )
      ).rejects.toThrowError(/RESERVATION_PAYLOAD_CHANGED|thay đổi so với phiếu tóm tắt/i)
    })

    it('generates a fresh summary card when user modifies details in conversation', async () => {
      const conv = createInitialState(undefined, null)
      conv.current_step = 'RESERVING_CONFIRMING'
      conv.pending_reservation = {
        type: 'reservation_summary',
        customer_name: 'Lê Thị Mai',
        phone: '0918765432',
        guest_count: 4,
        starts_at_iso: '2026-09-22T19:00:00+07:00',
        starts_at_formatted: '19:00 ngày 22/09/2026',
      } as any

      await saveInitialConversationRecord(undefined, conv)

      // User says: "Đổi sang 6 người nhé"
      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          message: 'Đổi sang 6 người nhé',
        },
        defaultContext
      )

      expect(envelope.current_step).toBe('RESERVING_CONFIRMING')
      const newSummary = envelope.cards.find((c) => c.type === 'reservation_summary')
      expect(newSummary).toBeDefined()
      if (newSummary && newSummary.type === 'reservation_summary') {
        expect(newSummary.guest_count).toBe(6)
        expect(newSummary.customer_name).toBe('Lê Thị Mai')
        expect(newSummary.phone).toBe('0918765432')
        expect(newSummary.hold_token).toBeDefined()
      }
    })

    it('replays completed reservation idempotently without creating duplicate bookings', async () => {
      const conv = createInitialState(undefined, null)
      conv.current_step = 'RESERVING_SUBMITTED'
      conv.current_intent = 'reservation'

      const startsAtIso = '2026-09-22T19:00:00+07:00'
      const startsAtDate = new Date(startsAtIso)
      const canonicalFingerprint = sha256(
        JSON.stringify({
          actor_scope: defaultContext.actor_scope,
          customer_name: 'Đặng Văn Lâm',
          customer_phone: '0909123456',
          starts_at: startsAtDate.toISOString(),
          guest_count: 4,
          seating_area_id: null,
          customer_user_id: null,
        })
      )
      const stableKey = `concierge_res_${conv.conversation_id}_${canonicalFingerprint.slice(0, 32)}`

      conv.pending_action = {
        id: 'pa_completed_001',
        action_type: 'confirm_reservation',
        actor_scope: defaultContext.actor_scope,
        conversation_id: conv.conversation_id,
        state_version: conv.state_version,
        content_fingerprint: canonicalFingerprint,
        reference_id: 'RESV-20260920-001',
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        status: 'completed',
        payload: { reservation_code: 'RESV-20260920-001' },
        stable_business_idempotency_key: stableKey,
        transaction_receipt: {
          code: 'RESV-20260920-001',
          status: 'pending',
          starts_at_formatted: '19:00 ngày 22/09/2026',
          guest_count: 4,
          customer_name: 'Đặng Văn Lâm',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      await saveInitialConversationRecord(undefined, conv)

      // Replay confirm_reservation action
      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'confirm_reservation',
            reservation_details: {
              customer_name: 'Đặng Văn Lâm',
              phone: '0909123456',
              guest_count: 4,
              starts_at_iso: '2026-09-22T19:00:00+07:00',
            },
          },
        },
        defaultContext
      )

      expect(envelope.current_step).toBe('RESERVING_SUBMITTED')
      const statusCard = envelope.cards.find((c) => c.type === 'reservation_status')
      expect(statusCard).toBeDefined()
      if (statusCard && statusCard.type === 'reservation_status') {
        expect(statusCard.reservation_code).toBe('RESV-20260920-001')
        expect(statusCard.status).toBe('pending')
      }
      expect(envelope.message).toMatch(/Idempotent replay|đã được tiếp nhận thành công trước đó/i)
    })
  })
})
