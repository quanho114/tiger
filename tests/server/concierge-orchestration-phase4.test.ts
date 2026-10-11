import { describe, expect, it } from 'vitest'
import { resolveRoute, isAccountRead } from '../../supabase/functions/_shared/concierge/orchestration/capability-router.ts'
import { selectToolCalls, computeEvidenceStatus, createTurnGateway } from '../../supabase/functions/_shared/concierge/orchestration/tool-runner.ts'
import { V2_READ_TOOLS, V2_TOOL_REGISTRY } from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { TOOL_POLICIES } from '../../supabase/functions/_shared/concierge/policy/confirmation-policy.ts'
import { createAgentPrincipal } from '../../supabase/functions/_shared/concierge/policy/capabilities.ts'
import { TurnBudget } from '../../supabase/functions/_shared/concierge/context.ts'
import type { TurnScope } from '../../supabase/functions/_shared/concierge/orchestration/turn-context.ts'

describe('Phase 4 — capability router', () => {
  it('routes refresh and smalltalk without retrieval', async () => {
    const { understandTurn } = await import('../../supabase/functions/_shared/concierge/understanding/engine.ts')
    const rec = (authed: boolean) => ({ actor: { authenticated_user_id: authed ? 'user-1' : null } }) as never
    const req = (message?: string, action?: string) =>
      ({ protocol_version: 'concierge-v2', request_id: '00000000-0000-4000-8000-000000000000', ...(message ? { message } : {}), ...(action ? { action: { type: action } } : {}) }) as never
    expect(resolveRoute({ request: req(undefined, 'refresh_session'), record: rec(false), understanding: null, message: '' })).toBe('refresh')
    for (const msg of ['xin chào', 'cảm ơn', 'bye']) {
      const u = understandTurn(msg)
      expect(resolveRoute({ request: req(msg), record: rec(false), understanding: u, message: msg })).toBe('conversation')
    }
  })

  it('routes restaurant facts and reservations before generic flow', async () => {
    const { understandTurn } = await import('../../supabase/functions/_shared/concierge/understanding/engine.ts')
    const rec = { actor: { authenticated_user_id: null } } as never
    const req = (message: string) =>
      ({ protocol_version: 'concierge-v2', request_id: '00000000-0000-4000-8000-000000000000', message }) as never
    for (const msg of ['quán mở cửa mấy giờ', 'địa chỉ quán ở đâu']) {
      const u = understandTurn(msg)
      expect(resolveRoute({ request: req(msg), record: rec, understanding: u, message: msg })).toBe('restaurant_fact')
    }
    // Legacy parity note: 'tối mai 7h bàn 4 người còn không' has no booking
    // verb, so it classifies as other → conversation (documented Phase 3 gap).
    expect(resolveRoute({
      request: req('tối mai 7h bàn 4 người còn không'),
      record: rec,
      understanding: understandTurn('tối mai 7h bàn 4 người còn không'),
      message: 'tối mai 7h bàn 4 người còn không',
    })).toBe('conversation')
    const reservationMsg = 'đặt bàn tối mai 4 người'
    const r = understandTurn(reservationMsg)
    expect(resolveRoute({ request: req(reservationMsg), record: rec, understanding: r, message: reservationMsg })).toBe('reservation')
  })

  it('refuses guest account reads, routes authed ones to main', async () => {
    const { understandTurn } = await import('../../supabase/functions/_shared/concierge/understanding/engine.ts')
    const msg = 'đơn hàng gần nhất của tôi'
    const u = understandTurn(msg)
    const req = { protocol_version: 'concierge-v2', request_id: '00000000-0000-4000-8000-000000000000', message: msg } as never
    expect(isAccountRead(u.intent)).toBe(true)
    expect(resolveRoute({ request: req, record: { actor: { authenticated_user_id: null } } as never, understanding: u, message: msg })).toBe('account_refusal')
    expect(resolveRoute({ request: req, record: { actor: { authenticated_user_id: 'user-1' } } as never, understanding: u, message: msg })).toBe('main')
  })

  it('routes food and draft commands to main flow', async () => {
    const { understandTurn } = await import('../../supabase/functions/_shared/concierge/understanding/engine.ts')
    const rec = { actor: { authenticated_user_id: null } } as never
    for (const msg of ['gợi ý món cho 4 người', 'thêm 2 trà đào', 'chốt']) {
      const u = understandTurn(msg)
      const req = { protocol_version: 'concierge-v2', request_id: '00000000-0000-4000-8000-000000000000', message: msg } as never
      expect(resolveRoute({ request: req, record: rec, understanding: u, message: msg })).toBe('main')
    }
    // 'xem giỏ' is other → conversation (UI-button action, Phase 3 parity note).
    const xem = understandTurn('xem giỏ')
    expect(resolveRoute({
      request: { protocol_version: 'concierge-v2', request_id: '00000000-0000-4000-8000-000000000000', message: 'xem giỏ' } as never,
      record: rec, understanding: xem, message: 'xem giỏ',
    })).toBe('conversation')
  })
})

