/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: orchestrator.ts, tests/server/concierge-menu-retrieval-contract.test.ts, tests/integration/concierge-menu-retrieval.test.ts
 * - Affected API: retrieveMenuCandidates, fetchAuthoritativeCatalog, MenuItemCatalogExtended
 * - Data Schemas: ConciergeV2MenuRetrievalQuerySchema, ConciergeV2MenuRetrievalResultSchema, ConciergeV2MenuCandidateSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V08: Verified menu and food-safety retrieval", "3. Filter available/mode/budget/hard constraints first, rank next, return 5-8 compact candidates with stable IDs, current prices and provenance.", "4. Return explicit unknown/unverified/conflict safety states. Allergy-related recommendation blocks unsafe or unverified claims and suggests staff confirmation.", "5. Keep price/availability authoritative and shared with existing quote/cart validation. Do not add a parallel pricing engine."
 */

import type pg from 'pg'
import type { z } from 'zod'
import {
  type ConciergeV2MenuCandidate,
  ConciergeV2MenuRetrievalQuerySchema,
  type ConciergeV2MenuRetrievalResult,
  ConciergeV2MenuRetrievalResultSchema,
  ConciergeV2MenuCandidateSchema,
} from '../contracts/concierge-v2.ts'
import { ALLERGEN_PROFILES, SERVING_PROFILES } from './knowledge.ts'
import type { KnowledgeSnapshot } from './knowledge.ts'
import { evaluateFoodSafety, sanitizeCatalogText } from './food-safety.ts'
import { menuTextScore, normalizeMenuSearch, PREFERENCE_WEIGHTS, type RetrievalPreference } from './menu-search.ts'

export interface MenuItemCatalogExtended {
  id: string
  name: string
  price_vnd: number
  pricing_mode?: 'fixed' | 'range' | 'market' | 'unknown'
  price_min?: number | null
  price_max?: number | null
  is_available: boolean
  published?: boolean
  category_id?: string
  category_name?: string
  description?: string | null
  image_url?: string | null
  image_path?: string | null
  serving_size?: string | null
  spice_level?: number | null
  is_signature?: boolean
  is_bestseller?: boolean
  is_new?: boolean
  allow_dine_in?: boolean
  allow_delivery?: boolean
  tags?: string[]
}

/**
 * Fetches current authoritative menu items from PostgreSQL.
 * Strict rules:
 * - Authoritative pricing from public.menu_items
 * - Only published items
 * - No parallel pricing engine
 */
export async function fetchAuthoritativeCatalog(pool: pg.Pool): Promise<MenuItemCatalogExtended[]> {
  const query = `
    SELECT
      m.id,
      m.name,
      m.description,
      m.price_vnd,
      m.pricing_mode,
      m.price_min,
      m.price_max,
      m.category_id,
      c.name as category_name,
      m.image_path,
      m.available as is_available,
      m.allow_dine_in,
      m.allow_delivery,
      m.serving_size,
      m.spice_level,
      m.is_signature,
      m.is_bestseller,
      m.is_new,
      m.tags
    FROM public.menu_items m
    LEFT JOIN public.categories c ON m.category_id = c.id
    WHERE m.published = true
    ORDER BY c.sort_order ASC NULLS LAST, m.featured_rank ASC NULLS LAST, m.name ASC
  `
  const result = await pool.query(query)
  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    price_vnd: Number(row.price_vnd),
    pricing_mode: row.pricing_mode ?? 'fixed',
    price_min: row.price_min == null ? null : Number(row.price_min),
    price_max: row.price_max == null ? null : Number(row.price_max),
    is_available: Boolean(row.is_available),
    published: true,
    category_id: row.category_id ? String(row.category_id) : undefined,
    category_name: row.category_name ? String(row.category_name) : undefined,
    description: row.description ? String(row.description) : null,
    image_url: row.image_path ? String(row.image_path) : null,
    serving_size: row.serving_size ? String(row.serving_size) : null,
    spice_level: row.spice_level !== null && row.spice_level !== undefined ? Number(row.spice_level) : null,
    is_signature: Boolean(row.is_signature),
    is_bestseller: typeof row.is_bestseller === 'boolean' ? row.is_bestseller : undefined,
    is_new: typeof row.is_new === 'boolean' ? row.is_new : undefined,
    allow_dine_in: row.allow_dine_in !== false,
    allow_delivery: row.allow_delivery !== false,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
  }))
}

/**
 * Retrieves 5-8 bounded menu candidates with authoritative pricing,
 * food-safety evaluations, and hard constraint filtering.
 */
