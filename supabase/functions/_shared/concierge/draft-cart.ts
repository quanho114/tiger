/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: runtime.ts, context.ts, tests/server/concierge-draft-cart.test.ts, tests/integration/concierge-draft-cart.test.ts
 * - Affected API: createInitialDraft, calculateDraftSubtotal, normalizeNote, applySingleDraftOperation, applyDraftBatch, revalidateDraftAgainstCatalog, transitionDraftReviewState, checkDraftHandoffEligibility, applyDraftTurnToSession
 * - Data Schemas: ConciergeV2DraftSchema, ConciergeV2DraftItemSchema, ConciergeV2DraftOperationSchema, ConciergeV2BlockedDraftItemSchema
 * - Verbatim Instructions:
 *   - "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có."
 *   - "V11: Draft cart domain and atomic operations"
 *   - "1. Implement add/remove/set quantity/read/total operations with bounded quantities, line count and stable item+note identity."
 *   - "2. Accept only validated command objects from trusted runtime; preserve candidate recommendations separately."
 *   - "3. Price and availability come from catalog; quantities and notes validated. Store currency as integer VND and never accept model prices."
 *   - "4. Apply a turn batch atomically with session version/request ID. Duplicate or stale calls cannot add twice or overwrite concurrent updates."
 *   - "5. Track pending suggestion, reviewed/exported versions and blocked items. Draft expiry follows the session."
 *   - "6. Provide explicit state transitions for review and handoff eligibility without performing real-cart writes."
 *   - "Exit criteria: Adding twice with the same request ID applies once; conflicting updates fail; unsafe/unavailable items cannot be handed off; suggestions alone create no lines."
 */

import {
  ConciergeV2DraftOperationSchema,
  ConciergeV2DraftSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2BlockedDraftItem,
  type ConciergeV2Draft,
  type ConciergeV2DraftItem,
  type ConciergeV2DraftOperation,
  type ConciergeV2Error,
  type ConciergeV2FoodSafetyState,
  type ConciergeV2SessionMutableState,
  type ConciergeV2SessionRecord,
  type ConciergeV2SessionReference,
  type ConciergeV2SessionStore,
  type ConciergeV2StoredTurnResult,
} from '../contracts/concierge-v2.ts'
import { withinMenuBudget } from './budget.ts'

export interface CatalogItemDetails {
  id: string
  name: string
  price_vnd: number
  is_available: boolean
  safety_state?: ConciergeV2FoodSafetyState
  safety_notes?: string
}

export type CatalogItemResolver = (
  menuItemId: string
) => Promise<CatalogItemDetails | null> | CatalogItemDetails | null

export type DraftDomainErrorCode =
  | 'ITEM_UNAVAILABLE'
  | 'ALLERGY_UNVERIFIED'
  | 'PRICE_CHANGED'
  | 'INVALID_HANDOFF'
  | 'STATE_CONFLICT'
  | 'IDEMPOTENCY_MISMATCH'
  | 'AMBIGUOUS_ACCEPTANCE'
  | 'DRAFT_LINE_LIMIT_EXCEEDED'
  | 'INVALID_DRAFT_OPERATION'
  | 'INTERNAL_SAFE_FAILURE'
  | 'BUDGET_EXCEEDED'

export type DraftOperationResult =
  | { ok: true; draft: ConciergeV2Draft; message?: string }
  | { ok: false; error: DraftDomainErrorCode; message: string }

/**
 * Creates an empty initial draft.
 */
export function createInitialDraft(overrides?: Partial<ConciergeV2Draft>): ConciergeV2Draft {
  const initial: ConciergeV2Draft = {
    draft_id: crypto.randomUUID(),
    version: 1,
    review_state: 'building',
    items: [],
    blocked_items: [],
    subtotal_vnd: 0,
    exported_version: null,
    ...overrides,
  }
  return ConciergeV2DraftSchema.parse(initial)
}

/**
 * Calculates subtotal for draft items in integer VND.
 */
export function calculateDraftSubtotal(items: ReadonlyArray<ConciergeV2DraftItem>): number {
  return items.reduce((total, item) => {
    const unitPrice = Math.max(0, Math.floor(item.unit_price_vnd))
    return total + unitPrice * item.quantity
  }, 0)
}

