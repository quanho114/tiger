/**
 * Tiger Agent V3 — Phase 4: Catalog resolver.
 *
 * Server-authoritative item resolution: availability × pricing mode ×
 * order mode × food safety. Moved verbatim from orchestrator.ts so
 * handlers share one implementation. Re-exported from orchestrator.ts
 * for existing import paths.
 */

import type { ConciergeV2SessionMutableState } from '../../contracts/concierge-v2.ts'
import type { MenuItemCatalogExtended } from '../menu-retrieval.ts'
import { evaluateFoodSafety } from '../food-safety.ts'
import type { KnowledgeSnapshot } from '../knowledge.ts'

export function catalogResolver(catalog: MenuItemCatalogExtended[], state: ConciergeV2SessionMutableState, mode = state.constraints.order_mode,
  knowledge?: Pick<KnowledgeSnapshot, 'allergenProfiles'>) {
  return (id: string) => {
    const item = catalog.find((i) => i.id === id)
    if (!item) return null
    return { ...item, is_available: item.is_available && (item.pricing_mode ?? 'fixed') === 'fixed' &&
      (mode === 'delivery' ? item.allow_delivery !== false : mode === 'dine_in' ? item.allow_dine_in !== false : true),
      ...evaluateFoodSafety(item, state.constraints.allergies, (knowledge?.allergenProfiles ?? {})[id], { ingredientOnly: true }) }
  }
}
