import type { ConciergeV2ConversationContext, ConciergeV2DomainClarification, ConciergeV2SessionRecord } from '../contracts/concierge-v2.ts'
import type { TurnScope } from './orchestration/turn-context.ts'
import type { TurnUnderstanding } from './understanding/types.ts'
import { normalizeIntent } from './draft-intent.ts'
import { resolveReservationDateTime, getVnDateTimeComponents } from './date-resolver.ts'

export function conversationContext(scope: TurnScope): ConciergeV2ConversationContext {
  return scope.next.conversation_context ??= {
    schema_version: 1, source: 'structured_state', scope: 'session', changed_fields: [], rejections: [],
  }
}

/** Resume only a compatible answer. A new explicit goal always takes precedence. */
export function continuePendingGoal(message: string, understanding: TurnUnderstanding, record: ConciergeV2SessionRecord): void {
  const context = record.conversation_context
  const pending = context?.pending_question
  const text = understanding.normalized.searchForm
  if (!context || (pending && pending.state_version !== record.state_version)) return
  if (['reservation', 'order_history', 'saved_address', 'faq'].includes(understanding.intent)) return
  const explicitRead = /\b(?:menu|thuc don|dac san|dac trung|chi tiet|gia mon|goi y|tu van|dat ban|giu cho)\b/.test(text)
  if (pending?.missing_field === 'guests' && !explicitRead && /^\d{1,2}$/.test(text) && +text >= 1 && +text <= 30) {
    understanding.constraintsDelta.partyTotal = +text
  }
  if (context.goal === 'reservation' && pending &&
      (/^(?:\d{1,2}(?:\s*(?:h|g|gio|:).*)?(?:\s+(?:nguoi|khach))?|(?:ngay |toi |trua |chieu |sang )?(?:mai|nay|mot)|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?|(?:buoi )?(?:sang|toi|chieu)|(?:thu|chu nhat) .+)$/.test(text) ||
       understanding.constraintsDelta.partyTotal !== undefined) && !explicitRead) {
    understanding.intent = 'reservation'
    understanding.readNeeds = []
    if (pending.missing_field === 'guests' && /^\d{1,2}$/.test(text) && +text >= 1 && +text <= 30) {
      understanding.constraintsDelta.partyTotal = +text
    }
  } else if (context.goal === 'meal' &&
      (understanding.constraintsDelta.partyTotal !== undefined || understanding.constraintsDelta.budgetVnd !== undefined ||
       understanding.constraintsDelta.spice !== undefined || understanding.constraintsDelta.requestedDishCount !== undefined ||
        understanding.constraintsDelta.clearBudget || /^(?:doi|thay|bo)\b/.test(text)) && !explicitRead) {
    understanding.readNeeds = []
    understanding.readNeeds.push({ kind: 'menu', mode: 'recommendation', merchandising: record.constraints.merchandising ?? [] })
    understanding.intent = 'food'
  }
}

export function updateConversationGoal(scope: TurnScope): void {
  const context = conversationContext(scope)
  const u = scope.understanding
  const menu = u?.readNeeds.find(need => need.kind === 'menu')
  const goal = menu ? menu.mode === 'recommendation' ? 'meal' : menu.mode === 'detail' ? 'menu_detail' : 'menu_browse'
    : u?.intent === 'reservation' ? 'reservation'
      : u?.readNeeds.some(need => need.kind === 'restaurant') ? 'restaurant'
        : ['order_history', 'saved_address'].includes(u?.intent ?? '') ? 'account' : undefined
  if (goal && context.goal !== goal) {
    delete context.pending_question
    context.goal = goal
  }
  context.changed_fields = Object.entries(u?.constraintsDelta ?? {}).filter(([, value]) => value != null).map(([key]) => key).slice(0, 8)
  const message = scope.request.message ?? ''
  if (/\b(?:khong thich|khong muon|doi mon|thay mon)\b/.test(u?.normalized.searchForm ?? '')) {
    context.rejections = [...context.rejections, { reason: message.slice(0, 120), source: 'user' as const, scope: 'meal' as const }].slice(-3)
  }
}

export async function clarify(scope: TurnScope, input: Omit<ConciergeV2DomainClarification, 'source' | 'scope' | 'state_version'>): Promise<void> {
  conversationContext(scope).pending_question = {
    ...input, source: 'handler', scope: 'session', state_version: scope.record.state_version + 1,
  }
  await scope.helpers.modelConversation(`Respond naturally to the customer's message: ${scope.request.message ?? ''}\nAsk one useful clarification for the validated pending_question in canonical context. Do not claim a lookup, acceptance, reservation or durable-memory write succeeded.`)
}

