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
import { extractExplicitFacts } from '../memory-extractor.ts'
import { createConciergeV2MemoryRepository } from '../memory-repository.ts'
import { retrieveSelectiveMemory } from '../memory-retrieval.ts'
import { normalizeIntent } from '../draft-intent.ts'
import { isRestaurantFactQuestion } from '../restaurant-info.ts'
import type { TurnScope } from './turn-context.ts'
import type { catalogResolver } from './catalog-resolver.ts'

function mergeConstraints(previous: string[], values: string[], allergy = false) {
  const combined = [...new Set([...previous, ...values])]
  return allergy && combined.length > 12 ? [...combined.slice(0, 11), 'unverified-additional-allergens'] : combined.slice(0, 12)
}

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
  const { request, record, pool, next, result, understanding } = scope
  const message = request.message ?? ''
  const text = understanding ? understanding.normalized.searchForm : normalizeIntent(message)
  if (!accountRead) {
    try {
      scope.knowledge = await withToolTimeout(loadKnowledgeSnapshot(pool))
    } catch {
      result.message = 'Mình chưa kiểm tra được thông tin nhà hàng lúc này. Bạn thử lại sau nhé.'
      return null
    }
    try {
      // Phase 5: serving/allergen truth is menu_item_ai_profiles (cached
      // snapshot), not knowledge.ts seeds or KV overlay. Documents/config
      // still come from the knowledge snapshot.
      const menuSnapshot = await withToolTimeout(getMenuSnapshot(pool))
      scope.knowledge.servingProfiles = snapshotServingProfiles(menuSnapshot)
      scope.knowledge.allergenProfiles = snapshotAllergenProfiles(menuSnapshot)
    } catch {
      // Safe degradation: unprofiled items (unknown serving, unverified
      // allergens) rather than seed fallback or turn failure.
      scope.knowledge.servingProfiles = {}
      scope.knowledge.allergenProfiles = {}
    }
  }
  const turnIntent = understanding?.intent ?? null
  const policyQuestion = /\b(?:chinh sach|quy dinh|hoan tien|huy don|doi tra|quy trinh)\b/.test(text)
  const factualQuestion = isRestaurantFactQuestion(message)
  const faq = policyQuestion || turnIntent === 'faq' || (turnIntent === 'other' && factualQuestion)
  // Session constraints are collected even when durable memory is disabled.
  const extracted = extractExplicitFacts(message.replace(/^(?:hôm nay|bữa nay|tối nay)[, ]*/iu, ''))
  for (const fact of extracted.facts) {
    const key = fact.memory_type === 'allergy' ? 'allergies' : fact.memory_type === 'dislike' ? 'dislikes' : 'preferences'
    if (fact.is_correction) next.constraints[key] = next.constraints[key].filter((v) => normalizeIntent(v) !== normalizeIntent(fact.food))
    else next.constraints[key] = mergeConstraints(next.constraints[key], [fact.food], key === 'allergies')
  }
  // Current-party allergies apply even in questions or temporary/third-party statements;
  // those statements still never become durable memory.
  const allergy = /(?:dị ứng|di ung)\s+(?:với\s+)?([^.;!?]+)/iu.exec(message)
  if (allergy && !/(?:không|khong|hết|het|chưa|chua).{0,12}$/iu.test(message.slice(0, allergy.index))) {
    const foods = allergy[1].split(/[,/]|\s+(?:và|and)\s+/iu).map((v) => v.trim().slice(0, 120)).filter(Boolean)
    next.constraints.allergies = mergeConstraints(next.constraints.allergies, foods, true)
  }
  if (!faq && !accountRead && record.actor.authenticated_user_id && process.env.CONCIERGE_MEMORY_DISABLED !== 'true') {
    const repository = createConciergeV2MemoryRepository(pool, { role: 'customer', userId: record.actor.authenticated_user_id })
    const memory = await retrieveSelectiveMemory({ message, actor: record.actor, repository, currentSessionConstraints: [...next.constraints.allergies, ...next.constraints.dislikes] })
    const currentConstraints = new Set((['preferences', 'dislikes', 'allergies'] as const).filter((key) => next.constraints[key].length))
    for (const fact of memory.facts) {
      const key = fact.memory_type === 'allergy' ? 'allergies' : fact.memory_type === 'dislike' ? 'dislikes' : 'preferences'
      if (!currentConstraints.has(key) || key === 'allergies') next.constraints[key] = mergeConstraints(next.constraints[key], [fact.food], key === 'allergies')
    }
  }
  if (!faq && !accountRead) {
    try { scope.catalog = await withToolTimeout(fetchAuthoritativeCatalog(pool)) }
    catch {
      result.message = 'Mình chưa lấy được thông tin thực đơn lúc này. Bạn thử lại sau nhé.'
      return null
    }
  }
  const refersToViewedItem = Boolean(request.page_context?.menu_item_id &&
    /\b(?:mon nay|cai nay|mon dang xem)\b/.test(text) &&
    /\b(?:gom|nguyen lieu|thanh phan|cay|gia|bao nhieu|giao duoc|co gi|lam tu|mo ta)\b/.test(text))
  const viewedItem = refersToViewedItem ? scope.catalog.find((item) => item.id === request.page_context?.menu_item_id) : undefined
  const exactName = turnIntent === 'food' && !refersToViewedItem ? understanding?.entities.namedMenuQuery ?? null : null
  const namedExactItem = exactName ? scope.catalog.find((item) => normalizeIntent(item.name) === exactName) : undefined
  if (refersToViewedItem && !viewedItem) {
    result.message = 'Mình chưa kiểm tra được món bạn đang xem. Bạn thử mở lại thực đơn nhé.'
    return null
  }
  const resolver = resolveCatalog(scope.catalog, next, request.action?.type === 'handoff_draft' ? request.action.order_mode : undefined, scope.knowledge ?? undefined)
  return { faq, factualQuestion, resolver, viewedItem, namedExactItem }
}
