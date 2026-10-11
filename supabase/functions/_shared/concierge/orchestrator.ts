import type pg from 'pg'
import { AppError } from '../errors.ts'
import { ConciergeV2SessionMutableStateSchema, type ConciergeV2Activity, type ConciergeV2SessionRecord, type ConciergeV2TurnRequest, type ConciergeV2StoredTurnResult } from '../contracts/concierge-v2.ts'
import { buildConciergeContext, TurnBudget, type ToolExchange } from './context.ts'
import { summarizeSession } from './session-summary.ts'
import { V2_READ_TOOLS, withToolTimeout } from './tool-registry.ts'
import { createTurnOrchestrator } from './llm-config.ts'
import type { ConciergeLlmOrchestrator } from './llm.ts'
import { normalizeIntent } from './draft-intent.ts'
import { understandTurn } from './understanding/engine.ts'
import { mergeConstraintDelta } from './understanding/constraint-extractor.ts'
import { safeConversationReply, safeGroundedReply } from './response-guard.ts'
import { suggestConciergeActions } from './suggested-actions.ts'
import { resolveCapabilityContext } from './capabilities/resolver.ts'
import { resolveRoute, isAccountRead } from './orchestration/capability-router.ts'
import { catalogResolver } from './orchestration/catalog-resolver.ts'
import { loadMainContext } from './orchestration/main-context.ts'
import { createTurnGateway, selectToolCalls, runModelTools, computeEvidenceStatus } from './orchestration/tool-runner.ts'
import { handleRefresh, handleConversation } from './orchestration/handlers/conversation-handler.ts'
import { handleAccountRefusal, applyAccountObservation } from './orchestration/handlers/account-handler.ts'
import { handleRestaurantFact, applyLookupObservation } from './orchestration/handlers/restaurant-handler.ts'
import { handleReservationCheck } from './orchestration/handlers/reservation-handler.ts'
import { buildFallbackCalls, activeToolsFor, applyMenuItemObservation, applyCandidateObservation } from './orchestration/handlers/food-handler.ts'
import { handleDraft } from './orchestration/handlers/draft-handler.ts'
import type { TurnScope } from './orchestration/turn-context.ts'

export { catalogResolver }

function mergeConstraints(previous: string[], values: string[], allergy = false) {
  const combined = [...new Set([...previous, ...values])]
  return allergy && combined.length > 12 ? [...combined.slice(0, 11), 'unverified-additional-allergens'] : combined.slice(0, 12)
}

