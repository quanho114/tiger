/**
 * Tiger Agent V2 — Phase 0: Capability model.
 *
 * One Restaurant Agent with explicit capabilities per principal.
 * Admin capabilities are NEVER granted to the customer agent —
 * a future admin agent must use a separate security context.
 */

export type ActorType = 'guest' | 'customer'

export type Capability =
  | 'menu.read'
  | 'restaurant.public.read'
  | 'recommendation.use'
  | 'cart.read'
  | 'cart.write'
  | 'order.quote'
  | 'order.self.read'
  | 'order.submit'
  | 'reservation.prepare'
  | 'reservation.self.read'
  | 'reservation.submit'
  | 'customer.self.read'
  | 'customer.preference.read'
  | 'customer.preference.write'
  | 'memory.self.read'
  | 'memory.self.write'

export interface AgentPrincipal {
  actorType: ActorType
  /** Authenticated Supabase user id; absent for guests. */
  userId?: string
  /** Random session id (csc_* capability is the credential, never the IP). */
  sessionId: string
  capabilities: ReadonlySet<Capability>
}

export const GUEST_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'menu.read',
  'restaurant.public.read',
  'recommendation.use',
  'cart.read',
  'cart.write',
  'order.quote',
  'reservation.prepare',
])

const CUSTOMER_EXTRA_CAPABILITIES: readonly Capability[] = [
  'customer.self.read',
  'customer.preference.read',
  'customer.preference.write',
  'order.self.read',
  'reservation.self.read',
  'memory.self.read',
  'memory.self.write',
]

/** Capabilities that submit real-world effects — always need confirmation. */
export const HIGH_RISK_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'order.submit',
  'reservation.submit',
])

export function resolveCapabilities(actorType: ActorType): Set<Capability> {
  const caps = new Set<Capability>(GUEST_CAPABILITIES)
  if (actorType === 'customer') {
    for (const cap of CUSTOMER_EXTRA_CAPABILITIES) caps.add(cap)
  }
  return caps
}

export function createAgentPrincipal(input: {
  actorType: ActorType
  sessionId: string
  userId?: string
}): AgentPrincipal {
  if (!input.sessionId.trim()) throw new Error('INVALID_SESSION')
  if (input.actorType === 'customer' && !input.userId) {
    throw new Error('CUSTOMER_REQUIRES_USER_ID')
  }
  if (input.actorType === 'guest' && input.userId) {
    throw new Error('GUEST_MUST_NOT_HAVE_USER_ID')
  }
  return {
    actorType: input.actorType,
    userId: input.userId,
    sessionId: input.sessionId,
    capabilities: resolveCapabilities(input.actorType),
  }
}

export function hasCapability(principal: AgentPrincipal, capability: Capability): boolean {
  return principal.capabilities.has(capability)
}
