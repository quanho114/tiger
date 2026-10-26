import { z } from 'zod'
import { ConciergeV2DraftSchema, ConciergeV2DraftOperationSchema, ConciergeV2MenuCandidateSchema, ConciergeV2MenuRetrievalResultSchema } from '../contracts/concierge-v2.ts'
import type { ModelTool } from './context.ts'
import { MealPlansSchema } from './meal-planner.ts'
import { TOOL_POLICIES, isForbiddenCustomerTool } from './policy/confirmation-policy.ts'
import { isToolAllowedForPrincipal } from './policy/authorization.ts'
import type { AgentPrincipal } from './policy/capabilities.ts'

// Menu IDs follow the catalog contract, including PostgreSQL-valid seeded UUIDs
// that do not use an RFC version/variant accepted by z.string().uuid().
const query = z.object({ query: z.string().max(200).optional(), limit: z.number().int().min(1).max(8).optional(), category_id: ConciergeV2MenuCandidateSchema.shape.category_id, is_signature: z.boolean().optional() }).strict()
const menuEvidence = ConciergeV2MenuRetrievalResultSchema.extend({
  status: z.enum(['known', 'empty', 'unknown']).optional(),
  unresolved_needs: z.array(z.enum(['bestseller', 'new'])).optional(),
})
const recommend = z.object({ adults: z.number().int().min(1).max(30).optional(), children: z.number().int().min(0).max(30).optional(),
  appetite: z.enum(['light', 'normal', 'heavy']).optional(), budget_vnd: z.number().int().nonnegative().nullable().optional(),
  is_hard_budget: z.boolean().optional(), allergies: z.array(z.string().max(120)).max(12).optional(),
  preferences: z.array(z.string().max(120)).max(12).optional(), dislikes: z.array(z.string().max(120)).max(12).optional() }).strict()
export const V2_TOOL_REGISTRY = {
  search_menu_items: { kind: 'read', input: query, output: menuEvidence },
  get_menu_item: { kind: 'read', input: z.object({ item_id: ConciergeV2MenuCandidateSchema.shape.id }).strict(),
    output: z.object({ item: ConciergeV2MenuCandidateSchema.nullable(), description: z.string().max(700).nullable(),
      status: z.enum(['known', 'empty', 'unknown']).optional(),
      missing_fields: z.array(z.enum(['description', 'spice_level', 'serving_size'])).optional(),
    }).strict() },
  recommend_meal: { kind: 'read', input: recommend, output: menuEvidence.extend({ plans: MealPlansSchema }) },
  lookup_restaurant_info: { kind: 'read', input: z.object({ query: z.string().max(200) }).strict(), output: z.object({
    status: z.enum(['known', 'unknown', 'unavailable']),
    source: z.enum(['operational_settings', 'approved_knowledge']).nullable(),
    answer: z.string().max(2000),
  }).strict() },
  get_draft_cart: { kind: 'read', input: z.object({}).strict(), output: ConciergeV2DraftSchema.nullable() },
  calculate_draft_total: { kind: 'read', input: z.object({}).strict(), output: z.object({ subtotal_vnd: z.number().int().nonnegative() }).strict() },
  get_recent_orders: { kind: 'read', input: z.object({}).strict(), output: z.object({ orders: z.array(z.object({
    id: z.string().uuid(), code: z.string().max(30), status: z.string().max(30),
    order_type: z.enum(['dine_in', 'delivery', 'takeaway']), created_at: z.string().datetime(),
  }).strict()).max(3) }).strict() },
  get_saved_addresses: { kind: 'read', input: z.object({}).strict(), output: z.object({ addresses: z.array(z.object({
    id: z.string().uuid(), label: z.string().max(50), address_line: z.string().max(255),
    ward: z.string().nullable(), district: z.string().nullable(), province: z.string().nullable(),
    is_default: z.boolean(),
  }).strict()).max(3) }).strict() },
  check_reservation_availability: { kind: 'read', input: z.object({}).strict(), output: z.object({
    status: z.enum(['available', 'unavailable', 'unverified']),
    starts_at: z.string().datetime(),
    guest_count: z.number().int().min(1).max(30),
    reason: z.string().max(500),
  }).strict() },
  add_draft_item: { kind: 'mutation', input: ConciergeV2DraftOperationSchema, output: ConciergeV2DraftSchema },
  remove_draft_item: { kind: 'mutation', input: ConciergeV2DraftOperationSchema, output: ConciergeV2DraftSchema },
  update_draft_quantity: { kind: 'mutation', input: ConciergeV2DraftOperationSchema, output: ConciergeV2DraftSchema },
} as const

