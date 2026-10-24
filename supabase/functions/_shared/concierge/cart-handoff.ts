import { ConciergeV2HandoffResultSchema, type ConciergeV2SessionMutableState } from '../contracts/concierge-v2.ts'
import type { CatalogItemDetails } from './draft-cart.ts'
import { withinMenuBudget } from './budget.ts'

export function prepareCartHandoff(
  state: ConciergeV2SessionMutableState,
  request: { draft_id: string; draft_version: number },
  resolve: (id: string) => CatalogItemDetails | null,
  now = Date.now(),
) {
  const draft = state.draft
  if (!draft || draft.draft_id !== request.draft_id) throw new Error('INVALID_HANDOFF')
  if (state.handoff && state.handoff.draft_id === draft.draft_id && draft.exported_version) {
    if (Date.parse(state.handoff.expires_at) <= now) throw new Error('INVALID_HANDOFF')
    return { next: state, handoff: { ...state.handoff, replay: true } }
  }
  const subtotal = draft.items.reduce((sum, line) => sum + line.unit_price_vnd * line.quantity, 0)
  if (!withinMenuBudget(subtotal, state.constraints.budget_vnd)) throw new Error('INVALID_HANDOFF')
  if (draft.version !== request.draft_version || draft.review_state !== 'ready_for_review' ||
      draft.blocked_items.length || !draft.items.length || draft.exported_version) throw new Error('INVALID_HANDOFF')
  const lines = draft.items.map(line => {
    const item = resolve(line.menu_item_id)
    if (!item?.is_available) throw new Error('ITEM_UNAVAILABLE')
    if (item.price_vnd !== line.unit_price_vnd) throw new Error('PRICE_CHANGED')
    if (state.constraints.allergies.length && item.safety_state !== 'verified_safe') throw new Error('ALLERGY_UNVERIFIED')
    return { menu_item_id: item.id, name: item.name, quantity: line.quantity, note: line.note,
      price_vnd: item.price_vnd, availability: 'available' as const, price_status: 'current' as const,
      allergy_status: state.constraints.allergies.length ? 'verified_safe' as const : 'not_requested' as const }
  })
  const handoff = ConciergeV2HandoffResultSchema.parse({ handoff_id: `handoff_${crypto.randomUUID().replace(/-/g, '')}`,
    draft_id: draft.draft_id, draft_version: draft.version, expires_at: new Date(now + 5 * 60_000).toISOString(), replay: false, lines })
  return { next: { ...state, handoff, pending_items: [], pending_suggestion_ids: [],
    draft: { ...draft, review_state: 'exported' as const, exported_version: draft.version, version: draft.version + 1 } }, handoff }
}