export async function retrieveMenuCandidates(
  poolOrCatalog: pg.Pool | MenuItemCatalogExtended[],
  input: z.input<typeof ConciergeV2MenuRetrievalQuerySchema>,
  knowledge?: Pick<KnowledgeSnapshot, 'allergenProfiles' | 'servingProfiles'>,
  preferences: RetrievalPreference[] = [],
  internalLimit?: number,
): Promise<ConciergeV2MenuRetrievalResult> {
  const rawQuery = ConciergeV2MenuRetrievalQuerySchema.parse(input)
  const catalog = Array.isArray(poolOrCatalog) ? poolOrCatalog : await fetchAuthoritativeCatalog(poolOrCatalog)

  const limit = Math.max(1, Math.min(internalLimit ?? rawQuery.limit ?? 8, internalLimit === undefined ? 8 : 48))
  const userAllergies = rawQuery.allergies || []
  const userDislikes = (rawQuery.dislikes || []).map(normalizeMenuSearch).filter(Boolean)
  const queryString = rawQuery.query || ''

  const relaxedFilters: string[] = []
  let globalStaffConfirmationRequired = false
  let allergyWarning: string | null = null

  // 1. Filter by availability and ordering mode
  let candidates = catalog.filter((item) => {
    if (!item.is_available || item.published === false || !Number.isSafeInteger(item.price_vnd) || item.price_vnd < 0) return false
    const policy = rawQuery.price_policy ?? 'orderable'
    if (policy === 'orderable' && item.pricing_mode && item.pricing_mode !== 'fixed') return false
    if (policy === 'bounded' && item.pricing_mode && item.pricing_mode !== 'fixed' &&
        !(item.pricing_mode === 'range' && Number.isSafeInteger(item.price_min) && Number.isSafeInteger(item.price_max) &&
          item.price_min! >= 0 && item.price_max! >= item.price_min!)) return false
    if (rawQuery.order_mode === 'dine_in' && item.allow_dine_in === false) return false
    if (rawQuery.order_mode === 'delivery' && item.allow_delivery === false) return false
    return true
  })

  // 2. Filter by category if requested
  if (rawQuery.category_id) {
    candidates = candidates.filter((item) => item.category_id === rawQuery.category_id)
  }

  // 3. Filter by signature if requested
  if (rawQuery.is_signature) {
    candidates = candidates.filter((item) => item.is_signature)
  }

  if (rawQuery.is_bestseller) candidates = candidates.filter(item => item.is_bestseller === true)
  if (rawQuery.is_new) candidates = candidates.filter(item => item.is_new === true)

  // 4. Filter by spice level if requested
  if (rawQuery.max_spice_level !== undefined && rawQuery.max_spice_level !== null) {
    candidates = candidates.filter((item) => {
      if (item.spice_level === null || item.spice_level === undefined) return false
      return item.spice_level <= rawQuery.max_spice_level!
    })
  }

  // 5. Filter by budget if requested
  if (rawQuery.max_budget_vnd !== undefined && rawQuery.max_budget_vnd !== null) {
    candidates = candidates.filter((item) => {
      const maximum = item.pricing_mode === 'range' ? item.price_max :
        !item.pricing_mode || item.pricing_mode === 'fixed' ? item.price_vnd : null
      return maximum != null && Number.isSafeInteger(maximum) && maximum <= rawQuery.max_budget_vnd!
    })
  }

  // 6. Filter by customer dislikes (text check against name and tags)
  if (userDislikes.length > 0) {
    candidates = candidates.filter((item) => {
      const itemText = normalizeMenuSearch(`${item.name} ${(item.tags || []).join(' ')}`)
      return !userDislikes.some((dislike) => itemText.includes(dislike))
    })
  }

  // 7. Safety Evaluation and Hard Allergy Filtering
  // NEVER relax allergy safety filters — fail-closed!
  const evaluatedItems = candidates.map((item) => {
    const allergenProfile = (knowledge?.allergenProfiles ?? ALLERGEN_PROFILES)[item.id]
    const servingProfile = (knowledge?.servingProfiles ?? SERVING_PROFILES)[item.id]

    const safety = evaluateFoodSafety(
      {
        id: item.id,
        name: item.name,
        description: item.description,
        tags: item.tags,
      },
      userAllergies,
      allergenProfile, { ingredientOnly: true },
    )

    if (safety.staff_confirmation_required) {
      globalStaffConfirmationRequired = true
    }

    return {
      item,
      safety,
      servingProfile,
    }
  })

  // Hard filter: strictly remove items with contains_allergen or conflict
  const safeItems = evaluatedItems.filter(({ safety }) => {
    return userAllergies.length ? safety.safety_state === 'verified_safe'
      : safety.safety_state !== 'contains_allergen' && safety.safety_state !== 'conflict'
  })

  if (userAllergies.length > 0) {
    if (safeItems.length === 0 && evaluatedItems.length > 0) {
      allergyWarning = 'Chưa có món đáp ứng điều kiện dị ứng với dữ liệu thành phần được xác minh đầy đủ.'
    } else if (globalStaffConfirmationRequired) {
      allergyWarning = 'Một số món đã bị loại do dữ liệu thành phần chưa đủ xác minh hoặc không phù hợp với dị ứng đã nêu.'
    }
  }

  // 8. Text Match & Scoring
  interface ScoredCandidate {
    item: MenuItemCatalogExtended
    safety: ReturnType<typeof evaluateFoodSafety>
    servingProfile: (typeof SERVING_PROFILES)[string] | undefined
    score: number
    exact: boolean
  }

  const scored: ScoredCandidate[] = safeItems.map(({ item, safety, servingProfile }) => {
    const text = menuTextScore(queryString, item.name, (item.tags ?? []).join(' '), item.category_name ?? '', item.description ?? '')
    let score = text.score
    const preferenceText = normalizeMenuSearch(`${item.name} ${(item.tags ?? []).join(' ')} ${item.category_name ?? ''}`)
    const uniquePreferences = new Map<string, number>()
    for (const preference of preferences.slice(0, 12)) {
      const key = normalizeMenuSearch(preference.text)
      if (key && (` ${preferenceText} `.includes(` ${key} `) || preference.text === item.id))
        uniquePreferences.set(key, Math.max(uniquePreferences.get(key) ?? 0, PREFERENCE_WEIGHTS[preference.source]))
    }
    score += Math.min(18, [...uniquePreferences.values()].reduce((sum, weight) => sum + weight, 0))

    if (item.is_signature) score += 20
    if (safety.safety_state === 'verified_safe') score += 10

    return {
      item,
      safety,
      servingProfile,
      score,
      exact: text.exact,
    }
  })

  // 9. Sort by score descending, then signature, then price ascending, then id for stability
  scored.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    if (Boolean(b.item.is_signature) !== Boolean(a.item.is_signature)) {
      return b.item.is_signature ? 1 : -1
    }
    // Price is a filter/constraint, not an automatic cheapness preference.
    return a.item.id.localeCompare(b.item.id)
  })

  const totalMatching = scored.length
  const topCandidates = rawQuery.diversify_categories ? (() => {
    const distinct: ScoredCandidate[] = []
    const seenCategories = new Set<string>()
    for (const entry of scored.filter(entry => entry.exact).slice(0, limit)) {
      distinct.push(entry)
      seenCategories.add(entry.item.category_id ?? entry.item.category_name ?? entry.item.id)
    }
    for (const entry of scored) {
      if (distinct.length === limit) break
      const category = entry.item.category_id ?? entry.item.category_name ?? entry.item.id
      if (seenCategories.has(category)) continue
      seenCategories.add(category)
      distinct.push(entry)
      if (distinct.length === limit) break
    }
    for (const entry of scored) {
      if (distinct.length === limit) break
      if (!distinct.includes(entry)) distinct.push(entry)
    }
    return distinct
  })() : scored.slice(0, limit)

  // 10. Map to bounded DTOs conforming to ConciergeV2MenuCandidateSchema
  const resultCandidates: ConciergeV2MenuCandidate[] = topCandidates.map(({ item, safety, servingProfile }) => ({
    id: item.id,
    name: sanitizeCatalogText(item.name),
    price_vnd: Math.round(item.price_vnd),
    pricing_mode: item.pricing_mode ?? 'fixed',
    price_min: item.price_min ?? null,
    price_max: item.price_max ?? null,
    is_bestseller: item.is_bestseller,
    is_new: item.is_new,
    category_id: item.category_id,
    category_name: item.category_name ? sanitizeCatalogText(item.category_name) : undefined,
    image_url: item.image_url ? sanitizeCatalogText(item.image_url) : null,
    serving_size: item.serving_size ? sanitizeCatalogText(item.serving_size) : servingProfile?.pieces_or_weight || null,
    meal_role: servingProfile?.meal_role,
    spice_level: item.spice_level ?? null,
    is_signature: Boolean(item.is_signature),
    is_available: Boolean(item.is_available),
    safety_state: safety.safety_state,
    safety_notes: safety.notes,
    provenance: 'catalog:live_menu',
    tags: (item.tags || []).map(sanitizeCatalogText).slice(0, 10),
  }))

  const result: ConciergeV2MenuRetrievalResult = {
    candidates: resultCandidates,
    total_matching: totalMatching,
    relaxed_filters: relaxedFilters.slice(0, 5),
    staff_confirmation_required: globalStaffConfirmationRequired,
    allergy_warning: allergyWarning,
  }

  // Validate with Zod before returning to guarantee contract integrity
  if (internalLimit !== undefined) {
    return { ...result, candidates: result.candidates.map(item => ConciergeV2MenuCandidateSchema.parse(item)) }
  }
  return ConciergeV2MenuRetrievalResultSchema.parse(result)
}
