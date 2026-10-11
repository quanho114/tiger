import { describe, expect, it } from 'vitest'
import type pg from 'pg'
import {
  coverageReport,
  findStaleSeedIds,
  profileStatusOf,
  profileWarningsOf,
} from '../../supabase/functions/_shared/concierge/menu/profile-quality.ts'
import { normalizeTasteTags, normalizeTasteTag } from '../../supabase/functions/_shared/concierge/menu/taxonomy.ts'
import { mapDomainItem } from '../../supabase/functions/_shared/concierge/menu/mapper.ts'
import type { MenuItemRow, MenuProfileRow } from '../../supabase/functions/_shared/concierge/menu/mapper.ts'
import { upsertTasteProfile } from '../../supabase/functions/_shared/concierge/menu/taste-repository.ts'
import { upsertAllergenProfile } from '../../supabase/functions/_shared/concierge/menu/profile-repository.ts'
import {
  acceptProfileDraft,
  AiProfileDraftSchema,
  generateProfileDraft,
  listProfileDrafts,
  rejectProfileDraft,
} from '../../supabase/functions/_shared/concierge/menu/ai-draft.ts'
import { invalidateMenuSnapshot } from '../../supabase/functions/_shared/concierge/menu/domain.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { V2_READ_TOOLS } from '../../supabase/functions/_shared/concierge/tool-registry.ts'
import { isForbiddenCustomerTool } from '../../supabase/functions/_shared/concierge/policy/confirmation-policy.ts'
import type { MenuDomainItem } from '../../supabase/functions/_shared/concierge/menu/types.ts'

const ITEM_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ITEM_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const itemRow = (id: string, name: string): MenuItemRow => ({
  id, category_id: null, category_name: 'Gà', name, description: null,
  price_vnd: 100000, pricing_mode: 'fixed', price_min: null, price_max: null,
  is_available: true, allow_dine_in: true, allow_delivery: true,
  serving_size: null, pairing_note: null, spice_level: null, tags: [],
  is_signature: false, is_bestseller: false,
})

const readyProfile = (id: string): MenuProfileRow => ({
  menu_item_id: id, serving_unit: 'đĩa', serving_description: null,
  people_min: 2, people_max: 3, meal_role: 'main_protein', meal_context: 'shared',
  protein_score: 0.8, carb_score: 0.1, vegetable_score: 0.2, soup_score: 0,
  spice_level: 1, richness_level: null, taste_tags: ['savory'], dietary_tags: [],
  pairing_item_ids: [], allergens: { peanuts: 'unknown' }, allergen_source: 'demo_estimate',
  allergen_verified: false, allergen_verified_at: null, allergen_verified_by: null,
  kitchen_notes: '', confidence: 'restaurant_defined', provenance: 'test',
  serving_source: 'restaurant_admin', taste_source: 'restaurant_admin',
})

const readyItem = (id: string, name: string): MenuDomainItem =>
  mapDomainItem(itemRow(id, name), readyProfile(id))

describe('Phase 5.5 — profile completeness', () => {
  it('derives EMPTY / PARTIAL / READY / KITCHEN_VERIFIED', () => {
    const empty = mapDomainItem(itemRow(ITEM_A, 'Trống'), null)
    expect(profileStatusOf(empty)).toBe('EMPTY')
    const partial = mapDomainItem(itemRow(ITEM_A, 'Thiếu'), {
      ...readyProfile(ITEM_A), meal_role: null, taste_tags: [], spice_level: null,
    })
    expect(profileStatusOf(partial)).toBe('PARTIAL')
    expect(profileStatusOf(readyItem(ITEM_A, 'Đủ'))).toBe('READY_FOR_RECOMMENDATION')
    const verified = mapDomainItem(itemRow(ITEM_A, 'Bếp'), {
      ...readyProfile(ITEM_A), allergen_verified: true, allergen_source: 'kitchen_audited',
    })
    expect(profileStatusOf(verified)).toBe('KITCHEN_VERIFIED')
    // Readiness and verification are independent: ready but unverified stays READY.
    expect(profileStatusOf(readyItem(ITEM_A, 'Đủ'))).not.toBe('KITCHEN_VERIFIED')
  })

  it('emits deterministic warnings', () => {
    const empty = mapDomainItem(itemRow(ITEM_A, 'Trống'), null)
    expect(profileWarningsOf(empty)).toEqual(
      expect.arrayContaining(['MISSING_SERVING_PROFILE', 'MISSING_MEAL_ROLE', 'MISSING_TASTE_METADATA', 'ALLERGEN_UNKNOWN']))
    const ready = readyItem(ITEM_A, 'Đủ')
    expect(profileWarningsOf(ready)).toEqual(['ALLERGEN_UNVERIFIED'])
    const badPair = mapDomainItem(itemRow(ITEM_A, 'Ghép'), {
      ...readyProfile(ITEM_A), pairing_item_ids: ['00000000-0000-4000-8000-000000000000'],
    })
    expect(profileWarningsOf(badPair, new Set([ITEM_A]))).toContain('PAIRING_REFERENCE_INVALID')
  })

  it('reports coverage and stale seeds', () => {
    const snapshot = {
      version: 'v', loadedAt: new Date().toISOString(),
      items: [mapDomainItem(itemRow(ITEM_A, 'Trống'), null), readyItem(ITEM_B, 'Đủ')],
    }
    const report = coverageReport(snapshot)
    expect(report).toMatchObject({ totalLive: 2, empty: 1, ready: 1, kitchenVerified: 0 })
    expect(report.mealRolePct).toBe(50)
    expect(findStaleSeedIds(new Set([ITEM_A]), ['seed-x', ITEM_A])).toEqual(['seed-x'])
  })
})