/**
 * Normalizes customer order notes, trimming whitespace and bounding length to 250 characters.
 */
export function normalizeNote(note?: string | null): string {
  return note ? note.trim().slice(0, 250) : ''
}

/**
 * Applies a single validated draft operation immutably.
 * Ensures:
 * - Stable item+note identity: identical menuItemId + note increments quantity on the same line.
 * - Line count bounded to 30 items.
 * - Quantities bounded to [1, 99].
 * - Authoritative catalog pricing (model prices rejected).
 * - Availability and allergy safety validated.
 * - Candidate suggestions alone create no lines unless explicitly operated upon.
 */
export async function applySingleDraftOperation(
  draft: ConciergeV2Draft,
  rawOperation: ConciergeV2DraftOperation,
  catalogResolver: CatalogItemResolver,
  allowedPendingSuggestionIds?: ReadonlyArray<string>,
  customerAllergies?: ReadonlyArray<string>
): Promise<DraftOperationResult> {
  const operationParsed = ConciergeV2DraftOperationSchema.safeParse(rawOperation)
  if (!operationParsed.success) {
    return {
      ok: false,
      error: 'INVALID_DRAFT_OPERATION',
      message: 'Thao tác trên giỏ hàng tạm không hợp lệ.',
    }
  }
  const operation = operationParsed.data

  switch (operation.type) {
    case 'start_new_set': {
      const freshDraft: ConciergeV2Draft = {
        draft_id: crypto.randomUUID(),
        version: draft.version + 1,
        review_state: 'building',
        items: [],
        blocked_items: [],
        subtotal_vnd: 0,
        exported_version: null,
      }
      return { ok: true, draft: ConciergeV2DraftSchema.parse(freshDraft) }
    }

    case 'add_item': {
      // If allowed suggestions are explicitly specified, verify that the operation references one
      if (
        allowedPendingSuggestionIds &&
        !allowedPendingSuggestionIds.includes(operation.pending_suggestion_id)
      ) {
        return {
          ok: false,
          error: 'AMBIGUOUS_ACCEPTANCE',
          message: 'Món gợi ý không khớp hoặc đã hết hiệu lực.',
        }
      }

      const catalogItem = await catalogResolver(operation.menu_item_id)
      if (!catalogItem || !catalogItem.is_available) {
        return {
          ok: false,
          error: 'ITEM_UNAVAILABLE',
          message: 'Món ăn không có sẵn hoặc đã tạm ngừng phục vụ.',
        }
      }

      // Check food safety constraints
      const hasCustomerAllergies = customerAllergies && customerAllergies.length > 0
      const safetyState = catalogItem.safety_state
      const isExplicitConflict = safetyState === 'contains_allergen' || safetyState === 'conflict'
      const isUnverifiedWithAllergies = hasCustomerAllergies && safetyState !== 'verified_safe'

      if (isExplicitConflict || isUnverifiedWithAllergies) {
        return {
          ok: false,
          error: 'ALLERGY_UNVERIFIED',
          message:
            catalogItem.safety_notes ||
            'Món ăn chưa được xác minh an toàn dị ứng hoặc có nguy cơ nhiễm chéo.',
        }
      }

      const note = normalizeNote(operation.note)
      const qtyToAdd = Math.min(99, Math.max(1, Math.floor(operation.quantity)))
      const authoritativePrice = Math.max(0, Math.floor(catalogItem.price_vnd))

      // Stable identity check: same menu_item_id and same note
      const existingIndex = draft.items.findIndex(
        (item) => item.menu_item_id === operation.menu_item_id && item.note === note
      )

      let nextItems: ConciergeV2DraftItem[]
      if (existingIndex >= 0) {
        const existing = draft.items[existingIndex]
        if (existing.unit_price_vnd !== authoritativePrice) return { ok: false, error: 'PRICE_CHANGED', message: 'Giá món đã thay đổi. Hãy kiểm tra và xác nhận lại giá.' }
        const updatedQuantity = existing.quantity + qtyToAdd
        if (updatedQuantity > 99) {
          return { ok: false, error: 'INVALID_DRAFT_OPERATION', message: 'Mỗi món chỉ được chọn tối đa 99 phần.' }
        }
        nextItems = draft.items.map((item, idx) =>
          idx === existingIndex
            ? {
                ...item,
                quantity: updatedQuantity,
                unit_price_vnd: authoritativePrice,
              }
            : item
        )
      } else {
        if (draft.items.length >= 30) {
          return {
            ok: false,
            error: 'DRAFT_LINE_LIMIT_EXCEEDED',
            message: 'Giỏ hàng tạm đã đạt giới hạn tối đa 30 món.',
          }
        }
        const newItem: ConciergeV2DraftItem = {
          line_id: crypto.randomUUID(),
          menu_item_id: operation.menu_item_id,
          quantity: qtyToAdd,
          note,
          unit_price_vnd: authoritativePrice,
        }
        nextItems = [...draft.items, newItem]
      }

      const nextSubtotal = calculateDraftSubtotal(nextItems)
      const updatedDraft: ConciergeV2Draft = {
        ...draft,
        items: nextItems,
        subtotal_vnd: nextSubtotal,
        review_state: 'building',
        version: draft.version + 1,
      }
      return { ok: true, draft: ConciergeV2DraftSchema.parse(updatedDraft) }
    }

    case 'remove_item': {
      const lineExistsInItems = draft.items.some((item) => item.line_id === operation.line_id)
      const lineExistsInBlocked = draft.blocked_items.some((item) => item.line_id === operation.line_id)

      if (!lineExistsInItems && !lineExistsInBlocked) {
        // Idempotent removal: return existing draft unchanged
        return { ok: true, draft }
      }

      const nextItems = draft.items.filter((item) => item.line_id !== operation.line_id)
      const nextBlocked = draft.blocked_items.filter((item) => item.line_id !== operation.line_id)
      const nextSubtotal = calculateDraftSubtotal(nextItems)

      const updatedDraft: ConciergeV2Draft = {
        ...draft,
        items: nextItems,
        blocked_items: nextBlocked,
        subtotal_vnd: nextSubtotal,
        review_state: 'building',
        version: draft.version + 1,
      }
      return { ok: true, draft: ConciergeV2DraftSchema.parse(updatedDraft) }
    }

    case 'set_quantity': {
      const targetIndex = draft.items.findIndex((item) => item.line_id === operation.line_id)
      if (targetIndex < 0) {
        return {
          ok: false,
          error: 'INVALID_DRAFT_OPERATION',
          message: 'Không tìm thấy món cần đổi số lượng trong giỏ hàng tạm.',
        }
      }

      const rawQuantity = Math.floor(operation.quantity)
      let nextItems: ConciergeV2DraftItem[]
      if (rawQuantity <= 0) {
        nextItems = draft.items.filter((item) => item.line_id !== operation.line_id)
      } else {
        const boundedQuantity = Math.min(99, rawQuantity)
        nextItems = draft.items.map((item, idx) =>
          idx === targetIndex ? { ...item, quantity: boundedQuantity } : item
        )
      }

      const nextSubtotal = calculateDraftSubtotal(nextItems)
      const updatedDraft: ConciergeV2Draft = {
        ...draft,
        items: nextItems,
        subtotal_vnd: nextSubtotal,
        review_state: 'building',
        version: draft.version + 1,
      }
      return { ok: true, draft: ConciergeV2DraftSchema.parse(updatedDraft) }
    }
  }
}

