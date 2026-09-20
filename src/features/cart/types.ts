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
  version: 1
  updatedAt: number
  context: CartOrderContext
  items: CartDraftItem[]
  orderNote?: string
}
