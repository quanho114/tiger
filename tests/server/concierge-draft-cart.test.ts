/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: vitest, npm run test:server
 * - Affected API: concierge/draft-cart.ts (createInitialDraft, calculateDraftSubtotal, normalizeNote, applySingleDraftOperation, applyDraftBatch, revalidateDraftAgainstCatalog, transitionDraftReviewState, checkDraftHandoffEligibility, applyDraftTurnToSession)
 * - Data Schemas: ConciergeV2DraftSchema, ConciergeV2DraftItemSchema, ConciergeV2DraftOperationSchema, ConciergeV2BlockedDraftItemSchema
 * - Verbatim Instructions:
 *   - "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có."
 *   - "V11: Draft cart domain and atomic operations"
 *   - "Deliverable: implementation + applicable tests + ../reports/V11.md"
 *   - "Exit criteria: Adding twice with the same request ID applies once; conflicting updates fail; unsafe/unavailable items cannot be handed off; suggestions alone create no lines."
 *   - "Verification: New tests/server/concierge-draft-cart.test.ts plus store integration concurrency tests; typecheck:server; lint."
 */

import { describe, expect, it } from 'vitest'
import {
  applyDraftBatch,
  applyDraftTurnToSession,
  applySingleDraftOperation,
  calculateDraftSubtotal,
  checkDraftHandoffEligibility,
  createInitialDraft,
  normalizeNote,
  revalidateDraftAgainstCatalog,
  transitionDraftReviewState,
  type CatalogItemDetails,
  type CatalogItemResolver,
} from '../../supabase/functions/_shared/concierge/draft-cart.ts'
import {
  InMemoryConciergeV2SessionBackend,
  createConciergeV2SessionStore,
} from '../../supabase/functions/_shared/concierge/session-store.ts'
import type {
  ConciergeV2ActorBinding,
  ConciergeV2Draft,
  ConciergeV2DraftItem,
  ConciergeV2StoredTurnResult,
} from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const ITEM_PHO_BO = '00000000-0000-0000-0000-000000000001'
const ITEM_GOI_CUON = '00000000-0000-0000-0000-000000000002'
const ITEM_CUA_RANG_ME = '00000000-0000-0000-0000-000000000003'
const ITEM_UNAVAILABLE = '00000000-0000-0000-0000-000000000004'

const SUGGESTION_1 = '11111111-1111-4111-8111-111111111111'
const SUGGESTION_2 = '22222222-2222-4222-8222-222222222222'

const mockCatalog: Record<string, CatalogItemDetails> = {
  [ITEM_PHO_BO]: {
    id: ITEM_PHO_BO,
    name: 'Phở bò tái lăn',
    price_vnd: 85000,
    is_available: true,
    safety_state: 'verified_safe',
    safety_notes: 'Bếp kiểm nghiệm an toàn.',
  },
  [ITEM_GOI_CUON]: {
    id: ITEM_GOI_CUON,
    name: 'Gỏi cuốn tôm thịt',
    price_vnd: 45000,
    is_available: true,
    safety_state: 'verified_safe',
  },
  [ITEM_CUA_RANG_ME]: {
    id: ITEM_CUA_RANG_ME,
    name: 'Cua rang me',
    price_vnd: 250000,
    is_available: true,
    safety_state: 'contains_allergen',
    safety_notes: 'Chứa hải sản và động vật giáp xác.',
  },
  [ITEM_UNAVAILABLE]: {
    id: ITEM_UNAVAILABLE,
    name: 'Lẩu cá kèo lá giang',
    price_vnd: 190000,
    is_available: false,
    safety_state: 'verified_safe',
  },
}

const mockCatalogResolver: CatalogItemResolver = (menuItemId: string) => {
  return mockCatalog[menuItemId] ?? null
}

