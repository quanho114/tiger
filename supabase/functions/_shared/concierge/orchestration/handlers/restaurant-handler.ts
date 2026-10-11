/**
 * Tiger Agent V3 — Phase 4: Restaurant handler.
 *
 * Owns restaurant-fact fast path and faq lookup. Source priority is
 * decided by the gateway executor (structured operational settings
 * first, approved knowledge second) — the model never chooses sources.
 */

import crypto from 'node:crypto'
import type { ToolExchange } from '../../context.ts'
import { V2_READ_TOOLS, V2_TOOL_REGISTRY, validateV2Tool } from '../../tool-registry.ts'
import type { ToolGateway } from '../../tools/gateway.ts'
import type { TurnScope } from '../turn-context.ts'
import { isDeliveryFeeQuestion } from '../../restaurant-hours.ts'
import { restaurantFactField } from '../../restaurant-info.ts'

export async function handleRestaurantFact(scope: TurnScope, gateway: ToolGateway): Promise<void> {
  const message = scope.request.message ?? ''
  const lookupTool = V2_READ_TOOLS.filter((tool) => tool.name === 'lookup_restaurant_info')
  const plan = await scope.helpers.askModel(message, lookupTool)
  const requestedLookup = plan.tool_calls.find((call) => call.name === 'lookup_restaurant_info')
  let args = { query: message.slice(0, 200) }
  if (requestedLookup) {
    try { args = validateV2Tool(requestedLookup.name, requestedLookup.arguments).args as typeof args }
    catch { /* Use the bounded user question when the planner returns malformed arguments. */ }
  }
  const observation = await gateway.execute('lookup_restaurant_info', args, {
    principal: scope.capability.principal,
    ownerUserId: scope.capability.principal.userId,
    signal: scope.helpers.signal,
  })
  const toolResult = observation.data as ReturnType<typeof V2_TOOL_REGISTRY.lookup_restaurant_info.output.parse>
  const factField = restaurantFactField(message)
  if (factField === 'delivery_information' && isDeliveryFeeQuestion(message))
    scope.result.cards.push({ type: 'service_link', destination: 'cart' })
  const exchange: ToolExchange = { id: requestedLookup?.id ?? `server_${crypto.randomUUID()}`,
    name: 'lookup_restaurant_info', arguments: args, result: toolResult }
  await scope.helpers.modelGroundedReply(message, [exchange], toolResult.status)
}

/** Faq fallback observation: clear stale suggestions, stay in discovery. */
export function applyLookupObservation(scope: TurnScope): void {
  scope.next.pending_items = []; scope.next.pending_suggestion_ids = []
  scope.result.phase = 'DISCOVERY'
}
