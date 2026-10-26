/**
 * Tiger Agent V3 — Phase 4: Reservation handler.
 *
 * Owns Concierge reservation behavior ONLY: date/time resolution,
 * party-size clarification, availability lookup card. Committing a
 * reservation stays outside the agent (booking UI boundary unchanged).
 */

import { V2_READ_TOOLS } from '../../tool-registry.ts'
import type { ToolGateway } from '../../tools/gateway.ts'
import { clarify, collectReservationFields, conversationContext } from '../../conversation-context.ts'
import type { TurnScope } from '../turn-context.ts'
import { selectToolCalls, runModelTools, computeEvidenceStatus } from '../tool-runner.ts'

export async function handleReservationCheck(scope: TurnScope, gateway: ToolGateway): Promise<void> {
  const message = scope.request.message ?? ''
  const resolved = collectReservationFields(scope)
  if (!resolved.success || !resolved.startsAt) {
    await clarify(scope, { goal: 'reservation', reason: resolved.missingField ? 'missing_field' : 'invalid_value',
      missing_field: resolved.missingField ?? 'time' })
    return
  }
  if (!scope.next.constraints.party_size_confirmed) {
    await clarify(scope, { goal: 'reservation', reason: 'missing_field', missing_field: 'guests' })
    return
  }
  delete conversationContext(scope).pending_question
  scope.helpers.onActivity?.('checking_info')
  const reservationTools = V2_READ_TOOLS.filter((tool) => tool.name === 'check_reservation_availability')
  const plan = await scope.helpers.askModel(message, reservationTools)
  scope.reservationQuery = {
    startsAt: resolved.startsAt.toISOString(),
    guests: scope.next.constraints.adults + scope.next.constraints.children,
  }
  const calls = selectToolCalls(reservationTools, plan.tool_calls, [{ name: 'check_reservation_availability', arguments: {} }])
  const exchanges = await runModelTools(scope, gateway, calls, reservationTools)
  const evidenceStatus = computeEvidenceStatus(exchanges)
  if (evidenceStatus === 'unavailable') {
    scope.result.warnings.push('EVIDENCE_UNAVAILABLE')
    scope.result.cards.push({ type: 'service_link', destination: 'reservations' })
    await scope.helpers.modelGroundedReply(message, exchanges, evidenceStatus)
    return
  }
  const toolResult = exchanges[0].result as { status: 'available' | 'unavailable' | 'unverified'; starts_at: string; guest_count: number; reason: string }
  if (toolResult.status === 'unverified') {
    scope.result.cards.push({ type: 'service_link', destination: 'reservations' })
  } else {
    scope.result.cards.push({ type: 'reservation_option', starts_at: toolResult.starts_at,
      guest_count: toolResult.guest_count, status: toolResult.status })
  }
  await scope.helpers.modelGroundedReply(message, exchanges, evidenceStatus)
}