export function validateV2Tool(name: string, args: unknown) {
  if (isForbiddenCustomerTool(name)) throw new Error('FORBIDDEN_TOOL')
  if (!Object.hasOwn(V2_TOOL_REGISTRY, name)) throw new Error('UNSUPPORTED_TOOL')
  const tool = V2_TOOL_REGISTRY[name as keyof typeof V2_TOOL_REGISTRY]
  return { tool, args: tool.input.parse(args) }
}

/**
 * Phase 0 — capability gate for the future Tool Gateway.
 * Pure check: schema validation still happens in validateV2Tool.
 */
export function assertToolAllowedForPrincipal(toolName: string, principal: AgentPrincipal): void {
  if (isForbiddenCustomerTool(toolName)) throw new Error('FORBIDDEN_TOOL')
  const policy = TOOL_POLICIES[toolName]
  if (!policy) throw new Error('TOOL_POLICY_MISSING')
  if (!isToolAllowedForPrincipal(principal, policy.requiredCapabilities)) {
    throw new Error(`CAPABILITY_DENIED:${policy.requiredCapabilities.join(',')}`)
  }
}

// Draft commands use deterministic customer intent; routing sees only read tools.
export const V2_READ_TOOLS: ModelTool[] = [
  { name: 'search_menu_items', description: 'Search the current published menu for dishes matching the customer request. Use this before recommending dishes or answering menu availability questions. Do not invent menu names, prices, ingredients, or availability.', parameters: { type: 'object', additionalProperties: false, properties: {
    query: { type: 'string', maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 8 }, category_id: { type: 'string', format: 'uuid' },
    is_signature: { type: 'boolean', description: 'Only signature specialties; never use for bestsellers or new dishes.' },
  } } },
  { name: 'get_menu_item', description: 'Read verified details for a menu item ID from the current page or a search result. Description is menu text, not a complete ingredient or allergy guarantee.',
    parameters: { type: 'object', additionalProperties: false, properties: { item_id: { type: 'string', format: 'uuid' } }, required: ['item_id'] } },
  { name: 'recommend_meal', description: 'Build a meal recommendation from the current menu using the server-verified party size, budget, appetite, allergies, dislikes, and order mode. Never supply or guess those constraints in tool arguments.', parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'lookup_restaurant_info', description: 'Look up current restaurant facts or approved policy knowledge relevant to the customer question. Always use this for restaurant-specific facts; do not answer from model knowledge or copy the source passage verbatim.', parameters: { type: 'object', additionalProperties: false, properties: { query: { type: 'string', maxLength: 200 } }, required: ['query'] } },
  { name: 'get_recent_orders', description: 'Read up to three recent orders for the authenticated customer only. Use only when they ask about their order history.',
    parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'get_saved_addresses', description: 'Read up to three saved delivery addresses for the authenticated customer only. Use only when they ask about saved addresses.',
    parameters: { type: 'object', additionalProperties: false, properties: {} } },
  { name: 'check_reservation_availability', description: 'Check current reservation availability for the customer date, time, and party size already resolved by the server. This only verifies a possible request; it never books or confirms a table.',
    parameters: { type: 'object', additionalProperties: false, properties: {} } },
]

export async function withToolTimeout<T>(work: Promise<T>, milliseconds = 4000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('TOOL_TIMEOUT')), milliseconds) })]) }
  finally { if (timer) clearTimeout(timer) }
}
