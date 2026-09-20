import { describe, it, expect, beforeEach } from 'vitest'
import {
  createDefaultCartState,
  getStoredCart,
  setStoredCart,
  clearStoredCart,
  CART_TTL_MS,
} from '@/features/cart/storage'
import { cartReducer } from '@/features/cart/cartReducer'
import type { PersistedCartState } from '@/features/cart/types'

describe('Cart Storage & Persistence (Invariant V12)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('initializes default cart with schema version 1 and delivery context', () => {
    const defaultState = createDefaultCartState()
    expect(defaultState.version).toBe(1)
    expect(defaultState.context.mode).toBe('delivery')
    expect(defaultState.items).toEqual([])
    expect(typeof defaultState.updatedAt).toBe('number')
  })

  it('persists and retrieves valid cart draft from localStorage', () => {
    const state: PersistedCartState = {
      version: 1,
      updatedAt: Date.now(),
      context: {
        mode: 'dine-in',
        tableId: 'tbl-123',
        tableCode: 'B01',
        tableName: 'Bàn 01',
        visitId: 'visit-123',
      },
      items: [
        {
          dishId: 'ga-hap-mam-nhi',
          quantity: 2,
          note: 'Không cay',
          dishSnapshot: {
            id: 'ga-hap-mam-nhi',
            name: 'Gà Hấp Mắm Nhĩ',
            price: 240000,
          },
        },
      ],
      orderNote: 'Giao nhanh trước 12h',
    }

    setStoredCart(state)
    const retrieved = getStoredCart()

    expect(retrieved).not.toBeNull()
    expect(retrieved?.version).toBe(1)
    expect(retrieved?.context.mode).toBe('dine-in')
    expect(retrieved?.items).toHaveLength(1)
    expect(retrieved?.items[0].dishId).toBe('ga-hap-mam-nhi')
    expect(retrieved?.items[0].quantity).toBe(2)
    expect(retrieved?.items[0].note).toBe('Không cay')
    expect(retrieved?.orderNote).toBe('Giao nhanh trước 12h')
  })

  it('safely discards and clears cart if schema version is mismatched', () => {
    const invalidVersionState = {
      version: 2, // Unsupported version
      updatedAt: Date.now(),
      context: { mode: 'delivery' },
      items: [{ dishId: 'dish-1', quantity: 1 }],
    }
    window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify(invalidVersionState))

    const retrieved = getStoredCart()
    expect(retrieved).toBeNull()
    expect(window.localStorage.getItem('tiger_cart_draft_v1')).toBeNull()
  })

  it('safely discards and clears cart if stored updatedAt is expired (> 24 hours TTL)', () => {
    const expiredState: PersistedCartState = {
      version: 1,
      updatedAt: Date.now() - (CART_TTL_MS + 1000), // Expired by 1 second
      context: { mode: 'delivery' },
      items: [{ dishId: 'dish-1', quantity: 1 }],
    }
    window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify(expiredState))

    const retrieved = getStoredCart()
    expect(retrieved).toBeNull()
    expect(window.localStorage.getItem('tiger_cart_draft_v1')).toBeNull()
  })

  it('safely handles malformed JSON in localStorage without throwing', () => {
    window.localStorage.setItem('tiger_cart_draft_v1', 'NOT_VALID_JSON{:::')

    expect(() => {
      const retrieved = getStoredCart()
      expect(retrieved).toBeNull()
    }).not.toThrow()
    expect(window.localStorage.getItem('tiger_cart_draft_v1')).toBeNull()
  })

  it('filters out invalid or zero/negative quantity items safely', () => {
    const partiallyCorrupted = {
      version: 1,
      updatedAt: Date.now(),
      context: { mode: 'delivery' },
      items: [
        { dishId: 'valid-dish', quantity: 3 },
        { dishId: 'bad-qty', quantity: 0 },
        { dishId: 'negative-qty', quantity: -1 },
        { invalid: 'item' },
        null,
      ],
    }
    window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify(partiallyCorrupted))

    const retrieved = getStoredCart()
    expect(retrieved).not.toBeNull()
    expect(retrieved?.items).toHaveLength(1)
    expect(retrieved?.items[0].dishId).toBe('valid-dish')
    expect(retrieved?.items[0].quantity).toBe(3)
  })

  it('clears stored cart correctly', () => {
    setStoredCart(createDefaultCartState())
    expect(window.localStorage.getItem('tiger_cart_draft_v1')).not.toBeNull()

    clearStoredCart()
    expect(window.localStorage.getItem('tiger_cart_draft_v1')).toBeNull()
  })
})

