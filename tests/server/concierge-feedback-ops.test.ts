/**
 * Tiger 345 - Concierge Feedback, Ops & Privacy Test Suite (Task C09 - R10, AT17, AT18)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Vitest runner via vitest.server.config.ts (npm run test:server)
 * - Affected API:
 *   - supabase/functions/_shared/concierge/feedback.ts (submitConciergeFeedbackAsync, listAdminFeedbackAsync, adminReviewFeedbackAsync)
 *   - supabase/functions/_shared/concierge/redact.ts (redactPii, redactObject)
 *   - supabase/functions/_shared/concierge/persistence.ts (logConciergeEventRecord, saveProposalRecord, getProposalRecord)
 *   - supabase/functions/_shared/concierge/flags.ts (getConciergeFeatureFlags, setConciergeFeatureFlagsForTesting)
 *   - supabase/functions/_shared/concierge/retention.ts (runConciergeRetentionCleanup, getRetentionPolicySummary)
 *   - supabase/functions/_shared/concierge/runtime.ts (processConciergeTurn)
 * - Data Schemas:
 *   - ConciergeFeedbackRecord, ConciergeFeatureFlags, RetentionOptions, RetentionCleanupResult, RetentionPolicySummary
 * - Verbatim User Instructions (C09 / AT17, AT18):
 *   - "Feedback bind proposal/version/owner thật; admin review cùng persisted dataset có status/note/audit."
 *   - "Không tự biến feedback thành serving rule đã duyệt; dữ liệu học cần owner review."
 *   - "Log request/intent/tool latency/tokens/errors/validation với redaction phone/address/token; không hidden reasoning."
 *   - "Rate limits, tool budgets, feature flags/kill switches và fallback liên hệ quán cấu hình thật; status/reconcile giao dịch đã commit còn truy cập được."
 *   - "Retention/deletion/minimization cho chat/customer data và feedback; tách transaction records có nghĩa vụ lưu; policy chưa duyệt ghi external blocker."
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  submitConciergeFeedbackAsync,
  listAdminFeedbackAsync,
  adminReviewFeedbackAsync,
} from '../../supabase/functions/_shared/concierge/feedback.js'
import { redactPii, redactObject } from '../../supabase/functions/_shared/concierge/redact.js'
import {
  saveProposalRecord,
  getProposalRecord,
  logConciergeEventRecord,
} from '../../supabase/functions/_shared/concierge/persistence.js'
import {
  setConciergeFeatureFlagsForTesting,
  getConciergeFeatureFlags,
} from '../../supabase/functions/_shared/concierge/flags.js'
import {
  runConciergeRetentionCleanup,
  getRetentionPolicySummary,
} from '../../supabase/functions/_shared/concierge/retention.js'
import { processConciergeTurn } from '../../supabase/functions/_shared/concierge/runtime.js'
import {
  createInitialState,
  getOrCreateConversationAsync,
} from '../../supabase/functions/_shared/concierge/state-machine.js'
import { SERVING_PROFILES } from '../../supabase/functions/_shared/concierge/knowledge.js'
import type { MealProposal } from '../../supabase/functions/_shared/concierge/types.js'

describe('Task C09: Feedback, Operations & Privacy Validation (AT17, AT18)', () => {
  const USER_ALICE_ID = '00000000-0000-0000-0000-0000000000aa'
  const USER_BOB_ID = '00000000-0000-0000-0000-0000000000bb'
  const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000001'

  beforeEach(() => {
    setConciergeFeatureFlagsForTesting(null)
  })

  afterEach(() => {
    setConciergeFeatureFlagsForTesting(null)
  })

  // --------------------------------------------------------------------------
  // AT17: FEEDBACK BINDING, OWNERSHIP & HUMAN-IN-THE-LOOP REVIEW
  // --------------------------------------------------------------------------
  describe('AT17: Feedback Binding & Admin Review', () => {
    const mockProposal: MealProposal = {
      id: 'prop-valid-001',
      version: 1,
      title: 'Mâm cơm gia đình 4 người',
      description: 'Cơm gia đình ấm cúng',
      concept_tag: 'balanced_harmony',
      items: [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000001',
          item_name: 'Gà Hấp Nước Mắm Nhĩ',
          quantity: 1,
          unit_price_vnd: 260000,
          meal_role: 'main_protein',
        },
      ],
      subtotal_vnd: 260000,
      serving_summary: '1 món chính',
      validation: {
        status: 'PASS',
        checks: [],
        subtotal_vnd: 260000,
        coverage: {
          target_equivalent_adults: 4,
          protein_coverage_ratio: 1.0,
          carb_coverage_ratio: 1.0,
          vegetable_coverage_ratio: 1.0,
          soup_coverage_ratio: 1.0,
          overall_fit_score: 95,
          is_sufficient: true,
          gaps: [],
        },
        assumptions: [],
        warnings: [],
        validated_at: new Date().toISOString(),
        version: 1,
      },
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }

    it('AT17-1: Rejects feedback when proposal does not exist (404 NOT_FOUND)', async () => {
      const mockPool = {
        query: async () => ({ rowCount: 0, rows: [] }),
      }

      await expect(
        submitConciergeFeedbackAsync(mockPool as any, {
          proposal_id: 'prop-non-existent',
          proposal_version: 1,
          config_version: '1.0.0',
          rating: 'perfect',
          actor_scope: `user:${USER_ALICE_ID}`,
          customer_user_id: USER_ALICE_ID,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'NOT_FOUND',
          status: 404,
        })
      )
    })

    it('AT17-2: Rejects feedback when proposal version is forged/mismatched (422 VALIDATION_ERROR)', async () => {
      // Mock pool returning proposal with version 1
      const mockPool = {
        query: async (queryText: string) => {
          if (queryText.includes('FROM public.concierge_proposals')) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: mockProposal.id,
                  proposal_version: 1,
                  title: mockProposal.title,
                  concept: mockProposal.concept_tag,
                  items: mockProposal.items,
                  validation: mockProposal.validation,
                  total_estimated_vnd: mockProposal.subtotal_vnd,
                  budget_max_vnd: 500000,
                  customer_user_id: USER_ALICE_ID,
                  actor_scope: `user:${USER_ALICE_ID}`,
                  expires_at: mockProposal.expires_at,
                  created_at: mockProposal.created_at,
                },
              ],
            }
          }
          return { rowCount: 0, rows: [] }
        },
      }

      // Submitting with mismatched proposal_version (version 2 instead of 1)
      await expect(
        submitConciergeFeedbackAsync(mockPool as any, {
          proposal_id: mockProposal.id,
          proposal_version: 2, // Forged / mismatched version
          config_version: '1.0.0',
          rating: 'too_much',
          actor_scope: `user:${USER_ALICE_ID}`,
          customer_user_id: USER_ALICE_ID,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'VALIDATION_ERROR',
          status: 422,
        })
      )
    })

    it('AT17-3: Cross-user isolation - Rejects feedback when caller does not own the proposal (403 FORBIDDEN)', async () => {
      const mockPool = {
        query: async (queryText: string) => {
          if (queryText.includes('FROM public.concierge_proposals')) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: mockProposal.id,
                  proposal_version: 1,
                  title: mockProposal.title,
                  concept: mockProposal.concept_tag,
                  items: mockProposal.items,
                  validation: mockProposal.validation,
                  total_estimated_vnd: mockProposal.subtotal_vnd,
                  budget_max_vnd: 500000,
                  customer_user_id: USER_ALICE_ID, // Owned by Alice
                  actor_scope: `user:${USER_ALICE_ID}`,
                  expires_at: mockProposal.expires_at,
                  created_at: mockProposal.created_at,
                },
              ],
            }
          }
          return { rowCount: 0, rows: [] }
        },
      }

      // Bob tries to submit feedback on Alice's proposal
      await expect(
        submitConciergeFeedbackAsync(mockPool as any, {
          proposal_id: mockProposal.id,
          proposal_version: 1,
          config_version: '1.0.0',
          rating: 'dislike',
          actor_scope: `user:${USER_BOB_ID}`,
          customer_user_id: USER_BOB_ID,
        })
      ).rejects.toThrowError(
        expect.objectContaining({
          code: 'FORBIDDEN',
          status: 403,
        })
      )
    })

    it('AT17-4: Successfully binds owner, proposal, and version and persists feedback', async () => {
      let insertedRow: any = null
      const mockPool = {
        query: async (queryText: string, params: any[]) => {
          if (queryText.includes('FROM public.concierge_proposals')) {
            return {
              rowCount: 1,
              rows: [
                {
                  id: mockProposal.id,
                  proposal_version: 1,
                  title: mockProposal.title,
                  concept: mockProposal.concept_tag,
                  items: mockProposal.items,
                  validation: mockProposal.validation,
                  total_estimated_vnd: mockProposal.subtotal_vnd,
                  budget_max_vnd: 500000,
                  customer_user_id: USER_ALICE_ID,
                  actor_scope: `user:${USER_ALICE_ID}`,
                  expires_at: mockProposal.expires_at,
                  created_at: mockProposal.created_at,
                },
              ],
            }
          }
          if (queryText.includes('INSERT INTO public.concierge_feedback')) {
            insertedRow = {
              id: params[0],
              conversation_id: params[1],
              proposal_id: params[2],
              proposal_version: params[3],
              config_version: params[4],
              rating: params[5],
              feedback_text: params[6],
              customer_user_id: params[7],
              actor_scope: params[8],
              status: 'NEW',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
            return { rowCount: 1, rows: [insertedRow] }
          }
          return { rowCount: 0, rows: [] }
        },
      }

      const feedback = await submitConciergeFeedbackAsync(mockPool as any, {
        proposal_id: mockProposal.id,
        proposal_version: 1,
        config_version: '1.0.0',
        rating: 'perfect',
        feedback_text: 'Món ăn rất ngon, hợp khẩu vị',
        actor_scope: `user:${USER_ALICE_ID}`,
        customer_user_id: USER_ALICE_ID,
      })

      expect(feedback.status).toBe('NEW')
      expect(feedback.proposal_id).toBe(mockProposal.id)
      expect(feedback.proposal_version).toBe(1)
      expect(feedback.customer_user_id).toBe(USER_ALICE_ID)
      expect(feedback.rating).toBe('perfect')
      expect(insertedRow).not.toBeNull()
      expect(insertedRow.proposal_id).toBe(mockProposal.id)
    })

    it('AT17-5: Admin reviews feedback, transitions status to REVIEWED, and attaches audit note', async () => {
      const feedbackRecord = {
        id: 'fb-test-001',
        proposal_id: mockProposal.id,
        proposal_version: 1,
        config_version: '1.0.0',
        rating: 'too_much',
        feedback_text: '2 người ăn không hết lẩu',
        customer_user_id: USER_ALICE_ID,
        actor_scope: `user:${USER_ALICE_ID}`,
        status: 'NEW',
        admin_notes: null,
        reviewed_by: null,
        reviewed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const mockPool = {
        query: async (queryText: string, params: any[]) => {
          if (queryText.includes('UPDATE public.concierge_feedback')) {
            return {
              rowCount: 1,
              rows: [
                {
                  ...feedbackRecord,
                  status: params[0],
                  admin_notes: params[1],
                  reviewed_by: params[2],
                  reviewed_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }
          }
          return { rowCount: 0, rows: [] }
        },
      }

      const reviewed = await adminReviewFeedbackAsync(mockPool as any, 'fb-test-001', {
        status: 'REVIEWED',
        admin_notes: 'Đã kiểm tra khẩu phần lẩu 2 người và chuyển bếp xem xét',
        reviewed_by: ADMIN_USER_ID,
      })

      expect(reviewed.status).toBe('REVIEWED')
      expect(reviewed.admin_notes).toContain('Đã kiểm tra khẩu phần lẩu 2 người')
      expect(reviewed.reviewed_by).toBe(ADMIN_USER_ID)
      expect(reviewed.reviewed_at).toBeDefined()
    })

    it('AT17-6: Human-in-the-loop verification - Feedback creates review signals and does NOT automatically alter serving profiles or prices', async () => {
      const dishId = '10000000-0000-0000-0000-000000000001'
      const initialProfile = JSON.parse(JSON.stringify(SERVING_PROFILES[dishId]))

      // Submit feedback claiming "too_much"
      await submitConciergeFeedbackAsync(undefined, {
        proposal_id: 'prop-static-test',
        proposal_version: 1,
        config_version: '1.0.0',
        rating: 'too_much',
        feedback_text: 'Gà quá nhiều cho 2 người',
      })

      // Invariant: The system serving profile must remain untouched without human admin approval
      const currentProfile = SERVING_PROFILES[dishId]
      expect(currentProfile.people_min).toBe(initialProfile.people_min)
      expect(currentProfile.people_max).toBe(initialProfile.people_max)
      expect(currentProfile.contributions).toEqual(initialProfile.contributions)
    })
  })

  // --------------------------------------------------------------------------
  // AT18: OBSERVABILITY, PII REDACTION, FEATURE FLAGS & RETENTION
  // --------------------------------------------------------------------------
  describe('AT18: Observability, Redaction, Flags & Retention', () => {
    it('AT18-1: PII Redaction - redacts phone numbers, emails, tokens, addresses and strips hidden reasoning tags', () => {
      const rawText =
        'Số điện thoại của tôi là 0901234567 hoặc +84983456789. Email: alice@example.com. ' +
        'Giao tới Số 123 Đường Lê Lợi, Phường Bến Nghé, Quận 1, TP.HCM. ' +
        'Token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDN secretly session: tok_abc12345678. ' +
        '<thought>Khách hàng có vẻ đang vội, cần ưu tiên xử lý nhanh.</thought>Hết tin nhắn.'

      const sanitized = redactPii(rawText)

      // Phone numbers redacted
      expect(sanitized).not.toContain('0901234567')
      expect(sanitized).not.toContain('+84983456789')
      expect(sanitized).toContain('[REDACTED_PHONE]')

      // Email redacted
      expect(sanitized).not.toContain('alice@example.com')
      expect(sanitized).toContain('[REDACTED_EMAIL]')

      // Tokens redacted
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDN')
      expect(sanitized).not.toContain('tok_abc12345678')
      expect(sanitized).toContain('[REDACTED_TOKEN]')

      // Address redacted
      expect(sanitized).not.toContain('Số 123 Đường Lê Lợi')
      expect(sanitized).toContain('[REDACTED_ADDRESS]')

      // Hidden reasoning stripped completely
      expect(sanitized).not.toContain('<thought>')
      expect(sanitized).not.toContain('Khách hàng có vẻ đang vội')
      expect(sanitized).toContain('Hết tin nhắn.')
    })

    it('AT18-2: Event audit logging enforces PII redaction on user message, reply and action result', async () => {
      let loggedPayload: any = null
      const mockPool = {
        query: async (queryText: string, params: any[]) => {
          if (queryText.includes('INSERT INTO public.concierge_events')) {
            loggedPayload = {
              conversation_id: params[0],
              actor_scope: params[1],
              turn_type: params[2],
              user_message: params[3],
              intent: params[4],
              agent_reply: params[5],
              action_type: params[6],
              action_result: params[7],
            }
            return { rowCount: 1, rows: [] }
          }
          return { rowCount: 0, rows: [] }
        },
      }

      await logConciergeEventRecord(mockPool as any, {
        conversation_id: 'conv-test-001',
        actor_scope: `user:${USER_ALICE_ID}`,
        turn_type: 'chat',
        user_message: 'Số điện thoại của tôi là 0912345678, mang tới Số 456 Đường Nguyễn Trãi, Quận 5',
        intent: 'order',
        agent_reply: 'Dạ em đã ghi nhận số 0912345678 của anh chị. <thought>Internal step</thought>',
        action_type: 'create_order_quote',
        action_result: {
          phone: '0912345678',
          token: 'tok_secret12345',
        },
        state_version_before: 1,
        state_version_after: 2,
      })

      expect(loggedPayload).not.toBeNull()
      // Verifying user message is redacted
      expect(loggedPayload.user_message).not.toContain('0912345678')
      expect(loggedPayload.user_message).toContain('[REDACTED_PHONE]')
      expect(loggedPayload.user_message).not.toContain('Số 456 Đường Nguyễn Trãi')
      expect(loggedPayload.user_message).toContain('[REDACTED_ADDRESS]')

      // Verifying agent reply is redacted and reasoning stripped
      expect(loggedPayload.agent_reply).not.toContain('0912345678')
      expect(loggedPayload.agent_reply).toContain('[REDACTED_PHONE]')
      expect(loggedPayload.agent_reply).not.toContain('Internal step')

      // Verifying action result object is redacted
      expect(loggedPayload.action_result).not.toContain('tok_secret12345')
      expect(loggedPayload.action_result).toContain('[REDACTED_SECRET]')
    })

    it('AT18-3: Kill switches - concierge_disabled blocks mutations and chat with fallback contact info', async () => {
      setConciergeFeatureFlagsForTesting({
        concierge_disabled: true,
      })

      const conv = await getOrCreateConversationAsync(undefined, undefined, undefined, USER_ALICE_ID)

      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          message: 'Tư vấn món ăn cho 4 người',
        },
        {
          actor_scope: `user:${USER_ALICE_ID}`,
          catalog: [],
          pool: undefined,
        },
        USER_ALICE_ID
      )

      expect(envelope.message).toContain('Tiger Concierge đang tạm dừng để nâng cấp hệ thống')
      expect(envelope.message).toContain('098.345.6789')
      expect(envelope.warnings).toContain('Dịch vụ trợ lý ảo đang tạm dừng theo cấu hình vận hành.')
    })

    it('AT18-4: Status/reconcile isolation - Even with kill switch active, existing committed transaction status checks remain accessible', async () => {
      setConciergeFeatureFlagsForTesting({
        concierge_disabled: true,
        ordering_disabled: true,
        reservation_disabled: true,
      })

      const conv = await getOrCreateConversationAsync(undefined, undefined, undefined, USER_ALICE_ID)

      // Customer checks status of an already committed order
      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'order_status',
            order_code: 'TG-20260901-001',
          },
        },
        {
          actor_scope: `user:${USER_ALICE_ID}`,
          catalog: [],
          pool: undefined,
        },
        USER_ALICE_ID
      )

      // Must NOT be blocked by the kill switch!
      expect(envelope.warnings).not.toContain('Dịch vụ trợ lý ảo đang tạm dừng theo cấu hình vận hành.')
      expect(envelope.warnings).not.toContain('Tính năng đặt hàng qua trợ lý ảo đang tạm dừng.')
    })

    it('AT18-5: Data retention & minimization - deletes expired ephemeral records only and strictly preserves business records', async () => {
      const executedQueries: string[] = []

      const mockPool = {
        query: async (queryText: string) => {
          executedQueries.push(queryText)
          return { rowCount: 5, rows: [] }
        },
      }

      const result = await runConciergeRetentionCleanup(mockPool as any, {
        eventsRetentionDays: 30,
        expiredProposalsRetentionDays: 3,
        guestConversationsRetentionDays: 7,
      })

      expect(result.deletedEventsCount).toBe(5)
      expect(result.deletedProposalsCount).toBe(5)
      expect(result.deletedGuestConversationsCount).toBe(5)
      expect(result.protectedBusinessRecordsPreserved).toBe(true)

      // Verify that queries ONLY targeted concierge tables
      for (const q of executedQueries) {
        expect(q).not.toContain('DELETE FROM public.orders')
        expect(q).not.toContain('DELETE FROM public.order_items')
        expect(q).not.toContain('DELETE FROM public.reservations')
        expect(q).not.toContain('DELETE FROM public.dining_tables')
        expect(q).not.toContain('DELETE FROM public.table_visits')
      }

      // Verify policy summary records external blocker for unapproved retention policy
      const summary = getRetentionPolicySummary()
      expect(summary.approvalStatus).toBe('PENDING_OWNER_APPROVAL')
      expect(summary.externalBlocker).toContain('Gate X03')
    })
  })
})
