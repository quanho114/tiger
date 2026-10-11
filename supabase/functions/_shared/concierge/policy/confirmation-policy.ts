/**
 * Tiger Agent V2 — Phase 0: Confirmation policy.
 *
 * Low-risk: no confirmation. Draft: the customer's own instruction
 * authorizes the draft mutation. High-risk: explicit confirmation
 * tied to a short-lived confirmation context.
 */

import type { Capability } from './capabilities.ts'

export type ConfirmationLevel = 'none' | 'implicit-draft' | 'explicit'

export interface ToolPolicy {
  requiredCapabilities: readonly Capability[]
  riskLevel: 'low' | 'medium' | 'high'
  requiresConfirmation: boolean
  confirmationLevel: ConfirmationLevel
}

/**
 * Central tool policy table. Every V2 tool must have an entry here
 * before the Tool Gateway will execute it.
 */
export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  search_menu_items: {
    requiredCapabilities: ['menu.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  get_menu_item: {
    requiredCapabilities: ['menu.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  recommend_meal: {
    requiredCapabilities: ['menu.read', 'recommendation.use'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  lookup_restaurant_info: {
    requiredCapabilities: ['restaurant.public.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  get_draft_cart: {
    requiredCapabilities: ['cart.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  calculate_draft_total: {
    requiredCapabilities: ['cart.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  get_recent_orders: {
    requiredCapabilities: ['order.self.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  get_saved_addresses: {
    requiredCapabilities: ['customer.self.read'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  check_reservation_availability: {
    requiredCapabilities: ['reservation.prepare'],
    riskLevel: 'low',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  add_draft_item: {
    requiredCapabilities: ['cart.write'],
    riskLevel: 'medium',
    requiresConfirmation: false,
    confirmationLevel: 'implicit-draft',
  },
  remove_draft_item: {
    requiredCapabilities: ['cart.write'],
    riskLevel: 'medium',
    requiresConfirmation: false,
    confirmationLevel: 'implicit-draft',
  },
  update_draft_quantity: {
    requiredCapabilities: ['cart.write'],
    riskLevel: 'medium',
    requiresConfirmation: false,
    confirmationLevel: 'implicit-draft',
  },
  create_order_quote: {
    requiredCapabilities: ['order.quote'],
    riskLevel: 'medium',
    requiresConfirmation: false,
    confirmationLevel: 'none',
  },
  submit_order: {
    requiredCapabilities: ['order.submit'],
    riskLevel: 'high',
    requiresConfirmation: true,
    confirmationLevel: 'explicit',
  },
  submit_reservation: {
    requiredCapabilities: ['reservation.submit'],
    riskLevel: 'high',
    requiresConfirmation: true,
    confirmationLevel: 'explicit',
  },
}

export function getToolPolicy(toolName: string): ToolPolicy | undefined {
  return TOOL_POLICIES[toolName]
}

/**
 * Tools that must NEVER exist in the customer capability registry.
 * The gateway rejects them even if an LLM hallucinates the name.
 */
export const FORBIDDEN_CUSTOMER_TOOLS = [
  'execute_sql',
  'query_database',
  'run_postgres',
  'get_any_table',
  'get_users',
  'get_sales',
  'get_revenue',
  'get_cost',
  'get_admin_settings',
  'get_environment',
  'get_api_keys',
  'get_logs',
  // Phase 5.5: menu profile governance is admin-only, never customer tools.
  'generate_menu_profile',
  'update_menu_profile',
  'verify_allergen',
  'menu_profile_generate',
  'menu_profile_verify',
] as const

export function isForbiddenCustomerTool(name: string): boolean {
  return (FORBIDDEN_CUSTOMER_TOOLS as readonly string[]).includes(name)
}
