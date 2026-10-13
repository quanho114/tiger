import { ConciergeV2HandoffResultSchema, type ConciergeV2HandoffResult } from '@contracts/concierge-v2'
import type { PersistedCartState } from './types'

export function mergeCartHandoff(state: PersistedCartState, raw: ConciergeV2HandoffResult, now = Date.now()): PersistedCartState {
  const handoff = ConciergeV2HandoffResultSchema.parse(raw)
  if (state.appliedHandoffs?.includes(handoff.handoff_id)) return state
  if (Date.parse(handoff.expires_at) <= now) throw new Error('Mâm đã hết hạn. Vui lòng kiểm tra lại giỏ nháp.')
  if ((state.appliedHandoffs?.length ?? 0) >= 500) throw new Error('Giỏ hàng đã đạt giới hạn chuyển món.')
  const items = state.items.map(item => ({ ...item }))
  for (const line of handoff.lines) {
    const existing = items.find(item => item.dishId === line.menu_item_id && (item.note ?? '') === line.note)
    if (existing) {
      if (existing.quantity + line.quantity > 99) throw new Error('Tổng số lượng món vượt quá 99 phần.')
      existing.quantity += line.quantity
    } else items.push({ dishId: line.menu_item_id, quantity: line.quantity, note: line.note,
      dishSnapshot: { id: line.menu_item_id, name: line.name, price: line.price_vnd, image: '/tiger.svg' } })
  }
  return { ...state, updatedAt: now, items, appliedHandoffs: [...(state.appliedHandoffs ?? []), handoff.handoff_id] }
}
