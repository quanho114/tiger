import type { MenuItem } from '@/features/catalog/legacyMenuItem'

export interface CartItem {
  dish: MenuItem
  quantity: number
  note?: string
}

export interface CartContextValue {
  cartItems: CartItem[]
  totalCount: number
  subtotal: number
  addedId: string | null
  isCartOpen: boolean
  context: CartOrderContext
  orderNote?: string
  setCartOpen: (open: boolean) => void
  setContext: (context: CartOrderContext) => void
  setOrderNote: (note: string) => void
  applyHandoff: (handoff: import('@contracts/concierge-v2').ConciergeV2HandoffResult) => void
  add: (dish: MenuItem, note?: string, quantity?: number) => void
  updateQty: (dishId: string, delta: number, note?: string) => void
  updateItemNote: (dishId: string, note?: string) => void
  remove: (dishId: string, note?: string) => void
  clear: () => void
}

export type CartOrderContext =
  | {
      mode: 'dine-in'
      tableId: string
      tableCode: string
      tableName: string
      visitId: string
    }
  | {
      mode: 'delivery'
      recipientName?: string
      phone?: string
      address?: string
      zoneId?: string
      deliveryNote?: string
    }
  | {
      mode: 'takeaway'
      pickupTime?: string | null
    }

export interface CartDraftItem {
  dishId: string
  quantity: number
  note?: string
  dishSnapshot?: {
    id: string
    name: string
    price: number
    image?: string
  }
}

export interface PersistedCartState {
  appliedHandoffs?: string[]
  version: 1
  updatedAt: number
  context: CartOrderContext
  items: CartDraftItem[]
  orderNote?: string
}