export async function orchestrateGroundedTurn(request: ConciergeV2TurnRequest, record: ConciergeV2SessionRecord, pool: pg.Pool,
  injected?: ConciergeLlmOrchestrator, onActivity?: (activity: ConciergeV2Activity) => void,
  onSafeText?: (text: string) => void, signal?: AbortSignal) {
  let next = summarizeSession(ConciergeV2SessionMutableStateSchema.parse(recordMutable(record)))
  const result: ConciergeV2StoredTurnResult = { response_id: crypto.randomUUID(), message: '', cards: [], warnings: [], phase: 'DISCOVERY' }
  const budget = new TurnBudget()
  let contextTrimmed = false
  let delegate: ConciergeLlmOrchestrator | undefined
  const getDelegate = async () => delegate ??= await createTurnOrchestrator(pool, injected)
  const askModel = async (prompt: string, tools: typeof V2_READ_TOOLS = [], exchanges: ToolExchange[] = []) => {
    const context = buildConciergeContext({ state: scope.next, message: prompt, tools, exchanges, pageContext: request.page_context })
    contextTrimmed ||= context.trimmed
    budget.consume(context.inputTokens)
    onActivity?.('thinking')
    const response = await withToolTimeout((await getDelegate()).orchestrateTurn(prompt, [], {
      bounded: context, signal, requestId: request.request_id,
    }), 11000)
    budget.recordUsage(response.tokens_used)
    return response
  }
  const modelConversation = async (prompt: string) => {
    const response = await askModel(prompt)
    const reply = safeConversationReply(response.reply_text)
    if (!reply) throw new AppError('UNSAFE_CONCIERGE_RESPONSE', 'Không thể tạo phản hồi an toàn từ câu trả lời của trợ lý.', 502)
    result.message = reply
    onSafeText?.(reply)
  }
  const modelGroundedReply = async (prompt: string, exchanges: ToolExchange[], evidenceStatus: 'known' | 'unknown' | 'unavailable' = 'known') => {
    const evidence = JSON.stringify(exchanges.map(exchange => exchange.result))
    const compositionExchanges = compactToolExchanges(exchanges)
    let response = await askModel(prompt, [], compositionExchanges)
    let reply = safeGroundedReply(response.reply_text, evidence, evidenceStatus)
    if (!reply) {
      response = await askModel(`${prompt}\nThe previous draft failed grounding checks. Correct it using only the verified evidence; abstain if needed.`, [], compositionExchanges)
      reply = safeGroundedReply(response.reply_text, evidence, evidenceStatus)
    }
    if (!reply) throw new AppError('UNSAFE_CONCIERGE_RESPONSE', 'Trợ lý không tạo được câu trả lời có căn cứ.', 502)
    result.message = reply
    onSafeText?.(reply)
  }
  const finish = () => {
    if (scope.next.draft) result.draft = scope.next.draft
    result.suggested_actions = suggestConciergeActions(result, scope.next)
    if (request.message) scope.next.transcript.push({ role: 'user', content: request.message })
    if (result.message) scope.next.transcript.push({ role: 'assistant', content: result.message })
    scope.next = summarizeSession(scope.next)
    next = scope.next
    return { next, result, metrics: { model_calls: budget.calls, input_tokens: budget.inputTokens, tool_count: budget.tools,
      reported_input_tokens: budget.reportedInputTokens, output_tokens: budget.outputTokens, summary_used: Boolean(next.summary), context_trimmed: contextTrimmed,
      safety_blocks: (next.draft?.blocked_items.filter(item => item.reason === 'ALLERGY_UNVERIFIED').length ?? 0) + (result.warnings.includes('ALLERGY_UNVERIFIED') ? 1 : 0) } }
  }

  const message = request.message ?? ''
  const understanding = message ? understandTurn(message, Boolean(next.pending_items?.length)) : null
  const text = understanding ? understanding.normalized.searchForm : normalizeIntent(message)
  const turnIntent = understanding?.intent ?? null
  if (understanding) next.constraints = mergeConstraintDelta(next.constraints, understanding.constraintsDelta)
  const replacement = next.pending_items?.length ? /^(?:doi|thay)\s+mon\s+(.+?)(?:\s+(?:di|nhe|nha))?$/.exec(text) : null
  if (replacement) next.constraints.dislikes = mergeConstraints(next.constraints.dislikes, [replacement[1]])
  if (request.page_context?.order_mode) next.constraints.order_mode = request.page_context.order_mode

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

  const fallbackCalls = buildFallbackCalls(scope, main.viewedItem, main.namedExactItem, main.faq, accountRead)
  const activeTools = activeToolsFor(scope, main.faq, accountRead, main.factualQuestion)
  const plan = await askModel(message, activeTools)
  const calls = selectToolCalls(activeTools, plan.tool_calls, fallbackCalls)
  const exchanges = await runModelTools(scope, gateway, calls)
  for (const exchange of exchanges) {
    if (exchange.name === 'get_recent_orders' || exchange.name === 'get_saved_addresses') {
      applyAccountObservation(scope, exchange)
    } else if (exchange.name === 'lookup_restaurant_info') {
      applyLookupObservation(scope)
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
    return Object.fromEntries(['name', 'category_name', 'is_available', 'spice_level', 'safety_state']
      .filter(key => item[key] !== undefined).map(key => [key, item[key]]))
  }
  return exchanges.map(exchange => {
    const value = exchange.result && typeof exchange.result === 'object' ? exchange.result as Record<string, unknown> : {}
    let result: unknown = value
    if (exchange.name === 'search_menu_items' || exchange.name === 'recommend_meal') {
      const candidates = Array.isArray(value.candidates) ? value.candidates.map(compactMenuItem) : []
      const plans = Array.isArray(value.plans) ? value.plans.map(rawPlan => {
        const plan = rawPlan && typeof rawPlan === 'object' ? rawPlan as Record<string, unknown> : {}
        const lines = Array.isArray(plan.lines) ? plan.lines.map(rawLine => {
          const line = rawLine && typeof rawLine === 'object' ? rawLine as Record<string, unknown> : {}
          return { item: compactMenuItem(line.item), quantity: line.quantity }
        }) : []
        return { lines, validation_status: plan.validation_status, warnings: plan.warnings }
      }) : undefined
      result = { candidates, plans, allergy_warning: value.allergy_warning,
        staff_confirmation_required: value.staff_confirmation_required, relaxed_filters: value.relaxed_filters }
    } else if (exchange.name === 'get_menu_item') {
      result = { item: value.item ? compactMenuItem(value.item) : null, description: value.description }
    }
    return { ...exchange, result }
  })
}

export function recordMutable(record: ConciergeV2SessionRecord) {
  const { session_id: _id, capability_hash: _cap, state_version: _version, actor: _actor,
    created_at: _created, idle_expires_at: _idle, absolute_expires_at: _absolute, idempotency: _replay, ...mutable } = record
  return mutable
}
