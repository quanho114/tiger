export interface DineInQuoteItem {
  menu_item_id: string
  quantity: number
  note?: string
}

export interface DineInQuoteRequest {
  order_type: 'dine_in'
  visit_capability: string
  items: DineInQuoteItem[]
}

export interface QuotedItem {
  menu_item_id: string
  item_name?: string
  quantity: number
  unit_price_vnd: number
  line_total_vnd: number
  note?: string
}

export interface DineInQuoteResponse {
  quote_token: string
  expires_at: string
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  items: QuotedItem[]
}

export interface CreateDineInOrderRequest {
  quote_token: string
  items: DineInQuoteItem[]
  note?: string
  claim_secret?: string
}

export interface DineInOrderReceipt {
  id: string
  code: string
  order_type: 'dine_in'
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  payment_status: 'unpaid' | 'paid' | 'refunded'
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  created_at: string
  table_id?: string
  table_code?: string
  table_name?: string
  items?: QuotedItem[]
  note?: string
}
