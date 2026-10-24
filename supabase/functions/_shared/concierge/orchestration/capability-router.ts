/**
 * Tiger Agent V3 — Phase 4: Capability Router.
 *
 * Selects which application path owns the turn. Pure function — it never
 * executes tools, touches the DB, or calls the model. Intent describes
 * what the customer appears to want; the route decides what the agent
 * is authorized to do (intent != capability).
 */

import type {
  ConciergeV2SessionRecord,
  ConciergeV2TurnRequest,
} from '../../contracts/concierge-v2.ts'
import type { TurnUnderstanding } from '../understanding/types.ts'
import { isRestaurantFactQuestion, restaurantFactField } from '../restaurant-info.ts'

export type CapabilityRoute =
  | 'refresh'
  | 'account_refusal'
  | 'restaurant_fact'
  | 'reservation'
  | 'conversation'
  | 'main'

export interface RouteInput {
  request: ConciergeV2TurnRequest
  record: ConciergeV2SessionRecord
  understanding: TurnUnderstanding | null
  message: string
}

/** Cheap pure derivations shared by router and orchestrator. */
export function isAccountRead(intent: TurnUnderstanding['intent'] | null): boolean {
  return intent === 'order_history' || intent === 'saved_address'
}

export function resolveRoute(input: RouteInput): CapabilityRoute {
  const { request, record, understanding, message } = input
  if (request.action?.type === 'refresh_session') return 'refresh'

  const turnIntent = understanding?.intent ?? null
  const searchForm = understanding?.normalized.searchForm ?? message
  if (isAccountRead(turnIntent) && !record.actor.authenticated_user_id) return 'account_refusal'
  if (isAccountRead(turnIntent)) return 'main'

  // Account intent still controls account scoping; read needs grant no identity or capability.
  if (understanding?.readNeeds.some(need => need.kind === 'menu') && !isAccountRead(turnIntent)) return 'main'

  const factField = restaurantFactField(message)
  const reservationPolicyQuestion = turnIntent === 'reservation' &&
    /\b(?:co nhan dat ban|nhan dat ban|dat ban duoc khong|chinh sach dat ban|quy dinh dat ban|huy dat ban)\b/
      .test(searchForm)
  if (factField && (factField !== 'reservation_information' || reservationPolicyQuestion)) {
    return 'restaurant_fact'
  }
  if (turnIntent === 'reservation') return 'reservation'

  const factualQuestion = isRestaurantFactQuestion(message)
  if (request.action?.type === 'open_conversation' ||
      (!factualQuestion && turnIntent && ['greeting', 'identity', 'thanks', 'farewell', 'other', 'constraints'].includes(turnIntent))) {
    return 'conversation'
  }
  return 'main'
}