/**
 * Applies a batch of operations sequentially to a draft.
 * If any operation fails, execution halts and returns that error.
 */
export async function applyDraftBatch(
  initialDraft: ConciergeV2Draft | null,
  operations: ReadonlyArray<ConciergeV2DraftOperation>,
  catalogResolver: CatalogItemResolver,
  allowedPendingSuggestionIds?: ReadonlyArray<string>,
  customerAllergies?: ReadonlyArray<string>,
  budgetVnd?: number | null,
): Promise<DraftOperationResult> {
  let currentDraft = initialDraft ? initialDraft : createInitialDraft()

  for (const op of operations) {
    const result = await applySingleDraftOperation(
      currentDraft,
      op,
      catalogResolver,
      allowedPendingSuggestionIds,
      customerAllergies
    )
    if (!result.ok) {
      return result
    }
    currentDraft = result.draft
  }

  // Validate the resulting draft once: replacement batches may remove before
  // or after adding, but no intermediate draft is persisted.
  const checked = await revalidateDraftAgainstCatalog(currentDraft, catalogResolver, customerAllergies)
  if (checked.blocked_items.length) {
    const blocked = checked.blocked_items[0]
    return { ok: false, error: blocked.reason, message: blocked.message }
  }
  if (!withinMenuBudget(checked.subtotal_vnd, budgetVnd)) return {
    ok: false, error: 'BUDGET_EXCEEDED', message: 'Tổng món sau thay đổi vượt ngân sách hiện tại. Hãy chọn lại món hoặc số lượng.' }
  return { ok: true, draft: checked }
}

