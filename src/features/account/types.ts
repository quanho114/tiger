/**
 * Tiger 345 - Customer Account Types
 * Models for profile, orders, reservations, addresses, favorites, and reorder.
 * Enforces Invariant V04 (Private DTO Whitelist) and V20/V21.
 */

export interface CustomerProfile {
  user_id: string
  display_name: string | null
  phone: string | null
  avatar_url: string | null
  marketing_opt_in: boolean
  created_at: string
  updated_at: string
}

export interface CustomerProfilePatch {
  display_name?: string
  phone?: string | null
  avatar_url?: string | null
  marketing_opt_in?: boolean
}

export interface FrequentMenuItem {
  menu_item_id: string
  name: string
  slug: string
  price_vnd: number
  image_path: string | null
  available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
  category_id: string
  category_name: string
  total_quantity: number
  order_count: number
  last_ordered_at: string
}

export interface CustomerFavoriteItem {
  menu_item_id: string
  name: string
  slug: string
  price_vnd: number
  image_path: string | null
  available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
  category_id: string
  category_name: string
  created_at: string
}

export interface CustomerHomeSummary {
  recent_orders: CustomerOrderSummary[]
  frequent_items: FrequentMenuItem[]
  favorites: CustomerFavoriteItem[]
  upcoming_reservations: CustomerReservationSummary[]
}

export interface CustomerOrderSummary {
  id: string
  code: string
  order_type: 'dine_in' | 'delivery'
  status:
    | 'pending'
    | 'confirmed'
    | 'preparing'
    | 'ready_for_pickup'
    | 'delivering'
    | 'completed'
    | 'cancelled'
  payment_status: 'unpaid' | 'paid' | 'refunded'
  payment_method: string | null
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  note: string | null
  table_name_snapshot: string | null
  address_snapshot: string | null
  zone_name_snapshot: string | null
  item_count: number
  items_summary: Array<{ item_name: string; quantity: number }>
  created_at: string
  paid_at: string | null
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
}

export interface CustomerOrderItem {
  id: string
  menu_item_id: string | null
  item_name: string
  unit_price_vnd: number
  quantity: number
  line_total_vnd: number
  note: string | null
  position: number
}

export interface OrderStatusHistoryItem {
  from_status: string | null
  to_status: string
  reason: string | null
  created_at: string
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  customer_name: string
  customer_phone: string
  version: number
  items: CustomerOrderItem[]
  timeline: OrderStatusHistoryItem[]
}

export interface CustomerReservationSummary {
  id: string
  code: string
  customer_name: string
  customer_phone: string
  starts_at: string
  ends_at: string
  guest_count: number
  seating_area_id: string | null
  area_name_snapshot: string | null
  status: 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show'
  note: string | null
  version: number
  created_at: string
  updated_at?: string
}

export interface CustomerAddress {
  id: string
  label: string
  recipient_name: string
  phone: string
  address_line: string
  ward: string | null
  district: string | null
  province: string | null
  delivery_note: string
  is_default: boolean
  version: number
  created_at: string
  updated_at: string
}

export interface CustomerAddressCreate {
  label: string
  recipient_name: string
  phone: string
  address_line: string
  ward?: string | null
  district?: string | null
  province?: string | null
  delivery_note?: string
  is_default?: boolean
}

export interface CustomerAddressUpdate {
  expected_version: number
  label?: string
  recipient_name?: string
  phone?: string
  address_line?: string
  ward?: string | null
  district?: string | null
  province?: string | null
  delivery_note?: string
  is_default?: boolean
}

export interface CustomerCancelReservationPayload {
  expected_version: number
  reason?: string
}

export interface ReorderWarning {
  type: 'ITEM_DELETED' | 'ITEM_UNPUBLISHED' | 'ITEM_OUT_OF_STOCK' | 'MODE_NOT_ALLOWED' | 'PRICE_CHANGED'
  menu_item_id?: string
  item_name: string
  old_price_vnd?: number
  new_price_vnd?: number
  message: string
}

export interface ReorderItemDto {
  menu_item_id: string
  item_name: string
  unit_price_vnd: number
  quantity: number
  line_total_vnd: number
  note: string
  available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
}

export interface ReorderResponse {
  source_order_id: string
  source_order_code: string
  target_order_type: 'dine_in' | 'delivery'
  items: ReorderItemDto[]
  warnings: ReorderWarning[]
  subtotal_vnd: number
}
