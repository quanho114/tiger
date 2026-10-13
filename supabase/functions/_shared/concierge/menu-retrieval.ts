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
} from '../contracts/concierge-v2.ts'
import { ALLERGEN_PROFILES, SERVING_PROFILES } from './knowledge.ts'
import type { KnowledgeSnapshot } from './knowledge.ts'
import { evaluateFoodSafety, sanitizeCatalogText } from './food-safety.ts'
import { normalizeIntent } from './draft-intent.ts'

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
): Promise<ConciergeV2MenuRetrievalResult> {
  const rawQuery = ConciergeV2MenuRetrievalQuerySchema.parse(input)
  const catalog = Array.isArray(poolOrCatalog) ? poolOrCatalog : await fetchAuthoritativeCatalog(poolOrCatalog)

  const limit = Math.max(1, Math.min(rawQuery.limit || 8, 8))
  const userAllergies = rawQuery.allergies || []
  const userDislikes = (rawQuery.dislikes || []).map(normalizeIntent).filter(Boolean)
  const queryString = (rawQuery.query || '').toLowerCase().trim()

  const relaxedFilters: string[] = []
  let globalStaffConfirmationRequired = false
  let allergyWarning: string | null = null

  // 1. Filter by availability and ordering mode
  let candidates = catalog.filter((item) => {
    if (!item.is_available) return false
    if (item.pricing_mode && item.pricing_mode !== 'fixed') return false
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

  // 4. Filter by spice level if requested
  if (rawQuery.max_spice_level !== undefined && rawQuery.max_spice_level !== null) {
    candidates = candidates.filter((item) => {
      if (item.spice_level === null || item.spice_level === undefined) return false
      return item.spice_level <= rawQuery.max_spice_level!
    })
  }

  // 5. Filter by budget if requested
  if (rawQuery.max_budget_vnd !== undefined && rawQuery.max_budget_vnd !== null) {
    candidates = candidates.filter((item) => item.price_vnd <= rawQuery.max_budget_vnd!)
  }

  // 6. Filter by customer dislikes (text check against name and tags)
  if (userDislikes.length > 0) {
    candidates = candidates.filter((item) => {
      const itemText = normalizeIntent(`${item.name} ${(item.tags || []).join(' ')}`)
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
      allergenProfile
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
    return safety.safety_state !== 'contains_allergen' && safety.safety_state !== 'conflict'
  })

  if (userAllergies.length > 0) {
    if (safeItems.length === 0 && evaluatedItems.length > 0) {
      allergyWarning = `Tất cả các món phù hợp với tiêu chí ban đầu đều chứa hoặc có thể chứa dị nguyên: ${userAllergies.join(', ')}.`
    } else if (globalStaffConfirmationRequired) {
      allergyWarning = `Một số món cần nhân viên nhà hàng xác nhận lại trực tiếp với bếp trưởng để đảm bảo không có nguy cơ nhiễm chéo.`
    }
  }

  // 8. Text Match & Scoring
  interface ScoredCandidate {
    item: MenuItemCatalogExtended
    safety: ReturnType<typeof evaluateFoodSafety>
    servingProfile: (typeof SERVING_PROFILES)[string] | undefined
    score: number
  }

  const queryTokens = queryString
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(
      (w) =>
        ![
          'quán',
          'có',
          'không',
          'gì',
          'thế',
          'nào',
          'các',
          'cho',
          'mình',
          'bạn',
          'ở',
          'tại',
          'nhà',
          'hàng',
          'món',
        ].includes(w)
    )

  const scored: ScoredCandidate[] = safeItems.map(({ item, safety, servingProfile }) => {
    let score = 0
    const nameLower = item.name.toLowerCase()
    const descLower = (item.description || '').toLowerCase()
    const categoryLower = (item.category_name || '').toLowerCase()
    const tagsLower = (item.tags || []).join(' ').toLowerCase()

    if (queryString) {
      if (nameLower === queryString) score += 150
      else if (nameLower.startsWith(queryString)) score += 100
      else if (nameLower.includes(queryString)) score += 60

      if (categoryLower.includes(queryString)) score += 30
      if (tagsLower.includes(queryString)) score += 25
      if (descLower.includes(queryString)) score += 15

      for (const token of queryTokens) {
        if (token.length >= 2) {
          if (nameLower.includes(token)) score += 20
          if (tagsLower.includes(token)) score += 10
        }
      }
    } else {
      // Default score based on popularity/signature
      score = 50
    }

    if (item.is_signature) score += 20
    if (safety.safety_state === 'verified_safe') score += 10

    return {
      item,
      safety,
      servingProfile,
      score,
    }
  })

  // 9. Sort by score descending, then signature, then price ascending, then id for stability
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (Boolean(b.item.is_signature) !== Boolean(a.item.is_signature)) {
      return b.item.is_signature ? 1 : -1
    }
    if (a.item.price_vnd !== b.item.price_vnd) return a.item.price_vnd - b.item.price_vnd
    return a.item.id.localeCompare(b.item.id)
  })

  const totalMatching = scored.length
  const topCandidates = rawQuery.diversify_categories ? (() => {
    const distinct: ScoredCandidate[] = []
    const seenCategories = new Set<string>()
    for (const entry of scored) {
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
  return ConciergeV2MenuRetrievalResultSchema.parse(result)
}