describe('Cart Reducer State Transitions', () => {
  const initial = createDefaultCartState({ mode: 'delivery' })

  it('adds new items and increments existing items', () => {
    const state1 = cartReducer(initial, {
      type: 'ADD_ITEM',
      dishId: 'dish-1',
      quantity: 2,
      note: 'Ít đường',
      dishSnapshot: { id: 'dish-1', name: 'Món 1', price: 100000 },
    })
    expect(state1.items).toHaveLength(1)
    expect(state1.items[0].quantity).toBe(2)
    expect(state1.items[0].note).toBe('Ít đường')

    // Add same item with +3
    const state2 = cartReducer(state1, {
      type: 'ADD_ITEM',
      dishId: 'dish-1',
      quantity: 3,
    })
    expect(state2.items).toHaveLength(1)
    expect(state2.items[0].quantity).toBe(5)
    expect(state2.items[0].note).toBe('Ít đường') // Retains existing note if not overwritten
  })

  it('updates item quantity and removes item when quantity becomes zero or negative', () => {
    const withItem = cartReducer(initial, {
      type: 'ADD_ITEM',
      dishId: 'dish-1',
      quantity: 5,
    })

    const updated = cartReducer(withItem, {
      type: 'UPDATE_QUANTITY',
      dishId: 'dish-1',
      quantity: 3,
    })
    expect(updated.items[0].quantity).toBe(3)

    const removed = cartReducer(updated, {
      type: 'UPDATE_QUANTITY',
      dishId: 'dish-1',
      quantity: 0,
    })
    expect(removed.items).toHaveLength(0)
  })

  it('removes item explicitly with REMOVE_ITEM', () => {
    const withTwoItems = cartReducer(
      cartReducer(initial, { type: 'ADD_ITEM', dishId: 'dish-1', quantity: 1 }),
      { type: 'ADD_ITEM', dishId: 'dish-2', quantity: 2 }
    )
    expect(withTwoItems.items).toHaveLength(2)

    const afterRemove = cartReducer(withTwoItems, {
      type: 'REMOVE_ITEM',
      dishId: 'dish-1',
    })
    expect(afterRemove.items).toHaveLength(1)
    expect(afterRemove.items[0].dishId).toBe('dish-2')
  })

  it('switches context between delivery and dine-in with SET_CONTEXT', () => {
    const dineInContext = {
      mode: 'dine-in' as const,
      tableId: 't-1',
      tableCode: 'B01',
      tableName: 'Bàn 01',
      visitId: 'visit-1',
    }
    const state = cartReducer(initial, {
      type: 'SET_CONTEXT',
      context: dineInContext,
    })
    expect(state.context.mode).toBe('dine-in')
    if (state.context.mode === 'dine-in') {
      expect(state.context.tableCode).toBe('B01')
    }
  })

  it('clears all items and order note on CLEAR_CART', () => {
    const populated = cartReducer(
      cartReducer(initial, { type: 'ADD_ITEM', dishId: 'dish-1', quantity: 2 }),
      { type: 'SET_ORDER_NOTE', note: 'Ghi chú đặc biệt' }
    )
    expect(populated.items).toHaveLength(1)
    expect(populated.orderNote).toBe('Ghi chú đặc biệt')

    const cleared = cartReducer(populated, { type: 'CLEAR_CART' })
    expect(cleared.items).toEqual([])
    expect(cleared.orderNote).toBeUndefined()
  })
})
