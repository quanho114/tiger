import { describe, it, expect } from 'vitest'
import {
  computeEquivalentAdults,
  calculateServingCoverage,
  validateMealCandidate,
  type MenuItemCatalogRecord,
} from '../../supabase/functions/_shared/concierge/validator.js'
import {
  ALLERGEN_PROFILES,
} from '../../supabase/functions/_shared/concierge/knowledge.js'
import { buildMealProposals } from '../../supabase/functions/_shared/concierge/recommendation.js'
import { searchRestaurantKnowledge } from '../../supabase/functions/_shared/concierge/rag.js'
import {
  createInitialState,
  transitionConversation,
  validateStateVersion,
} from '../../supabase/functions/_shared/concierge/state-machine.js'
import {
  toolCreateOrderQuote,
  toolLookupRestaurantInfo,
  type ToolContext,
} from '../../supabase/functions/_shared/concierge/tools.js'
import { processConciergeTurn } from '../../supabase/functions/_shared/concierge/runtime.js'

describe('Tiger Concierge Backend Architecture', () => {
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
      id: '10000000-0000-0000-0000-000000000003',
      name: 'Cá hồi áp chảo sốt chanh leo',
      price_vnd: 220000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Lẩu nấm hoàng cung chim câu',
      price_vnd: 380000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: 'Phở bò Wagyu thố đá',
      price_vnd: 145000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000006',
      name: 'Bò nướng lá lốt than hoa',
      price_vnd: 165000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000007',
      name: 'Bánh xèo tép nhảy miền Tây',
      price_vnd: 110000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000008',
      name: 'Cơm niêu cháy giòn kho quẹt tóp mỡ',
      price_vnd: 95000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000009',
      name: 'Mâm tiệc sum vầy 5 món',
      price_vnd: 680000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000010',
      name: 'Trà đào cam sả hạt chia',
      price_vnd: 42000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000011',
      name: 'Nước ép ổi hồng ruby',
      price_vnd: 45000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000012',
      name: 'Bia thủ công Tiger Crystal Draught',
      price_vnd: 38000,
      is_available: true,
    },
    {
      id: '10000000-0000-0000-0000-000000000013',
      name: 'Chè hạt sen long nhãn Phố Hiến',
      price_vnd: 35000,
      is_available: true,
    },
  ]

  const mockContext: ToolContext = {
    catalog: mockCatalog,
    actor_scope: 'guest:test-scope-1234567890',
  }

  describe('1. Serving Math & Macro Coverage Calculation', () => {
    it('calculates equivalent adults correctly based on weights and appetite', () => {
      expect(computeEquivalentAdults(2, 0, 'normal')).toBe(2.0)
      expect(computeEquivalentAdults(2, 1, 'normal')).toBe(2.6)
      expect(computeEquivalentAdults(2, 2, 'heavy')).toBe(3.84)
      expect(computeEquivalentAdults(2, 0, 'light')).toBe(1.7)
    })

    it('evaluates macro coverage and detects nutritional gaps', () => {
      const candidateOnlySides = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000002',
          quantity: 1,
        },
      ]
      const coverage = calculateServingCoverage(candidateOnlySides, {
        adults: 3,
        children: 0,
        appetite: 'normal',
        budget_vnd: null,
        is_hard_budget: false,
        preferences: [],
        dislikes: [],
        allergies: [],
      })

      expect(coverage.is_sufficient).toBe(false)
      expect(coverage.gaps).toContain('Thiếu món đạm chính (Protein)')
    })
  })

  describe('2. Deterministic Validator Pipeline', () => {
    it('recalculates live database price and validates availability', () => {
      const items = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000001', // Sườn: 185k
          quantity: 1,
        },
        {
          menu_item_id: '10000000-0000-0000-0000-000000000008', // Cơm niêu: 95k
          quantity: 1,
        },
        {
          menu_item_id: '10000000-0000-0000-0000-000000000002', // Gỏi cuốn: 85k
          quantity: 1,
        },
        {
          menu_item_id: '10000000-0000-0000-0000-000000000004', // Lẩu nấm: 380k
          quantity: 1,
        },
      ]
      const validation = validateMealCandidate(
        items,
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

      expect(validation.status).toBe('PASS')
      expect(validation.subtotal_vnd).toBe(185000 + 95000 + 85000 + 380000)
    })

    it('blocks proposal if hard budget is exceeded (0% tolerance)', () => {
      const items = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000004',
          quantity: 1,
        },
      ]
      const validation = validateMealCandidate(
        items,
        {
          adults: 2,
          children: 0,
          appetite: 'normal',
          budget_vnd: 350000,
          is_hard_budget: true,
          preferences: [],
          dislikes: [],
          allergies: [],
        },
        mockCatalog
      )

      expect(validation.status).toBe('BLOCKED')
      expect(validation.checks.some((c) => c.status === 'BLOCKED' && c.name === 'check_budget')).toBe(
        true
      )
    })

    it('issues WARNING for soft budget slight overage (+5% tolerance)', () => {
      const items = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000001',
          quantity: 1,
        },
      ]
      const validation = validateMealCandidate(
        items,
        {
          adults: 1,
          children: 0,
          appetite: 'normal',
          budget_vnd: 180000,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: [],
        },
        mockCatalog
      )

      expect(validation.status).toBe('WARNING')
      expect(validation.warnings.some((w) => w.includes('vượt nhẹ ngân sách'))).toBe(true)
    })

    it('blocks proposal when an item explicitly CONTAINS a customer allergen', () => {
      const items = [
        {
          menu_item_id: '10000000-0000-0000-0000-000000000002',
          quantity: 1,
        },
      ]
      const validation = validateMealCandidate(
        items,
        {
          adults: 1,
          children: 0,
          appetite: 'normal',
          budget_vnd: null,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: ['seafood'],
        },
        mockCatalog
      )

      expect(validation.status).toBe('BLOCKED')
      expect(validation.checks.some((c) => c.status === 'BLOCKED' && c.name.includes('allergen'))).toBe(
        true
      )
    })

    it('returns INSUFFICIENT_DATA when an item allergen is unknown or unprofiled', () => {
      const items = [
        {
          menu_item_id: 'non-profiled-item-uuid',
          item_name: 'Món Mới Chưa Đăng Ký',
          quantity: 1,
        },
      ]
      const catalogWithUnknown = [
        ...mockCatalog,
        {
          id: 'non-profiled-item-uuid',
          name: 'Món Mới Chưa Đăng Ký',
          price_vnd: 50000,
          is_available: true,
        },
      ]

      const validation = validateMealCandidate(
        items,
        {
          adults: 1,
          children: 0,
          appetite: 'normal',
          budget_vnd: null,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: ['peanuts'],
        },
        catalogWithUnknown
      )

      expect(validation.status).toBe('INSUFFICIENT_DATA')
      expect(validation.warnings.some((w) => w.includes('chưa có hồ sơ kiểm nghiệm dị ứng'))).toBe(
        true
      )
    })
  })

  describe('3. Food Recommendation Engine', () => {
    it('generates multiple distinct proposals avoiding customer allergens', () => {
      const proposals = buildMealProposals(
        {
          adults: 4,
          children: 0,
          appetite: 'normal',
          budget_vnd: null,
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: ['peanuts'],
        },
        mockCatalog
      )

      expect(proposals.length).toBeGreaterThanOrEqual(1)
      for (const p of proposals) {
        expect(p.validation.status).not.toBe('BLOCKED')
        for (const item of p.items) {
          const profile = ALLERGEN_PROFILES[item.menu_item_id]
          if (profile) {
            expect(profile.allergens.peanuts).not.toBe('contains')
          }
        }
      }
    })
  })

  describe('4. Grounded RAG Knowledge Retrieval', () => {
    it('retrieves accurate restaurant facts with KnowledgeReference citations', () => {
      const search = searchRestaurantKnowledge('mấy giờ mở cửa và địa chỉ quán ở đâu')
      expect(search.results.length).toBeGreaterThan(0)
      expect(search.references.length).toBeGreaterThan(0)
      expect(search.references[0].source).toBe('tiger-restaurant-policy-2026')

      const info = toolLookupRestaurantInfo({ query: 'chỗ đậu xe ô tô' })
      expect(info.content).toContain('bãi đỗ xe')
      expect(info.references.length).toBeGreaterThan(0)
    })
  })

  describe('5. Signed Order Quote Gateway', () => {
    it('generates cryptographically verifiable HMAC quote with calculated prices', async () => {
      const quoteRes = await toolCreateOrderQuote(
        {
          order_type: 'delivery',
          items: [
            {
              menu_item_id: '10000000-0000-0000-0000-000000000001',
              quantity: 2,
              note: 'không hành',
            },
          ],
        },
        mockContext
      )

      expect(quoteRes.quoteCard.type).toBe('order_quote')
      expect(quoteRes.quoteCard.quote_token).toBeDefined()
      expect(quoteRes.quoteCard.subtotal_vnd).toBe(185000 * 2)
      expect(quoteRes.quoteCard.shipping_fee_vnd).toBe(25000)
      expect(quoteRes.quoteCard.total_vnd).toBe(185000 * 2 + 25000)
    })
  })

  describe('6. State Machine & Optimistic Concurrency', () => {
    it('tracks state versions and rejects conflicting stale updates', () => {
      const state = createInitialState('test-conv-1', 'test-token-1')
      expect(state.state_version).toBe(1)
      expect(state.current_step).toBe('IDLE')

      const next = transitionConversation(state, 'ANSWERING', 'restaurant_info')
      expect(next.state_version).toBe(2)

      expect(() => validateStateVersion(next, 1)).toThrowError(
        'Phiên trò chuyện đã được cập nhật ở lượt khác'
      )
    })
  })

  describe('7. End-to-End Single Agent Runtime Turn', () => {
    it('handles food recommendation query, returning cards and options', async () => {
      const envelope = await processConciergeTurn(
        {
          message: 'Tư vấn giúp tôi mâm tiệc cho 4 người ăn khỏe',
        },
        mockContext
      )

      expect(envelope.intent).toBe('food_recommendation')
      expect(envelope.current_step).toBe('RECOMMENDING_PROPOSAL_READY')
      expect(envelope.cards.length).toBeGreaterThanOrEqual(1)
      expect(envelope.cards[0].type).toBe('meal_recommendation')
      expect(envelope.suggested_actions.length).toBeGreaterThan(0)
    })

    it('requires explicit user action to add recommended proposal to cart', async () => {
      const initialEnvelope = await processConciergeTurn(
        {
          message: 'Gợi ý mâm cơm 2 người lớn',
        },
        mockContext
      )

      const proposalCard = initialEnvelope.cards.find(
        (c) => c.type === 'meal_recommendation'
      ) as { type: 'meal_recommendation'; proposal: { id: string } }
      expect(proposalCard).toBeDefined()
      const proposalId = proposalCard.proposal.id

      const cartEnvelope = await processConciergeTurn(
        {
          conversation_id: initialEnvelope.conversation_id,
          session_token: initialEnvelope.session_token,
          state_version: initialEnvelope.state_version,
          action: {
            type: 'add_proposal_to_cart',
            proposal_id: proposalId,
          },
        },
        mockContext
      )

      expect(cartEnvelope.current_step).toBe('RECOMMENDING_CART_UPDATED')
      expect(cartEnvelope.cart_addition).toBeDefined()
      expect(cartEnvelope.cart_addition!.items.length).toBeGreaterThan(0)
      expect(cartEnvelope.message).toContain('Đã chuyển toàn bộ')
    })
  })
})
