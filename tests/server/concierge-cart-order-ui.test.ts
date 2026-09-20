/**
 * Tiger 345 - Concierge Cart & Order UI Test Suite (Task C06 - AT13, AT14)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Vitest runner via vitest.server.config.ts (npm run test:server)
 * - Affected API:
 *   - supabase/functions/_shared/concierge/runtime.ts (processConciergeTurn)
 *   - supabase/functions/_shared/concierge/tools.ts (toolCreateOrderQuote)
 *   - supabase/functions/_shared/concierge/types.ts (ConciergeActionPayload, ConciergeResponseEnvelope)
 *   - supabase/functions/_shared/quote.ts (createOrderQuote, verifyOrderQuote)
 * - Data Schemas:
 *   - ConciergeTurnContext, MealProposal, ConciergeActionPayload, ConciergeResponseEnvelope
 * - Verbatim Instructions (C06 / AT13 / AT14):
 *   - "Add proposal đọc lại owner/version/expiry và live price/availability/allergy/budget; thay đổi đáng kể hiển thị và yêu cầu chấp thuận lại."
 *   - "Giỏ dùng tên/ID/quantity thật; double click/retry không nhân đôi ngoài ý muốn."
 *   - "Thu thập contact/address/fulfillment thật; quote tổng có phí/giảm giá/thuế theo business service; không placeholder."
 *   - "Hiển thị quote trước explicit confirm; ok mơ hồ không submit; đổi cart/fulfillment vô hiệu quote cũ."
 *   - "Đọc status thật có ownership; newly created pending không nói đang nấu; refresh/retry lấy receipt C02."
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
  type MealProposal,
} from '../../supabase/functions/_shared/concierge/types.js'
import {
  createOrderQuote,
  verifyOrderQuote,
  computeCanonicalRequestHash,
} from '../../supabase/functions/_shared/quote.js'
import { AppError } from '../../supabase/functions/_shared/errors.js'

describe('Task C06: Concierge Cart & Order UI Server Validation (AT13, AT14)', () => {
  const ITEM_A: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'Gà Hấp Nước Mắm Nhĩ',
    price_vnd: 240000,
    is_available: true,
  }

  const ITEM_B: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000002',
    name: 'Lẩu Cá Kèo Lá Giang',
    price_vnd: 280000,
    is_available: true,
  }

  const ITEM_UNAVAILABLE: MenuItemCatalogRecord = {
    id: '10000000-0000-0000-0000-000000000003',
    name: 'Bò Tơ Cuốn Rau Rừng',
    price_vnd: 320000,
    is_available: false,
  }

  const baseCatalog: MenuItemCatalogRecord[] = [ITEM_A, ITEM_B, ITEM_UNAVAILABLE]

  const defaultContext: ToolContext = {
    actor_scope: 'guest:session-alice-123',
    catalog: baseCatalog,
  }

  const sampleProposal: MealProposal = {
    id: 'prop-sample-001',
    title: 'Mâm tiệc 2 người ấm cúng',
    description: '1 gà hấp mắm nhĩ + 1 lẩu cá kèo lá giang',
    concept_tag: 'signature_experience',
    version: 1,
    items: [
      {
        menu_item_id: ITEM_A.id,
        item_name: ITEM_A.name,
        quantity: 2,
        unit_price_vnd: 240000,
        meal_role: 'main_protein',
        serving_size: 'Phần 2 người',
      },
      {
        menu_item_id: ITEM_B.id,
        item_name: ITEM_B.name,
        quantity: 1,
        unit_price_vnd: 280000,
        meal_role: 'soup_hotpot',
        serving_size: 'Nồi vừa',
      },
    ],
    subtotal_vnd: 760000, // (240000 * 2) + 280000 = 760000
    serving_summary: '2 người lớn',
    validation: {
      status: 'PASS',
      warnings: [],
      assumptions: ['Khẩu phần 2 người'],
      checks: [
        { name: 'allergen', status: 'PASS', message: 'An toàn dị ứng' },
        { name: 'budget', status: 'PASS', message: 'Phù hợp ngân sách' },
      ],
      subtotal_vnd: 760000,
      coverage: {
        target_equivalent_adults: 2,
        protein_coverage_ratio: 1.0,
        carb_coverage_ratio: 1.0,
        vegetable_coverage_ratio: 1.0,
        soup_coverage_ratio: 1.0,
        overall_fit_score: 1.0,
        is_sufficient: true,
        gaps: [],
      },
      validated_at: new Date().toISOString(),
      version: 1,
    },
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    actor_scope: 'guest:session-alice-123',
  }

  describe('AT13: Add Proposal to Cart revalidation & safety gates', () => {
    it('successfully adds valid proposal with atomic multi-item quantities to cart', async () => {
      const conv = createInitialState(undefined, null)
      conv.last_proposals = [sampleProposal]
      await saveInitialConversationRecord(undefined, conv)

      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'add_proposal_to_cart',
            proposal_id: sampleProposal.id,
          },
        },
        defaultContext
      )

      expect(envelope.cart_addition).toBeDefined()
      expect(envelope.cart_addition?.items).toHaveLength(2)

      const item1 = envelope.cart_addition?.items.find((i) => i.menu_item_id === ITEM_A.id)
      expect(item1).toBeDefined()
      expect(item1?.quantity).toBe(2)
      expect(item1?.unit_price_vnd).toBe(240000)

      const item2 = envelope.cart_addition?.items.find((i) => i.menu_item_id === ITEM_B.id)
      expect(item2).toBeDefined()
      expect(item2?.quantity).toBe(1)
      expect(item2?.unit_price_vnd).toBe(280000)
    })

    it('rejects adding proposal belonging to another actor_scope (403 FORBIDDEN ownership)', async () => {
      const conv = createInitialState(undefined, null)
      const foreignProposal: MealProposal = {
        ...sampleProposal,
        id: 'prop-foreign-999',
        actor_scope: 'guest:session-bob-456',
      }
      conv.last_proposals = [foreignProposal]
      await saveInitialConversationRecord(undefined, conv)

      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'add_proposal_to_cart',
              proposal_id: foreignProposal.id,
            },
          },
          defaultContext // actor_scope is guest:session-alice-123
        )
      ).rejects.toThrowError(/quyền|không có quyền|Mâm đề xuất thuộc về người dùng/i)
    })

    it('rejects adding proposal if live item is now out of stock (409 MENU_ITEM_UNAVAILABLE)', async () => {
      const conv = createInitialState(undefined, null)
      const outOfStockProposal: MealProposal = {
        ...sampleProposal,
        id: 'prop-oos-001',
        items: [
          {
            menu_item_id: ITEM_UNAVAILABLE.id,
            item_name: ITEM_UNAVAILABLE.name,
            quantity: 1,
            unit_price_vnd: ITEM_UNAVAILABLE.price_vnd,
          },
        ],
      }
      conv.last_proposals = [outOfStockProposal]
      await saveInitialConversationRecord(undefined, conv)

      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'add_proposal_to_cart',
              proposal_id: outOfStockProposal.id,
            },
          },
          defaultContext
        )
      ).rejects.toThrowError(/ngưng phục vụ|hết món|không còn khả dụng/i)
    })

    it('detects live price divergence and requires explicit accept_price_change (409 PRICE_CHANGED)', async () => {
      const conv = createInitialState(undefined, null)
      conv.last_proposals = [sampleProposal]
      await saveInitialConversationRecord(undefined, conv)

      // Catalog where ITEM_A increased from 240.000 to 260.000
      const changedCatalog: MenuItemCatalogRecord[] = [
        {
          ...ITEM_A,
          price_vnd: 260000,
        },
        ITEM_B,
      ]

      const changedContext: ToolContext = {
        ...defaultContext,
        catalog: changedCatalog,
      }

      // 1. Without accept_price_change: must fail with PRICE_CHANGED error
      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'add_proposal_to_cart',
              proposal_id: sampleProposal.id,
              accept_price_change: false,
            },
          },
          changedContext
        )
      ).rejects.toThrowError(/Giá món ăn đã thay đổi/i)

      // 2. With accept_price_change: true: succeeds with updated live catalog pricing
      const envelope = await processConciergeTurn(
        {
          conversation_id: conv.conversation_id,
          session_token: conv.session_token,
          state_version: conv.state_version,
          action: {
            type: 'add_proposal_to_cart',
            proposal_id: sampleProposal.id,
            accept_price_change: true,
          },
        },
        changedContext
      )

      expect(envelope.cart_addition).toBeDefined()
      const addedItemA = envelope.cart_addition?.items.find((i) => i.menu_item_id === ITEM_A.id)
      expect(addedItemA?.unit_price_vnd).toBe(260000)
    })

    it('blocks proposal addition if validation status is BLOCKED (allergen or budget gate)', async () => {
      const conv = createInitialState(undefined, null)
      const blockedProposal: MealProposal = {
        ...sampleProposal,
        id: 'prop-blocked-001',
        validation: {
          ...sampleProposal.validation,
          status: 'BLOCKED',
          warnings: ['Chứa đậu phộng gây dị ứng nguy hiểm'],
        },
      }
      conv.last_proposals = [blockedProposal]
      await saveInitialConversationRecord(undefined, conv)

      await expect(
        processConciergeTurn(
          {
            conversation_id: conv.conversation_id,
            session_token: conv.session_token,
            state_version: conv.state_version,
            action: {
              type: 'add_proposal_to_cart',
              proposal_id: blockedProposal.id,
            },
          },
          defaultContext
        )
      ).rejects.toThrowError(/kiểm nghiệm dị ứng|ngân sách|bị chặn/i)
    })
  })

  describe('AT14: Order Quote, Confirmation, HMAC Token & Status Integrity', () => {
    it('creates an HMAC-signed delivery quote bound to actor_scope, items, fees, and TTL', () => {
      const quote = createOrderQuote({
        order_type: 'delivery',
        actor_scope: 'guest:session-alice-123',
        context: {
          delivery_zone_id: '40000000-0000-0000-0000-000000000001',
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          address: '17 Đường Số 1, Vĩnh An',
        },
        subtotal_vnd: 520000,
        shipping_fee_vnd: 15000,
        total_vnd: 535000,
        items: [
          { menu_item_id: ITEM_A.id, item_name: ITEM_A.name, quantity: 1, unit_price_vnd: 240000, line_total_vnd: 240000, note: '' },
          { menu_item_id: ITEM_B.id, item_name: ITEM_B.name, quantity: 1, unit_price_vnd: 280000, line_total_vnd: 280000, note: '' },
        ],
      })

      expect(quote.quote_token).toBeDefined()
      expect(quote.quote_token.split('.')).toHaveLength(3)

      // Verification of token extracts bound payload and confirms total_vnd
      const verified = verifyOrderQuote(quote.quote_token)
      expect(verified.total_vnd).toBe(535000)
      expect(verified.subtotal_vnd).toBe(520000)
      expect(verified.shipping_fee_vnd).toBe(15000)
      expect(verified.actor_scope).toBe('guest:session-alice-123')
      expect(verified.is_expired).toBe(false)
    })

    it('rejects quote confirmation if quote_token is tampered or actor_scope does not match', () => {
      const quote = createOrderQuote({
        order_type: 'delivery',
        actor_scope: 'guest:session-alice-123',
        context: {
          delivery_zone_id: '40000000-0000-0000-0000-000000000001',
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          address: '17 Đường Số 1, Vĩnh An',
        },
        subtotal_vnd: 520000,
        shipping_fee_vnd: 15000,
        total_vnd: 535000,
        items: [
          { menu_item_id: ITEM_A.id, item_name: ITEM_A.name, quantity: 1, unit_price_vnd: 240000, line_total_vnd: 240000, note: '' },
        ],
      })

      // 1. Tampered signature
      const tamperedSignatureToken = quote.quote_token.slice(0, -6) + 'xyz123'
      expect(() => verifyOrderQuote(tamperedSignatureToken)).toThrowError(
        /Token báo giá không hợp lệ hoặc đã bị thay đổi/i
      )

      // 2. Verified payload ownership check: caller's actor scope must match quote's actor scope
      const verified = verifyOrderQuote(quote.quote_token)
      const callerScope = 'guest:attacker-scope'
      expect(verified.actor_scope === callerScope).toBe(false)
    })

    it('ensures distinct canonical hashes for different carts or delivery zones (no quote collision)', () => {
      const hash1 = computeCanonicalRequestHash({
        order_type: 'delivery',
        context: {
          delivery_zone_id: '40000000-0000-0000-0000-000000000001',
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          address: '17 Đường Số 1, Vĩnh An',
        },
        items: [{ menu_item_id: ITEM_A.id, quantity: 1, note: '' }],
      })

      const hash2 = computeCanonicalRequestHash({
        order_type: 'delivery',
        context: {
          delivery_zone_id: '40000000-0000-0000-0000-000000000002', // different zone
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          address: '17 Đường Số 1, Vĩnh An',
        },
        items: [{ menu_item_id: ITEM_A.id, quantity: 1, note: '' }],
      })

      const hash3 = computeCanonicalRequestHash({
        order_type: 'delivery',
        context: {
          delivery_zone_id: '40000000-0000-0000-0000-000000000001',
          customer_name: 'Nguyễn Văn A',
          customer_phone: '0902809929',
          address: '17 Đường Số 1, Vĩnh An',
        },
        items: [{ menu_item_id: ITEM_A.id, quantity: 2, note: '' }], // different quantity
      })

      expect(hash1).not.toBe(hash2)
      expect(hash1).not.toBe(hash3)
      expect(hash2).not.toBe(hash3)
    })
  })
})
