/**
 * Tiger 345 - Concierge Agent Regression Test Suite
 * Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.server.config.ts (npm run test:server)
 * - Affected API: Concierge Edge Function APIs (/concierge/chat, /concierge/action, processConciergeTurn, state-machine.ts, validator.ts, tools.ts)
 * - Data Schemas: ConciergeRequestPayload, ConciergeResponseEnvelope, ConciergeState, CandidateItem, MealProposal, OrderQuoteCardData
 * - Verbatim Instruction: "BƯỚC 2 — SỬA CÁC LỖI REVIEW ĐÃ PHÁT HIỆN. Tái hiện và bổ sung regression tests trước hoặc cùng lúc sửa."
 *
 * Covers 8 reviewer findings:
 * 1. Conversation ownership verification (session_token, customer_user_id, CSPRNG tokens)
 * 2. State persistence & concurrency (version enforcement, conflict detection)
 * 3. Allergen safety (unknown/missing = INSUFFICIENT_DATA, may_contain = WARNING, no false safety)
 * 4. Price fabrication & mock removal (no 100k fallback, real shipping calculation)
 * 5. Cart addition revalidation (fresh price/availability, BLOCKED rejection, real names)
 * 6. Serving validator fixes (surplus reachability, 100 hotpots for 2 people, bounds)
 * 7. Conversation & intent transitions (Giờ mở cửa after recommendation, reservation intent, combo edits)
 * 8. Workflow execution (confirm_quote & confirm_reservation connecting to business logic)
 */

import { describe, it, expect } from 'vitest'
import {
  createInitialState,
  validateStateVersion,
  getOrCreateConversation,
  generateSecureToken,
} from '../../supabase/functions/_shared/concierge/state-machine.js'
import {
  validateMealCandidate,
  calculateServingCoverage,
  type MenuItemCatalogRecord,
} from '../../supabase/functions/_shared/concierge/validator.js'
import {
  ALLERGEN_PROFILES,
} from '../../supabase/functions/_shared/concierge/knowledge.js'
import {
  processConciergeTurn,
  classifyIntent,
} from '../../supabase/functions/_shared/concierge/runtime.js'
import {
  toolCreateOrderQuote,
  type ToolContext,
} from '../../supabase/functions/_shared/concierge/tools.js'

