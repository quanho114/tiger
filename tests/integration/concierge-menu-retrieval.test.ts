/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: vitest runner (npm run test:integration -- tests/integration/concierge-menu-retrieval.test.ts)
 * - Affected API: retrieveMenuCandidates, fetchAuthoritativeCatalog
 * - Data Schemas: public.menu_items, public.categories, ConciergeV2MenuCandidateSchema, ConciergeV2MenuRetrievalResultSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V08: Verified menu and food-safety retrieval", "5. Keep price/availability authoritative and shared with existing quote/cart validation. Do not add a parallel pricing engine."
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard.js'
import {
  fetchAuthoritativeCatalog,
  retrieveMenuCandidates,
} from '../../supabase/functions/_shared/concierge/menu-retrieval.ts'
import { ConciergeV2MenuRetrievalResultSchema } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

const { Pool } = pg

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

describe('Concierge V2 V08 - Real Database Menu Retrieval Integration', () => {
  let pool: pg.Pool

  beforeAll(async () => {
    pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)
  })

  afterAll(async () => {
    await pool.end()
  })

  it('fetches authoritative catalog directly from PostgreSQL', async () => {
    const catalog = await fetchAuthoritativeCatalog(pool)
    expect(catalog.length).toBeGreaterThan(0)

    const firstItem = catalog[0]
    expect(firstItem.id).toBeDefined()
    expect(firstItem.name).toBeDefined()
    expect(typeof firstItem.price_vnd).toBe('number')
    expect(firstItem.is_available).toBe(true)
  })

  it('retrieves bounded candidates against real database', async () => {
    const result = await retrieveMenuCandidates(pool, {
      query: 'sườn',
      limit: 5,
    })

    expect(() => ConciergeV2MenuRetrievalResultSchema.parse(result)).not.toThrow()
    expect(result.candidates.length).toBeGreaterThan(0)
    expect(result.candidates.length).toBeLessThanOrEqual(5)

    const suonItem = result.candidates.find((c) => c.name.toLowerCase().includes('sườn'))
    expect(suonItem).toBeDefined()
    expect(suonItem!.provenance).toBe('catalog:live_menu')
  })

  it('enforces food-safety filtering on real catalog items', async () => {
    // Search with seafood allergy - should exclude items like Gỏi cuốn tôm thịt or Cá hồi
    const resultWithAllergy = await retrieveMenuCandidates(pool, {
      allergies: ['tôm', 'hải sản'],
      limit: 8,
    })

    expect(resultWithAllergy.candidates.length).toBeGreaterThan(0)
    for (const candidate of resultWithAllergy.candidates) {
      expect(candidate.name.toLowerCase()).not.toContain('tôm sú')
      expect(candidate.name.toLowerCase()).not.toContain('cá hồi')
      expect(candidate.safety_state).not.toBe('contains_allergen')
      expect(candidate.safety_state).not.toBe('conflict')
    }
  })

  it('reflects authoritative price changes immediately with no parallel pricing engine', async () => {
    const catalog = await fetchAuthoritativeCatalog(pool)
    const targetItem = catalog.find((item) => item.pricing_mode === 'fixed') ?? catalog[0]
    const originalPrice = targetItem.price_vnd
    const tempNewPrice = originalPrice + 15000

    try {
      // Temporarily update price in database
      await pool.query('UPDATE public.menu_items SET price_vnd = $1 WHERE id = $2', [
        tempNewPrice,
        targetItem.id,
      ])

      const result = await retrieveMenuCandidates(pool, {
        query: targetItem.name,
        limit: 8,
      })

      const updatedCandidate = result.candidates.find((c) => c.id === targetItem.id)
      expect(updatedCandidate).toBeDefined()
      expect(updatedCandidate!.price_vnd).toBe(tempNewPrice)
    } finally {
      // Restore original price
      await pool.query('UPDATE public.menu_items SET price_vnd = $1 WHERE id = $2', [
        originalPrice,
        targetItem.id,
      ])
    }
  })
})
