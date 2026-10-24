/**
 * Tiger Agent V3 — Phase 4: Main-context preparation.
 *
 * Loads the bounded context for food/faq/account/draft routes:
 * knowledge snapshot → memory extract/merge → selective memory →
 * authoritative catalog → viewed-item resolution. Each load preserves
 * legacy scoping (account reads skip knowledge/memory/catalog) and
 * legacy failure messages. Early exits set result.message and return
 * null so the orchestrator can finish the turn unchanged.
 */

import { withToolTimeout } from '../tool-registry.ts'
import { loadKnowledgeSnapshot } from '../knowledge-repository.ts'
import { getMenuSnapshot, snapshotAllergenProfiles, snapshotServingProfiles } from '../menu/domain.ts'
import { fetchAuthoritativeCatalog, type MenuItemCatalogExtended } from '../menu-retrieval.ts'
import { normalizeIntent } from '../draft-intent.ts'
import type { TurnScope } from './turn-context.ts'
import type { catalogResolver } from './catalog-resolver.ts'

export interface MainContext {
  faq: boolean
  factualQuestion: boolean
  resolver: ReturnType<typeof catalogResolver>
  viewedItem: MenuItemCatalogExtended | undefined
  namedExactItem: MenuItemCatalogExtended | undefined
}

export async function loadMainContext(
  scope: TurnScope,
  accountRead: boolean,
  resolveCatalog: typeof catalogResolver,
): Promise<MainContext | null> {
  const { request, pool, next, result, understanding } = scope
  const message = request.message ?? ''
  const text = understanding ? understanding.normalized.searchForm : normalizeIntent(message)
  if (!accountRead) {
    try {
      scope.knowledge = await withToolTimeout(loadKnowledgeSnapshot(pool))
    } catch {
      result.warnings.push('EVIDENCE_UNAVAILABLE')
    }
    if (scope.knowledge) {
      try {
        // Phase 5: serving/allergen truth is menu_item_ai_profiles (cached
        // snapshot), not knowledge.ts seeds or KV overlay. Documents/config
        // still come from the knowledge snapshot.
        const mutationOrReview = Boolean(request.draft_operation || request.action ||
          understanding?.draftSignal === 'possible_operation' || understanding?.draftSignal === 'review')
        const menuSnapshot = await withToolTimeout(getMenuSnapshot(pool, mutationOrReview))
        scope.knowledge.menuItems = menuSnapshot.items
        scope.knowledge.servingProfiles = snapshotServingProfiles(menuSnapshot)
        scope.knowledge.allergenProfiles = snapshotAllergenProfiles(menuSnapshot)
      } catch {
        // Safe degradation: unprofiled items (unknown serving, unverified
        // allergens) rather than seed fallback or turn failure.
        scope.knowledge.servingProfiles = {}
        scope.knowledge.allergenProfiles = {}
      }
    }
  }
  const menuRead = understanding?.readNeeds.some(need => need.kind === 'menu') ?? false
  const factualQuestion = understanding?.readNeeds.some(need => need.kind === 'restaurant') ?? false
  const faq = factualQuestion && !menuRead
  if (!faq && !accountRead) {
    try { scope.catalog = await withToolTimeout(fetchAuthoritativeCatalog(pool)) }
    catch {
      scope.catalogUnavailable = true
      if (!factualQuestion) {
        result.warnings.push('EVIDENCE_UNAVAILABLE')
        result.message = 'Mình chưa lấy được thông tin thực đơn lúc này. Bạn thử lại sau nhé.'
        return null
      }
    }
  }
  const refersToViewedItem = Boolean(request.page_context?.menu_item_id &&
    /\b(?:mon nay|cai nay|mon dang xem)\b/.test(text) &&
    /\b(?:gom|nguyen lieu|thanh phan|cay|gia|bao nhieu|giao duoc|co gi|lam tu|mo ta)\b/.test(text))
  const viewedItem = scope.referentItemId ? scope.catalog.find(item => item.id === scope.referentItemId)
    : refersToViewedItem ? scope.catalog.find((item) => item.id === request.page_context?.menu_item_id) : undefined
  const exactName = !refersToViewedItem ? understanding?.entities.namedMenuQuery ?? null : null
  const namedExactItem = exactName ? scope.catalog.find((item) => normalizeIntent(item.name) === exactName) : undefined
  if ((refersToViewedItem || scope.referentItemId) && !viewedItem) {
    result.message = 'Mình chưa kiểm tra được món bạn đang xem. Bạn thử mở lại thực đơn nhé.'
    return null
  }
  const resolver = resolveCatalog(scope.catalog, next, request.action?.type === 'handoff_draft' ? request.action.order_mode : undefined, scope.knowledge ?? undefined)
  return { faq, factualQuestion, resolver, viewedItem, namedExactItem }
}
