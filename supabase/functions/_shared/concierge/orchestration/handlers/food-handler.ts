/**
 * Tiger Agent V3 — Phase 4: Food handler.
 *
 * Owns menu search / item detail / meal recommendation presentation:
 * deterministic fallback selection, active-tool scoping, and observation
 * → cards/pending/phase mapping. Retrieval implementations live in
 * gateway executors (tool-runner); the model never supplies prices.
 */

import crypto from 'node:crypto'
import { V2_READ_TOOLS, V2_TOOL_REGISTRY } from '../../tool-registry.ts'
import type { ModelTool } from '../../context.ts'
import type { MenuItemCatalogExtended } from '../../menu-retrieval.ts'
import type { ToolExchange } from '../../context.ts'
import type { TurnScope } from '../turn-context.ts'
import type { ModelToolCall } from '../tool-runner.ts'
import { validateMealPlanForDisplay } from '../../meal-planner.ts'
import { evaluateFoodSafety, sanitizeCatalogText } from '../../food-safety.ts'

function replacementFor(scope: TurnScope, text: string) {
  return scope.next.pending_items?.length
    ? /^(?:doi|thay)\s+mon\s+(.+?)(?:\s+(?:di|nhe|nha))?$/.exec(text) : null
}

/** Canonical retrieval needs select fallbacks; session constraints do not imply a new goal. */
export function buildFallbackCalls(
  scope: TurnScope,
  viewedItem: MenuItemCatalogExtended | undefined,
  namedExactItem: MenuItemCatalogExtended | undefined,
  faq: boolean,
  accountRead: boolean,
): ModelToolCall[] {
  const message = scope.request.message ?? ''
  const text = scope.understanding ? scope.understanding.normalized.searchForm : message
  const turnIntent = scope.understanding?.intent ?? null
  const needs = scope.understanding?.readNeeds ?? []
  if (!accountRead && needs.length) {
    return needs.map(need => need.kind === 'restaurant'
      ? { name: 'lookup_restaurant_info', arguments: { query: need.query } }
      : (viewedItem || namedExactItem) && need.mode !== 'recommendation' && !need.merchandising.length
        ? { name: 'get_menu_item', arguments: { item_id: (viewedItem ?? namedExactItem)!.id } }
        : { name: need.mode === 'recommendation' ? 'recommend_meal' : 'search_menu_items', arguments: {} })
  }
  return viewedItem || namedExactItem
    ? [{ name: 'get_menu_item', arguments: { item_id: (viewedItem ?? namedExactItem)!.id } }]
    : [{ name: accountRead ? (turnIntent === 'order_history' ? 'get_recent_orders' : 'get_saved_addresses') : faq ? 'lookup_restaurant_info' :
      (replacementFor(scope, text) && scope.next.pending_items?.some((item) => item.plan_id)) ||
      /\b(?:goi y|tu van|bua|mam|combo|set)\b/.test(text) ? 'recommend_meal' : 'search_menu_items',
      arguments: faq ? { query: message.slice(0, 200) } : {} }]
}

export function activeToolsFor(
  scope: TurnScope,
  faq: boolean,
  accountRead: boolean,
  factualQuestion: boolean,
): ModelTool[] {
  const turnIntent = scope.understanding?.intent ?? null
  const needs = scope.understanding?.readNeeds ?? []
  if (!accountRead && needs.length) {
    const menu = needs.some(need => need.kind === 'menu')
    const restaurant = needs.some(need => need.kind === 'restaurant')
    return V2_READ_TOOLS.filter(tool =>
      (menu && ['search_menu_items', 'get_menu_item', 'recommend_meal'].includes(tool.name)) ||
      (restaurant && tool.name === 'lookup_restaurant_info'))
  }
  return accountRead
    ? V2_READ_TOOLS.filter((tool) => tool.name === (turnIntent === 'order_history' ? 'get_recent_orders' : 'get_saved_addresses'))
    : faq || factualQuestion
      ? V2_READ_TOOLS.filter((tool) => tool.name === 'lookup_restaurant_info')
      : V2_READ_TOOLS.filter((tool) => ['search_menu_items', 'get_menu_item', 'recommend_meal'].includes(tool.name))
}

export function applyMenuItemObservation(scope: TurnScope, exchange: ToolExchange): void {
  const message = scope.request.message ?? ''
  const text = scope.understanding ? scope.understanding.normalized.searchForm : message
  const verified = V2_TOOL_REGISTRY.get_menu_item.output.parse(exchange.result)
  const spiceOnly = /\bcay\b/.test(text) && !/\b(?:gom|nguyen lieu|thanh phan|gia|bao nhieu|mo ta)\b/.test(text)
  if (verified.item && !spiceOnly) {
    scope.result.cards.push({ type: 'menu_item_detail', item: verified.item, description: verified.description })
  }
}