describe('Phase 5.5 — taste taxonomy', () => {
  it('normalizes synonyms, rejects unknown', () => {
    expect(normalizeTasteTag('đậm đà')).toBe('savory')
    expect(normalizeTasteTag('SAVORY')).toBe('savory')
    expect(normalizeTasteTag('vị lạ')).toBeNull()
    const { tags, rejected } = normalizeTasteTags(['cay', 'umami-xyz', 'cay', 42])
    expect(tags).toEqual(['spicy'])
    expect(rejected).toEqual(['umami-xyz'])
  })
})

/** Programmable mock pool routing by SQL shape. */
function governancePool(opts: {
  menuIds?: string[]
  profileRow?: Record<string, unknown> | null
  drafts?: Record<string, unknown>[]
  inserts?: string[]
}) {
  const drafts = opts.drafts ?? []
  const inserts = opts.inserts ?? []
  return {
    inserts,
    query: async (sql: string, params?: unknown[]) => {
      if (sql.includes('menu_item_ai_profile_drafts')) {
        if (sql.startsWith('SELECT')) return { rows: drafts }
        if (sql.startsWith('INSERT INTO public.menu_item_ai_profile_drafts')) {
          const row = {
            id: `d${drafts.length + 1}`,
            menu_item_id: params?.[0],
            payload: typeof params?.[1] === 'string' ? JSON.parse(params[1] as string) : params?.[1],
            provider: params?.[2] ?? null,
            model: params?.[3] ?? null,
            created_by: params?.[4] ?? null,
            status: 'pending',
            created_at: new Date().toISOString(),
          }
          drafts.push(row)
          return { rows: [row] }
        }
        if (sql.startsWith('UPDATE public.menu_item_ai_profile_drafts')) {
          const row = drafts[0]
          if (row && (row as Record<string, unknown>).status === 'pending' && sql.includes('RETURNING')) {
            if (sql.includes("status = 'accepted'") || sql.includes("status = 'rejected'")) {
              ;(row as Record<string, unknown>).status = sql.includes('accepted') ? 'accepted' : 'rejected'
              return { rows: [row] }
            }
            return { rows: [row] }
          }
          const selected = drafts.filter((d) => (d as Record<string, unknown>).status === 'pending')
          return { rows: selected.slice(0, 1) }
        }
        return { rows: drafts }
      }
      if (sql.includes('menu_item_ai_profiles')) {
        if (sql.startsWith('SELECT')) {
          return { rows: opts.profileRow ? [opts.profileRow] : [] }
        }
        inserts.push(sql)
        return { rows: [] }
      }
      if (sql.includes('FROM public.menu_items')) {
        if (sql.includes('ANY')) {
          const ids = (params?.[0] as string[]) ?? []
          return { rows: (opts.menuIds ?? []).filter((id) => ids.includes(id)).map((id) => ({ id })) }
        }
        if (sql.includes('LEFT JOIN')) {
          return { rows: (opts.menuIds ?? []).map((id) => ({ id, name: `Dish ${id.slice(0, 4)}` })) }
        }
        const id = params?.[0] as string
        const found = (opts.menuIds ?? []).includes(id)
        return { rows: found ? [{ id }] : [] }
      }
      if (sql.includes('concierge_llm_config')) {
        return { rows: [{ provider: 'test', model: 'test-model' }] }
      }
      if (sql.includes('audit_logs')) return { rows: [] }
      return { rows: [] }
    },
  } as unknown as pg.Pool & { inserts: string[] }
}

