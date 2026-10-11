import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CAPABILITY_MANIFEST } from '../../supabase/functions/_shared/concierge/capabilities/manifest.ts'
import {
  permittedToolsForTurn,
  resolveCapabilityContext,
} from '../../supabase/functions/_shared/concierge/capabilities/resolver.ts'
import { createAgentPrincipal } from '../../supabase/functions/_shared/concierge/policy/capabilities.ts'
import { ToolGateway } from '../../supabase/functions/_shared/concierge/tools/gateway.ts'

describe('Phase 1 — capability manifest', () => {
  it('covers every capability with auth/ownership/mutation metadata', () => {
    const guest = createAgentPrincipal({ actorType: 'guest', sessionId: 's' })
    const customer = createAgentPrincipal({ actorType: 'customer', sessionId: 's', userId: 'u' })
    for (const cap of new Set([...guest.capabilities, ...customer.capabilities])) {
      const entry = CAPABILITY_MANIFEST[cap]
      expect(entry, cap).toBeDefined()
      expect(typeof entry.requiresAuth).toBe('boolean')
      expect(Array.isArray(entry.permittedTools)).toBe(true)
    }
  })

  it('self-data capabilities require auth + self ownership', () => {
    expect(CAPABILITY_MANIFEST['order.self.read'].requiresAuth).toBe(true)
    expect(CAPABILITY_MANIFEST['order.self.read'].ownershipScope).toBe('self')
    expect(CAPABILITY_MANIFEST['menu.read'].requiresAuth).toBe(false)
  })

  it('submit capabilities are mutations with explicit confirmation', () => {
    expect(CAPABILITY_MANIFEST['order.submit'].mutation).toBe(true)
    expect(CAPABILITY_MANIFEST['order.submit'].confirmation).toBe('explicit')
  })
})

describe('Phase 1 — resolver (never from natural language)', () => {
  it('derives context from verified actor only', () => {
    const ctx = resolveCapabilityContext({ actorType: 'customer', sessionId: 's', userId: 'u1' })
    expect(ctx.authenticated).toBe(true)
    expect(ctx.principal.capabilities.has('order.self.read')).toBe(true)
  })

  it('food intent unlocks menu tools, never account tools', () => {
    const guest = resolveCapabilityContext({ actorType: 'guest', sessionId: 's' })
    const tools = permittedToolsForTurn(guest, 'food_recommendation')
    expect(tools).toContain('search_menu_items')
    expect(tools).toContain('recommend_meal')
    expect(tools).not.toContain('get_recent_orders')
  })

  it('guest history intent yields no account tools', () => {
    const guest = resolveCapabilityContext({ actorType: 'guest', sessionId: 's' })
    expect(permittedToolsForTurn(guest, 'order_status')).toEqual([])
  })
})

describe('Phase 2 — tool gateway', () => {
  function makeGateway(events: { tool: string; success: boolean }[] = []) {
    const gw = new ToolGateway((e) => events.push(e))
    gw.register({
      name: 'search_menu_items',
      kind: 'read',
      inputSchema: z.object({ query: z.string().max(200).optional() }).strict(),
      outputSchema: z.object({ items: z.array(z.string()) }).strict(),
      requiredCapabilities: ['menu.read'],
      ownershipScope: 'none',
      timeoutMs: 1000,
      budgetCost: 1,
      modelVisible: true,
      execute: async () => ({ items: ['Gà nướng'] }),
    })
    gw.register({
      name: 'get_recent_orders',
      kind: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ orders: z.array(z.string()) }).strict(),
      requiredCapabilities: ['order.self.read'],
      ownershipScope: 'self',
      timeoutMs: 1000,
      budgetCost: 1,
      modelVisible: true,
      execute: async () => ({ orders: [] }),
    })
    gw.register({
      name: 'submit_order',
      kind: 'mutation',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({}).strict(),
      requiredCapabilities: ['order.submit'],
      ownershipScope: 'session',
      timeoutMs: 1000,
      budgetCost: 5,
      modelVisible: false,
      execute: async () => ({}),
    })
    return gw
  }

  const guest = createAgentPrincipal({ actorType: 'guest', sessionId: 's' })
  const customer = createAgentPrincipal({ actorType: 'customer', sessionId: 's', userId: 'u1' })

  it('executes allowed read tools and exposes model-visible set', async () => {
    const gw = makeGateway()
    expect(gw.modelVisibleTools().sort()).toEqual(['get_recent_orders', 'search_menu_items'])
    const obs = await gw.execute('search_menu_items', {}, { principal: guest })
    expect(obs.data).toEqual({ items: ['Gà nướng'] })
  })

  it('denies unknown, forbidden, and capability-missing tools', async () => {
    const gw = makeGateway()
    await expect(gw.execute('nope', {}, { principal: guest })).rejects.toThrow('UNKNOWN_TOOL')
    await expect(gw.execute('execute_sql', {}, { principal: customer })).rejects.toThrow()
    await expect(gw.execute('get_recent_orders', {}, { principal: guest, ownerUserId: 'u1' })).rejects.toThrow()
  })

  it('enforces self ownership and blocks model-called mutations', async () => {
    const gw = makeGateway()
    await expect(
      gw.execute('get_recent_orders', {}, { principal: customer, ownerUserId: 'u2' }),
    ).rejects.toThrow('CROSS_USER_DENIED')
    await expect(
      gw.execute('get_recent_orders', {}, { principal: customer, ownerUserId: 'u1' }),
    ).resolves.toBeDefined()
    await expect(gw.execute('submit_order', {}, { principal: guest })).rejects.toThrow(
      'MUTATION_NOT_MODEL_CALLABLE',
    )
  })

  it('rejects bad input and times out slow executors', async () => {
    const gw = makeGateway()
    await expect(gw.execute('search_menu_items', { query: 42 }, { principal: guest })).rejects.toThrow(
      'TOOL_INPUT_INVALID',
    )
    gw.register({
      name: 'slow',
      kind: 'read',
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({}).strict(),
      requiredCapabilities: ['menu.read'],
      ownershipScope: 'none',
      timeoutMs: 20,
      budgetCost: 1,
      modelVisible: true,
      execute: async () => new Promise((r) => setTimeout(r, 200)),
    })
    await expect(gw.execute('slow', {}, { principal: guest })).rejects.toThrow('TOOL_TIMEOUT')
  })

  it('emits observability events for success and denial', async () => {
    const events: { tool: string; success: boolean }[] = []
    const gw = makeGateway(events)
    await gw.execute('search_menu_items', {}, { principal: guest })
    await expect(gw.execute('nope', {}, { principal: guest })).rejects.toThrow()
    expect(events).toMatchObject([{ tool: 'search_menu_items', success: true }, { tool: 'nope', success: false }])
  })
})
