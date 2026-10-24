/**
 * Tiger Agent V3 — Phase 4: Draft handler.
 *
 * Owns deterministic draft-cart flow: operations, price acceptance,
 * review/handoff, clarification, rejection. Mutations NEVER go through
 * the model — natural language becomes a DraftCommand via the
 * Understanding Engine, then the draft domain executes it.
 *
 * Returns 'done' when the turn is complete, 'continue' when the caller
 * should proceed to the read-tool fallback tail (rejection path).
 */

import { applyDraftBatch, revalidateDraftAgainstCatalog, transitionDraftReviewState, calculateDraftSubtotal } from '../../draft-cart.ts'
import { prepareCartHandoff } from '../../cart-handoff.ts'
import { understandDraft } from '../../understanding/engine.ts'
import type { TurnScope } from '../turn-context.ts'
import type { catalogResolver } from '../catalog-resolver.ts'
import { clarify, conversationContext } from '../../conversation-context.ts'
import { withinMenuBudget } from '../../budget.ts'

export async function handleDraft(
  scope: TurnScope,
  resolver: ReturnType<typeof catalogResolver>,
): Promise<'done' | 'continue'> {
  const { request, record, next, result } = scope
  const message = request.message ?? ''
  const referenced = scope.referentItemId && scope.catalog.find(item => item.id === scope.referentItemId)
  const resolvedMessage = referenced ? message.replace(/món\s+(?:thứ\s+)?(?:một|nhất|hai|ba|tư|bốn|năm|sáu|bảy|tám|[1-8])|mon\s+(?:thu\s+)?(?:mot|nhat|hai|ba|tu|bon|nam|sau|bay|tam|[1-8])|món đó|món này|cái này|mon do|mon nay|cai nay/iu, referenced.name) : message
  const intent = understandDraft(resolvedMessage, next, scope.catalog)
  let operations = request.draft_operation ? [request.draft_operation] : intent.kind === 'operations' ? intent.operations : []
  if (request.action?.type === 'accept_meal_plan') {
    const action = request.action
    const selected = next.pending_items?.filter((item) => item.plan_id === action.plan_id) ?? []
    if (selected.length !== action.suggestion_ids.length ||
        !selected.every((item) => item.state_version === record.state_version &&
          next.pending_suggestion_ids.includes(item.suggestion_id) && action.suggestion_ids.includes(item.suggestion_id)))
      throw new Error('AMBIGUOUS_ACCEPTANCE')
    operations = selected.map((item) => ({ type: 'add_item' as const, pending_suggestion_id: item.suggestion_id,
      menu_item_id: item.menu_item_id, quantity: item.quantity, note: '' }))
  }
  if (request.draft_operation?.type === 'add_item') {
    const op = request.draft_operation
    const pending = next.pending_items?.find((p) => p.suggestion_id === op.pending_suggestion_id && p.menu_item_id === op.menu_item_id)
    if (!pending || pending.state_version !== record.state_version) throw new Error('AMBIGUOUS_ACCEPTANCE')
  }
  if (next.draft?.exported_version && operations.some((op) => op.type !== 'start_new_set')) {
    result.message = 'Mâm này đã chuyển vào giỏ hàng. Hãy chỉnh trong giỏ hàng hoặc bắt đầu mâm mới.'
    return 'done'
  }
  if (request.action?.type === 'answer_clarification') {
    if (request.action.choice_field === 'guests') { next.constraints.adults = Number(request.action.choice_value); next.constraints.party_size_confirmed = true }
    else next.constraints.appetite = request.action.choice_value as 'light' | 'normal' | 'heavy'
  }
  if (operations.length) {
    if (operations.some(operation => operation.type === 'add_item' &&
        next.pending_items?.some(item => item.menu_item_id === operation.menu_item_id && item.orderable_exact === false))) {
      result.message = 'Mâm này còn món có giá khoảng hoặc chưa chốt giá. Cần nhà hàng xác nhận giá chính xác trước khi thêm vào giỏ nháp.'
      result.warnings = ['PRICE_CONFIRMATION_REQUIRED']
      return 'done'
    }
    // Short acceptance requires a current suggestion even when parsed from text.
    if (/^(?:ok|okay|dong y|lay mon nay|lay mon do|lay cai nay)$/.test(scope.understanding?.normalized.searchForm ?? '') &&
        !next.pending_items?.every(item => item.state_version === record.state_version && next.pending_suggestion_ids.includes(item.suggestion_id))) {
      await clarify(scope, { goal: 'menu_detail', reason: 'stale_referent', unresolved_referent: message.slice(0, 120) })
      return 'done'
    }
    const applied = await applyDraftBatch(next.draft, operations, resolver,
      request.action?.type === 'accept_meal_plan' || request.draft_operation?.type === 'add_item' ? next.pending_suggestion_ids : undefined,
      next.constraints.allergies, next.constraints.budget_vnd)
    if (!applied.ok) { result.message = applied.message; result.warnings = [applied.error]; return 'done' }
    if (!withinMenuBudget(applied.draft.subtotal_vnd, next.constraints.budget_vnd)) {
      result.message = 'Giá hiện tại vượt ngân sách tối đa. Hãy chọn lại món.'
      result.warnings = ['BUDGET_EXCEEDED']
      return 'done'
    }
    next.draft = applied.draft
    next.pending_items = []; next.pending_suggestion_ids = []
    delete conversationContext(scope).displayed
    delete conversationContext(scope).pending_question
    result.message = 'Đã cập nhật giỏ nháp. Món chưa được chuyển vào giỏ hàng.'
    result.phase = 'BUILDING_DRAFT'
    return 'done'
  }
  if (request.action?.type === 'accept_prices' && next.draft) {
    if (request.action.draft_version !== next.draft.version) throw new Error('STATE_CONFLICT')
    const prices = next.draft.blocked_items.filter((item) => item.reason === 'PRICE_CHANGED')
    if (prices.some((item) => resolver(item.menu_item_id)?.price_vnd !== item.current_unit_price_vnd)) {
      next.draft = await revalidateDraftAgainstCatalog(next.draft, resolver, next.constraints.allergies)
      result.message = 'Giá vừa thay đổi thêm. Hãy kiểm tra giá mới trước khi đồng ý.'
      result.phase = 'REVIEWING'
      return 'done'
    }
    const items = next.draft.items.map((i) => ({ ...i, unit_price_vnd: prices.find((p) => p.line_id === i.line_id)?.current_unit_price_vnd ?? i.unit_price_vnd }))
    const subtotal = calculateDraftSubtotal(items)
    if (!withinMenuBudget(subtotal, next.constraints.budget_vnd)) {
      result.message = 'Giá mới làm tổng món vượt ngân sách hiện tại. Hãy điều chỉnh món trước khi xác nhận.'
      result.warnings = ['BUDGET_EXCEEDED']; result.phase = 'REVIEWING'
      return 'done'
    }
    next.draft = { ...next.draft, items, blocked_items: [], subtotal_vnd: subtotal, version: next.draft.version + 1 }
  }
  if (intent.kind === 'review' || ['review_draft', 'accept_prices', 'handoff_draft'].includes(request.action?.type ?? '')) {
    if (!next.draft) { result.message = 'Giỏ nháp đang trống. Hãy chọn món trước.'; return 'done' }
    const checked = await revalidateDraftAgainstCatalog(next.draft, resolver, next.constraints.allergies)
    next.draft = checked
    if (!withinMenuBudget(checked.subtotal_vnd, next.constraints.budget_vnd)) {
      result.message = 'Tổng món vượt ngân sách hiện tại. Hãy điều chỉnh trước khi duyệt hoặc chuyển vào giỏ hàng.'
      result.warnings = ['BUDGET_EXCEEDED']; result.phase = 'REVIEWING'
      return 'done'
    }
    if (request.action?.type === 'handoff_draft') {
      if (checked.blocked_items.length) {
        result.message = 'Có món cần kiểm tra lại. Chưa chuyển món nào vào giỏ hàng.'
        result.phase = 'REVIEWING'
        result.warnings = [...new Set(checked.blocked_items.map((item) => item.reason))]
        return 'done'
      }
      const prepared = prepareCartHandoff(next, request.action, resolver)
      scope.next = prepared.next
      result.handoff = prepared.handoff
      result.phase = 'HANDOFF_TO_CART'
      result.message = 'Mâm đã sẵn sàng chuyển vào giỏ hàng. Bạn vẫn cần kiểm tra và xác nhận đặt món.'
    } else {
      const reviewed = transitionDraftReviewState(checked, 'ready_for_review')
      if (reviewed.ok) next.draft = reviewed.draft
      result.message = reviewed.ok ? 'Hãy xem lại món và số lượng trước khi chuyển vào giỏ hàng.' : reviewed.message
      result.phase = 'REVIEWING'
    }
    return 'done'
  }
  if (intent.kind === 'clarify') {
    await clarify(scope, { goal: 'menu_detail', reason: 'ambiguous_referent', unresolved_referent: message.slice(0, 120) })
    return 'done'
  }
  if (intent.kind === 'reject' && /^(?:nghe ngon|de xem)$/.test(scope.understanding?.normalized.searchForm ?? '')) {
    await scope.helpers.modelConversation(message)
    return 'done'
  }
  if (intent.kind === 'reject' && !/^(?:nghe ngon|de xem)$/.test(scope.understanding?.normalized.searchForm ?? '')) {
    next.pending_items = []; next.pending_suggestion_ids = []; delete conversationContext(scope).displayed
  }
  return 'continue'
}
