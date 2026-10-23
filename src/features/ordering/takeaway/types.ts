export interface TakeawayQuoteItem {
  menu_item_id: string
  quantity: number
  selected_price_vnd?: number
  note?: string
}

export interface TakeawayQuoteRequest {
  order_type: 'takeaway'
  items: TakeawayQuoteItem[]
  pickup_time?: string | null
}

export interface TakeawayQuotedItem {
  menu_item_id: string
  item_name?: string
  quantity: number
  unit_price_vnd: number
  line_total_vnd: number
  note?: string
}

export interface TakeawayQuoteResponse {
  quote_token: string
  expires_at: string
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  items: TakeawayQuotedItem[]
}

export interface CreateTakeawayOrderRequest {
  quote_token: string
  customer_name: string
  customer_phone: string
  note?: string
  items: TakeawayQuoteItem[]
  claim_secret?: string
}

export interface TakeawayOrderReceipt {
  id: string
  code: string
  order_type: 'takeaway'
  status:
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready_for_pickup'
    | 'completed'
    | 'cancelled'
    | 'rejected'
  payment_status: 'unpaid' | 'paid' | 'refunded'
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  created_at: string
  customer_name?: string
  customer_phone?: string
  pickup_time?: string | null
  note?: string
  items?: TakeawayQuotedItem[]
}

export interface TakeawayFormState {
  customerName: string
  customerPhone: string
  orderNote: string
  pickupTime: string | null
}

export type TakeawayFieldErrors = Partial<Record<keyof TakeawayFormState, string>>
