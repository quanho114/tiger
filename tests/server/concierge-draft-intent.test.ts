import { it, expect } from 'vitest'
import { resolveDraftIntent } from '../../supabase/functions/_shared/concierge/draft-intent.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionMutableState } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
const id = '11111111-1111-4111-8111-111111111111'
const state: ConciergeV2SessionMutableState = { ...emptyConciergeSession(), pending_items: [{ suggestion_id: id, menu_item_id: id, name: 'Bò nướng', quantity: 1, state_version: 2 }] }
it.each(['gợi ý bò nướng', 'nghe ngon', 'để xem', 'không lấy bò nướng', 'chưa chốt'])('never mutates from %s', message => {
  expect(resolveDraftIntent(message, state, [{ id, name: 'Bò nướng' }]).kind).not.toBe('operations')
})
it('binds contextual OK only to exactly one pending selection', () => {
  expect(resolveDraftIntent('OK', state, []).kind).toBe('operations')
  expect(resolveDraftIntent('OK', { ...state, pending_items: [] }, []).kind).toBe('clarify')
  expect(resolveDraftIntent('OK', { ...state, pending_items: [...state.pending_items!, ...state.pending_items!] }, []).kind).toBe('clarify')
})
it('validates named quantities and chot never means handoff', () => {
  expect(resolveDraftIntent('Lấy Bò nướng 2 phần', state, [{ id, name: 'Bò nướng' }])).toMatchObject({ kind: 'operations', operations: [{ quantity: 2 }] })
  expect(resolveDraftIntent('Lấy Bò nướng 100 phần', state, [{ id, name: 'Bò nướng' }]).kind).toBe('clarify')
  expect(resolveDraftIntent('Chốt', state, []).kind).toBe('review')
})
it.each(['Lấy Bò nướng bao nhiêu tiền?', 'Thêm Bò nướng thì bao lâu có?', 'Lấy Bò nướng lúc 7 giờ', 'Lấy Bò nướng hai phần'])('clarifies instead of inventing acceptance or quantities: %s', message => {
  expect(resolveDraftIntent(message, state, [{ id, name: 'Bò nướng' }]).kind).toBe('clarify')
})
it('does not match short dish names inside unrelated words', () => {
  expect(resolveDraftIntent('Lấy cho mình khăn giấy', state, [{ id, name: 'Mì' }]).kind).toBe('clarify')
})
it('does not confuse bò (beef) price questions with bỏ (remove) commands', () => {
  expect(resolveDraftIntent('Bò nướng giá bao nhiêu?', state, [{ id, name: 'Bò nướng' }]).kind).toBe('none')
  expect(resolveDraftIntent('Bỏ Bò nướng', { ...state, draft: null }, [{ id, name: 'Bò nướng' }]).kind).toBe('clarify')
})