/** Normalize partial dates to absolute dates now, so "mai" does not move tomorrow. */
export function collectReservationFields(scope: TurnScope, now = new Date()) {
  const context = conversationContext(scope)
  const fields = context.reservation ??= {}
  const message = scope.request.message ?? ''
  const dateText = message.replace(/\b\d{1,2}\s*(?:h|g|giờ|:)\s*\d{0,2}\b/giu, '')
  const dateProbe = resolveReservationDateTime(`${dateText} 12h`, now, true)
  if (dateProbe.success && dateProbe.startsAt) {
    const local = getVnDateTimeComponents(dateProbe.startsAt)
    fields.date = `${local.date}/${local.month}/${local.year}`
  }
  const text = normalizeIntent(message)
  const time = /\b\d{1,2}\s*(?:h|g|gio|:)\s*\d{0,2}\b/.exec(text)
  const period = /\b(?:sang|trua|chieu|toi|dem)\b/.exec(text)?.[0]
  if (time) fields.time = `${time[0].replace(/gio/g, 'h').trim()}${period ? ` ${period}` : ''}`.slice(0, 30)
  else if (fields.time && period && /^(?:buoi )?(?:sang|toi|chieu|trua)(?: nhe| a)?$/.test(text)) {
    fields.time = `${fields.time.replace(/\s+(?:sang|trua|chieu|toi|dem)$/, '')} ${period}`
  }
  return resolveReservationDateTime([fields.date, fields.time].filter(Boolean).join(' '), now, true)
}

export function resolveDisplayedReferent(scope: TurnScope): { requested: boolean; itemId?: string; stale?: boolean } {
  const text = scope.understanding?.normalized.searchForm ?? ''
  const ordinal = /\bmon (?:thu )?(mot|nhat|hai|ba|tu|bon|nam|sau|bay|tam|[1-8])\b/.exec(text)
  const singular = /\b(?:mon do|mon nay|cai do|cai nay|mon dang xem)\b/.test(text)
  if (!ordinal && !singular) return { requested: false }
  const displayed = scope.next.conversation_context?.displayed
  const page = scope.request.page_context
  // A valid current page is independent evidence for an explicitly viewed dish.
  if (!ordinal && page?.page === 'menu' && page.menu_item_id && /\b(?:mon nay|cai nay|mon dang xem)\b/.test(text)) {
    return { requested: true, itemId: page.menu_item_id }
  }
  if (!displayed || displayed.session_id !== scope.record.session_id || displayed.state_version !== scope.record.state_version ||
      (page && displayed.page && JSON.stringify(page) !== JSON.stringify(displayed.page))) return { requested: true, stale: true }
  const index = ordinal ? ({ mot: 1, nhat: 1, hai: 2, ba: 3, tu: 4, bon: 4, nam: 5, sau: 6, bay: 7, tam: 8 }[ordinal[1]] ?? Number(ordinal[1])) - 1 : 0
  if (!ordinal && displayed.items.length !== 1) return { requested: true }
  const item = displayed.items[index]
  if (!item) return { requested: true }
  if (item.suggestion_id && !scope.next.pending_items?.some(pending => pending.suggestion_id === item.suggestion_id &&
      pending.menu_item_id === item.menu_item_id && pending.state_version === scope.record.state_version &&
      scope.next.pending_suggestion_ids.includes(pending.suggestion_id))) return { requested: true, stale: true }
  return { requested: true, itemId: item.menu_item_id }
}

export function recordDisplayedItems(scope: TurnScope): void {
  const items = scope.result.cards.flatMap(card => card.type === 'draft_suggestion'
    ? [{ menu_item_id: card.item.id, suggestion_id: card.suggestion_id }]
    : card.type === 'meal_plan' ? card.lines.map(line => ({ menu_item_id: line.item.id, suggestion_id: line.suggestion_id }))
      : card.type === 'menu_item_detail' ? [{ menu_item_id: card.item.id }] : [])
  if (items.length) conversationContext(scope).displayed = {
    session_id: scope.record.session_id, state_version: scope.record.state_version + 1,
    ...(scope.request.page_context ? { page: scope.request.page_context } : {}), items: items.slice(0, 60),
  }
  else {
    const context = scope.next.conversation_context
    const displayed = context?.displayed
    // Asking which of the still-displayed options the customer means does not
    // itself change that list. Revalidate its IDs and promote only this exact
    // snapshot, so the clarification answer can resolve on the following turn.
    if (context?.pending_question?.reason === 'ambiguous_referent' && displayed &&
        displayed.session_id === scope.record.session_id && displayed.state_version === scope.record.state_version &&
        (!scope.request.page_context || !displayed.page || JSON.stringify(scope.request.page_context) === JSON.stringify(displayed.page)) &&
        !context.changed_fields.length &&
        JSON.stringify(scope.next.pending_items) === JSON.stringify(scope.record.pending_items) &&
        displayed.items.every(item => item.suggestion_id && scope.next.pending_items?.some(pending => pending.suggestion_id === item.suggestion_id &&
          pending.menu_item_id === item.menu_item_id && pending.state_version === scope.record.state_version && scope.next.pending_suggestion_ids.includes(pending.suggestion_id)))) {
      displayed.state_version = scope.record.state_version + 1
      scope.next.pending_items = scope.next.pending_items?.map(item => ({ ...item, state_version: scope.record.state_version + 1 }))
    }
  }
}