describe('Concierge Reviewer Findings Regression Tests', () => {
  const mockCatalog: MenuItemCatalogRecord[] = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Sườn heo nướng mật ong Tây Bắc',
      price_vnd: 185000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Gỏi cuốn tôm thịt hữu cơ',
      price_vnd: 85000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Lẩu nấm hoàng cung chim câu',
      price_vnd: 380000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000008',
      name: 'Cơm niêu cháy giòn kho quẹt tóp mỡ',
      price_vnd: 95000,
      is_available: true,
    },
  ]

  const mockContext: ToolContext = {
    catalog: mockCatalog,
    actor_scope: 'guest:test-scope-regression',
  }

  describe('Finding 1: Conversation Ownership Verification', () => {
    it('generates session tokens using CSPRNG, not Math.random', () => {
      const token1 = generateSecureToken()
      const token2 = generateSecureToken()
      expect(token1).toBeDefined()
      expect(token2).toBeDefined()
      expect(token1).not.toBe(token2)
      expect(token1.startsWith('cst_') || token1.startsWith('stk_')).toBe(true)
      expect(token1.length).toBeGreaterThanOrEqual(24)
    })

    it('rejects access to existing conversation when session_token is omitted', () => {
      const state = getOrCreateConversation(undefined, undefined, null)
      expect(state.conversation_id).toBeDefined()
      expect(state.session_token).toBeDefined()

      expect(() => {
        getOrCreateConversation(state.conversation_id, undefined, null)
      }).toThrowError(/session_token|Mã phiên|quyền truy cập/i)
    })

    it('rejects access to existing conversation when session_token does not match', () => {
      const state = getOrCreateConversation(undefined, undefined, null)

      expect(() => {
        getOrCreateConversation(state.conversation_id, 'wrong-invalid-token', null)
      }).toThrowError(/hợp lệ|FORBIDDEN|UNAUTHORIZED/i)
    })

    it('enforces customer_user_id ownership and prevents cross-user conversation access', () => {
      const userA = '00000000-0000-0000-0000-00000000000a'
      const userB = '00000000-0000-0000-0000-00000000000b'

      const stateUserA = getOrCreateConversation(undefined, undefined, userA)

      expect(() => {
        getOrCreateConversation(stateUserA.conversation_id, stateUserA.session_token, userB)
      }).toThrowError(/người dùng khác|FORBIDDEN|quyền/i)

      expect(() => {
        getOrCreateConversation(stateUserA.conversation_id, stateUserA.session_token, null)
      }).toThrowError(/người dùng khác|FORBIDDEN|quyền/i)
    })

    it('allows guest-to-login transition when valid session_token is provided', () => {
      const userC = '00000000-0000-0000-0000-00000000000c'
      const guestState = getOrCreateConversation(undefined, undefined, null)
      expect(guestState.customer_user_id).toBeNull()

      const upgradedState = getOrCreateConversation(guestState.conversation_id, guestState.session_token, userC)
      expect(upgradedState.customer_user_id).toBe(userC)
    })

    it('throws NOT_FOUND when client provides non-existent conversationId instead of silent recreation', () => {
      expect(() => {
        getOrCreateConversation('non-existent-conv-id', 'some-token', null)
      }).toThrowError(/không tồn tại|NOT_FOUND|hết hạn/i)
    })
  })

  describe('Finding 2: State Persistence & Concurrency', () => {
    it('does NOT skip version checks when clientVersion is omitted on existing conversation', () => {
      const state = createInitialState('test-conv-persist', 'test-token-persist')
      state.state_version = 2

      expect(() => {
        validateStateVersion(state, undefined)
      }).toThrowError(/version|xung đột|state_version/i)
    })

    it('rejects stale state version update on concurrent requests', () => {
      const state = createInitialState('test-conv-concurrent', 'test-token-concurrent')
      state.state_version = 3

      expect(() => {
        validateStateVersion(state, 2)
      }).toThrowError(/CONCIERGE_STATE_CONFLICT|cập nhật ở lượt khác/i)
    })
  })

  describe('Finding 3: Allergen Safety Guardrails', () => {
    it('treats missing profile or missing allergen field as INSUFFICIENT_DATA', () => {
      const unprofiledDish: MenuItemCatalogRecord = {
        id: '99999999-9999-9999-9999-999999999999',
        name: 'Món Mới Chưa Đăng Ký Kiểm Nghiệm',
        price_vnd: 120000,
        is_available: true,
      }

      const res = validateMealCandidate(
        [{ menu_item_id: unprofiledDish.id, quantity: 1 }],
        {
          adults: 2,
          children: 0,
          appetite: 'normal',
          budget_vnd: null,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: ['seafood'],
        },
        [...mockCatalog, unprofiledDish]
      )

      expect(res.status).toBe('INSUFFICIENT_DATA')
      expect(res.warnings.some((w) => w.includes('chưa có hồ sơ kiểm nghiệm') || w.includes('dị ứng'))).toBe(true)
    })

    it('treats may_contain as WARNING and never claims confirmed safety', () => {
      const dishWithMayContain: MenuItemCatalogRecord = {
        id: '88888888-8888-8888-8888-888888888888',
        name: 'Món Bò Xào Có Nguy Cơ Dính Đậu Phộng',
        price_vnd: 135000,
        is_available: true,
      }

      ALLERGEN_PROFILES[dishWithMayContain.id] = {
        item_id: dishWithMayContain.id,
        allergens: {
          peanuts: 'may_contain',
        },
        cross_contact_risk: true,
        source: 'demo_estimate',
        verified_by_kitchen: false,
        updated_at: '2026-09-19',
      }

      const res = validateMealCandidate(
        [{ menu_item_id: dishWithMayContain.id, quantity: 1 }],
        {
          adults: 2,
          children: 0,
          appetite: 'normal',
          budget_vnd: null,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: ['peanuts'],
        },
        [...mockCatalog, dishWithMayContain]
      )

      expect(res.status).toBe('WARNING')
      expect(res.warnings.some((w) => w.includes('nhiễm chéo') || w.includes('may_contain') || w.includes('nguy cơ'))).toBe(true)
    })

    it('marks all seed/demo knowledge records as unverified without kitchen confirmation', () => {
      for (const profile of Object.values(ALLERGEN_PROFILES)) {
        expect(profile.source).toBeDefined()
        if (profile.source === 'demo_estimate' || profile.source === 'system_seed') {
          expect(profile.verified_by_kitchen).toBe(false)
        }
      }
    })
  })

  describe('Finding 4: Remove Price Fabrication and Mock Fallbacks', () => {
    it('returns empty/no-data response when catalog is empty without synthesizing 100k items', async () => {
      const emptyContext: ToolContext = {
        catalog: [],
        actor_scope: 'guest:empty-catalog-test',
      }

      const envelope = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        emptyContext
      )

      expect(envelope.cards.some((c) => c.type === 'meal_recommendation' && c.proposal?.subtotal_vnd === 100000)).toBe(false)
      expect(envelope.message).toMatch(/không có dữ liệu|chưa khả dụng|liên hệ|không tìm thấy/i)
    })
  })

  describe('Finding 5: Revalidation on Cart Addition', () => {
    it('blocks proposal cart addition if proposal validation status is BLOCKED', async () => {
      const envelope = await processConciergeTurn(
        { message: 'Tư vấn món ăn cho người dị ứng hải sản' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: envelope.conversation_id,
            session_token: envelope.session_token,
            state_version: envelope.state_version,
            action: {
              type: 'add_proposal_to_cart',
              proposal_id: 'blocked-proposal-id',
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/bị chặn|BLOCKED|không thể thêm|không hợp lệ/i)
    })

    it('returns real item names and metadata in cart_addition, not generic placeholder', async () => {
      const initialEnvelope = await processConciergeTurn(
        { message: 'Gợi ý mâm cơm 2 người lớn' },
        mockContext
      )

      const propCard = initialEnvelope.cards.find((c) => c.type === 'meal_recommendation') as {
        type: 'meal_recommendation'
        proposal: { id: string }
      }
      expect(propCard).toBeDefined()

      const cartEnvelope = await processConciergeTurn(
        {
          conversation_id: initialEnvelope.conversation_id,
          session_token: initialEnvelope.session_token,
          state_version: initialEnvelope.state_version,
          action: {
            type: 'add_proposal_to_cart',
            proposal_id: propCard.proposal.id,
          },
        },
        mockContext
      )

      expect(cartEnvelope.cart_addition).toBeDefined()
      for (const item of cartEnvelope.cart_addition!.items) {
        expect(item.item_name).toBeDefined()
        expect(item.item_name).not.toMatch(/^Món Tiger #/)
        expect(item.unit_price_vnd).toBeGreaterThan(0)
      }
    })
  })

  describe('Finding 6: Serving Validator Math & Bounds', () => {
    it('detects severe surplus when ordering 100 hotpots for 2 people', () => {
      const candidates = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000004',
          quantity: 100,
        },
      ]

      const coverage = calculateServingCoverage(candidates, {
        adults: 2,
        children: 0,
        appetite: 'normal',
        budget_vnd: null,
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      })

      expect(coverage.is_sufficient).toBe(true)
      expect(coverage.surplus_detected).toBe(true)

      const validation = validateMealCandidate(candidates, {
        adults: 2,
        children: 0,
        appetite: 'normal',
        budget_vnd: null,
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      }, mockCatalog)

      expect(validation.status).toBe('WARNING')
      expect(validation.warnings.some((w) => w.includes('quá nhiều') || w.includes('dư thừa') || w.includes('vượt'))).toBe(true)
    })

    it('rejects negative, fractional, or zero quantities', () => {
      expect(() => {
        validateMealCandidate(
          [{ menu_item_id: '10000000-0000-0000-0000-000000000001', quantity: -2 }],
          {
            adults: 2,
            children: 0,
            appetite: 'normal',
            budget_vnd: null,
            is_hard_budget: false,
            preferences: [],
            dislikes: [],
            allergies: [],
          },
          mockCatalog
        )
      }).toThrowError(/số lượng|nguyên dương|quantity/i)

      expect(() => {
        validateMealCandidate(
          [{ menu_item_id: '10000000-0000-0000-0000-000000000001', quantity: 1.5 }],
          {
            adults: 2,
            children: 0,
            appetite: 'normal',
            budget_vnd: null,
            is_hard_budget: false,
            preferences: [],
            dislikes: [],
            allergies: [],
          },
          mockCatalog
        )
      }).toThrowError(/số lượng|nguyên dương|quantity/i)
    })
  })

  describe('Finding 7: Conversation & Intent Transitions', () => {
    it('allows asking restaurant info ("Giờ mở cửa") after recommendation without transition error', async () => {
      const step1 = await processConciergeTurn(
        { message: 'Gợi ý mâm cơm 2 người lớn' },
        mockContext
      )
      expect(step1.current_step).toBe('RECOMMENDING_PROPOSAL_READY')

      const step2 = await processConciergeTurn(
        {
          conversation_id: step1.conversation_id,
          session_token: step1.session_token,
          state_version: step1.state_version,
          message: 'Nhà hàng mở cửa đến mấy giờ?',
        },
        mockContext
      )

      expect(step2.current_step).toBe('ANSWERING')
      expect(step2.intent).toBe('restaurant_info')
      expect(step2.message).toMatch(/mở cửa|22:00|10:00/i)
    })

    it('classifies "Đặt bàn cho 4 người" as reservation intent, not recommendation', () => {
      const intent = classifyIntent('Đặt bàn cho 4 người tối nay lúc 19h')
      expect(intent).toBe('reservation')
    })

    it('modifies proposal when customer asks "Thêm món rau đi"', async () => {
      const step1 = await processConciergeTurn(
        { message: 'Gợi ý mâm cơm 2 người lớn' },
        mockContext
      )

      const step2 = await processConciergeTurn(
        {
          conversation_id: step1.conversation_id,
          session_token: step1.session_token,
          state_version: step1.state_version,
          message: 'Thêm món rau cho đỡ ngấy nhé',
        },
        mockContext
      )

      expect(step2.intent).toBe('food_recommendation')
      expect(step2.cards.some((c) => c.type === 'meal_recommendation')).toBe(true)
      expect(step2.message).toMatch(/rau|cập nhật|bổ sung/i)
    })

    it('prompts for clarification when customer replies ambiguous "ok"', async () => {
      const step1 = await processConciergeTurn(
        { message: 'Gợi ý mâm cơm 4 người' },
        mockContext
      )

      const step2 = await processConciergeTurn(
        {
          conversation_id: step1.conversation_id,
          session_token: step1.session_token,
          state_version: step1.state_version,
          message: 'ok',
        },
        mockContext
      )

      expect(step2.message).toMatch(/chọn mâm nào|mâm số|xác nhận/i)
    })
  })

  describe('Finding 8: Workflow Execution (Quote & Reservation Confirmation Invariants)', () => {
    it('rejects confirm_quote directly from IDLE state', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'dine_in',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            action: {
              type: 'confirm_quote',
              quote_token: quoteRes.quoteCard.quote_token,
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/IDLE|chưa có báo giá/i)
    })

    it('rejects quote confirmation when actor_scope does not match (403 FORBIDDEN)', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'dine_in',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext // actor_scope: 'guest:test-scope-regression'
      )

      // Start conversation in non-IDLE state
      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      // Try to confirm with a different actor_scope
      const crossActorContext: ToolContext = {
        catalog: mockCatalog,
        actor_scope: 'guest:different-cross-actor-attacker',
      }

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              quote_token: quoteRes.quoteCard.quote_token,
            },
          },
          crossActorContext
        )
      ).rejects.toThrowError(/FORBIDDEN|quyền|khác/i)
    })

    it('fails closed (503 SERVICE_UNAVAILABLE) without pool, never generating synthetic TG codes', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'dine_in',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
          context: {
            table_id: '30000000-0000-0000-0000-000000000001',
            table_visit_id: '20000000-0000-0000-0000-000000000001',
          },
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      // Context without pool
      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              quote_token: quoteRes.quoteCard.quote_token,
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/SERVICE_UNAVAILABLE|cơ sở dữ liệu chưa sẵn sàng/i)
    })

    it('rejects confirm_reservation directly from IDLE state', async () => {
      await expect(
        processConciergeTurn(
          {
            action: {
              type: 'confirm_reservation',
              reservation_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0912345678',
                guest_count: 4,
                starts_at_iso: new Date(Date.now() + 3600000 * 2).toISOString(),
              },
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/IDLE|chưa có thông tin đặt bàn/i)
    })

    it('rejects reservation with past date (01/01/2000)', async () => {
      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_reservation',
              reservation_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0912345678',
                guest_count: 4,
                starts_at_iso: '2000-01-01T12:00:00.000Z',
              },
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/tương lai|30 phút|quá khứ|hợp lệ/i)
    })

    it('rejects reservation with negative or invalid guest count (-4 guests)', async () => {
      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_reservation',
              reservation_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0912345678',
                guest_count: -4,
                starts_at_iso: new Date(Date.now() + 3600000 * 2).toISOString(),
              },
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/số lượng khách|1 đến 30/i)
    })

    it('rejects reservation with invalid phone number (< 9 digits)', async () => {
      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_reservation',
              reservation_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '12345',
                guest_count: 4,
                starts_at_iso: new Date(Date.now() + 3600000 * 2).toISOString(),
              },
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/số điện thoại/i)
    })

    it('fails closed (503 SERVICE_UNAVAILABLE) without pool, never generating synthetic RES codes', async () => {
      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_reservation',
              reservation_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0912345678',
                guest_count: 4,
                starts_at_iso: new Date(Date.now() + 3600000 * 2).toISOString(),
              },
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/SERVICE_UNAVAILABLE|cơ sở dữ liệu chưa sẵn sàng/i)
    })

    it('rejects order confirmation when delivery details are missing (no synthetic fallbacks)', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              quote_token: quoteRes.quoteCard.quote_token,
              // Intentionally omit delivery_details
            },
          },
          mockContext
        )
      ).rejects.toThrowError(/Vui lòng cung cấp họ và tên người nhận|VALIDATION_ERROR/i)
    })

    it('successfully calls public.create_order when pool is provided with valid context', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            return {
              rows: [
                {
                  result: {
                    replayed: false,
                    receipt: {
                      id: 'ord-real-uuid-001',
                      code: 'TG-260920-0001',
                      status: 'pending',
                      total_vnd: quoteRes.quoteCard.total_vnd,
                    },
                  },
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      const envelope = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_quote',
            quote_token: quoteRes.quoteCard.quote_token,
            delivery_details: {
              customer_name: 'Nguyễn Văn A',
              phone: '0901234567',
              address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
            },
          },
        },
        poolContext
      )

      expect(envelope.current_step).toBe('ORDERING_SUBMITTED')
      expect(envelope.message).toContain('TG-260920-0001')
      const orderCard = envelope.cards.find((c) => c.type === 'order_status') as any
      expect(orderCard).toBeDefined()
      expect(orderCard.order_code).toBe('TG-260920-0001')
      expect(orderCard.status).toBe('pending')
    })

    it('fails closed and does not report success when create_order throws', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      const failingPool: any = {
        query: async () => {
          throw new Error('Database connection timeout')
        },
      }

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              quote_token: quoteRes.quoteCard.quote_token,
              delivery_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0901234567',
                address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
              },
            },
          },
          { ...mockContext, pool: failingPool }
        )
      ).rejects.toThrowError(/Không thể thực thi giao dịch đặt đơn|Database connection timeout/i)
    })
  })

  describe('Phase A7: Feedback & Optimization Pipeline', () => {
    it('validates and persists feedback bound to proposal and config version', async () => {
      const { submitConciergeFeedback, listAdminFeedback, adminReviewFeedback } = await import(
        '../../supabase/functions/_shared/concierge/feedback.js'
      )

      // Rejects missing proposal_id
      expect(() =>
        submitConciergeFeedback({
          rating: 'perfect',
        })
      ).toThrowError(/proposal_id/i)

      // Rejects invalid rating
      expect(() =>
        submitConciergeFeedback({
          proposal_id: 'prop-123',
          rating: 'invalid_rating' as any,
        })
      ).toThrowError(/đánh giá không hợp lệ/i)

      // Successfully submits valid feedback
      const record = submitConciergeFeedback({
        proposal_id: 'prop-test-456',
        proposal_version: 1,
        config_version: '1.2',
        rating: 'too_expensive',
        feedback_text: 'Món ngon nhưng giá hơi cao so với sinh viên',
        customer_user_id: 'usr-test-1',
        actor_scope: 'user:usr-test-1',
      })

      expect(record.id).toBeDefined()
      expect(record.status).toBe('NEW')
      expect(record.rating).toBe('too_expensive')
      expect(record.proposal_id).toBe('prop-test-456')
      expect(record.config_version).toBe('1.2')

      // Admin list contains submitted feedback
      const adminList = listAdminFeedback()
      const found = adminList.find((r) => r.id === record.id)
      expect(found).toBeDefined()

      // Admin reviews feedback
      const reviewed = adminReviewFeedback(record.id, {
        status: 'REVIEWED',
        admin_notes: 'Đã chuyển phòng bếp cân nhắc set menu sinh viên',
      })
      expect(reviewed.status).toBe('REVIEWED')
      expect(reviewed.admin_notes).toBe('Đã chuyển phòng bếp cân nhắc set menu sinh viên')
    })
  })

  describe('Finding 9: Action-Bound Idempotency & Replay Protection Invariants', () => {
    it('1. Rejects replay when using same token but modified payload (QUOTE_PAYLOAD_CHANGED, 409)', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      let executionCount = 0
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            executionCount++
            return {
              rows: [
                {
                  result: {
                    replayed: false,
                    receipt: {
                      id: 'ord-test-001',
                      code: 'TG-260920-0001',
                      status: 'pending',
                      total_vnd: quoteRes.quoteCard.total_vnd,
                    },
                  },
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      // First confirmation succeeds
      const confirmTurn1 = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_test_action_1',
            quote_token: quoteRes.quoteCard.quote_token,
            delivery_details: {
              customer_name: 'Nguyễn Văn A',
              phone: '0901234567',
              address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
            },
          },
        },
        poolContext
      )
      expect(confirmTurn1.current_step).toBe('ORDERING_SUBMITTED')
      expect(executionCount).toBe(1)

      // Attempt replay with SAME quote_token and SAME action_id but MODIFIED delivery address
      await expect(
        processConciergeTurn(
          {
            conversation_id: confirmTurn1.conversation_id,
            session_token: confirmTurn1.session_token,
            state_version: confirmTurn1.state_version,
            action: {
              type: 'confirm_quote',
              action_id: 'act_ord_test_action_1',
              quote_token: quoteRes.quoteCard.quote_token,
              delivery_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0901234567',
                address: '456 Địa chỉ khác hoàn toàn, Quận 1',
              },
            },
          },
          poolContext
        )
      ).rejects.toThrowError(/QUOTE_PAYLOAD_CHANGED|thay đổi so với báo giá|khác với giao dịch/i)

      expect(executionCount).toBe(1)
    })

    it('2. Retrying the same action returns the same receipt without creating a new transaction', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      let executionCount = 0
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            executionCount++
            return {
              rows: [
                {
                  result: {
                    replayed: false,
                    receipt: {
                      id: 'ord-test-002',
                      code: 'TG-260920-0002',
                      status: 'pending',
                      total_vnd: quoteRes.quoteCard.total_vnd,
                    },
                  },
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      // First confirmation succeeds
      const confirmTurn1 = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_test_action_2',
            quote_token: quoteRes.quoteCard.quote_token,
            delivery_details: {
              customer_name: 'Trần Thị B',
              phone: '0909888777',
              address: '789 Đường Lê Văn Sỹ, P.13, Q.3',
            },
          },
        },
        poolContext
      )
      expect(confirmTurn1.current_step).toBe('ORDERING_SUBMITTED')
      expect(executionCount).toBe(1)

      // Retry exact same action with same fingerprint (even with different client idempotency_key)
      const retryTurn = await processConciergeTurn(
        {
          conversation_id: confirmTurn1.conversation_id,
          session_token: confirmTurn1.session_token,
          state_version: confirmTurn1.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_test_action_2',
            quote_token: quoteRes.quoteCard.quote_token,
            idempotency_key: 'different-client-retry-key-12345',
            delivery_details: {
              customer_name: 'Trần Thị B',
              phone: '0909888777',
              address: '789 Đường Lê Văn Sỹ, P.13, Q.3',
            },
          },
        },
        poolContext
      )

      expect(retryTurn.current_step).toBe('ORDERING_SUBMITTED')
      expect(retryTurn.message).toContain('TG-260920-0002')
      const orderCard = retryTurn.cards.find((c) => c.type === 'order_status') as any
      expect(orderCard).toBeDefined()
      expect(orderCard.order_code).toBe('TG-260920-0002')
      expect(executionCount).toBe(1)
    })

    it('3. A new action with identical content as past order is not mistaken for a retry and creates a new transaction', async () => {
      const quoteRes1 = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      let executionCount = 0
      const createdCodes: string[] = []
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            executionCount++
            const orderCode = `TG-260920-000${executionCount}`
            createdCodes.push(orderCode)
            return {
              rows: [
                {
                  result: {
                    replayed: false,
                    receipt: {
                      id: `ord-test-00${executionCount}`,
                      code: orderCode,
                      status: 'pending',
                      total_vnd: quoteRes1.quoteCard.total_vnd,
                    },
                  },
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      // Action 1: First order confirmation
      const confirmTurn1 = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_first_action',
            quote_token: quoteRes1.quoteCard.quote_token,
            delivery_details: {
              customer_name: 'Lê Văn C',
              phone: '0933111222',
              address: '100 Nguyễn Thị Minh Khai, Q.1',
            },
          },
        },
        poolContext
      )
      expect(executionCount).toBe(1)
      expect(createdCodes[0]).toBe('TG-260920-0001')

      // Customer asks to order again in the same conversation -> transitions back to ordering flow
      const reorderTurn = await processConciergeTurn(
        {
          conversation_id: confirmTurn1.conversation_id,
          session_token: confirmTurn1.session_token,
          state_version: confirmTurn1.state_version,
          message: 'Gợi ý thêm món tương tự để tôi đặt thêm một đơn',
        },
        poolContext
      )
      expect(reorderTurn.current_step).toBe('RECOMMENDING_PROPOSAL_READY')

      // New quote issued for the second order
      const quoteRes2 = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 1,
            },
          ],
        },
        mockContext
      )

      // Action 2: Second order with identical items and delivery details but its own distinct action_id
      const confirmTurn2 = await processConciergeTurn(
        {
          conversation_id: reorderTurn.conversation_id,
          session_token: reorderTurn.session_token,
          state_version: reorderTurn.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_second_action',
            quote_token: quoteRes2.quoteCard.quote_token,
            delivery_details: {
              customer_name: 'Lê Văn C',
              phone: '0933111222',
              address: '100 Nguyễn Thị Minh Khai, Q.1',
            },
          },
        },
        poolContext
      )

      // Verifies a new transaction was executed (executionCount = 2) and received new order code
      expect(executionCount).toBe(2)
      expect(createdCodes[1]).toBe('TG-260920-0002')
      const orderCard2 = confirmTurn2.cards.find((c) => c.type === 'order_status') as any
      expect(orderCard2).toBeDefined()
      expect(orderCard2.order_code).toBe('TG-260920-0002')
    })
  })

  describe('Finding 10: Post-Commit Reconciliation & Expired Action Invariants', () => {
    it('1. Action is pending, DB committed, quote expired -> returns existing receipt without mutation', async () => {
      const { createOrderQuote, getQuoteSecret } = await import('../../supabase/functions/_shared/quote.js')

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      // Generate a signed quote that is already expired (ttl = -10 seconds)
      const expiredQuote = createOrderQuote(
        {
          actor_scope: mockContext.actor_scope,
          order_type: 'delivery',
          context: {
            delivery_zone_id: 'zone-d3',
            customer_name: 'Nguyễn Văn A',
            customer_phone: '0901234567',
            address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
          },
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              item_name: 'Sườn heo nướng mật ong Tây Bắc',
              quantity: 1,
              note: '',
              unit_price_vnd: 185000,
              line_total_vnd: 185000,
            },
          ],
          subtotal_vnd: 185000,
          shipping_fee_vnd: 25000,
          total_vnd: 210000,
        },
        getQuoteSecret(),
        -10
      )

      let mutationExecuted = false

      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            mutationExecuted = true
            throw new Error('Mutation must not be executed during idempotent reconciliation')
          }
          if (text.includes('public.idempotency_requests')) {
            return {
              rows: [
                {
                  response_json: {
                    code: 'TG-260920-COMMITTED',
                    order_code: 'TG-260920-COMMITTED',
                    status: 'pending',
                    total_vnd: 210000,
                    order_type: 'delivery',
                  },
                  actor_scope: mockContext.actor_scope,
                  request_hash: null,
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      // Client retries action after quote expired, but DB has already committed order
      const retryTurn = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_quote',
            action_id: 'act_ord_pending_crashed_worker',
            quote_token: expiredQuote.quote_token,
            delivery_details: {
              customer_name: 'Nguyễn Văn A',
              phone: '0901234567',
              address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
            },
          },
        },
        poolContext
      )

      expect(mutationExecuted).toBe(false)
      expect(retryTurn.current_step).toBe('ORDERING_SUBMITTED')
      expect(retryTurn.message).toContain('TG-260920-COMMITTED')
      const orderCard = retryTurn.cards.find((c) => c.type === 'order_status') as any
      expect(orderCard).toBeDefined()
      expect(orderCard.order_code).toBe('TG-260920-COMMITTED')
    })

    it('2. Action is pending, no receipt in DB, quote expired -> rejects without mutation', async () => {
      const { createOrderQuote, getQuoteSecret } = await import('../../supabase/functions/_shared/quote.js')

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      const expiredQuote = createOrderQuote(
        {
          actor_scope: mockContext.actor_scope,
          order_type: 'delivery',
          context: {
            delivery_zone_id: 'zone-d3',
            customer_name: 'Nguyễn Văn A',
            customer_phone: '0901234567',
            address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
          },
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              item_name: 'Sườn heo nướng mật ong Tây Bắc',
              quantity: 1,
              note: '',
              unit_price_vnd: 185000,
              line_total_vnd: 185000,
            },
          ],
          subtotal_vnd: 185000,
          shipping_fee_vnd: 25000,
          total_vnd: 210000,
        },
        getQuoteSecret(),
        -10
      )

      let mutationExecuted = false
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            mutationExecuted = true
            throw new Error('Mutation must not be executed for uncommitted expired quote')
          }
          if (text.includes('public.idempotency_requests')) {
            return { rows: [] } // No committed transaction in DB
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              action_id: 'act_ord_uncommitted_action',
              quote_token: expiredQuote.quote_token,
              delivery_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0901234567',
                address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
              },
            },
          },
          poolContext
        )
      ).rejects.toThrowError(/QUOTE_EXPIRED|Báo giá đã hết hạn/i)

      expect(mutationExecuted).toBe(false)
    })

    it('3. Error during receipt lookup -> returns retryable error without mutation', async () => {
      const { createOrderQuote, getQuoteSecret } = await import('../../supabase/functions/_shared/quote.js')

      const initialTurn = await processConciergeTurn(
        { message: 'Gợi ý món ăn cho 2 người' },
        mockContext
      )

      const quote = createOrderQuote(
        {
          actor_scope: mockContext.actor_scope,
          order_type: 'delivery',
          context: {
            delivery_zone_id: 'zone-d3',
            customer_name: 'Nguyễn Văn A',
            customer_phone: '0901234567',
            address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
          },
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              item_name: 'Sườn heo nướng mật ong Tây Bắc',
              quantity: 1,
              note: '',
              unit_price_vnd: 185000,
              line_total_vnd: 185000,
            },
          ],
          subtotal_vnd: 185000,
          shipping_fee_vnd: 25000,
          total_vnd: 210000,
        },
        getQuoteSecret(),
        300
      )

      let mutationExecuted = false
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_order')) {
            mutationExecuted = true
            throw new Error('Mutation must not be executed when reconciliation fails')
          }
          if (text.includes('public.idempotency_requests')) {
            throw new Error('PostgreSQL connection timeout on receipt lookup')
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_quote',
              action_id: 'act_ord_failing_lookup',
              quote_token: quote.quote_token,
              delivery_details: {
                customer_name: 'Nguyễn Văn A',
                phone: '0901234567',
                address: '123 Đường số 1, Vĩnh An, Vĩnh Cửu',
              },
            },
          },
          poolContext
        )
      ).rejects.toThrowError(/SERVICE_UNAVAILABLE|Không thể xác minh trạng thái giao dịch/i)

      expect(mutationExecuted).toBe(false)
    })
  })

  describe('Finding 11: Reservation Replay with Expired Hold & Multi-Action Preservation', () => {
    it('1. Reservation: hold token expired + receipt committed in DB -> returns receipt without mutation', async () => {
      const { createReservationHoldToken, getQuoteSecret } = await import('../../supabase/functions/_shared/quote.js')

      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      const startsAtIso = new Date(Date.now() + 3600000 * 2).toISOString()
      const expiredHold = createReservationHoldToken(
        {
          actor_scope: mockContext.actor_scope,
          customer_name: 'Nguyễn Văn A',
          phone: '0901234567',
          guest_count: 4,
          starts_at_iso: startsAtIso,
        },
        getQuoteSecret(),
        -10 // expired 10 seconds ago
      )

      let mutationExecuted = false

      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_reservation') || text.includes('INSERT INTO public.reservations')) {
            mutationExecuted = true
            throw new Error('Mutation must not be executed during idempotent reconciliation')
          }
          if (text.includes('public.idempotency_requests')) {
            return {
              rows: [
                {
                  response_json: {
                    code: 'RES-260920-COMMITTED',
                    reservation_code: 'RES-260920-COMMITTED',
                    status: 'confirmed',
                    guest_count: 4,
                    customer_name: 'Nguyễn Văn A',
                  },
                  actor_scope: mockContext.actor_scope,
                  request_hash: null,
                },
              ],
            }
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      const retryTurn = await processConciergeTurn(
        {
          conversation_id: initialTurn.conversation_id,
          session_token: initialTurn.session_token,
          state_version: initialTurn.state_version,
          action: {
            type: 'confirm_reservation',
            action_id: 'act_res_pending_reconcile',
            hold_token: expiredHold.hold_token,
            reservation_details: {
              customer_name: 'Nguyễn Văn A',
              phone: '0901234567',
              guest_count: 4,
              starts_at_iso: startsAtIso,
            },
          },
        },
        poolContext
      )

      expect(mutationExecuted).toBe(false)
      expect(retryTurn.current_step).toBe('RESERVING_SUBMITTED')
      expect(retryTurn.message).toContain('RES-260920-COMMITTED')
      const resvCard = retryTurn.cards.find((c) => c.type === 'reservation_status') as any
      expect(resvCard).toBeDefined()
      expect(resvCard.reservation_code).toBe('RES-260920-COMMITTED')
    })

    it('2. Reservation: hold token expired + no receipt in DB -> rejects with 409 RESERVATION_HOLD_INVALID without mutation', async () => {
      const { createReservationHoldToken, getQuoteSecret } = await import('../../supabase/functions/_shared/quote.js')

      const initialTurn = await processConciergeTurn(
        { message: 'Tôi muốn đặt bàn' },
        mockContext
      )

      const startsAtIso = new Date(Date.now() + 3600000 * 2).toISOString()
      const expiredHold = createReservationHoldToken(
        {
          actor_scope: mockContext.actor_scope,
          customer_name: 'Nguyễn Văn B',
          phone: '0907654321',
          guest_count: 2,
          starts_at_iso: startsAtIso,
        },
        getQuoteSecret(),
        -10 // expired
      )

      let mutationExecuted = false
      const mockPool: any = {
        query: async (text: string, _params?: any[]) => {
          if (text.includes('public.create_reservation') || text.includes('INSERT INTO public.reservations')) {
            mutationExecuted = true
            throw new Error('Mutation must not be executed for uncommitted expired hold')
          }
          if (text.includes('public.idempotency_requests')) {
            return { rows: [] } // No committed transaction in DB
          }
          return { rows: [] }
        },
      }

      const poolContext: ToolContext = {
        ...mockContext,
        pool: mockPool,
      }

      await expect(
        processConciergeTurn(
          {
            conversation_id: initialTurn.conversation_id,
            session_token: initialTurn.session_token,
            state_version: initialTurn.state_version,
            action: {
              type: 'confirm_reservation',
              action_id: 'act_res_uncommitted_action',
              hold_token: expiredHold.hold_token,
              reservation_details: {
                customer_name: 'Nguyễn Văn B',
                phone: '0907654321',
                guest_count: 2,
                starts_at_iso: startsAtIso,
              },
            },
          },
          poolContext
        )
      ).rejects.toThrowError(/RESERVATION_HOLD_INVALID|Mã giữ chỗ \(hold_token\) đã hết hạn/i)

      expect(mutationExecuted).toBe(false)
    })

    it.each([
      {
        target: 'order',
        activeType: 'reservation',
        committedCode: 'TG-260920-COMMITTED-A',
      },
      {
        target: 'reservation',
        activeType: 'order',
        committedCode: 'RES-260920-COMMITTED-A',
      },
    ])(
      '3. Retry committed $target action while $activeType action B is active preserves B state',
      async ({ target, activeType, committedCode }) => {
        const { createOrderQuote, createReservationHoldToken, getQuoteSecret } = await import(
          '../../supabase/functions/_shared/quote.js'
        )

        const convId = `conv-multi-action-${target}-${Date.now()}`
        const sessionToken = `cst_multi_action_${target}`
        const initialVersion = 3

        const activeBActionId = `act_${activeType}_b_active_123`
        const committedAActionId = `act_${target}_a_committed_456`

        const initialStep = activeType === 'reservation' ? 'RESERVING_CONFIRMING' : 'ORDERING_QUOTED'
        const initialIntent = activeType === 'reservation' ? 'reservation' : 'order'

        const preservedConstraints = {
          adults: 6,
          children: 2,
          appetite: 'normal' as const,
          budget_vnd: 1500000,
          is_hard_budget: true,
          preferences: ['outdoor', 'quiet'],
          dislikes: ['spicy'],
          allergies: ['peanut'],
        }

        const activeBPendingAction = {
          id: activeBActionId,
          action_type: activeType === 'reservation' ? 'confirm_reservation' : 'confirm_quote',
          status: 'pending' as const,
          actor_scope: mockContext.actor_scope,
          conversation_id: convId,
          state_version: initialVersion,
          content_fingerprint: 'fingerprint-b-active',
          reference_id: `ref-b-${activeType}`,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
          payload: {
            action_id: activeBActionId,
            description: `Active ${activeType} transaction details`,
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }

        let updatedStateRecorded: any = null

        const mockPool: any = {
          query: async (text: string, params?: any[]) => {
            if (text.includes('FROM public.concierge_conversations') && text.includes('WHERE id = $1')) {
              return {
                rows: [
                  {
                    id: convId,
                    session_token: sessionToken,
                    customer_user_id: null,
                    current_step: initialStep,
                    state_version: initialVersion,
                    constraints: preservedConstraints,
                    active_proposal_id: null,
                    pending_action: activeBPendingAction,
                    metadata: {
                      current_intent: initialIntent,
                      active_quote: activeType === 'order' ? { quote_token: 'quote_b_token' } : undefined,
                      pending_reservation: activeType === 'reservation' ? { customer_name: 'Khách B' } : undefined,
                      messages: [],
                      last_proposals: [],
                    },
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                ],
              }
            }

            if (text.includes('public.idempotency_requests')) {
              return {
                rows: [
                  {
                    response_json: {
                      code: committedCode,
                      order_code: committedCode,
                      reservation_code: committedCode,
                      status: 'confirmed',
                    },
                    actor_scope: mockContext.actor_scope,
                    request_hash: null,
                  },
                ],
              }
            }

            if (text.includes('UPDATE public.concierge_conversations')) {
              updatedStateRecorded = {
                nextStep: params?.[0],
                nextVersion: params?.[1],
                constraints: typeof params?.[2] === 'string' ? JSON.parse(params[2]) : params?.[2],
                pending_action: typeof params?.[4] === 'string' ? JSON.parse(params[4]) : params?.[4],
                expectedVersion: params?.[9],
              }
              return { rowCount: 1 }
            }

            return { rows: [] }
          },
        }

        const poolContext: ToolContext = {
          ...mockContext,
          pool: mockPool,
        }

        let retryActionPayload: any

        if (target === 'order') {
          const quoteA = createOrderQuote(
            {
              actor_scope: mockContext.actor_scope,
              order_type: 'delivery',
              context: {
                delivery_zone_id: 'zone-d3',
                customer_name: 'Khách Hàng A',
                customer_phone: '0901111111',
                address: '123 Đường A, Quận 1',
              },
              items: [
                {
                  menu_item_id: '10000000-0000-0000-0000-000000000001',
                  item_name: 'Sườn heo nướng mật ong Tây Bắc',
                  quantity: 1,
                  note: '',
                  unit_price_vnd: 185000,
                  line_total_vnd: 185000,
                },
              ],
              subtotal_vnd: 185000,
              shipping_fee_vnd: 25000,
              total_vnd: 210000,
            },
            getQuoteSecret(),
            300
          )

          retryActionPayload = {
            type: 'confirm_quote',
            action_id: committedAActionId,
            quote_token: quoteA.quote_token,
            delivery_details: {
              customer_name: 'Khách Hàng A',
              phone: '0901111111',
              address: '123 Đường A, Quận 1',
            },
          }
        } else {
          const startsAtIso = new Date(Date.now() + 3600000 * 3).toISOString()
          const holdA = createReservationHoldToken(
            {
              actor_scope: mockContext.actor_scope,
              customer_name: 'Khách Hàng A',
              phone: '0902222222',
              guest_count: 2,
              starts_at_iso: startsAtIso,
            },
            getQuoteSecret(),
            300
          )

          retryActionPayload = {
            type: 'confirm_reservation',
            action_id: committedAActionId,
            hold_token: holdA.hold_token,
            reservation_details: {
              customer_name: 'Khách Hàng A',
              phone: '0902222222',
              guest_count: 2,
              starts_at_iso: startsAtIso,
            },
          }
        }

        const replayTurn = await processConciergeTurn(
          {
            conversation_id: convId,
            session_token: sessionToken,
            state_version: initialVersion,
            action: retryActionPayload,
          },
          poolContext
        )

        // 1. Receipt A is returned correctly
        expect(replayTurn.message).toContain(committedCode)
        const expectedCardType = target === 'order' ? 'order_status' : 'reservation_status'
        const card = replayTurn.cards.find((c) => c.type === expectedCardType) as any
        expect(card).toBeDefined()
        const returnedCode = target === 'order' ? card.order_code : card.reservation_code
        expect(returnedCode).toBe(committedCode)

        // 2. Action B's conversational step and intent are fully preserved
        expect(replayTurn.current_step).toBe(initialStep)
        expect(replayTurn.intent).toBe(initialIntent)

        // 3. state_version progressed by CAS (initialVersion -> initialVersion + 1, never back or bypassed)
        expect(replayTurn.state_version).toBe(initialVersion + 1)
        expect(updatedStateRecorded).toBeDefined()
        expect(updatedStateRecorded.expectedVersion).toBe(initialVersion)
        expect(updatedStateRecorded.nextVersion).toBe(initialVersion + 1)

        // 4. Action B's pending_action and business constraints are preserved in database CAS update
        expect(updatedStateRecorded.pending_action).toBeDefined()
        expect(updatedStateRecorded.pending_action.id).toBe(activeBActionId)
        expect(updatedStateRecorded.pending_action.action_type).toBe(activeBPendingAction.action_type)
        expect(updatedStateRecorded.constraints).toEqual(preservedConstraints)
      }
    )
  })
})
