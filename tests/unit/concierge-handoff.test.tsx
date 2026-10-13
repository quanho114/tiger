import { it, expect, vi } from 'vitest'
import { mergeCartHandoff } from '@/features/cart/handoff'
import { createDefaultCartState, getStoredCart, setStoredCart } from '@/features/cart/storage'
import type { ConciergeV2HandoffResult } from '@contracts/concierge-v2'
import { renderHook, act } from '@testing-library/react'
import { CartProvider, useCart } from '@/features/cart'
const id = '11111111-1111-4111-8111-111111111111'
const handoff: ConciergeV2HandoffResult = { handoff_id: 'handoff_abcdefghijklmnop', draft_id: id, draft_version: 2,
  expires_at: new Date(Date.now() + 60000).toISOString(), replay: false,
  lines: [{ menu_item_id: id, name: 'Bò', quantity: 2, note: 'Không hành', price_vnd: 100000,
    availability: 'available', price_status: 'current', allergy_status: 'verified_safe' }] }
it('persists lines and dedup marker together, preserves old notes, and survives reload/replay', () => {
  const original = { ...createDefaultCartState(), items: [{ dishId: id, quantity: 1, note: 'Ít cay' }] }
  const merged = mergeCartHandoff(original, handoff)
  expect(merged.items).toHaveLength(2)
  expect(merged.items[0]).toEqual(original.items[0])
  setStoredCart(merged)
  const reloaded = getStoredCart()!
  expect(mergeCartHandoff(reloaded, handoff)).toBe(reloaded)
  expect(reloaded.items.map(i => i.quantity)).toEqual([1, 2])
  expect(JSON.stringify(reloaded)).not.toContain('session_capability')
  expect(JSON.stringify(reloaded)).not.toContain('draft_id')
})
it('rejects expired or overflowing batches atomically', () => {
  expect(() => mergeCartHandoff(createDefaultCartState(), handoff, Date.now() + 120000)).toThrow()
  const cart = { ...createDefaultCartState(), items: [{ dishId: id, quantity: 99, note: 'Không hành' }] }
  expect(() => mergeCartHandoff(cart, handoff)).toThrow()
  expect(cart.items[0].quantity).toBe(99)
})
it('does not report a durable handoff when browser storage rejects the atomic write', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  try {
    expect(() => setStoredCart(mergeCartHandoff(createDefaultCartState(), handoff), true)).toThrow('Không thể lưu giỏ hàng')
  } finally { write.mockRestore() }
})
it('preserves manual additions batched in the same event as a repeated handoff', () => {
  localStorage.clear()
  const { result } = renderHook(() => useCart(), { wrapper: CartProvider })
  act(() => {
    result.current.add({ id, name: 'Bò', price: 100000, image: '', category: '', description: '', modes: ['delivery'] }, 'Ít cay', 1)
    result.current.applyHandoff(handoff)
    result.current.applyHandoff(handoff)
  })
  expect(result.current.cartItems.map(item => item.quantity)).toEqual([1, 2])
  expect(getStoredCart()?.appliedHandoffs).toEqual([handoff.handoff_id])
})