describe('Phase 5.5 — taste writes and verification gate', () => {
  it('rejects unknown taste tags and bad ranges, accepts valid taste', async () => {
    const pool = governancePool({ menuIds: [ITEM_A] })
    await expect(upsertTasteProfile(pool, ITEM_A, { taste_tags: ['umami-xyz'] }, 'admin'))
      .rejects.toThrowError(/Thẻ vị không hợp lệ/)
    await expect(upsertTasteProfile(pool, ITEM_A, { spice_level: 5 }, 'admin'))
      .rejects.toThrowError(/Mức cay/)
    await expect(upsertTasteProfile(pool, 'not-a-uuid', { spice_level: 1 }, 'admin'))
      .rejects.toThrowError(/UUID/)
    const updated = await upsertTasteProfile(pool, ITEM_A, {
      spice_level: 1, taste_tags: ['cay', 'đậm đà'], pairing_item_ids: [ITEM_B],
    }, 'admin')
    expect((updated.taste_source as string)).toBe('restaurant_admin')
    // ITEM_B is well-formed but not on this mock menu: dropped gracefully.
    expect(updated.pairing_item_ids).toEqual([])
    expect(pool.inserts.length).toBe(1)
  })

  it('drops unavailable pairing IDs gracefully', async () => {
    const pool = governancePool({ menuIds: [ITEM_A, ITEM_B] })
    const updated = await upsertTasteProfile(pool, ITEM_A, {
      pairing_item_ids: [ITEM_B, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
    }, 'admin')
    expect(updated.pairing_item_ids).toEqual([ITEM_B])
  })

  it('generic allergen updates can never verify; explicit verify is gated', async () => {
    const pool = governancePool({ menuIds: [ITEM_A], profileRow: null })
    const updated = await upsertAllergenProfile(pool, ITEM_A, {
      allergens: { peanuts: 'contains' },
    }, 'admin')
    expect(updated.verified_by_kitchen).toBe(false)
    await expect(upsertAllergenProfile(pool, ITEM_A, {
      verified_by_kitchen: true, kitchen_notes: '',
    }, 'admin')).rejects.toThrowError(/Xác nhận an toàn bếp/)
  })
})

describe('Phase 5.5 — AI drafts (admin-only, never auto-verify)', () => {
  const cannedLlm = (payload: unknown) =>
    new ConciergeLlmOrchestrator({
      customAdapter: async () => ({
        reply_text: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``,
        tool_calls: [],
        tokens_used: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    })

  it('validates structured output and stores drafts without touching authority', async () => {
    const pool = governancePool({ menuIds: [ITEM_A] })
    const draft = await generateProfileDraft(pool, ITEM_A, 'admin', cannedLlm({
      meal_role: 'main_protein', people_min: 2, people_max: 3,
      taste_tags: ['savory'], possible_allergens_for_review: ['peanuts'],
    }))
    expect(draft.status).toBe('pending')
    expect(draft.payload.meal_role).toBe('main_protein')
    const drafts = await listProfileDrafts(pool, ITEM_A)
    expect(drafts).toHaveLength(1)
  })

  it('rejects malformed model output without persisting', async () => {
    const pool = governancePool({ menuIds: [ITEM_A] })
    await expect(generateProfileDraft(pool, ITEM_A, 'admin', cannedLlm({ meal_role: 'not-a-role' })))
      .rejects.toThrow()
    expect(await listProfileDrafts(pool, ITEM_A)).toHaveLength(0)
  })

  it('accept applies safe fields with ai_draft source; allergens stay unverified', async () => {
    const payload = AiProfileDraftSchema.parse({
      meal_role: 'side', people_min: 1, people_max: 2,
      taste_tags: ['fresh'], pairing_names: [], possible_allergens_for_review: ['soy'],
    })
    const pool = governancePool({
      menuIds: [ITEM_A],
      drafts: [{ id: 'd1', menu_item_id: ITEM_A, payload, status: 'pending' }],
    })
    const result = await acceptProfileDraft(pool, 'd1', 'admin')
    expect(result).toMatchObject({ appliedServing: true, appliedTaste: true })
    expect(result.allergenCandidatesNoted).toEqual(['soy'])
    // No authoritative allergen verification path was touched.
    expect(pool.inserts.filter((sql) => sql.includes('allergen_verified') && !sql.includes('audit'))).toHaveLength(0)
    await rejectProfileDraft(pool, 'd1', 'admin')
  })

  it('AI draft creation does not invalidate the authoritative snapshot', async () => {
    invalidateMenuSnapshot()
    let snapshotCalls = 0
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('menu_item_ai_profiles p')) {
          snapshotCalls++
          return { rows: [{ id: ITEM_A, name: 'A' }] }
        }
        if (sql.includes('FROM public.menu_items')) return { rows: [{ id: ITEM_A }] }
        if (sql.includes('concierge_llm_config')) return { rows: [{ provider: 't', model: 'm' }] }
        if (sql.includes('menu_item_ai_profile_drafts')) {
          if (sql.startsWith('INSERT')) return { rows: [{ id: 'd9', created_at: new Date().toISOString() }] }
          return { rows: [] }
        }
        return { rows: [] }
      },
    } as unknown as pg.Pool
    await generateProfileDraft(pool, ITEM_A, 'admin', cannedLlm({ taste_tags: ['fresh'] }))
    expect(snapshotCalls).toBe(0)
  })
})

describe('Phase 5.5 — customer agent isolation', () => {
  it('no profile governance tool is model-visible', () => {
    const modelVisible = new Set(V2_READ_TOOLS.map((t) => t.name))
    for (const name of ['generate_menu_profile', 'update_menu_profile', 'verify_allergen',
      'menu_profile_generate', 'menu_profile_verify']) {
      expect(isForbiddenCustomerTool(name)).toBe(true)
      expect(modelVisible.has(name)).toBe(false)
    }
  })
})
