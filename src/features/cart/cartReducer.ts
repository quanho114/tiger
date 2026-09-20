import type { CartDraftItem, CartOrderContext, PersistedCartState } from './types'

export type CartAction =
  | {
      type: 'ADD_ITEM'
      dishId: string
      quantity?: number
      note?: string
      dishSnapshot?: CartDraftItem['dishSnapshot']
    }
  | {
      type: 'UPDATE_QUANTITY'
      dishId: string
      quantity: number
    }
  | {
      type: 'UPDATE_ITEM_NOTE'
      dishId: string
      note?: string
    }
  | {
      type: 'REMOVE_ITEM'
      dishId: string
    }
  | {
      type: 'SET_ORDER_NOTE'
      note?: string
    }
  | {
      type: 'SET_CONTEXT'
      context: CartOrderContext
    }
  | {
      type: 'CLEAR_CART'
    }
  | {
      type: 'REPLACE_CART'
      state: PersistedCartState
    }

export function cartReducer(state: PersistedCartState, action: CartAction): PersistedCartState {
  const now = Date.now()

  switch (action.type) {
    case 'ADD_ITEM': {
      const addQty = action.quantity ?? 1
      if (addQty <= 0) return state

      const existingIndex = state.items.findIndex((item) => item.dishId === action.dishId)

      let updatedItems: CartDraftItem[]
      if (existingIndex >= 0) {
        updatedItems = state.items.map((item, idx) => {
          if (idx !== existingIndex) return item
          return {
            ...item,
            quantity: item.quantity + addQty,
            note: action.note !== undefined ? action.note : item.note,
            dishSnapshot: action.dishSnapshot || item.dishSnapshot,
          }
        })
      } else {
        updatedItems = [
          ...state.items,
          {
            dishId: action.dishId,
            quantity: addQty,
            note: action.note,
            dishSnapshot: action.dishSnapshot,
          },
        ]
      }

      return {
        ...state,
        updatedAt: now,
        items: updatedItems,
      }
    }

    case 'UPDATE_QUANTITY': {
      if (action.quantity <= 0) {
        return {
          ...state,
          updatedAt: now,
          items: state.items.filter((item) => item.dishId !== action.dishId),
        }
      }

      return {
        ...state,
        updatedAt: now,
        items: state.items.map((item) =>
          item.dishId === action.dishId ? { ...item, quantity: action.quantity } : item
        ),
      }
    }

    case 'UPDATE_ITEM_NOTE': {
      return {
        ...state,
        updatedAt: now,
        items: state.items.map((item) =>
          item.dishId === action.dishId ? { ...item, note: action.note } : item
        ),
      }
    }

    case 'REMOVE_ITEM': {
      return {
        ...state,
        updatedAt: now,
        items: state.items.filter((item) => item.dishId !== action.dishId),
      }
    }

    case 'SET_ORDER_NOTE': {
      return {
        ...state,
        updatedAt: now,
        orderNote: action.note,
      }
    }

    case 'SET_CONTEXT': {
      return {
        ...state,
        updatedAt: now,
        context: action.context,
      }
    }

    case 'CLEAR_CART': {
      return {
        ...state,
        updatedAt: now,
        items: [],
        orderNote: undefined,
      }
    }

    case 'REPLACE_CART': {
      return action.state
    }

    default:
      return state
  }
}
