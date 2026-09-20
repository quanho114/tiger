export interface DeliveryQuoteItem {
  menu_item_id: string
  quantity: number
  note?: string
}

export interface DeliveryQuoteRequest {
  order_type: 'delivery'
  delivery_zone_id: string
  items: DeliveryQuoteItem[]
}

export interface DeliveryQuotedItem {
  menu_item_id: string
  item_name?: string
  quantity: number
  unit_price_vnd: number
  line_total_vnd: number
  note?: string
}

export interface DeliveryQuoteResponse {
  quote_token: string
  expires_at: string
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  items: DeliveryQuotedItem[]
}

export interface CreateDeliveryOrderRequest {
  quote_token: string
  customer_name: string
  customer_phone: string
  address: string
  note?: string
  items: DeliveryQuoteItem[]
  claim_secret?: string
}

export interface DeliveryOrderReceipt {
  id: string
  code: string
  order_type: 'delivery'
  status: 'pending' | 'confirmed' | 'preparing' | 'delivering' | 'completed' | 'cancelled' | 'rejected'
  payment_status: 'unpaid' | 'paid' | 'refunded'
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  created_at: string
  customer_name?: string
  customer_phone?: string
  address?: string
  zone_name?: string
  note?: string
  items?: DeliveryQuotedItem[]
}

export interface DeliveryFormState {
  customerName: string
  customerPhone: string
  address: string
  deliveryZoneId: string
  orderNote: string
}

export type DeliveryFieldErrors = Partial<Record<keyof DeliveryFormState, string>>

export interface DeliveryZoneOption {
  id: string
  name: string
  description?: string
  fee_vnd: number
  free_threshold_vnd: number | null
}