describe('Phase 4 — model-visible tools are read-only', () => {
  it('every model-visible tool is kind=read with no confirmation', () => {
    expect(V2_READ_TOOLS.length).toBeGreaterThan(0)
    for (const tool of V2_READ_TOOLS) {
      const def = V2_TOOL_REGISTRY[tool.name as keyof typeof V2_TOOL_REGISTRY]
      expect(def, tool.name).toBeDefined()
      expect(def.kind).toBe('read')
      const policy = TOOL_POLICIES[tool.name]
      expect(policy, tool.name).toBeDefined()
      expect(policy.requiresConfirmation).toBe(false)
    }
  })
})

describe('Phase 4 — tool selection and evidence', () => {
  it('keeps allowed read calls, falls back otherwise', () => {
    const active = [{ name: 'search_menu_items', description: '', parameters: {} }]
    const plan = [
      { id: 'a', name: 'search_menu_items', arguments: {} },
      { id: 'b', name: 'execute_sql', arguments: {} },
      { id: 'c', name: 'submit_order', arguments: {} },
    ]
    const fallback = [{ name: 'search_menu_items', arguments: {} }]
    expect(selectToolCalls(active, plan, fallback).map((c) => c.name)).toEqual(['search_menu_items'])
    expect(selectToolCalls(active, [{ id: 'x', name: 'nope', arguments: {} }], fallback)).toEqual(fallback)
    expect(selectToolCalls(active, [], fallback)).toEqual(fallback)
  })

  it('computes unknown evidence status like production', () => {
    expect(computeEvidenceStatus([{ id: '1', name: 'search_menu_items', arguments: {}, result: { candidates: [] } }])).toBe('unknown')
    expect(computeEvidenceStatus([{ id: '1', name: 'search_menu_items', arguments: {}, result: { candidates: [{ id: 'x' }] } }])).toBe('known')
    expect(computeEvidenceStatus([{ id: '1', name: 'get_menu_item', arguments: {}, result: { item: null } }])).toBe('unknown')
  })

  it('gateway executes through capability boundary with shared budget', async () => {
    const principal = createAgentPrincipal({ actorType: 'guest', sessionId: 's' })
    const scope = {
      capability: { principal, authenticated: false },
      budget: new TurnBudget(),
      helpers: {},
      toolEvents: [],
      next: { constraints: {} },
      request: {},
    } as unknown as TurnScope
    const gateway = createTurnGateway(scope)
    expect(gateway.modelVisibleTools().sort()).toEqual(
      ['check_reservation_availability', 'get_menu_item', 'get_recent_orders', 'get_saved_addresses', 'lookup_restaurant_info', 'recommend_meal', 'search_menu_items'],
    )
    // Guest cannot execute self-scoped account tools even with valid schema.
    await expect(gateway.execute('get_recent_orders', {}, { principal })).rejects.toThrow()
    // Unknown tools fail closed.
    await expect(gateway.execute('execute_sql', {}, { principal })).rejects.toThrow()
  })
})
