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

function replacementFor(scope: TurnScope, text: string) {
  return scope.next.pending_items?.length
    ? /^(?:doi|thay)\s+mon\s+(.+?)(?:\s+(?:di|nhe|nha))?$/.exec(text) : null
}

/** Legacy fallback selection, verbatim policy. */
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
  return viewedItem || namedExactItem
    ? [{ name: 'get_menu_item', arguments: { item_id: (viewedItem ?? namedExactItem)!.id } }]
    : [{ name: accountRead ? (turnIntent === 'order_history' ? 'get_recent_orders' : 'get_saved_addresses') : faq ? 'lookup_restaurant_info' :
      (replacementFor(scope, text) && scope.next.pending_items?.some((item) => item.plan_id)) ||
      /\b(?:goi y|tu van|bua|mam|combo|set)\b/.test(text) ||
      Boolean(scope.next.constraints.party_size_confirmed && scope.next.constraints.budget_vnd != null) ? 'recommend_meal' : 'search_menu_items',
      arguments: faq ? { query: message.slice(0, 200) } : {} }]
}

export function activeToolsFor(
  scope: TurnScope,
  faq: boolean,
  accountRead: boolean,
  factualQuestion: boolean,
): ModelTool[] {
  const turnIntent = scope.understanding?.intent ?? null
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
  const parsed = exchange.name === 'recommend_meal'
    ? V2_TOOL_REGISTRY.recommend_meal.output.parse(exchange.result)
    : V2_TOOL_REGISTRY.search_menu_items.output.parse(exchange.result)
  const plans = exchange.name === 'recommend_meal'
    ? (parsed as ReturnType<typeof V2_TOOL_REGISTRY.recommend_meal.output.parse>).plans
    : []
  const planCards = plans.map((plan) => {
    const planId = crypto.randomUUID()
    return { type: 'meal_plan' as const, plan_id: planId, lines: plan.lines.map((line) => ({ ...line,
      suggestion_id: crypto.randomUUID() })), subtotal_vnd: plan.subtotal_vnd,
      validation_status: plan.validation_status, warnings: plan.warnings }
  })
  const displayedCandidates = (exchange.name === 'recommend_meal'
    ? (parsed as ReturnType<typeof V2_TOOL_REGISTRY.recommend_meal.output.parse>).candidates
    : (parsed as ReturnType<typeof V2_TOOL_REGISTRY.search_menu_items.output.parse>).candidates).slice(0, 4)
  scope.next.pending_items = plans.length ? planCards.flatMap((card) => card.lines.map((line) => ({
    suggestion_id: line.suggestion_id, menu_item_id: line.item.id, name: line.item.name,
    quantity: line.quantity, plan_id: card.plan_id, state_version: committedStateVersion + 1,
  }))) : displayedCandidates.map((c) => ({ suggestion_id: crypto.randomUUID(), menu_item_id: c.id, name: c.name, quantity: 1, state_version: committedStateVersion + 1 }))
  scope.next.pending_suggestion_ids = scope.next.pending_items.map((p) => p.suggestion_id)
  scope.result.cards.push(...(plans.length ? planCards : displayedCandidates.map((item, index) => ({ type: 'draft_suggestion' as const, item, suggestion_id: scope.next.pending_items![index].suggestion_id }))))
  const allergyWarning = (exchange.result as { allergy_warning?: string }).allergy_warning
  if (allergyWarning) scope.result.warnings.push(allergyWarning)
  scope.result.phase = 'RECOMMENDATION'
}
