/**
 * Tiger Agent V3 — Phase 4: Restaurant handler.
 *
 * Owns restaurant-fact fast path and faq lookup. Source priority is
 * decided by the gateway executor (structured operational settings
 * first, approved knowledge second) — the model never chooses sources.
 */

import { V2_READ_TOOLS } from '../../tool-registry.ts'
import type { ToolGateway } from '../../tools/gateway.ts'
import type { TurnScope } from '../turn-context.ts'
import { isDeliveryFeeQuestion } from '../../restaurant-hours.ts'
import { restaurantFactField } from '../../restaurant-info.ts'
import { selectToolCalls, runModelTools, computeEvidenceStatus } from '../tool-runner.ts'

export async function handleRestaurantFact(scope: TurnScope, gateway: ToolGateway): Promise<void> {
  const message = scope.request.message ?? ''
  const lookupTool = V2_READ_TOOLS.filter((tool) => tool.name === 'lookup_restaurant_info')
  const plan = await scope.helpers.askModel(message, lookupTool)
  const calls = selectToolCalls(lookupTool, plan.tool_calls,
    [{ name: 'lookup_restaurant_info', arguments: { query: message.slice(0, 200) } }])
  const exchanges = await runModelTools(scope, gateway, calls, lookupTool)
  const status = computeEvidenceStatus(exchanges)
  if (status === 'unavailable') scope.result.warnings.push('EVIDENCE_UNAVAILABLE')
  const factField = restaurantFactField(message)
  if (factField === 'delivery_information' && isDeliveryFeeQuestion(message))
    scope.result.cards.push({ type: 'service_link', destination: 'cart' })
  await scope.helpers.modelGroundedReply(message, exchanges, status)
}

/** Faq fallback observation: clear stale suggestions, stay in discovery. */
export function applyLookupObservation(scope: TurnScope): void {
  scope.next.pending_items = []; scope.next.pending_suggestion_ids = []
  scope.result.phase = 'DISCOVERY'
}
