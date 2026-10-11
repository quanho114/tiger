/**
 * Tiger Agent V3 — Phase 1: Capability manifest.
 *
 * Capability defines what the agent is AUTHORIZED to do.
 * Intent describes what the customer APPEARS to want.
 * Never derive authorization from natural language.
 */

import type { Capability } from '../policy/capabilities.ts'
import type { ConfirmationLevel } from '../policy/confirmation-policy.ts'

export type OwnershipScope = 'none' | 'session' | 'self'

export interface CapabilityManifestEntry {
  capability: Capability
  /** True when a verified authenticated customer is required. */
  requiresAuth: boolean
  ownershipScope: OwnershipScope
  /** Tools this capability unlocks (model-visible subset enforced separately). */
  permittedTools: readonly string[]
  /** True for state-changing capabilities (draft/order/reservation/memory). */
  mutation: boolean
  confirmation: ConfirmationLevel
}

export const CAPABILITY_MANIFEST: Record<Capability, CapabilityManifestEntry> = {
  'menu.read': {
    capability: 'menu.read',
    requiresAuth: false,
    ownershipScope: 'none',
    permittedTools: ['search_menu_items', 'get_menu_item'],
    mutation: false,
    confirmation: 'none',
  },
  'restaurant.public.read': {
    capability: 'restaurant.public.read',
    requiresAuth: false,
    ownershipScope: 'none',
    permittedTools: ['lookup_restaurant_info'],
    mutation: false,
    confirmation: 'none',
  },
  'recommendation.use': {
    capability: 'recommendation.use',
    requiresAuth: false,
    ownershipScope: 'none',
    permittedTools: ['recommend_meal'],
    mutation: false,
    confirmation: 'none',
  },
  'cart.read': {
    capability: 'cart.read',
    requiresAuth: false,
    ownershipScope: 'session',
    permittedTools: ['get_draft_cart', 'calculate_draft_total'],
    mutation: false,
    confirmation: 'none',
  },
  'cart.write': {
    capability: 'cart.write',
    requiresAuth: false,
    ownershipScope: 'session',
    permittedTools: ['add_draft_item', 'remove_draft_item', 'update_draft_quantity'],
    mutation: true,
    confirmation: 'implicit-draft',
  },
  'order.quote': {
    capability: 'order.quote',
    requiresAuth: false,
    ownershipScope: 'session',
    permittedTools: ['create_order_quote'],
    mutation: false,
    confirmation: 'none',
  },
  'order.self.read': {
    capability: 'order.self.read',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: ['get_recent_orders'],
    mutation: false,
    confirmation: 'none',
  },
  'order.submit': {
    capability: 'order.submit',
    requiresAuth: false,
    ownershipScope: 'session',
    permittedTools: ['submit_order'],
    mutation: true,
    confirmation: 'explicit',
  },
  'reservation.prepare': {
    capability: 'reservation.prepare',
    requiresAuth: false,
    ownershipScope: 'none',
    permittedTools: ['check_reservation_availability'],
    mutation: false,
    confirmation: 'none',
  },
  'reservation.self.read': {
    capability: 'reservation.self.read',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: [],
    mutation: false,
    confirmation: 'none',
  },
  'reservation.submit': {
    capability: 'reservation.submit',
    requiresAuth: false,
    ownershipScope: 'session',
    permittedTools: ['submit_reservation'],
    mutation: true,
    confirmation: 'explicit',
  },
  'customer.self.read': {
    capability: 'customer.self.read',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: ['get_saved_addresses'],
    mutation: false,
    confirmation: 'none',
  },
  'customer.preference.read': {
    capability: 'customer.preference.read',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: [],
    mutation: false,
    confirmation: 'none',
  },
  'customer.preference.write': {
    capability: 'customer.preference.write',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: [],
    mutation: true,
    confirmation: 'none',
  },
  'memory.self.read': {
    capability: 'memory.self.read',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: [],
    mutation: false,
    confirmation: 'none',
  },
  'memory.self.write': {
    capability: 'memory.self.write',
    requiresAuth: true,
    ownershipScope: 'self',
    permittedTools: [],
    mutation: true,
    confirmation: 'none',
  },
}

/** Customer intents (from Understanding) → authorized capabilities. */
export type AgentIntent =
  | 'food_recommendation'
  | 'menu_search'
  | 'restaurant_info'
  | 'cart_change'
  | 'order_quote'
  | 'order_status'
  | 'reservation'
  | 'reservation_status'
  | 'customer_history'
  | 'general_chat'

export const INTENT_CAPABILITIES: Record<AgentIntent, readonly Capability[]> = {
  food_recommendation: ['menu.read', 'recommendation.use', 'restaurant.public.read'],
  menu_search: ['menu.read'],
  restaurant_info: ['restaurant.public.read'],
  cart_change: ['cart.read', 'cart.write', 'menu.read'],
  order_quote: ['cart.read', 'order.quote'],
  order_status: ['order.self.read'],
  reservation: ['reservation.prepare', 'restaurant.public.read'],
  reservation_status: ['reservation.self.read'],
  customer_history: ['order.self.read', 'customer.self.read', 'memory.self.read'],
  general_chat: [],
}
