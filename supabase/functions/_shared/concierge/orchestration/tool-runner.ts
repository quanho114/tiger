/**
 * Tiger Agent V3 — Phase 4: Tool runner.
 *
 * Registers per-turn gateway executors (DB/retrieval implementations live
 * here, never in handlers) and runs model-selected read tools through the
 * Tool Gateway: registry → schema → capability → ownership → timeout →
 * output schema → projection → event. Handlers only interpret the safe
 * observations (cards/pending/phase).
 */

import crypto from 'node:crypto'
import { V2_TOOL_REGISTRY, validateV2Tool } from '../tool-registry.ts'
import type { ModelTool } from '../context.ts'
import { TOOL_POLICIES } from '../policy/confirmation-policy.ts'
import { ToolGateway, type ToolObservation } from '../tools/gateway.ts'
import { retrieveMenuCandidates } from '../menu-retrieval.ts'
import { evaluateFoodSafety, sanitizeCatalogText } from '../food-safety.ts'
import { buildMealPlans } from '../meal-planner.ts'
import { getRestaurantInfo, restaurantFactField } from '../restaurant-info.ts'
import { loadKnowledgeSnapshot } from '../knowledge-repository.ts'
import { searchRestaurantKnowledge } from '../rag.ts'
import { checkReservationAvailability } from '../reservation-availability.ts'
import { normalizeIntent } from '../draft-intent.ts'
import { namedMenuQuery } from '../understanding/intent-classifier.ts'
import type { TurnScope } from './turn-context.ts'
import type { ToolExchange } from '../context.ts'

async function lookupRestaurantEvidence(pool: TurnScope['pool'], query: string) {
  const field = restaurantFactField(query)
  if (field) {
    const info = await getRestaurantInfo(pool, field, query)
    return V2_TOOL_REGISTRY.lookup_restaurant_info.output.parse({
      status: info.status,
      source: 'operational_settings',
      answer: info.answer,
    })
  }
  const knowledge = await loadKnowledgeSnapshot(pool)
  const found = searchRestaurantKnowledge(query, 0.25, new Date(), knowledge.documents.filter(doc =>
    !(['doc-001', 'doc-002', 'doc-003'].includes(doc.id) && doc.source.startsWith('tiger-'))))
  const document = found.results[0]?.document
  return V2_TOOL_REGISTRY.lookup_restaurant_info.output.parse({
    status: document ? 'known' : 'unknown',
    source: document ? 'approved_knowledge' : null,
    answer: document?.content.trim().slice(0, 2000) ?? 'No verified restaurant information matched this question.',
  })
}

function requireKnowledge(scope: TurnScope) {
  if (!scope.knowledge) throw new Error('MISSING_KNOWLEDGE')
  return scope.knowledge
}

