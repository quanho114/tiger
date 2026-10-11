/**
 * Tiger Agent V3 — Phase 1: Capability resolver.
 *
 * Builds a trusted CapabilityContext from the ALREADY-VERIFIED server
 * actor/session (gateway auth). The orchestrator receives this context
 * and must never re-derive authorization from message text.
 */

import {
  createAgentPrincipal,
  type ActorType,
  type AgentPrincipal,
  type Capability,
} from '../policy/capabilities.ts'
import { CAPABILITY_MANIFEST, INTENT_CAPABILITIES, type AgentIntent } from './manifest.ts'

export interface CapabilityContext {
  principal: AgentPrincipal
  /** True when the caller proved authentication (verified JWT). */
  authenticated: boolean
}

export function resolveCapabilityContext(input: {
  actorType: ActorType
  sessionId: string
  userId?: string
}): CapabilityContext {
  const principal = createAgentPrincipal(input)
  return { principal, authenticated: input.actorType === 'customer' }
}

/** Capabilities an intent is allowed to exercise (subset of principal). */
export function capabilitiesForIntent(intent: AgentIntent): ReadonlySet<Capability> {
  return new Set(INTENT_CAPABILITIES[intent] ?? [])
}

/**
 * Tools the current turn may use: principal capabilities ∩ intent
 * capabilities, expanded through the manifest. Model-visible filtering
 * (read-only) is enforced by the Tool Gateway.
 */
export function permittedToolsForTurn(
  ctx: CapabilityContext,
  intent: AgentIntent,
): string[] {
  const intentCaps = capabilitiesForIntent(intent)
  const tools = new Set<string>()
  for (const cap of ctx.principal.capabilities) {
    if (!intentCaps.has(cap)) continue
    const entry = CAPABILITY_MANIFEST[cap]
    for (const tool of entry?.permittedTools ?? []) tools.add(tool)
  }
  return [...tools]
}
