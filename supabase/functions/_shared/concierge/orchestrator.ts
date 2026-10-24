import type pg from 'pg'
import { ConciergeV2SessionMutableStateSchema, type ConciergeV2Activity, type ConciergeV2SessionRecord, type ConciergeV2TurnRequest, type ConciergeV2StoredTurnResult } from '../contracts/concierge-v2.ts'
import { buildConciergeContext, TurnBudget, ContextBudgetError, type ToolExchange, type EvidenceStatus } from './context.ts'
import { summarizeSession } from './session-summary.ts'
import { V2_READ_TOOLS, withToolTimeout } from './tool-registry.ts'
import { createTurnOrchestrator } from './llm-config.ts'
import type { ConciergeLlmOrchestrator } from './llm.ts'
import { normalizeIntent } from './draft-intent.ts'
import { understandTurn } from './understanding/engine.ts'
import { mergeConstraintDelta } from './understanding/constraint-extractor.ts'
import { safeConversationReply, safeGroundedReply, ReplyGuardError, type ReplyGuardMetrics } from './response-guard.ts'
import { suggestConciergeActions } from './suggested-actions.ts'
import { resolveCapabilityContext } from './capabilities/resolver.ts'
import { resolveRoute, isAccountRead } from './orchestration/capability-router.ts'
import { catalogResolver } from './orchestration/catalog-resolver.ts'
import { loadMainContext } from './orchestration/main-context.ts'
import { createTurnGateway, selectToolCalls, runModelTools, computeEvidenceStatus, evidenceStatusFor } from './orchestration/tool-runner.ts'
import { handleRefresh, handleConversation } from './orchestration/handlers/conversation-handler.ts'
import { handleAccountRefusal, applyAccountObservation } from './orchestration/handlers/account-handler.ts'
import { handleRestaurantFact, applyLookupObservation } from './orchestration/handlers/restaurant-handler.ts'
import { handleReservationCheck } from './orchestration/handlers/reservation-handler.ts'
import { buildFallbackCalls, activeToolsFor, applyMenuItemObservation, applyCandidateObservation } from './orchestration/handlers/food-handler.ts'
import { handleDraft } from './orchestration/handlers/draft-handler.ts'
import type { TurnScope } from './orchestration/turn-context.ts'
import { initializeMemoryContext, collectSessionFacts, finishMemoryState, applyEffectiveMemory } from './memory-state.ts'
import { prepareTurnMemory } from './orchestration/session-memory.ts'
import { continuePendingGoal, updateConversationGoal, conversationContext, clarify, resolveDisplayedReferent, recordDisplayedItems } from './conversation-context.ts'
import type { LlmResponse } from './llm.ts'

export { catalogResolver }

function mergeConstraints(previous: string[], values: string[], allergy = false) {
  const combined = [...new Set([...previous, ...values])]
  return allergy && combined.length > 12 ? [...combined.slice(0, 11), 'unverified-additional-allergens'] : combined.slice(0, 12)
}