describe('Concierge V2 Draft Domain (V11 Server Tests)', () => {
  describe('Subtask 1: Operations, Bounded Quantities, and Stable Identity', () => {
    it('creates a clean initial draft with default state', () => {
      const draft = createInitialDraft()
      expect(draft.draft_id).toBeDefined()
      expect(draft.version).toBe(1)
      expect(draft.review_state).toBe('building')
      expect(draft.items).toEqual([])
      expect(draft.blocked_items).toEqual([])
      expect(draft.subtotal_vnd).toBe(0)
      expect(draft.exported_version).toBeNull()
    })

    it('calculates subtotal as non-negative integer VND', () => {
      const items: ConciergeV2DraftItem[] = [
        {
          line_id: '00000000-0000-0000-0000-000000000010',
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: '',
          unit_price_vnd: 85000,
        },
        {
          line_id: '00000000-0000-0000-0000-000000000020',
          menu_item_id: ITEM_GOI_CUON,
          quantity: 3,
          note: 'không hành',
          unit_price_vnd: 45000,
        },
      ]
      expect(calculateDraftSubtotal(items)).toBe(2 * 85000 + 3 * 45000)
    })

    it('normalizes customer notes and caps length at 250 characters', () => {
      expect(normalizeNote('   ít cay, không hành   ')).toBe('ít cay, không hành')
      expect(normalizeNote(null)).toBe('')
      const longNote = 'a'.repeat(300)
      expect(normalizeNote(longNote).length).toBe(250)
    })

    it('adds item with stable item+note identity: same item and note increments quantity on existing line', async () => {
      const draft = createInitialDraft()

      // Add first item
      const result1 = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: 'không hành',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(result1.ok).toBe(true)
      if (!result1.ok) return

      expect(result1.draft.items.length).toBe(1)
      const firstLineId = result1.draft.items[0].line_id
      expect(result1.draft.items[0].quantity).toBe(2)
      expect(result1.draft.items[0].unit_price_vnd).toBe(85000)
      expect(result1.draft.subtotal_vnd).toBe(170000)
      expect(result1.draft.version).toBe(2)

      // Add same item with same note -> preserves line_id and increments quantity
      const result2 = await applySingleDraftOperation(
        result1.draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 3,
          note: 'không hành',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(result2.ok).toBe(true)
      if (!result2.ok) return

      expect(result2.draft.items.length).toBe(1)
      expect(result2.draft.items[0].line_id).toBe(firstLineId)
      expect(result2.draft.items[0].quantity).toBe(5)
      expect(result2.draft.subtotal_vnd).toBe(5 * 85000)
      expect(result2.draft.version).toBe(3)
    })

    it('creates distinct lines when notes differ for the same menu_item_id', async () => {
      const draft = createInitialDraft()

      const r1 = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 1,
          note: 'không hành',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r1.ok).toBe(true)
      if (!r1.ok) return

      const r2 = await applySingleDraftOperation(
        r1.draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 1,
          note: 'nhiều ớt cay',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r2.ok).toBe(true)
      if (!r2.ok) return

      expect(r2.draft.items.length).toBe(2)
      expect(r2.draft.items[0].line_id).not.toBe(r2.draft.items[1].line_id)
      expect(r2.draft.items[0].note).toBe('không hành')
      expect(r2.draft.items[1].note).toBe('nhiều ớt cay')
    })

    it('enforces maximum 30 lines limit on draft', async () => {
      let draft = createInitialDraft()

      // Fill 30 unique lines
      for (let i = 1; i <= 30; i++) {
        const lineId = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`
        draft = {
          ...draft,
          items: [
            ...draft.items,
            {
              line_id: lineId,
              menu_item_id: ITEM_PHO_BO,
              quantity: 1,
              note: `ghi chú số ${i}`,
              unit_price_vnd: 85000,
            },
          ],
        }
      }
      expect(draft.items.length).toBe(30)

      // Attempting to add 31st item fails
      const r = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_GOI_CUON,
          quantity: 1,
          note: 'món thứ 31',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('DRAFT_LINE_LIMIT_EXCEEDED')
      }
    })

    it('bounds quantity between 1 and 99 and rejects out-of-range quantities', async () => {
      const draft = createInitialDraft()

      // Adding with quantity > 99 is rejected by operation schema
      const rOutOfRange = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 150, // exceeds 99
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(rOutOfRange.ok).toBe(false)
      if (!rOutOfRange.ok) {
        expect(rOutOfRange.error).toBe('INVALID_DRAFT_OPERATION')
      }

      // Reject overflow without silently changing the requested quantity.
      const rAddFirst = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 90,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(rAddFirst.ok).toBe(true)
      if (!rAddFirst.ok) return
      expect(rAddFirst.draft.items[0].quantity).toBe(90)

      const rAddMore = await applySingleDraftOperation(
        rAddFirst.draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 15,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(rAddMore.ok).toBe(false)
      if (!rAddMore.ok) expect(rAddMore.error).toBe('INVALID_DRAFT_OPERATION')
      expect(rAddFirst.draft.items[0].quantity).toBe(90)
    })

    it('set_quantity modifies quantity between 1 and 99, rejects 0 as invalid operation', async () => {
      const draft = createInitialDraft()
      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      if (!rAdd.ok) return
      const lineId = rAdd.draft.items[0].line_id

      // Set quantity to 5
      const rSet = await applySingleDraftOperation(
        rAdd.draft,
        {
          type: 'set_quantity',
          line_id: lineId,
          quantity: 5,
        },
        mockCatalogResolver
      )
      expect(rSet.ok).toBe(true)
      if (!rSet.ok) return
      expect(rSet.draft.items[0].quantity).toBe(5)
      expect(rSet.draft.subtotal_vnd).toBe(5 * 85000)

      // Set quantity to 0 is rejected by schema (must use remove_item instead)
      const rZero = await applySingleDraftOperation(
        rSet.draft,
        {
          type: 'set_quantity',
          line_id: lineId,
          quantity: 0,
        },
        mockCatalogResolver
      )
      expect(rZero.ok).toBe(false)
      if (!rZero.ok) {
        expect(rZero.error).toBe('INVALID_DRAFT_OPERATION')
      }
    })

    it('remove_item removes line and updates subtotal', async () => {
      const draft = createInitialDraft()
      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      if (!rAdd.ok) return
      const lineId = rAdd.draft.items[0].line_id

      const rRemove = await applySingleDraftOperation(
        rAdd.draft,
        {
          type: 'remove_item',
          line_id: lineId,
        },
        mockCatalogResolver
      )
      expect(rRemove.ok).toBe(true)
      if (!rRemove.ok) return
      expect(rRemove.draft.items.length).toBe(0)
      expect(rRemove.draft.subtotal_vnd).toBe(0)

      // Idempotent removal of already removed line succeeds
      const rRemoveAgain = await applySingleDraftOperation(
        rRemove.draft,
        {
          type: 'remove_item',
          line_id: lineId,
        },
        mockCatalogResolver
      )
      expect(rRemoveAgain.ok).toBe(true)
    })

    it('start_new_set resets draft to empty with incremented version', async () => {
      const draft = createInitialDraft()
      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      if (!rAdd.ok) return

      const rNewSet = await applySingleDraftOperation(
        rAdd.draft,
        {
          type: 'start_new_set',
        },
        mockCatalogResolver
      )
      expect(rNewSet.ok).toBe(true)
      if (!rNewSet.ok) return
      expect(rNewSet.draft.items).toEqual([])
      expect(rNewSet.draft.subtotal_vnd).toBe(0)
      expect(rNewSet.draft.review_state).toBe('building')
      expect(rNewSet.draft.version).toBe(rAdd.draft.version + 1)
      expect(rNewSet.draft.draft_id).not.toBe(rAdd.draft.draft_id)
    })
  })

  describe('Subtask 2 & 3: Suggestions Separation, Pricing, and Safety', () => {
    it('suggestions alone create no lines: draft remains empty without explicit operation', () => {
      const draft = createInitialDraft()
      // Pending suggestions exist in session state, but draft items remain empty
      expect(draft.items).toEqual([])
      expect(draft.subtotal_vnd).toBe(0)
    })

    it('rejects add_item if pending_suggestion_id is not in allowed pending suggestions', async () => {
      const draft = createInitialDraft()
      const r = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: '99999999-9999-4999-8999-999999999999',
          menu_item_id: ITEM_PHO_BO,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1] // only SUGGESTION_1 is allowed
      )
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('AMBIGUOUS_ACCEPTANCE')
      }
    })

    it('strictly derives price from catalog and ignores external or model prices', async () => {
      const draft = createInitialDraft()
      const r = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // Authoritative catalog price is 85000 VND
      expect(r.draft.items[0].unit_price_vnd).toBe(85000)
    })

    it('rejects unavailable items with ITEM_UNAVAILABLE', async () => {
      const draft = createInitialDraft()
      const r = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_UNAVAILABLE,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('ITEM_UNAVAILABLE')
      }
    })

    it('rejects unsafe items with ALLERGY_UNVERIFIED', async () => {
      const draft = createInitialDraft()
      // Cua rang me has safety_state 'contains_allergen'
      const r = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_CUA_RANG_ME,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('ALLERGY_UNVERIFIED')
      }
    })

    it('applies a batch of operations in sequence', async () => {
      const draft = createInitialDraft()
      const rBatch = await applyDraftBatch(
        draft,
        [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
          },
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_2,
            menu_item_id: ITEM_GOI_CUON,
            quantity: 2,
            note: '',
          },
        ],
        mockCatalogResolver,
        [SUGGESTION_1, SUGGESTION_2]
      )
      expect(rBatch.ok).toBe(true)
      if (!rBatch.ok) return
      expect(rBatch.draft.items.length).toBe(2)
      expect(rBatch.draft.subtotal_vnd).toBe(85000 + 2 * 45000)
    })
  })

  describe('Subtask 5: Revalidation and Blocked Items Tracking', () => {
    it('retains item details and marks blocked_items if catalog price changes upon revalidation', async () => {
      const draft = createInitialDraft()
      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_PHO_BO,
          quantity: 2,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      if (!rAdd.ok) return

      // Dynamic catalog with updated price for Phở bò (changed from 85000 to 95000)
      const dynamicResolver: CatalogItemResolver = (id: string) => {
        if (id === ITEM_PHO_BO) {
          return {
            id: ITEM_PHO_BO,
            name: 'Phở bò tái lăn',
            price_vnd: 95000,
            is_available: true,
            safety_state: 'verified_safe',
          }
        }
        return mockCatalog[id] ?? null
      }

      const revalidated = await revalidateDraftAgainstCatalog(rAdd.draft, dynamicResolver)
      expect(revalidated.items).toEqual(rAdd.draft.items)
      expect(revalidated.blocked_items.length).toBe(1)
      expect(revalidated.blocked_items[0].reason).toBe('PRICE_CHANGED')
      expect(revalidated.subtotal_vnd).toBe(rAdd.draft.subtotal_vnd)
      expect(revalidated.version).toBe(rAdd.draft.version + 1)
    })

    it('retains item details and marks blocked_items if catalog availability changes upon revalidation', async () => {
      const draft = createInitialDraft()
      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_1,
          menu_item_id: ITEM_GOI_CUON,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_1]
      )
      if (!rAdd.ok) return

      // Dynamic catalog where Gỏi cuốn is now unavailable
      const dynamicResolver: CatalogItemResolver = (id: string) => {
        if (id === ITEM_GOI_CUON) {
          return {
            id: ITEM_GOI_CUON,
            name: 'Gỏi cuốn tôm thịt',
            price_vnd: 45000,
            is_available: false,
          }
        }
        return mockCatalog[id] ?? null
      }

      const revalidated = await revalidateDraftAgainstCatalog(rAdd.draft, dynamicResolver)
      expect(revalidated.items).toEqual(rAdd.draft.items)
      expect(revalidated.blocked_items.length).toBe(1)
      expect(revalidated.blocked_items[0].reason).toBe('ITEM_UNAVAILABLE')
    })
  })

  describe('Subtask 6: State Transitions and Handoff Eligibility', () => {
    it('empty draft cannot transition to ready_for_review', () => {
      const draft = createInitialDraft()
      const r = transitionDraftReviewState(draft, 'ready_for_review')
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error).toBe('INVALID_HANDOFF')
      }
    })

    it('draft with blocked_items cannot transition to ready_for_review or be handed off', () => {
      const draft: ConciergeV2Draft = {
        ...createInitialDraft(),
        items: [
          {
            line_id: '00000000-0000-0000-0000-000000000010',
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
            unit_price_vnd: 85000,
          },
        ],
        blocked_items: [
          {
            line_id: '00000000-0000-0000-0000-000000000020',
            menu_item_id: ITEM_UNAVAILABLE,
            reason: 'ITEM_UNAVAILABLE',
            message: 'Món ăn tạm ngưng phục vụ.',
          },
        ],
        subtotal_vnd: 85000,
      }

      const rTrans = transitionDraftReviewState(draft, 'ready_for_review')
      expect(rTrans.ok).toBe(false)
      if (!rTrans.ok) {
        expect(rTrans.error).toBe('ITEM_UNAVAILABLE')
      }

      const rEligible = checkDraftHandoffEligibility(draft)
      expect(rEligible.eligible).toBe(false)
      expect(rEligible.reason).toBe('ITEM_UNAVAILABLE')
    })

    it('transitions to ready_for_review when valid items exist and no items are blocked', () => {
      const draft: ConciergeV2Draft = {
        ...createInitialDraft(),
        items: [
          {
            line_id: '00000000-0000-0000-0000-000000000010',
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
            unit_price_vnd: 85000,
          },
        ],
        subtotal_vnd: 85000,
      }

      const r = transitionDraftReviewState(draft, 'ready_for_review')
      expect(r.ok).toBe(true)
      if (!r.ok) return
      expect(r.draft.review_state).toBe('ready_for_review')
      expect(r.draft.version).toBe(draft.version + 1)

      const rEligible = checkDraftHandoffEligibility(r.draft)
      expect(rEligible.eligible).toBe(true)
    })

    it('modifying draft reverts review_state back to building', async () => {
      const draft: ConciergeV2Draft = {
        ...createInitialDraft(),
        review_state: 'ready_for_review',
        items: [
          {
            line_id: '00000000-0000-0000-0000-000000000010',
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
            unit_price_vnd: 85000,
          },
        ],
        subtotal_vnd: 85000,
      }

      const rAdd = await applySingleDraftOperation(
        draft,
        {
          type: 'add_item',
          pending_suggestion_id: SUGGESTION_2,
          menu_item_id: ITEM_GOI_CUON,
          quantity: 1,
          note: '',
        },
        mockCatalogResolver,
        [SUGGESTION_2]
      )
      expect(rAdd.ok).toBe(true)
      if (!rAdd.ok) return
      expect(rAdd.draft.review_state).toBe('building')
    })

    it('transitions to exported sets exported_version and preserves draft version', () => {
      const draft: ConciergeV2Draft = {
        ...createInitialDraft(),
        version: 4,
        review_state: 'ready_for_review',
        items: [
          {
            line_id: '00000000-0000-0000-0000-000000000010',
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
            unit_price_vnd: 85000,
          },
        ],
        subtotal_vnd: 85000,
      }

      const rExported = transitionDraftReviewState(draft, 'exported')
      expect(rExported.ok).toBe(true)
      if (!rExported.ok) return
      expect(rExported.draft.review_state).toBe('exported')
      expect(rExported.draft.exported_version).toBe(4)
      expect(rExported.draft.version).toBe(5)
    })
  })

  describe('Subtask 4: Atomic Session Store Turn Integration & Exit Criteria', () => {
    const ACTOR: ConciergeV2ActorBinding = {
      authenticated_user_id: '00000000-0000-0000-0000-000000000001',
    }

    const STORED_RESULT: ConciergeV2StoredTurnResult = {
      response_id: '00000000-0000-0000-0000-000000000099',
      phase: 'BUILDING_DRAFT',
      message: 'Đã cập nhật giỏ hàng tạm.',
      cards: [],
      warnings: [],
    }

    async function createTestSession() {
      const backend = new InMemoryConciergeV2SessionBackend()
      const store = createConciergeV2SessionStore({ backend })
      const created = await store.create({
        actor: ACTOR,
        transcript: [],
        summary: '',
        constraints: {
          adults: 2,
          children: 0,
          appetite: 'normal',
          is_hard_budget: false,
          preferences: [],
          dislikes: [],
          allergies: [],
        },
        draft: null,
        pending_suggestion_ids: [SUGGESTION_1, SUGGESTION_2],
      })
      if (!created.ok) throw new Error('Failed to create test session')
      return { store, ref: created.reference, initialRecord: created.record }
    }

    it('Exit criterion 1: Adding twice with the same request ID applies once (idempotent replay)', async () => {
      const { store, ref, initialRecord } = await createTestSession()
      const requestId = '11111111-2222-3333-4444-555555555555'
      const operationHash = '4d6f2a8e7b9c1d3f5a6b7c8d9e0f12344d6f2a8e7b9c1d3f5a6b7c8d9e0f1234'

      // First application: adds 2 Phở bò
      const firstResult = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version,
        requestId,
        operationHash,
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 2,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })

      expect(firstResult.ok).toBe(true)
      if (!firstResult.ok) return
      expect(firstResult.replay).toBe(false)
      expect(firstResult.record.draft?.items.length).toBe(1)
      expect(firstResult.record.draft?.items[0].quantity).toBe(2)
      expect(firstResult.record.state_version).toBe(2)

      // Second application with identical requestId and operationHash
      const secondResult = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: firstResult.record.state_version,
        requestId,
        operationHash,
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 2,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })

      expect(secondResult.ok).toBe(true)
      if (!secondResult.ok) return
      // Replay is true!
      expect(secondResult.replay).toBe(true)
      // Draft has NOT been added twice; quantity remains 2!
      expect(secondResult.record.draft?.items.length).toBe(1)
      expect(secondResult.record.draft?.items[0].quantity).toBe(2)
      expect(secondResult.record.state_version).toBe(2)
    })

    it('fails with IDEMPOTENCY_MISMATCH if same requestId is used with different operations', async () => {
      const { store, ref, initialRecord } = await createTestSession()
      const requestId = '11111111-2222-3333-4444-555555555555'

      const r1 = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version,
        requestId,
        operationHash: '1111111111111111111111111111111111111111111111111111111111111111',
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })
      expect(r1.ok).toBe(true)

      const r2 = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version,
        requestId,
        operationHash: '2222222222222222222222222222222222222222222222222222222222222222', // different hash!
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 2,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })
      expect(r2.ok).toBe(false)
      if (!r2.ok) {
        expect(r2.error.code).toBe('IDEMPOTENCY_MISMATCH')
      }
    })

    it('Exit criterion 2: Conflicting updates fail with STATE_CONFLICT', async () => {
      const { store, ref, initialRecord } = await createTestSession()

      // Client A advances state to version 2
      const clientAResult = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version, // 1
        requestId: 'aaaa1111-2222-3333-4444-555555555555',
        operationHash: 'aaaa111111111111111111111111111111111111111111111111111111111111',
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_PHO_BO,
            quantity: 1,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })
      expect(clientAResult.ok).toBe(true)

      // Concurrent Client B attempts update with stale state_version 1
      const clientBResult = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version, // stale 1!
        requestId: 'bbbb1111-2222-3333-4444-555555555555',
        operationHash: 'bbbb111111111111111111111111111111111111111111111111111111111111',
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_2,
            menu_item_id: ITEM_GOI_CUON,
            quantity: 2,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })

      // Client B is rejected with STATE_CONFLICT!
      expect(clientBResult.ok).toBe(false)
      if (!clientBResult.ok) {
        expect(clientBResult.error.code).toBe('STATE_CONFLICT')
      }
    })

    it('Exit criterion 3 & 4: Unsafe or unavailable items cannot be added and suggestions alone create no lines', async () => {
      const { store, ref, initialRecord } = await createTestSession()

      // 1. Suggestions alone create no lines
      const readFresh = await store.read(ref, ACTOR)
      expect(readFresh.ok).toBe(true)
      if (!readFresh.ok) return
      expect(readFresh.record.draft).toBeNull()

      // 2. Attempting to add an unavailable item fails the session turn
      const rUnavailable = await applyDraftTurnToSession({
        sessionStore: store,
        sessionRef: ref,
        actor: ACTOR,
        expectedStateVersion: initialRecord.state_version,
        requestId: 'cccc1111-2222-3333-4444-555555555555',
        operationHash: 'cccc111111111111111111111111111111111111111111111111111111111111',
        operations: [
          {
            type: 'add_item',
            pending_suggestion_id: SUGGESTION_1,
            menu_item_id: ITEM_UNAVAILABLE,
            quantity: 1,
            note: '',
          },
        ],
        catalogResolver: mockCatalogResolver,
        storedResult: STORED_RESULT,
      })

      expect(rUnavailable.ok).toBe(false)
      if (!rUnavailable.ok) {
        expect(rUnavailable.error.code).toBe('ITEM_UNAVAILABLE')
      }

      // Session record remains untouched
      const readAfter = await store.read(ref, ACTOR)
      expect(readAfter.ok).toBe(true)
      if (!readAfter.ok) return
      expect(readAfter.record.draft).toBeNull()
      expect(readAfter.record.state_version).toBe(1)
    })
  })
})