/** Per-turn gateway: executors close over scope and read it at execute time. */
export function registerTurnExecutors(gateway: ToolGateway, scope: TurnScope): void {
  const read = (name: keyof typeof V2_TOOL_REGISTRY & string) => ({
    kind: 'read' as const,
    inputSchema: V2_TOOL_REGISTRY[name].input,
    outputSchema: V2_TOOL_REGISTRY[name].output,
    requiredCapabilities: TOOL_POLICIES[name]?.requiredCapabilities ?? [],
    ownershipScope: (name === 'get_recent_orders' || name === 'get_saved_addresses' ? 'self' : 'none') as 'self' | 'none',
    timeoutMs: 4000,
    budgetCost: 1,
    modelVisible: true,
  })

  gateway.register({
    ...read('get_menu_item'),
    name: 'get_menu_item',
    execute: async (args) => {
      const knowledge = requireKnowledge(scope)
      const item = scope.catalog.find((entry) => entry.id === (args as { item_id: string }).item_id)
      const safety = item ? evaluateFoodSafety(item, scope.next.constraints.allergies, knowledge.allergenProfiles[item.id]) : null
      return V2_TOOL_REGISTRY.get_menu_item.output.parse({ item: item && safety ? {
        id: item.id, name: sanitizeCatalogText(item.name), price_vnd: item.price_vnd,
        pricing_mode: item.pricing_mode ?? 'fixed', price_min: item.price_min ?? null, price_max: item.price_max ?? null,
        category_id: item.category_id, category_name: item.category_name ? sanitizeCatalogText(item.category_name) : undefined,
        image_url: item.image_url ?? null, serving_size: item.serving_size ?? null,
        meal_role: knowledge.servingProfiles[item.id]?.meal_role, spice_level: item.spice_level ?? null,
        is_signature: Boolean(item.is_signature), is_available: item.is_available &&
          (scope.next.constraints.order_mode === 'delivery' ? item.allow_delivery !== false :
            scope.next.constraints.order_mode === 'dine_in' ? item.allow_dine_in !== false : true),
        safety_state: safety.safety_state, safety_notes: safety.notes,
        provenance: 'catalog:live_menu', tags: (item.tags ?? []).map(sanitizeCatalogText).slice(0, 10),
      } : null, description: item?.description ? sanitizeCatalogText(item.description) : null })
    },
  })

  gateway.register({
    ...read('get_recent_orders'),
    name: 'get_recent_orders',
    execute: async () => {
      // Identity comes from the trusted principal, never from model input.
      const userId = scope.capability.principal.userId
      if (!userId) throw new Error('UNAUTHORIZED_TOOL')
      const recent = await scope.pool.query(`SELECT id, code, status, order_type, created_at
        FROM public.orders WHERE customer_user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 3`, [userId])
      const orders = recent.rows.map((row) => ({ id: row.id, code: row.code, status: row.status,
        order_type: row.order_type, created_at: new Date(row.created_at).toISOString() }))
      return V2_TOOL_REGISTRY.get_recent_orders.output.parse({ orders })
    },
  })

  gateway.register({
    ...read('get_saved_addresses'),
    name: 'get_saved_addresses',
    execute: async () => {
      const userId = scope.capability.principal.userId
      if (!userId) throw new Error('UNAUTHORIZED_TOOL')
      const saved = await scope.pool.query(`SELECT id, label, address_line, ward, district, province, is_default
        FROM public.customer_addresses WHERE user_id = $1
        ORDER BY is_default DESC, updated_at DESC, id DESC LIMIT 3`, [userId])
      return V2_TOOL_REGISTRY.get_saved_addresses.output.parse({ addresses: saved.rows })
    },
  })

  gateway.register({
    ...read('lookup_restaurant_info'),
    name: 'lookup_restaurant_info',
    execute: async (args) => {
      const query = (args as { query: string }).query
      return lookupRestaurantEvidence(scope.pool, query || scope.request.message?.slice(0, 200) || '')
    },
  })

  const runCandidateRetrieval = async (args: unknown, isRecommend: boolean) => {
    const knowledge = requireKnowledge(scope)
    const message = scope.request.message ?? ''
    const text = scope.understanding ? scope.understanding.normalized.searchForm : normalizeIntent(message)
    const search = !isRecommend ? (args as { query?: string; limit?: number; category_id?: string }) : undefined
    const refersToViewedItem = Boolean(scope.request.page_context?.menu_item_id &&
      /\b(?:mon nay|cai nay|mon dang xem)\b/.test(text) &&
      /\b(?:gom|nguyen lieu|thanh phan|cay|gia|bao nhieu|giao duoc|co gi|lam tu|mo ta)\b/.test(text))
    const viewedItem = refersToViewedItem
      ? scope.catalog.find((item) => item.id === scope.request.page_context?.menu_item_id) : undefined
    const query = viewedItem?.name || search?.query || message
    const matches = scope.catalog.filter((i) => text.includes(normalizeIntent(i.name)))
    const namedItem = namedMenuQuery(message)
    const replacement = scope.next.pending_items?.length
      ? /^(?:doi|thay)\s+mon\s+(.+?)(?:\s+(?:di|nhe|nha))?$/.exec(text) : null
    const selection = viewedItem ? [viewedItem] : replacement ? scope.catalog : namedItem
      ? scope.catalog.filter((item) => normalizeIntent(`${item.name} ${item.category_name ?? ''} ${(item.tags ?? []).join(' ')}`).includes(namedItem))
      : matches.length ? matches : scope.catalog
    const candidates = await retrieveMenuCandidates(selection, { query: query.slice(0, 200),
      limit: isRecommend ? 8 : Math.min(search?.limit ?? 4, 4),
      category_id: search?.category_id,
      diversify_categories: isRecommend,
      allergies: scope.next.constraints.allergies, dislikes: scope.next.constraints.dislikes,
      order_mode: scope.next.constraints.order_mode,
      max_budget_vnd: scope.next.constraints.is_hard_budget ? scope.next.constraints.budget_vnd ?? undefined : undefined,
      max_spice_level: scope.next.constraints.max_spice_level }, knowledge)
    const plans = isRecommend
      ? buildMealPlans(candidates.candidates, scope.next.constraints, knowledge, scope.next.draft?.subtotal_vnd ?? 0) : []
    return { candidates, plans, isRecommend }
  }

  gateway.register({
    ...read('search_menu_items'),
    name: 'search_menu_items',
    execute: async (args) => {
      const { candidates } = await runCandidateRetrieval(args, false)
      return V2_TOOL_REGISTRY.search_menu_items.output.parse(candidates)
    },
  })

  gateway.register({
    ...read('recommend_meal'),
    name: 'recommend_meal',
    execute: async (args) => {
      const { candidates, plans } = await runCandidateRetrieval(args, true)
      return V2_TOOL_REGISTRY.recommend_meal.output.parse({ ...candidates, plans })
    },
  })

  gateway.register({
    ...read('check_reservation_availability'),
    name: 'check_reservation_availability',
    execute: async () => {
      const query = scope.reservationQuery
      if (!query) throw new Error('MISSING_RESERVATION_QUERY')
      const startsAt = new Date(query.startsAt)
      try {
        const availability = await checkReservationAvailability(scope.pool, startsAt, query.guests)
        return V2_TOOL_REGISTRY.check_reservation_availability.output.parse(availability)
      } catch {
        return V2_TOOL_REGISTRY.check_reservation_availability.output.parse({
          status: 'unverified', starts_at: startsAt.toISOString(), guest_count: query.guests,
          reason: 'Reservation availability could not be verified.',
        })
      }
    },
  })
}