export async function orchestrateGroundedTurn(request: ConciergeV2TurnRequest, record: ConciergeV2SessionRecord, pool: pg.Pool,
  injected?: ConciergeLlmOrchestrator, onActivity?: (activity: ConciergeV2Activity) => void,
  onSafeText?: (text: string) => void, signal?: AbortSignal) {
  let next = ConciergeV2SessionMutableStateSchema.parse(recordMutable(record))
  initializeMemoryContext(next, record.actor.authenticated_user_id ?? undefined)
  next = summarizeSession(next)
  const result: ConciergeV2StoredTurnResult = { response_id: crypto.randomUUID(), message: '', cards: [], warnings: [], phase: 'DISCOVERY' }
  const budget = new TurnBudget()
  const guardMetrics: ReplyGuardMetrics = { guard_checks: 0, guard_rejections: 0, repair_attempts: 0, repair_successes: 0, repair_latency_ms: 0 }
  const checked = (reply: string | null) => {
    guardMetrics.guard_checks++
    if (!reply) guardMetrics.guard_rejections++
    return reply
  }
  let contextTrimmed = false
  let delegate: ConciergeLlmOrchestrator | undefined
  const getDelegate = async () => delegate ??= await createTurnOrchestrator(pool, injected)
  const includeUnprocessedReads = (reply: string) => {
    const u = scope.understanding
    const notices: string[] = []
    if (isAccountRead(u?.intent ?? null) && u?.readNeeds.length) notices.push('Phần yêu cầu về món hoặc thông tin nhà hàng chưa được xử lý trong lượt này.')
    if (u?.deferredReadNeeds.some(need => need.kind === 'menu')) notices.push('Phần hỏi chi tiết các món tiếp theo chưa được xử lý trong lượt này.')
    if (u?.deferredReadNeeds.some(need => need.kind === 'restaurant')) notices.push('Phần hỏi thông tin nhà hàng tiếp theo chưa được xử lý trong lượt này.')
    if (u?.intent === 'reservation' && u.readNeeds.some(need => need.kind === 'menu')) notices.push('Phần kiểm tra bàn cho yêu cầu đặt bàn chưa được xử lý trong lượt này.')
    if (!notices.length) return reply
    if (!result.warnings.includes('UNPROCESSED_READ_NEEDS')) result.warnings.push('UNPROCESSED_READ_NEEDS')
    return `${reply} ${notices.join(' ')}`
  }
  const askModel = async (prompt: string, tools: typeof V2_READ_TOOLS = [], exchanges: ToolExchange[] = []) => {
    const memory = scope.next.memory_context
    if (memory?.imported.length && memory.epoch !== undefined) {
      const before = memory.imported.length
      applyEffectiveMemory(scope.next, memory.imported, memory.epoch)
      if (memory.imported.length !== before) { scope.next.transcript = []; scope.next.summary = '' }
    }
    const context = buildConciergeContext({ state: scope.next, message: prompt, tools, exchanges, pageContext: request.page_context,
      readNeeds: scope.understanding?.readNeeds, deferredReadNeeds: scope.understanding?.deferredReadNeeds,
      maxInputTokens: 12000 - budget.inputTokens })
    contextTrimmed ||= context.trimmed
    budget.consume(context.inputTokens)
    const remainingMs = 25000 - (Date.now() - budget.started)
    if (remainingMs <= 0) throw new ContextBudgetError('TURN_BUDGET')
    onActivity?.('thinking')
    const response = await withToolTimeout((await getDelegate()).orchestrateTurn(prompt, [], {
      bounded: context, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(remainingMs)]), requestId: request.request_id,
    }), Math.min(11000, remainingMs))
    budget.recordUsage(response.tokens_used)
    return response
  }
  const modelConversation = async (prompt: string) => {
    const response = await askModel(prompt)
    const reply = checked(safeConversationReply(includeUnprocessedReads(response.reply_text)))
    if (!reply) throw new ReplyGuardError({ ...guardMetrics })
    result.message = reply
    onSafeText?.(reply)
  }
  const modelGroundedReply = async (prompt: string, exchanges: ToolExchange[], evidenceStatus: EvidenceStatus = 'known') => {
    const compositionExchanges = compactToolExchanges(exchanges)
    // Guard exactly the evidence the composer receives; hidden prices or IDs
    // in the full tool result cannot accidentally validate a hallucination.
    const evidence = JSON.stringify(compositionExchanges.map(exchange => ({ name: exchange.name, status: evidenceStatusFor(exchange), result: exchange.result })))
    let response = await askModel(prompt, [], compositionExchanges)
    let reply = checked(safeGroundedReply(includeUnprocessedReads(response.reply_text), evidence, evidenceStatus))
    if (!reply) {
      guardMetrics.repair_attempts++
      const repairStarted = Date.now()
      try {
        response = await askModel(`${prompt}\nThe previous draft failed grounding checks. Correct using verified evidence; abstain if needed. Max 700 characters; operational values stay on cards.`, [], compositionExchanges)
        reply = checked(safeGroundedReply(includeUnprocessedReads(response.reply_text), evidence, evidenceStatus))
        if (reply) guardMetrics.repair_successes++
      } finally {
        guardMetrics.repair_latency_ms += Math.max(0, Date.now() - repairStarted)
      }
    }
    if (!reply) throw new ReplyGuardError({ ...guardMetrics })
    result.message = reply
    onSafeText?.(reply)
  }
  const finish = () => {
    if (Date.now() - budget.started > 25000) throw new ContextBudgetError('TURN_BUDGET')
    recordDisplayedItems(scope)
    finishMemoryState(scope.next)
    if (scope.next.conversation_context?.pending_question) scope.next.conversation_context.pending_question.state_version = record.state_version + 1
    if (scope.next.draft) result.draft = scope.next.draft
    result.suggested_actions = suggestConciergeActions(result, scope.next)
    if (request.message) scope.next.transcript.push({ role: 'user', content: request.message })
    if (result.message) scope.next.transcript.push({ role: 'assistant', content: result.message })
    scope.next = summarizeSession(scope.next)
    next = scope.next
    return { next, result, metrics: { ...guardMetrics, model_calls: budget.calls, input_tokens: budget.inputTokens, tool_count: budget.tools,
      reported_input_tokens: budget.reportedInputTokens, output_tokens: budget.outputTokens, summary_used: Boolean(next.summary), context_trimmed: contextTrimmed,
      safety_blocks: (next.draft?.blocked_items.filter(item => item.reason === 'ALLERGY_UNVERIFIED').length ?? 0) + (result.warnings.includes('ALLERGY_UNVERIFIED') ? 1 : 0) } }
  }

  const message = request.message ?? ''
  const understanding = message ? understandTurn(message, Boolean(next.pending_items?.length), Boolean(next.pending_items?.some(item => item.plan_id))) : null
  if (understanding) continuePendingGoal(message, understanding, record)
  const text = understanding ? understanding.normalized.searchForm : normalizeIntent(message)
  const turnIntent = understanding?.intent ?? null
  if (understanding) next.constraints = mergeConstraintDelta(next.constraints, understanding.constraintsDelta)
  const merchandising = understanding?.readNeeds.find(need => need.kind === 'menu')?.merchandising
  if (merchandising?.length) next.constraints.merchandising = merchandising
  if (/\b(?:khong can|bo yeu cau|khong chi)\s+(?:best seller|bestseller|ban chay)\b/.test(text)) {
    next.constraints.merchandising = next.constraints.merchandising?.filter(value => value !== 'bestseller')
    for (const need of understanding?.readNeeds ?? []) if (need.kind === 'menu') need.merchandising = need.merchandising.filter(value => value !== 'bestseller')
  }
  const allergyCorrection = collectSessionFacts(next, message)
  const replacement = next.pending_items?.length ? /^(?:doi|thay)\s+mon\s+(.+?)(?:\s+(?:di|nhe|nha))?$/.exec(text) : null
  if (replacement) next.constraints.dislikes = mergeConstraints(next.constraints.dislikes, [replacement[1]])
  if (request.page_context?.order_mode) next.constraints.order_mode = request.page_context.order_mode
  next.memory_context!.current = structuredClone(next.constraints)

  const capability = resolveCapabilityContext({
    actorType: record.actor.authenticated_user_id ? 'customer' : 'guest',
    sessionId: record.session_id,
    userId: record.actor.authenticated_user_id ?? undefined,
  })
  const scope: TurnScope = {
    request, record, pool, capability, understanding, next, result, budget,
    helpers: { askModel, modelConversation, modelGroundedReply, onActivity, onSafeText, signal },
    toolEvents: [], knowledge: null, catalog: [], reservationQuery: null,
  }
  const gateway = createTurnGateway(scope)
  updateConversationGoal(scope)
  await prepareTurnMemory(scope)
  if (allergyCorrection) {
    await clarify(scope, { goal: conversationContext(scope).goal ?? 'meal', reason: 'allergy_correction', missing_field: 'allergy' })
    return finish()
  }
  const referent = resolveDisplayedReferent(scope)
  if (referent.requested && !referent.itemId && !request.action && !request.draft_operation) {
    await clarify(scope, { goal: 'menu_detail', reason: referent.stale ? 'stale_referent' : 'ambiguous_referent', unresolved_referent: message.slice(0, 120) })
    return finish()
  }
  if (referent.itemId && understanding) {
    scope.referentItemId = referent.itemId
    if (!understanding.readNeeds.some(need => need.kind === 'menu')) understanding.readNeeds.push({ kind: 'menu', mode: 'detail', merchandising: [] })
  }
  let initialPlan: LlmResponse | undefined
  // Give unrecognized natural language a bounded model/tool opportunity. Low
  // confidence alone is not a reason to force a scripted clarification.
  if (understanding?.intent === 'other' && !understanding.readNeeds.length && !request.action && !request.draft_operation) {
    const exploratoryTools = V2_READ_TOOLS.filter(tool => ['search_menu_items', 'get_menu_item', 'recommend_meal', 'lookup_restaurant_info'].includes(tool.name))
    initialPlan = await askModel(message, exploratoryTools)
    const calls = selectToolCalls(exploratoryTools, initialPlan.tool_calls, [])
    for (const call of calls) {
      if (call.name === 'lookup_restaurant_info') understanding.readNeeds.push({ kind: 'restaurant', query: String((call.arguments as Record<string, unknown>).query ?? message).slice(0, 200) })
      else understanding.readNeeds.push({ kind: 'menu', mode: call.name === 'recommend_meal' ? 'recommendation' : call.name === 'get_menu_item' ? 'detail' : 'browse', merchandising: [] })
    }
    if (!understanding.readNeeds.length) {
      const reply = checked(safeConversationReply(initialPlan.reply_text))
      if (!reply) throw new ReplyGuardError({ ...guardMetrics })
      result.message = reply
      return finish()
    }
    understanding.intent = understanding.readNeeds.some(need => need.kind === 'menu') ? 'food' : 'faq'
    updateConversationGoal(scope)
    await prepareTurnMemory(scope)
  }
  const route = resolveRoute({ request, record, understanding, message })

  if (route === 'refresh') {
    await handleRefresh(scope)
    return finish()
  }
  if (route === 'account_refusal') {
    await handleAccountRefusal(scope, turnIntent === 'order_history' ? 'order_history' : 'saved_address')
    return finish()
  }
  if (route === 'restaurant_fact') {
    await handleRestaurantFact(scope, gateway)
    return finish()
  }
  if (route === 'reservation') {
    await handleReservationCheck(scope, gateway)
    return finish()
  }
  if (route === 'conversation') {
    await handleConversation(scope)
    return finish()
  }

  const accountRead = isAccountRead(turnIntent)
  if (!accountRead) onActivity?.(turnIntent === 'faq' ? 'checking_info' : 'checking_menu')
  const main = await loadMainContext(scope, accountRead, catalogResolver)
  if (!main) return finish()

  const draftOutcome = await handleDraft(scope, main.resolver)
  if (draftOutcome === 'done') return finish()

  if (understanding?.constraintsDelta.requestedDishCountInvalid) {
    result.message = 'Mình hỗ trợ tối đa 30 món khác nhau trong một phương án. Bạn muốn chọn bao nhiêu món trong khoảng 1–30?'
    return finish()
  }
  if (understanding?.readNeeds.some(need => need.kind === 'menu' && need.mode === 'recommendation') &&
      !next.constraints.party_size_confirmed &&
      (next.constraints.budget_vnd == null || next.constraints.budget_basis === 'per_person')) {
    await clarify(scope, { goal: 'meal', reason: 'missing_field', missing_field: 'guests' })
    return finish()
  }
  if (conversationContext(scope).goal === 'meal') delete conversationContext(scope).pending_question

  const fallbackCalls = buildFallbackCalls(scope, main.viewedItem, main.namedExactItem, main.faq, accountRead)
  const activeTools = activeToolsFor(scope, main.faq, accountRead, main.factualQuestion)
  const plan = initialPlan ?? await askModel(message, activeTools)
  const menuNeed = understanding?.readNeeds.find(need => need.kind === 'menu')
  const wantsRecommendation = understanding?.readNeeds.some(need => need.kind === 'menu' && need.mode === 'recommendation')
  const planCalls = plan.tool_calls.map(call => {
    if (scope.referentItemId && ['get_menu_item', 'search_menu_items', 'recommend_meal'].includes(call.name)) {
      return { ...call, name: 'get_menu_item', arguments: { item_id: scope.referentItemId } }
    }
    if (menuNeed?.mode === 'detail' && main.namedExactItem && !menuNeed.merchandising.length &&
        ['get_menu_item', 'search_menu_items'].includes(call.name)) {
      return { ...call, name: 'get_menu_item', arguments: { item_id: main.namedExactItem.id } }
    }
    // Preserve browse semantics even when the model mistakes stored constraints for a meal request.
    if (menuNeed && (menuNeed.merchandising.length || (!wantsRecommendation && call.name === 'recommend_meal')) &&
        ['get_menu_item', 'search_menu_items', 'recommend_meal'].includes(call.name)) {
      return { ...call, name: wantsRecommendation && call.name === 'recommend_meal' ? 'recommend_meal' : 'search_menu_items', arguments: {} }
    }
    return call
  })
  const calls = selectToolCalls(activeTools, planCalls, fallbackCalls)
  const exchanges = await runModelTools(scope, gateway, calls, activeTools)
  for (const exchange of exchanges) {
    if (evidenceStatusFor(exchange) === 'unavailable') {
      result.warnings.push('EVIDENCE_UNAVAILABLE')
      continue
    }
    if (exchange.name === 'get_recent_orders' || exchange.name === 'get_saved_addresses') {
      applyAccountObservation(scope, exchange)
    } else if (exchange.name === 'lookup_restaurant_info') {
      if (!menuNeed) applyLookupObservation(scope)
    } else if (exchange.name === 'get_menu_item') {
      applyMenuItemObservation(scope, exchange)
    } else {
      applyCandidateObservation(scope, exchange, record.state_version)
    }
  }
  await modelGroundedReply(message, exchanges, computeEvidenceStatus(exchanges))
  return finish()
}

