import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import type { MenuItem } from '../data/restaurantData'
import {
  cartReducer,
  createDefaultCartState,
  getStoredCart,
  setStoredCart,
} from '@/features/cart'
import type { CartOrderContext, PersistedCartState } from '@/features/cart/types'
import { CartContext, type CartContextValue, type CartItem } from './cart'

function initCartState(): PersistedCartState {
  const stored = getStoredCart()
  if (stored) return stored
  if (typeof window !== 'undefined') {
    try {
      const rawSession = window.sessionStorage.getItem('tiger_table_session_v1')
      if (rawSession) {
        const session = JSON.parse(rawSession)
        if (session && session.tableId) {
          return createDefaultCartState({
            mode: 'dine-in',
            tableId: session.tableId,
            tableCode: session.tableCode,
            tableName: session.tableName,
            visitId: session.visitId,
          })
        }
      }
    } catch {
      // Ignore storage parse error
    }
  }
  return createDefaultCartState()
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, initCartState)
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [addedId, setAddedId] = useState<string | null>(null)

  // Persist state to localStorage on every change
  useEffect(() => {
    setStoredCart(state)
  }, [state])

  const add = useCallback((dish: MenuItem, note?: string, quantity = 1) => {
    dispatch({
      type: 'ADD_ITEM',
      dishId: dish.id,
      quantity: quantity > 0 ? quantity : 1,
      note,
      dishSnapshot: {
        id: dish.id,
        name: dish.name,
        price: dish.price,
        image: dish.image,
      },
    })
    setAddedId(dish.id)
    window.setTimeout(() => {
      setAddedId((current) => (current === dish.id ? null : current))
    }, 1800)
  }, [])

  const updateQty = useCallback((dishId: string, delta: number) => {
    const current = state.items.find((item) => item.dishId === dishId)
    if (!current) return
    const nextQty = current.quantity + delta
    if (nextQty <= 0) {
      dispatch({ type: 'REMOVE_ITEM', dishId })
    } else {
      dispatch({ type: 'UPDATE_QUANTITY', dishId, quantity: nextQty })
    }
  }, [state.items])

  const updateItemNote = useCallback((dishId: string, note?: string) => {
    dispatch({ type: 'UPDATE_ITEM_NOTE', dishId, note })
  }, [])

  const remove = useCallback((dishId: string) => {
    dispatch({ type: 'REMOVE_ITEM', dishId })
  }, [])

  const clear = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' })
  }, [])

  const setContext = useCallback((context: CartOrderContext) => {
    dispatch({ type: 'SET_CONTEXT', context })
  }, [])

  const setOrderNote = useCallback((note: string) => {
    dispatch({ type: 'SET_ORDER_NOTE', note })
  }, [])

  const cartItems = useMemo<CartItem[]>(() => {
    return state.items.map((item) => ({
      dish: {
        id: item.dishId,
        name: item.dishSnapshot?.name || 'Món ăn',
        price: item.dishSnapshot?.price || 0,
        image: item.dishSnapshot?.image || '/tiger.svg',
        category: '',
        description: '',
        modes: ['dine-in', 'delivery'],
      },
      quantity: item.quantity,
      note: item.note,
    }))
  }, [state.items])

  const totalCount = useMemo(() => {
    return state.items.reduce((acc, item) => acc + item.quantity, 0)
  }, [state.items])

  const subtotal = useMemo(() => {
    return cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0)
  }, [cartItems])

  const value = useMemo<CartContextValue>(() => ({
    cartItems,
    totalCount,
    subtotal,
    addedId,
    isCartOpen,
    context: state.context,
    orderNote: state.orderNote,
    setCartOpen: setIsCartOpen,
    setContext,
    setOrderNote,
    add,
    updateQty,
    updateItemNote,
    remove,
    clear,
  }), [
    cartItems,
    totalCount,
    subtotal,
    addedId,
    isCartOpen,
    state.context,
    state.orderNote,
    setContext,
    setOrderNote,
    add,
    updateQty,
    updateItemNote,
    remove,
    clear,
  ])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