/**
 * Revalidates all items in a draft against current authoritative catalog state.
 * Moves items to `blocked_items` if:
 * - Unavailable or deleted from catalog (`ITEM_UNAVAILABLE`)
 * - Price changed (`PRICE_CHANGED`)
 * - Unsafe or unverified with customer allergies (`ALLERGY_UNVERIFIED`)
 */
export async function revalidateDraftAgainstCatalog(
  draft: ConciergeV2Draft,
  catalogResolver: CatalogItemResolver,
  customerAllergies?: ReadonlyArray<string>
): Promise<ConciergeV2Draft> {
  const nextItems: ConciergeV2DraftItem[] = []
  const nextBlocked: ConciergeV2BlockedDraftItem[] = []
  let stateChanged = draft.blocked_items.length > 0

  for (const item of draft.items) {
    const catalogItem = await catalogResolver(item.menu_item_id)
    if (!catalogItem || !catalogItem.is_available) {
      nextBlocked.push({
        line_id: item.line_id,
        menu_item_id: item.menu_item_id,
        reason: 'ITEM_UNAVAILABLE',
        message: `Món ${catalogItem?.name || 'ăn'} hiện đã hết hoặc tạm ngừng phục vụ.`,
      })
      stateChanged = true
      nextItems.push(item)
      continue
    }

    const currentPrice = Math.max(0, Math.floor(catalogItem.price_vnd))
    if (currentPrice !== item.unit_price_vnd) {
      nextBlocked.push({
        line_id: item.line_id,
        menu_item_id: item.menu_item_id,
        reason: 'PRICE_CHANGED',
        current_unit_price_vnd: currentPrice,
        message: `Giá món ${catalogItem.name} đã thay đổi từ ${item.unit_price_vnd.toLocaleString('vi-VN')} VND sang ${currentPrice.toLocaleString('vi-VN')} VND. Vui lòng xác nhận lại.`,
      })
      stateChanged = true
      nextItems.push(item)
      continue
    }

    const hasCustomerAllergies = customerAllergies && customerAllergies.length > 0
    const safetyState = catalogItem.safety_state
    const isExplicitConflict = safetyState === 'contains_allergen' || safetyState === 'conflict'
    const isUnverifiedWithAllergies = hasCustomerAllergies && safetyState !== 'verified_safe'

    if (isExplicitConflict || isUnverifiedWithAllergies) {
      nextBlocked.push({
        line_id: item.line_id,
        menu_item_id: item.menu_item_id,
        reason: 'ALLERGY_UNVERIFIED',
        message:
          catalogItem.safety_notes ||
          `Món ${catalogItem.name} chưa được xác minh an toàn đối với dị ứng của bạn.`,
      })
      stateChanged = true
      nextItems.push(item)
      continue
    }

    nextItems.push(item)
  }

  if (!stateChanged) {
    return draft
  }

  const subtotal = calculateDraftSubtotal(nextItems)
  const updatedDraft: ConciergeV2Draft = {
    ...draft,
    items: nextItems,
    blocked_items: nextBlocked,
    subtotal_vnd: subtotal,
    review_state: 'building',
    version: draft.version + 1,
  }
  return ConciergeV2DraftSchema.parse(updatedDraft)
}

/**
 * Explicit state transitions for review and handoff eligibility.
 * Does not perform real-cart writes.
 */
