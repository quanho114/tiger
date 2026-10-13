import { expect, it, vi } from 'vitest'
import type pg from 'pg'
import { adminUpdateAllergenProfile, adminUpdateConfig, RECOMMENDATION_CONFIG, seedKnowledgeSnapshot } from '../../supabase/functions/_shared/concierge/knowledge.ts'
import { loadKnowledgeSnapshot, persistKnowledgeMutation } from '../../supabase/functions/_shared/concierge/knowledge-repository.ts'

it('persists an admin edit and reloads it without changing module defaults', async () => {
  const rows: { kind: string; key: string; payload: object }[] = []
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT kind, key, payload')) return { rows: structuredClone(rows) }
    if (sql.startsWith('INSERT INTO public.concierge_knowledge')) {
      rows.push({ kind: String(params?.[0]), key: String(params?.[1]), payload: JSON.parse(String(params?.[2])) })
    }
    return { rows: [] }
  })
  const pool = { query, connect: async () => ({ query, release: () => {} }) } as unknown as pg.Pool
  const originalFactor = RECOMMENDATION_CONFIG.adult_factor
  const updated = await persistKnowledgeMutation(pool, { kind: 'config', key: 'global', actorId: crypto.randomUUID(),
    action: 'update_recommendation_config', entityType: 'recommendation_config',
    mutate: snapshot => adminUpdateConfig({ adult_factor: 1.3 }, 'admin', snapshot),
    metadata: value => ({ version: value.version }),
  })

  expect(updated.version).toBe(RECOMMENDATION_CONFIG.version + 1)
  expect(RECOMMENDATION_CONFIG.adult_factor).toBe(originalFactor)
  expect((await loadKnowledgeSnapshot(pool)).config.adult_factor).toBe(1.3)
  expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO public.audit_logs'))).toBe(true)
})

it('rejects malformed persisted allergy verification instead of treating it as safe', async () => {
  const itemId = crypto.randomUUID()
  const pool = { query: async () => ({ rows: [{ kind: 'allergen', key: itemId,
    payload: { item_id: itemId, verified_by_kitchen: 'false', allergens: { peanuts: 'absent' } } }] }) } as unknown as pg.Pool
  await expect(loadKnowledgeSnapshot(pool)).rejects.toThrow('INVALID_KNOWLEDGE')
})

it('requires fresh kitchen approval when allergen ingredients change', () => {
  const itemId = '10000000-0000-0000-0000-000000000001'
  const snapshot = seedKnowledgeSnapshot()
  adminUpdateAllergenProfile(itemId, { verified_by_kitchen: true, kitchen_notes: 'Đã kiểm tra với bếp' }, 'admin', snapshot)
  expect(snapshot.allergenProfiles[itemId].verified_by_kitchen).toBe(true)
  adminUpdateAllergenProfile(itemId, { allergens: { peanuts: 'absent' } }, 'admin', snapshot)
  expect(snapshot.allergenProfiles[itemId].verified_by_kitchen).toBe(false)
  expect(snapshot.allergenProfiles[itemId].source).toBe('demo_estimate')
})
