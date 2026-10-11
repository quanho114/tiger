/**
 * Tiger Agent V2 — Phase 0: Authorization enforcement.
 *
 * Code-enforced checks. The system prompt is a secondary layer only.
 */

import { hasCapability, type AgentPrincipal, type Capability } from './capabilities.ts'

export class CapabilityDeniedError extends Error {
  readonly capability: Capability
  constructor(capability: Capability) {
    super(`CAPABILITY_DENIED:${capability}`)
    this.name = 'CapabilityDeniedError'
    this.capability = capability
  }
}

export class OwnershipError extends Error {
  constructor(message = 'CROSS_USER_ACCESS_DENIED') {
    super(message)
    this.name = 'OwnershipError'
  }
}

/** Throw unless the principal holds every required capability. */
export function requireCapabilities(principal: AgentPrincipal, ...required: Capability[]): void {
  for (const cap of required) {
    if (!hasCapability(principal, cap)) throw new CapabilityDeniedError(cap)
  }
}

/**
 * Ownership check for CUSTOMER_PRIVATE resources.
 * Guests own nothing; customers own only rows matching their userId.
 */
export function assertOwnsResource(
  principal: AgentPrincipal,
  ownerUserId: string | null | undefined,
): void {
  if (principal.actorType !== 'customer' || !principal.userId) {
    throw new OwnershipError('GUEST_HAS_NO_PRIVATE_RESOURCES')
  }
  if (!ownerUserId || ownerUserId !== principal.userId) {
    throw new OwnershipError('CROSS_USER_ACCESS_DENIED')
  }
}

/** True when a tool call is permitted (schema-validated separately). */
export function isToolAllowedForPrincipal(
  principal: AgentPrincipal,
  requiredCapabilities: readonly Capability[],
): boolean {
  return requiredCapabilities.every((cap) => hasCapability(principal, cap))
}