function compactToolExchanges(exchanges: ToolExchange[]): ToolExchange[] {
  const compactMenuItem = (value: unknown) => {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return Object.fromEntries(['name', 'category_name', 'is_available', 'is_signature', 'is_bestseller', 'spice_level', 'safety_state', 'serving_size', 'meal_role']
      .filter(key => item[key] !== undefined).map(key => [key, item[key]]))
  }
  return exchanges.map(exchange => {
    const value = exchange.result && typeof exchange.result === 'object' ? exchange.result as Record<string, unknown> : {}
    let result: unknown = value
    if (exchange.name === 'search_menu_items' || exchange.name === 'recommend_meal') {
      const candidates = Array.isArray(value.candidates) ? value.candidates.map(compactMenuItem) : []
      const plans = Array.isArray(value.plans) ? value.plans.slice(0, 1).map(rawPlan => {
        const plan = rawPlan && typeof rawPlan === 'object' ? rawPlan as Record<string, unknown> : {}
        const lines = Array.isArray(plan.lines) ? plan.lines.map(rawLine => {
          const line = rawLine && typeof rawLine === 'object' ? rawLine as Record<string, unknown> : {}
          return { item: compactMenuItem(line.item), quantity: line.quantity }
        }) : []
        return { lines, validation_status: plan.validation_status, warnings: plan.warnings }
      }) : undefined
      // When plans are displayed, their lines already contain the relevant
      // items. Avoid repeating the unused candidate pool in every repair call.
      result = { candidates: plans?.length ? undefined : candidates, plans,
        advice_evidence: 'Serving text/warnings only; no pairing or portion guarantee.', allergy_warning: value.allergy_warning,
        staff_confirmation_required: value.staff_confirmation_required, relaxed_filters: value.relaxed_filters }
    } else if (exchange.name === 'get_menu_item') {
      result = { item: value.item ? compactMenuItem(value.item) : null, description: value.description, missing_fields: value.missing_fields }
    }
    return { ...exchange, result: { ...(result as Record<string, unknown>), evidence_status: evidenceStatusFor(exchange),
      ...(exchange.name === 'check_reservation_availability' ? {} : { status: evidenceStatusFor(exchange) }),
      ...(value.unresolved_needs ? { unresolved_needs: value.unresolved_needs } : {}) } }
  })
}

export function recordMutable(record: ConciergeV2SessionRecord) {
  const { session_id: _id, capability_hash: _cap, state_version: _version, actor: _actor,
    created_at: _created, idle_expires_at: _idle, absolute_expires_at: _absolute, idempotency: _replay, ...mutable } = record
  return mutable
}