export interface ModelToolCall {
  id?: string
  name: string
  arguments: unknown
}

/** Legacy pre-filter (allowed set + registry read-kind) then gateway enforcement. */
export function selectToolCalls(
  activeTools: ModelTool[],
  planCalls: ModelToolCall[],
  fallbackCalls: ModelToolCall[],
): ModelToolCall[] {
  const allowedToolNames = new Set(activeTools.map((tool) => tool.name))
  const modelCalls = planCalls.filter((call) => {
    if (!allowedToolNames.has(call.name) || !Object.hasOwn(V2_TOOL_REGISTRY, call.name)) return false
    try { return validateV2Tool(call.name, call.arguments).tool.kind === 'read' }
    catch { return false }
  })
  return modelCalls.length ? modelCalls : fallbackCalls
}

export async function runModelTools(
  scope: TurnScope,
  gateway: ToolGateway,
  calls: ModelToolCall[],
): Promise<ToolExchange[]> {
  const exchanges: ToolExchange[] = []
  for (const call of calls) {
    const checked = validateV2Tool(call.name, call.arguments)
    if (checked.tool.kind !== 'read') throw new Error('UNAUTHORIZED_TOOL_MUTATION')
    scope.budget.consumeTool()
    const exchangeId = 'id' in call && typeof call.id === 'string' ? call.id : `server_${crypto.randomUUID()}`
    const observation: ToolObservation = await gateway.execute(call.name, checked.args, {
      principal: scope.capability.principal,
      ownerUserId: scope.capability.principal.userId,
      signal: scope.helpers.signal,
    })
    exchanges.push({ id: exchangeId, name: call.name, arguments: checked.args, result: observation.data })
  }
  return exchanges
}

export function createTurnGateway(scope: TurnScope): ToolGateway {
  const gateway = new ToolGateway((event) => scope.toolEvents.push(event))
  registerTurnExecutors(gateway, scope)
  return gateway
}

export function computeEvidenceStatus(exchanges: ToolExchange[]): 'known' | 'unknown' | 'unavailable' {  return exchanges.some((exchange) => {
    const value = exchange.result as { status?: string; candidates?: unknown[]; item?: unknown; orders?: unknown[]; addresses?: unknown[] } | null
    return value?.status === 'unknown' || value?.status === 'unavailable' ||
      (Array.isArray(value?.candidates) && value.candidates.length === 0) ||
      ('item' in (value ?? {}) && value?.item === null) ||
      (Array.isArray(value?.orders) && value.orders.length === 0) ||
      (Array.isArray(value?.addresses) && value.addresses.length === 0)
  }) ? 'unknown' : 'known'
}