export function transitionDraftReviewState(
  draft: ConciergeV2Draft,
  targetState: 'building' | 'ready_for_review' | 'exported'
): DraftOperationResult {
  if (draft.review_state === targetState) {
    return { ok: true, draft }
  }

  if (targetState === 'ready_for_review') {
    if (draft.items.length === 0) {
      return {
        ok: false,
        error: 'INVALID_HANDOFF',
        message: 'Giỏ hàng tạm đang trống, không thể chuyển sang trạng thái chờ duyệt.',
      }
    }
    if (draft.blocked_items.length > 0) {
      const firstBlocked = draft.blocked_items[0]
      return {
        ok: false,
        error: firstBlocked.reason,
        message: firstBlocked.message,
      }
    }
    const updated: ConciergeV2Draft = {
      ...draft,
      review_state: 'ready_for_review',
      version: draft.version + 1,
    }
    return { ok: true, draft: ConciergeV2DraftSchema.parse(updated) }
  }

  if (targetState === 'exported') {
    if (draft.review_state !== 'ready_for_review') {
      return {
        ok: false,
        error: 'INVALID_HANDOFF',
        message: 'Đơn hàng tạm chưa được chốt duyệt trước khi xuất.',
      }
    }
    if (draft.blocked_items.length > 0) {
      const firstBlocked = draft.blocked_items[0]
      return {
        ok: false,
        error: firstBlocked.reason,
        message: firstBlocked.message,
      }
    }
    const updated: ConciergeV2Draft = {
      ...draft,
      review_state: 'exported',
      exported_version: draft.version,
      version: draft.version + 1,
    }
    return { ok: true, draft: ConciergeV2DraftSchema.parse(updated) }
  }

  // targetState === 'building'
  const updated: ConciergeV2Draft = {
    ...draft,
    review_state: 'building',
    version: draft.version + 1,
  }
  return { ok: true, draft: ConciergeV2DraftSchema.parse(updated) }
}

/**
 * Checks if a draft is currently eligible for handoff to the real shopping cart.
 * Unsafe or unavailable items strictly prevent handoff.
 */
export function checkDraftHandoffEligibility(draft: ConciergeV2Draft | null): {
  eligible: boolean
  reason?: 'ALLERGY_UNVERIFIED' | 'PRICE_CHANGED' | 'ITEM_UNAVAILABLE' | 'INVALID_HANDOFF'
  message?: string
} {
  if (!draft || draft.items.length === 0) {
    return { eligible: false, reason: 'INVALID_HANDOFF', message: 'Giỏ hàng tạm trống.' }
  }
  if (draft.blocked_items.length > 0) {
    const first = draft.blocked_items[0]
    return { eligible: false, reason: first.reason, message: first.message }
  }
  if (draft.review_state !== 'ready_for_review' && draft.review_state !== 'exported') {
    return {
      eligible: false,
      reason: 'INVALID_HANDOFF',
      message: 'Đơn hàng tạm chưa được chốt duyệt.',
    }
  }
  return { eligible: true }
}

export interface ApplyDraftTurnToSessionInput {
  sessionStore: ConciergeV2SessionStore
  sessionRef: ConciergeV2SessionReference
  actor: ConciergeV2ActorBinding
  expectedStateVersion: number
  requestId: string
  operationHash: string
  operations?: ReadonlyArray<ConciergeV2DraftOperation>
  catalogResolver: CatalogItemResolver
  customerAllergies?: ReadonlyArray<string>
  markReadyForReview?: boolean
  storedResult: ConciergeV2StoredTurnResult
  newPendingSuggestionIds?: string[]
}

export type ApplyDraftTurnToSessionResult =
  | { ok: true; record: ConciergeV2SessionRecord; replay: boolean; result: ConciergeV2StoredTurnResult }
  | { ok: false; error: ConciergeV2Error }

function mapDomainErrorToSessionError(
  domainError: DraftDomainErrorCode,
  message: string
): ConciergeV2Error {
  switch (domainError) {
    case 'AMBIGUOUS_ACCEPTANCE':
      return { code: 'AMBIGUOUS_ACCEPTANCE', message }
    case 'ALLERGY_UNVERIFIED':
      return { code: 'ALLERGY_UNVERIFIED', message }
    case 'PRICE_CHANGED':
      return { code: 'PRICE_CHANGED', message }
    case 'ITEM_UNAVAILABLE':
      return { code: 'ITEM_UNAVAILABLE', message }
    case 'INVALID_HANDOFF':
    case 'BUDGET_EXCEEDED':
    case 'DRAFT_LINE_LIMIT_EXCEEDED':
    case 'INVALID_DRAFT_OPERATION':
      return { code: 'INVALID_HANDOFF', message }
    case 'STATE_CONFLICT':
      return { code: 'STATE_CONFLICT', message }
    case 'IDEMPOTENCY_MISMATCH':
      return { code: 'IDEMPOTENCY_MISMATCH', message }
    default:
      return { code: 'INTERNAL_SAFE_FAILURE', message }
  }
}