export function applyCandidateObservation(scope: TurnScope, exchange: ToolExchange, committedStateVersion: number): void {
  const currentPending = scope.result.cards.some(card => card.type === 'meal_plan' || card.type === 'draft_suggestion') ? scope.next.pending_items ?? [] : []
  let remaining = 60 - currentPending.length
  const parsed = exchange.name === 'recommend_meal'
    ? V2_TOOL_REGISTRY.recommend_meal.output.parse(exchange.result)
    : V2_TOOL_REGISTRY.search_menu_items.output.parse(exchange.result)
  // Resolve every commercial/safety field from server data; only proposed IDs
  // and quantities survive this boundary. Never reoptimize a union of plans.
  const authoritative = scope.catalog.map(item => {
    const safety = evaluateFoodSafety(item, scope.next.constraints.allergies,
      scope.knowledge?.allergenProfiles[item.id], { ingredientOnly: true })
    return { id: item.id, name: sanitizeCatalogText(item.name), price_vnd: item.price_vnd,
      pricing_mode: item.pricing_mode ?? 'fixed', price_min: item.price_min ?? null, price_max: item.price_max ?? null,
      category_id: item.category_id, category_name: item.category_name ? sanitizeCatalogText(item.category_name) : undefined,
      image_url: item.image_url ?? null, serving_size: item.serving_size ?? null,
      meal_role: scope.knowledge?.servingProfiles[item.id]?.meal_role, spice_level: item.spice_level ?? null,
      is_signature: Boolean(item.is_signature), is_bestseller: item.is_bestseller, is_new: item.is_new,
      is_available: item.is_available && (scope.next.constraints.order_mode === 'delivery' ? item.allow_delivery !== false :
        scope.next.constraints.order_mode === 'dine_in' ? item.allow_dine_in !== false : true),
      safety_state: safety.safety_state, safety_notes: safety.notes,
      provenance: 'catalog:live_menu', tags: (item.tags ?? []).map(sanitizeCatalogText).slice(0, 10) }
  })
  const plans = exchange.name === 'recommend_meal'
    ? (parsed as ReturnType<typeof V2_TOOL_REGISTRY.recommend_meal.output.parse>).plans.flatMap(plan => {
      const validated = validateMealPlanForDisplay(plan.lines, authoritative, scope.next.constraints,
        scope.next.draft?.subtotal_vnd ?? 0, scope.next.draft?.items.map(item => item.menu_item_id) ?? [])
      return validated ? [validated] : []
    }) : []
  const planCards = plans.filter(plan => {
    if (plan.lines.length > remaining) return false
    remaining -= plan.lines.length
    return true
  }).map((plan) => {
    const planId = crypto.randomUUID()
    return { type: 'meal_plan' as const, plan_id: planId, lines: plan.lines.map((line) => ({ ...line,
      suggestion_id: crypto.randomUUID() })), subtotal_vnd: plan.subtotal_vnd,
      subtotal_min_vnd: plan.subtotal_min_vnd, subtotal_max_vnd: plan.subtotal_max_vnd,
      total_min_vnd: plan.total_min_vnd, total_max_vnd: plan.total_max_vnd,
      budget_status: plan.budget_status, orderable_exact: plan.orderable_exact,
      validation_status: plan.validation_status, warnings: plan.warnings }
  })
  const displayedCandidates = (exchange.name === 'recommend_meal'
    ? (parsed as ReturnType<typeof V2_TOOL_REGISTRY.recommend_meal.output.parse>).candidates
    : (parsed as ReturnType<typeof V2_TOOL_REGISTRY.search_menu_items.output.parse>).candidates)
    .flatMap(item => { const live = authoritative.find(entry => entry.id === item.id); return live ? [live] : [] })
    .slice(0, Math.min(4, remaining))
  const pending = planCards.length ? planCards.flatMap((card) => card.lines.map((line) => ({
    suggestion_id: line.suggestion_id, menu_item_id: line.item.id, name: line.item.name,
    quantity: line.quantity, plan_id: card.plan_id, state_version: committedStateVersion + 1,
    orderable_exact: (line.item.pricing_mode ?? 'fixed') === 'fixed',
  }))) : displayedCandidates.map((c) => ({ suggestion_id: crypto.randomUUID(), menu_item_id: c.id, name: c.name, quantity: 1, state_version: committedStateVersion + 1,
    orderable_exact: (c.pricing_mode ?? 'fixed') === 'fixed' }))
  scope.next.pending_items = [...currentPending, ...pending]
  scope.next.pending_suggestion_ids = scope.next.pending_items.map((p) => p.suggestion_id)
  scope.result.cards.push(...(planCards.length ? planCards : displayedCandidates.map((item, index) => ({ type: 'draft_suggestion' as const, item, suggestion_id: pending[index].suggestion_id }))))
  const allergyWarning = (exchange.result as { allergy_warning?: string }).allergy_warning
  if (allergyWarning) scope.result.warnings.push(allergyWarning)
  scope.result.phase = 'RECOMMENDATION'
}
