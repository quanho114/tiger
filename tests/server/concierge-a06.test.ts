import { afterEach, describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import fs from 'node:fs'
import { getMenuSnapshot, invalidateMenuSnapshot, snapshotAllergenProfiles, SNAPSHOT_TTL_MS } from '../../supabase/functions/_shared/concierge/menu/domain.ts'
import { mapDomainItem } from '../../supabase/functions/_shared/concierge/menu/mapper.ts'
import { menuReadinessReport } from '../../supabase/functions/_shared/concierge/menu/readiness.ts'
import { evaluateFoodSafety, normalizeAllergen } from '../../supabase/functions/_shared/concierge/food-safety.ts'
import { adminUpdateAllergenProfile, seedKnowledgeSnapshot, ALLERGEN_PROFILES } from '../../supabase/functions/_shared/concierge/knowledge.ts'
import { catalogResolver } from '../../supabase/functions/_shared/concierge/orchestration/catalog-resolver.ts'
import { session } from './concierge-a03-a05-fixture.ts'
import { databaseRow, itemRow, profileRow } from './fixtures/a06-a08-fixture.ts'

afterEach(() => vi.useRealTimers())
const safety = (profiles: ReturnType<typeof snapshotAllergenProfiles>) => evaluateFoodSafety({ id: itemRow.id, name: itemRow.name }, ['hải sản'], profiles[itemRow.id], { ingredientOnly: true })
describe('A06 ingredient evidence and snapshot freshness', () => {
  it('does not fall back to module seed profiles when runtime knowledge is unavailable', () => {
    const previous = ALLERGEN_PROFILES[itemRow.id]
    try {
      ALLERGEN_PROFILES[itemRow.id] = { item_id: itemRow.id, allergens: { seafood: 'absent' },
        verified_by_kitchen: true, source: 'kitchen_audited', verified_at: profileRow.allergen_verified_at! }
      const state = session(); state.constraints.allergies = ['seafood']
      const resolve = catalogResolver([{ id: itemRow.id, name: itemRow.name, price_vnd: 20000, is_available: true }], state)
      expect(resolve(itemRow.id)?.safety_state).toBe('allergen_unknown')
    } finally {
      if (previous) ALLERGEN_PROFILES[itemRow.id] = previous
      else delete ALLERGEN_PROFILES[itemRow.id]
    }
  })
  it('expires exactly at TTL, fails closed on refresh error, and recovers without re-verifying the source', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T00:00:00Z'))
    let fail = false
    const query = vi.fn(async () => { if (fail) throw new Error('OFFLINE'); return { rows: [databaseRow()] } })
    const pool = { query } as unknown as pg.Pool
    const first = await getMenuSnapshot(pool)
    const profiles = snapshotAllergenProfiles(first)
    expect(safety(profiles).safety_state).toBe('verified_safe')
    vi.setSystemTime(Date.now() + SNAPSHOT_TTL_MS - 1)
    expect(await getMenuSnapshot(pool)).toBe(first)
    vi.setSystemTime(Date.now() + 1); fail = true
    expect(safety(profiles).safety_state).toBe('allergen_unverified')
    const stale = await getMenuSnapshot(pool)
    expect(stale.freshness).toBe('stale')
    expect(stale.loadedAt).toBe(first.loadedAt)
    expect(safety(snapshotAllergenProfiles(stale)).safety_state).not.toBe('verified_safe')
    fail = false
    const refreshed = await getMenuSnapshot(pool)
    expect(refreshed.loadedAt).not.toBe(first.loadedAt)
    expect(refreshed.items[0].allergens.verifiedAt).toBe(profileRow.allergen_verified_at)
    expect(safety(snapshotAllergenProfiles(refreshed)).safety_state).toBe('verified_safe')
  })
  it('downgrades a fresh cache after a failed forced read, and retries on the next read', async () => {
    let fail = false
    const query = vi.fn(async () => { if (fail) throw new Error('OFFLINE'); return { rows: [databaseRow()] } })
    const pool = { query } as unknown as pg.Pool
    await getMenuSnapshot(pool); fail = true
    expect(safety(snapshotAllergenProfiles(await getMenuSnapshot(pool, true))).safety_state).not.toBe('verified_safe')
    expect(safety(snapshotAllergenProfiles(await getMenuSnapshot(pool))).safety_state).not.toBe('verified_safe')
    expect(query).toHaveBeenCalledTimes(3)
  })
  it('observes ingredient changes and revoked verification after invalidation', async () => {
    let row = databaseRow()
    const pool = { query: async () => ({ rows: [row] }) } as unknown as pg.Pool
    const first = await getMenuSnapshot(pool)
    row = { ...row, allergens: { seafood: 'contains', peanuts: 'absent' }, allergen_verified: false }
    invalidateMenuSnapshot()
    const second = await getMenuSnapshot(pool)
    expect(second.version).not.toBe(first.version)
    expect(safety(snapshotAllergenProfiles(second)).safety_state).toBe('contains_allergen')
    row = { ...row, allergens: { seafood: 'absent', peanuts: 'absent' } }
    invalidateMenuSnapshot()
    expect(safety(snapshotAllergenProfiles(await getMenuSnapshot(pool))).safety_state).toBe('allergen_unverified')
  })
  it('does not publish an in-flight snapshot invalidated by an admin write', async () => {
    let resolve!: (value: { rows: ReturnType<typeof databaseRow>[] }) => void
    let calls = 0
    const revoked = { ...databaseRow(), allergen_verified: false }
    const pool = { query: () => ++calls === 1 ? new Promise(done => { resolve = done }) : Promise.resolve({ rows: [revoked] }) } as unknown as pg.Pool
    const pending = getMenuSnapshot(pool)
    invalidateMenuSnapshot(); resolve({ rows: [databaseRow()] })
    expect(safety(snapshotAllergenProfiles(await pending)).safety_state).not.toBe('verified_safe')
    expect(calls).toBe(2)
  })
  it('clears verification when ingredient assertions change and timestamps a new explicit audit', () => {
    const snapshot = seedKnowledgeSnapshot()
    snapshot.allergenProfiles[itemRow.id] = { item_id: itemRow.id, allergens: { seafood: 'absent' }, verified_by_kitchen: true, verified_at: profileRow.allergen_verified_at!, source: 'kitchen_audited' }
    expect(adminUpdateAllergenProfile(itemRow.id, { allergens: { seafood: 'contains' } }, 'test-auditor', snapshot).verified_by_kitchen).toBe(false)
    const audited = adminUpdateAllergenProfile(itemRow.id, { allergens: { seafood: 'absent' }, verified_by_kitchen: true, kitchen_notes: 'Synthetic audit', verified_at: '2000-01-01T00:00:00Z' }, 'test-auditor', snapshot)
    expect(audited.verified_at).not.toBe('2000-01-01T00:00:00Z')
  })
  it('reports missing metadata separately from unavailable items, with denominators and curation IDs', () => {
    const profiled = mapDomainItem(itemRow, profileRow)
    const missing = mapDomainItem({ ...itemRow, id: crypto.randomUUID() }, null)
    const unavailable = { ...profiled, id: crypto.randomUUID(), isAvailable: false }
    const snapshot = { version: 'fixture:v1', loadedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 45000).toISOString(), items: [profiled, missing, unavailable] }
    const report = menuReadinessReport(snapshot, 'fixture')
    if (process.env.A06_REPORT_OUTPUT === '1') fs.writeFileSync('../tiger-a06-a08-baseline/readiness-fixture-snapshot.json', JSON.stringify(snapshot, null, 2))
    expect(report).toMatchObject({ published: 3, available: 2, missingProfileIds: [missing.id], unavailableIds: [unavailable.id] })
    expect(report.availableOnly.restaurantServing).toMatchObject({ denominator: 2, present: 1, missing: 1 })
    expect(report.curation.find(item => item.itemId === missing.id)?.missing).toContain('allergenAssertions')
  })
  it.each(['nước mắm', 'nuoc mam', 'dầu hào', 'mam tom', 'nghêu', 'hải sản'])('maps %s to seafood', alias => expect(normalizeAllergen(alias)).toBe('seafood'))
  it.each(['dầu đậu phộng', 'bo dau phong', 'peanut oil', 'dau lac', 'lạc'])('maps %s to peanuts', alias => expect(normalizeAllergen(alias)).toBe('peanuts'))
  it('uses ingredient assertions for hidden sauces and fillings; missing data cannot pass', () => {
    const item = { id: itemRow.id, name: 'Món gia truyền' }
    const profile = { item_id: item.id, source: 'kitchen_audited' as const, verified_by_kitchen: true, verified_at: profileRow.allergen_verified_at!, allergens: { seafood: 'contains' as const } }
    expect(evaluateFoodSafety(item, ['tôm'], profile, { ingredientOnly: true }).safety_state).toBe('contains_allergen')
    expect(evaluateFoodSafety(item, ['đậu phộng'], profile, { ingredientOnly: true }).safety_state).toBe('allergen_unknown')
    expect(evaluateFoodSafety(item, ['hải sản và đậu phộng'], profile, { ingredientOnly: true }).safety_state).not.toBe('verified_safe')
    const absent = { ...profile, allergens: { seafood: 'absent' as const }, cross_contact_risk: true }
    expect(evaluateFoodSafety(item, ['hải sản'], absent, { ingredientOnly: true }).safety_state).toBe('verified_safe')
    expect(evaluateFoodSafety(item, ['hải sản'], absent).safety_state).toBe('cross_contact_risk')
    expect(evaluateFoodSafety({ ...item, description: 'Sốt dầu hào' }, ['hải sản'], absent, { ingredientOnly: true }).safety_state).toBe('conflict')
  })
})
