import { describe, expect, it } from 'vitest'
import {
  classifyField,
  projectCustomerSelf,
  INTERNAL_DATA_REFUSAL,
} from '../../supabase/functions/_shared/concierge/policy/data-classification.ts'
import {
  createAgentPrincipal,
  resolveCapabilities,
} from '../../supabase/functions/_shared/concierge/policy/capabilities.ts'
import {
  requireCapabilities,
  assertOwnsResource,
  CapabilityDeniedError,
  OwnershipError,
} from '../../supabase/functions/_shared/concierge/policy/authorization.ts'
import {
  getToolPolicy,
  isForbiddenCustomerTool,
} from '../../supabase/functions/_shared/concierge/policy/confirmation-policy.ts'
import {
  validateV2Tool,
  assertToolAllowedForPrincipal,
} from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { getClientIp } from '../../supabase/functions/_shared/request.ts'

describe('Phase 0 — data classification', () => {
  it('fails closed on unknown fields', () => {
    expect(classifyField('mystery_column')).toBe('BUSINESS_INTERNAL')
    expect(classifyField('')).toBe('BUSINESS_INTERNAL')
  })

  it('flags secrets absolutely', () => {
    expect(classifyField('OPENAI_API_KEY')).toBe('SECRET')
    expect(classifyField('service_role_key')).toBe('SECRET')
    expect(classifyField('DATABASE_URL')).toBe('SECRET')
  })

  it('flags internal business data', () => {
    expect(classifyField('revenue')).toBe('BUSINESS_INTERNAL')
    expect(classifyField('doanh thu')).toBe('BUSINESS_INTERNAL')
    expect(classifyField('internal_note')).toBe('BUSINESS_INTERNAL')
  })

  it('projects only agent-visible customer fields', () => {
    const projected = projectCustomerSelf({
      display_name: 'Quân',
      preferences: ['ít cay'],
      email: 'q@example.com',
      internal_notes: 'vip?',
      fraud_score: 3,
    })
    expect(projected).toEqual({ display_name: 'Quân', preferences: ['ít cay'] })
    expect(INTERNAL_DATA_REFUSAL.length).toBeGreaterThan(0)
  })
})

describe('Phase 0 — capability model', () => {
  it('guest gets public capabilities only', () => {
    const caps = resolveCapabilities('guest')
    expect(caps.has('menu.read')).toBe(true)
    expect(caps.has('cart.write')).toBe(true)
    expect(caps.has('order.self.read')).toBe(false)
    expect(caps.has('memory.self.write')).toBe(false)
  })

  it('customer extends guest, never admin', () => {
    const caps = resolveCapabilities('customer')
    expect(caps.has('menu.read')).toBe(true)
    expect(caps.has('order.self.read')).toBe(true)
    expect(caps.has('memory.self.write')).toBe(true)
  })

  it('rejects invalid principal shapes', () => {
    expect(() => createAgentPrincipal({ actorType: 'customer', sessionId: 's1' })).toThrow()
    expect(() => createAgentPrincipal({ actorType: 'guest', sessionId: 's1', userId: 'u' })).toThrow()
    expect(() => createAgentPrincipal({ actorType: 'guest', sessionId: '' })).toThrow()
  })
})

describe('Phase 0 — authorization', () => {
  const guest = createAgentPrincipal({ actorType: 'guest', sessionId: 'sess-1' })
  const customer = createAgentPrincipal({ actorType: 'customer', sessionId: 'sess-2', userId: 'user-1' })

  it('denies missing capabilities in code, not prompts', () => {
    expect(() => requireCapabilities(guest, 'order.self.read')).toThrow(CapabilityDeniedError)
    expect(() => requireCapabilities(customer, 'order.self.read')).not.toThrow()
  })

  it('enforces own-only private data', () => {
    expect(() => assertOwnsResource(guest, 'user-1')).toThrow(OwnershipError)
    expect(() => assertOwnsResource(customer, 'user-2')).toThrow(OwnershipError)
    expect(() => assertOwnsResource(customer, 'user-1')).not.toThrow()
  })
})

describe('Phase 0 — tool policy + gateway gate', () => {
  const guest = createAgentPrincipal({ actorType: 'guest', sessionId: 'sess-1' })
  const customer = createAgentPrincipal({ actorType: 'customer', sessionId: 'sess-2', userId: 'user-1' })

  it('low-risk reads need no confirmation; submit needs explicit', () => {
    expect(getToolPolicy('search_menu_items')?.requiresConfirmation).toBe(false)
    expect(getToolPolicy('submit_order')?.requiresConfirmation).toBe(true)
    expect(getToolPolicy('submit_order')?.confirmationLevel).toBe('explicit')
    expect(getToolPolicy('add_draft_item')?.confirmationLevel).toBe('implicit-draft')
  })

  it('forbidden tools can never enter the customer registry', () => {
    for (const name of ['execute_sql', 'get_users', 'get_revenue', 'get_api_keys', 'get_logs']) {
      expect(isForbiddenCustomerTool(name)).toBe(true)
      expect(() => validateV2Tool(name, {})).toThrow()
      expect(() => assertToolAllowedForPrincipal(name, customer)).toThrow()
    }
  })

  it('guest cannot use own-only tools', () => {
    expect(() => assertToolAllowedForPrincipal('get_recent_orders', guest)).toThrow()
    expect(() => assertToolAllowedForPrincipal('get_recent_orders', customer)).not.toThrow()
    expect(() => assertToolAllowedForPrincipal('search_menu_items', guest)).not.toThrow()
  })
})

describe('Phase 0 — IP is rate-limit only, never identity', () => {
  it('accepts plausible IPs, rejects garbage', () => {
    const withIp = (headers: Record<string, string>) =>
      getClientIp(new Request('http://x/', { headers }))
    expect(withIp({ 'cf-connecting-ip': '1.2.3.4' })).toBe('1.2.3.4')
    expect(withIp({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8' })).toBe('9.9.9.9')
    expect(withIp({ 'x-forwarded-for': 'not-an-ip-<script>' })).toBe('127.0.0.1')
    expect(withIp({})).toBe('127.0.0.1')
  })
})
