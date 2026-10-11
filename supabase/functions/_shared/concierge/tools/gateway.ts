/**
 * Tiger Agent V3 — Phase 2: Tool Gateway.
 *
 * Every tool call passes through:
 *   registry lookup → forbidden check → input schema → capability
 *   → ownership → timeout → executor → output schema → projection
 *   → observability event → safe observation.
 *
 * Executors are INJECTED (register) so the gateway never imports the
 * orchestrator — no cycles. The orchestrator adopts gateway.execute()
 * incrementally; direct executor chains must migrate here.
 */

import { z } from 'zod'
import { isForbiddenCustomerTool } from '../policy/confirmation-policy.ts'
import { isToolAllowedForPrincipal } from '../policy/authorization.ts'
import type { AgentPrincipal, Capability } from '../policy/capabilities.ts'

export type ToolKind = 'read' | 'mutation'
export type OwnershipScope = 'none' | 'session' | 'self'

export interface ToolExecutionContext {
  principal: AgentPrincipal
  /** Owner of the target resource for `self`-scoped tools. */
  ownerUserId?: string
  signal?: AbortSignal
}

export interface ToolDefinition {
  name: string
  kind: ToolKind
  inputSchema: z.ZodType<unknown>
  outputSchema: z.ZodType<unknown>
  requiredCapabilities: readonly Capability[]
  ownershipScope: OwnershipScope
  timeoutMs: number
  budgetCost: number
  /** False = deterministic server-only (draft/order/submit) — never shown to the model. */
  modelVisible: boolean
  project?: (output: unknown) => unknown
  execute: (args: unknown, ctx: ToolExecutionContext) => Promise<unknown>
}

export interface ToolObservation {
  data: unknown
  durationMs: number
}

export interface ToolEvent {
  tool: string
  success: boolean
  durationMs: number
  denied?: string
}

export class ToolError extends Error {
  readonly code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.name = 'ToolError'
    this.code = code
  }
}

const DEFAULT_TIMEOUT_MS = 4000

export class ToolGateway {
  private readonly definitions = new Map<string, ToolDefinition>()
  constructor(
    private readonly onEvent?: (event: ToolEvent) => void,
  ) {}

  register(def: ToolDefinition): void {
    if (isForbiddenCustomerTool(def.name)) throw new ToolError('FORBIDDEN_TOOL')
    if (this.definitions.has(def.name)) throw new ToolError('TOOL_ALREADY_REGISTERED')
    this.definitions.set(def.name, def)
  }

  /** Names the model is allowed to request (read-only surface). */
  modelVisibleTools(): string[] {
    return [...this.definitions.values()].filter((d) => d.modelVisible).map((d) => d.name)
  }

  async execute(
    toolName: string,
    rawArgs: unknown,
    ctx: ToolExecutionContext,
  ): Promise<ToolObservation> {
    const started = Date.now()
    const fail = (code: string): never => {
      this.onEvent?.({ tool: toolName, success: false, durationMs: Date.now() - started, denied: code })
      throw new ToolError(code)
    }
    const def = this.definitions.get(toolName)
    if (!def) fail('UNKNOWN_TOOL')
    if (isForbiddenCustomerTool(toolName)) fail('FORBIDDEN_TOOL')
    // Mutations are deterministic server actions — the model must never invoke them.
    if (def!.kind === 'mutation' && !def!.modelVisible) fail('MUTATION_NOT_MODEL_CALLABLE')

    const parsed = def!.inputSchema.safeParse(rawArgs)
    if (!parsed.success) fail('TOOL_INPUT_INVALID')

    if (!isToolAllowedForPrincipal(ctx.principal, def!.requiredCapabilities)) {
      fail(`CAPABILITY_DENIED:${def!.requiredCapabilities.join(',')}`)
    }
    if (def!.ownershipScope === 'self') {
      if (ctx.principal.actorType !== 'customer' || !ctx.principal.userId) fail('AUTH_REQUIRED')
      if (!ctx.ownerUserId || ctx.ownerUserId !== ctx.principal.userId) fail('CROSS_USER_DENIED')
    }

    const timeoutMs = def!.timeoutMs > 0 ? def!.timeoutMs : DEFAULT_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        def!.execute(parsed.data, ctx),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new ToolError('TOOL_TIMEOUT')), timeoutMs)
        }),
      ])
      const validated = def!.outputSchema.safeParse(result)
      if (!validated.success) fail('TOOL_OUTPUT_INVALID')
      const data = def!.project ? def!.project(validated.data) : validated.data
      const durationMs = Date.now() - started
      this.onEvent?.({ tool: toolName, success: true, durationMs })
      return { data, durationMs }
    } catch (error) {
      if (error instanceof ToolError) {
        this.onEvent?.({ tool: toolName, success: false, durationMs: Date.now() - started, denied: error.code })
      } else {
        this.onEvent?.({ tool: toolName, success: false, durationMs: Date.now() - started, denied: 'TOOL_EXECUTION_FAILED' })
      }
      throw error instanceof ToolError ? error : new ToolError('TOOL_EXECUTION_FAILED')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
