/**
 * Tiger Agent V3 — Phase 4: Account handler.
 *
 * Owns authenticated self-data reads (recent orders, saved addresses).
 * Refusal for guests preserves legacy wording. Observation application
 * (cards) lives here; DB implementations live in gateway executors,
 * which derive identity from the trusted principal — the model can
 * never supply a user ID (input schemas are `{}`).
 */

import type { ToolExchange } from '../../context.ts'
import { V2_TOOL_REGISTRY } from '../../tool-registry.ts'
import type { TurnScope } from '../turn-context.ts'

export async function handleAccountRefusal(
  scope: TurnScope,
  kind: 'order_history' | 'saved_address',
): Promise<void> {
  await scope.helpers.modelConversation(kind === 'order_history'
    ? 'Explain naturally that sign-in is required before you can look up previous orders. Do not imply you have read any account data.'
    : 'Explain naturally that sign-in is required before you can look up saved addresses. Do not imply you have read any account data.')
}

export function applyAccountObservation(scope: TurnScope, exchange: ToolExchange): void {
  if (exchange.name === 'get_recent_orders') {
    const verified = V2_TOOL_REGISTRY.get_recent_orders.output.parse(exchange.result)
    scope.result.cards.push(...verified.orders.map((order) => ({ type: 'order_status' as const, order_id: order.id,
      code: order.code, status: order.status, order_type: order.order_type, created_at: order.created_at })))
  } else if (exchange.name === 'get_saved_addresses') {
    const verified = V2_TOOL_REGISTRY.get_saved_addresses.output.parse(exchange.result)
    scope.result.cards.push(...verified.addresses.map((address) => ({ type: 'saved_address' as const, address_id: address.id,
      label: address.label, address_line: address.address_line, ward: address.ward,
      district: address.district, province: address.province, is_default: address.is_default })))
  }
}
