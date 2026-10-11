/**
 * Tiger Agent V3 — Phase 4: Reservation handler.
 *
 * Owns Concierge reservation behavior ONLY: date/time resolution,
 * party-size clarification, availability lookup card. Committing a
 * reservation stays outside the agent (booking UI boundary unchanged).
 */

import crypto from 'node:crypto'
import { V2_READ_TOOLS, validateV2Tool } from '../../tool-registry.ts'
import type { ToolGateway } from '../../tools/gateway.ts'
import { resolveReservationDateTime } from '../../date-resolver.ts'
import type { TurnScope } from '../turn-context.ts'

export async function handleReservationCheck(scope: TurnScope, gateway: ToolGateway): Promise<void> {
  const message = scope.request.message ?? ''
  const resolved = resolveReservationDateTime(message, new Date(), true)
  if (!resolved.success || !resolved.startsAt) {
    const missing = resolved.missingField === 'date' ? 'Ask which date they have in mind.' :
      resolved.missingField === 'time' ? 'Ask what time they would like.' :
      resolved.ambiguous ? `Ask one concise clarification for this ambiguity: ${resolved.reason ?? 'morning or evening'}.` :
      'Ask them to clarify the reservation date and time.'
    await scope.helpers.modelConversation(`The reservation request is incomplete. ${missing} Do not claim availability or confirmation.`)
    return
  }
  if (!scope.next.constraints.party_size_confirmed) {
    await scope.helpers.modelConversation('The reservation request is missing party size. Ask how many guests are coming. Do not claim availability or confirmation.')
    return
  }
  scope.helpers.onActivity?.('checking_info')
  const reservationTools = V2_READ_TOOLS.filter((tool) => tool.name === 'check_reservation_availability')
  const plan = await scope.helpers.askModel(message, reservationTools)
  const requestedCheck = plan.tool_calls.find((call) => call.name === 'check_reservation_availability')
  let exchangeId = `server_${crypto.randomUUID()}`
  if (requestedCheck) {
    try { validateV2Tool(requestedCheck.name, requestedCheck.arguments); exchangeId = requestedCheck.id }
    catch { /* Ignore malformed tool arguments; the server resolves all reservation inputs. */ }
  }
  scope.budget.consumeTool()
  scope.reservationQuery = {
    startsAt: resolved.startsAt.toISOString(),
    guests: scope.next.constraints.adults + scope.next.constraints.children,
  }
  const observation = await gateway.execute('check_reservation_availability', {}, {
    principal: scope.capability.principal,
    ownerUserId: scope.capability.principal.userId,
    signal: scope.helpers.signal,
  })
  const toolResult = observation.data as { status: 'available' | 'unavailable' | 'unverified'; starts_at: string; guest_count: number; reason: string }
  if (toolResult.status === 'unverified') {
    scope.result.cards.push({ type: 'service_link', destination: 'reservations' })
  } else {
    scope.result.cards.push({ type: 'reservation_option', starts_at: toolResult.starts_at,
      guest_count: toolResult.guest_count, status: toolResult.status })
  }
  await scope.helpers.modelGroundedReply(message, [{ id: exchangeId, name: 'check_reservation_availability',
    arguments: {}, result: toolResult }], toolResult.status === 'unverified' ? 'unknown' : 'known')
}