/**
 * Applies a draft turn batch atomically to the shared session store.
 * - Same request ID + operation hash replays the bounded stored result (add twice applies once).
 * - Stale state version fails with STATE_CONFLICT.
 * - Idempotency mismatch fails with IDEMPOTENCY_MISMATCH.
 * - Unsafe or unavailable items are rejected and never admitted as valid draft lines.
 * - Suggestions alone create no lines unless an explicit operation is included.
 */
export async function applyDraftTurnToSession(
  input: ApplyDraftTurnToSessionInput
): Promise<ApplyDraftTurnToSessionResult> {
  const {
    sessionStore,
    sessionRef,
    actor,
    expectedStateVersion,
    requestId,
    operationHash,
    operations = [],
    catalogResolver,
    customerAllergies,
    markReadyForReview = false,
    storedResult,
    newPendingSuggestionIds,
  } = input

  // 1. Read current session from store
  const readResult = await sessionStore.read(sessionRef, actor)
  if (!readResult.ok) {
    return readResult
  }
  const currentRecord = readResult.record

  // 2. Fast replay check against session idempotency records
  const existingIdempotency = currentRecord.idempotency.find((entry) => entry.request_id === requestId)
  if (existingIdempotency) {
    if (existingIdempotency.operation_hash === operationHash) {
      return {
        ok: true,
        record: currentRecord,
        replay: true,
        result: existingIdempotency.result,
      }
    }
    return {
      ok: false,
      error: {
        code: 'IDEMPOTENCY_MISMATCH',
        message: 'Mã yêu cầu đã được dùng cho một thao tác khác.',
      },
    }
  }

  // 3. State version check
  if (currentRecord.state_version !== expectedStateVersion) {
    return {
      ok: false,
      error: {
        code: 'STATE_CONFLICT',
        message: 'Phiên trò chuyện đã thay đổi. Vui lòng làm mới trạng thái.',
      },
    }
  }

  // 4. Apply operations to draft
  let currentDraft = currentRecord.draft ? currentRecord.draft : createInitialDraft()

  if (operations.length > 0) {
    const batchResult = await applyDraftBatch(
      currentDraft,
      operations,
      catalogResolver,
      currentRecord.pending_suggestion_ids,
      customerAllergies,
      currentRecord.constraints.budget_vnd,
    )
    if (!batchResult.ok) {
      return {
        ok: false,
        error: mapDomainErrorToSessionError(batchResult.error, batchResult.message),
      }
    }
    currentDraft = batchResult.draft
  }

  // 5. Explicit review transition if requested
  if (markReadyForReview) {
    if (!withinMenuBudget(currentDraft.subtotal_vnd, currentRecord.constraints.budget_vnd)) {
      return { ok: false, error: mapDomainErrorToSessionError('BUDGET_EXCEEDED', 'Tổng món vượt ngân sách hiện tại.') }
    }
    const reviewResult = transitionDraftReviewState(currentDraft, 'ready_for_review')
    if (!reviewResult.ok) {
      return {
        ok: false,
        error: mapDomainErrorToSessionError(reviewResult.error, reviewResult.message),
      }
    }
    currentDraft = reviewResult.draft
  }

  // 6. Build next mutable state
  const nextMutableState: ConciergeV2SessionMutableState = {
    transcript: currentRecord.transcript,
    summary: currentRecord.summary,
    constraints: currentRecord.constraints,
    draft: currentDraft,
    pending_suggestion_ids: newPendingSuggestionIds ?? currentRecord.pending_suggestion_ids,
  }

  // 7. Commit via atomic compareAndSwap
  return sessionStore.compareAndSwap({
    reference: sessionRef,
    actor,
    expected_state_version: expectedStateVersion,
    request_id: requestId,
    operation_hash: operationHash,
    next: nextMutableState,
    result: storedResult,
  })
}
