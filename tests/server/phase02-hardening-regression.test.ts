import { afterEach, describe, expect, it } from 'vitest'
import { getAllergenProfile, listAllergenProfiles } from '../../supabase/functions/_shared/concierge/menu/profile-repository.ts'
import { getCorsHeaders } from '../../supabase/functions/_shared/cors.ts'
import { getClientIp } from '../../supabase/functions/_shared/request.ts'

const ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const verifiedRow = {
  menu_item_id: ITEM,
  serving_unit: 'đĩa',
  serving_description: null,
  people_min: 2,
  people_max: 3,
  meal_role: 'main_protein',
  meal_context: 'shared',
  protein_score: 0.8,
  carb_score: 0.1,
  vegetable_score: 0.2,
  soup_score: 0,
  spice_level: 1,
  richness_level: 2,
  taste_tags: ['savory', 'spicy'],
  dietary_tags: ['halal-friendly'],
  pairing_item_ids: [],
  allergens: { peanuts: 'contains', shrimp: 'may_contain', milk: 'absent', soy: 'unknown' },
  allergen_source: 'kitchen_audited',
  allergen_verified: true,
  allergen_verified_at: '2026-10-01T00:00:00.000Z',
  allergen_verified_by: 'bep-truong',
  kitchen_notes: 'Chảo riêng cho món không đậu phộng',
  confidence: 'restaurant_defined',
  provenance: 'admin',
  serving_source: 'restaurant_admin',
  taste_source: 'restaurant_admin',
}

const poolWithRow = (row: Record<string, unknown> | undefined) => ({
  query: async () => ({ rows: row ? [row] : [] }),
})

describe('Phase 02 — allergen persistence preserves stored data', () => {
  it('getAllergenProfile keeps verified states, source, verifier and notes', async () => {
    const profile = await getAllergenProfile(poolWithRow(verifiedRow) as never, ITEM)
    expect(profile.allergens).toEqual(verifiedRow.allergens)
    expect(profile.verified_by_kitchen).toBe(true)
    expect(profile.source).toBe('kitchen_audited')
    expect(profile.verified_at).toBe('2026-10-01T00:00:00.000Z')
    expect(profile.kitchen_notes).toBe(verifiedRow.kitchen_notes)
  })

  it('listAllergenProfiles does not blank stored profiles', async () => {
    const out = await listAllergenProfiles(poolWithRow(verifiedRow) as never)
    expect(out[ITEM].allergens).toEqual(verifiedRow.allergens)
    expect(out[ITEM].verified_by_kitchen).toBe(true)
  })

  it('unknown stays unknown — never promoted to absent', async () => {
    const row = { ...verifiedRow, allergens: { peanuts: 'unknown' }, allergen_verified: false, allergen_source: 'demo_estimate' }
    const profile = await getAllergenProfile(poolWithRow(row) as never, ITEM)
    expect(profile.allergens).toEqual({ peanuts: 'unknown' })
    expect(profile.verified_by_kitchen).toBe(false)
  })
})

describe('Phase 02 — CORS allowlist is strict in production', () => {
  const savedNodeEnv = process.env.NODE_ENV
  const savedEnv = process.env.ENVIRONMENT
  afterEach(() => {
    if (savedNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = savedNodeEnv
    if (savedEnv === undefined) delete process.env.ENVIRONMENT
    else process.env.ENVIRONMENT = savedEnv
  })

  const originHeader = (origin: string) =>
    (getCorsHeaders(new Request('https://api.test/', { headers: { origin } })) as Record<string, string>)['Access-Control-Allow-Origin']

  it('production echoes only explicit allowlist origins', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.ENVIRONMENT
    expect(originHeader('https://tiger345.vn')).toBe('https://tiger345.vn')
    expect(originHeader('https://evil.vercel.app')).toBe('http://localhost:5173')
    expect(originHeader('http://localhost:9999')).toBe('http://localhost:5173')
  })

  it('non-production keeps local/preview conveniences', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.ENVIRONMENT
    expect(originHeader('https://some-preview.vercel.app')).toBe('https://some-preview.vercel.app')
  })
})

describe('Phase 02 — client IP fallback never grants loopback limits', () => {
  it('returns non-loopback sentinel when headers are missing or garbage', () => {
    expect(getClientIp(new Request('http://x/'))).toBe('0.0.0.0')
    expect(getClientIp(new Request('http://x/', { headers: { 'x-forwarded-for': 'not-an-ip' } }))).toBe('0.0.0.0')
  })

  it('still accepts explicit plausible IPs including loopback from local tests', () => {
    expect(getClientIp(new Request('http://x/', { headers: { 'x-forwarded-for': '127.0.0.1' } }))).toBe('127.0.0.1')
    expect(getClientIp(new Request('http://x/', { headers: { 'cf-connecting-ip': '1.2.3.4' } }))).toBe('1.2.3.4')
  })
})
