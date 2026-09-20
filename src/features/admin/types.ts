export type OrderType = 'dine_in' | 'delivery'
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'served'
  | 'delivering'
  | 'completed'
  | 'cancelled'
  | 'rejected'

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'

export type PaymentMethod = 'cash' | 'bank_transfer'

export interface OrderPaymentEvent {
  id: string
  order_id: string
  event: 'paid' | 'refunded' | 'corrected'
  amount_vnd: number
  method: PaymentMethod | null
  actor_admin_name: string
  reason: string | null
  created_at: string
}

export interface OrderItemSummary {
  id: string
  menu_item_id: string
  name_snapshot: string
  price_vnd: number
  quantity: number
  subtotal_vnd: number
  note?: string
}

export interface OrderStatusHistoryItem {
  id: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  reason: string | null
  actor_name: string
  created_at: string
}

export interface AdminOrderSummary {
  id: string
  code: string
  order_type: OrderType
  status: OrderStatus
  payment_status: PaymentStatus
  total_vnd: number
  subtotal_vnd: number
  shipping_fee_vnd: number
  table_name_snapshot?: string | null
  table_id?: string | null
  table_visit_id?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  address_snapshot?: string | null
  note: string
  internal_note: string
  item_count: number
  version: number
  created_at: string
  confirmed_at?: string | null
  completed_at?: string | null
  cancelled_at?: string | null
  updated_at: string
}

export interface AdminOrderDetail {
  order: AdminOrderSummary
  items: OrderItemSummary[]
  status_history: OrderStatusHistoryItem[]
  payment_events?: OrderPaymentEvent[]
}

export interface TableVisitDetail {
  visit: {
    id: string
    table_id: string
    table_code: string
    table_name: string
    status: 'active' | 'closed'
    capability_epoch: number
    opened_at: string
    closed_at: string | null
    opened_by_admin_id: string
    version: number
  }
  orders: Array<{
    id: string
    code: string
    order_type: OrderType
    status: OrderStatus
    payment_status: PaymentStatus
    payment_method: PaymentMethod | null
    total_vnd: number
    created_at: string
    paid_at: string | null
    version: number
    items_summary: Array<{
      name: string
      quantity: number
      line_total_vnd: number
    }>
  }>
  unpaid_summary: {
    active_orders_count: number
    unpaid_orders_count: number
    unpaid_total_vnd: number
  }
}

export interface AdminDashboardData {
  pending_orders_count: number
  preparing_orders_count: number
  delivering_orders_count: number
  active_tables_count: number
  settings: {
    accepting_orders: boolean
    accepting_dine_in_orders: boolean
    accepting_delivery_orders: boolean
    booking_enabled: boolean
  }
  recent_pending_orders: AdminOrderSummary[]
}

export interface AdminTableItem {
  id: string
  code: string
  name: string
  seating_area_id: string | null
  area_name: string | null
  active: boolean
  sort_order: number
  version: number
  current_visit_id: string | null
  visit_opened_at: string | null
  unpaid_orders_count: number
  unpaid_total_vnd: number
  active_qr_token: string | null
}

export interface AdminRestaurantSettings {
  id: number
  name: string
  phone: string
  zalo: string
  facebook: string
  maps_url: string
  address: string
  timezone: string
  accepting_orders: boolean
  accepting_dine_in_orders: boolean
  accepting_delivery_orders: boolean
  booking_enabled: boolean
  min_delivery_order_vnd: number
  reservation_min_notice_minutes: number
  reservation_max_days_ahead: number
  reservation_duration_minutes: number
  reservation_cancel_notice_minutes: number
  reservation_no_show_grace_minutes: number
  version: number
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  sort_order: number
  active: boolean
  version: number
  created_at?: string
  updated_at?: string
}

export interface AdminMenuItem {
  id: string
  category_id: string
  category_name?: string
  name: string
  slug: string
  description: string
  price_vnd: number
  image_path?: string | null
  published: boolean
  available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
  featured_rank?: number | null
  tags?: string[]
  serving_size?: string | null
  pairing_note?: string | null
  delivery_eta?: string | null
  spice_level?: number | null
  is_signature?: boolean
  is_bestseller?: boolean
  is_new?: boolean
  version: number
  created_at?: string
  updated_at?: string
}

export interface AdminBusinessHour {
  id?: string
  weekday: number
  service_type: 'restaurant' | 'delivery' | 'reservation'
  open_time: string
  close_time: string
  active?: boolean
}

export interface AdminBusinessClosure {
  id?: string
  date: string
  service_type: 'restaurant' | 'delivery' | 'reservation' | 'all'
  reason: string
}

export interface AdminSeatingArea {
  id: string
  code: string
  name: string
  sort_order: number
  active: boolean
  version: number
}

export interface AdminDeliveryZone {
  id: string
  name: string
  description: string
  fee_vnd: number
  free_threshold_vnd: number | null
  sort_order: number
  active: boolean
  version: number
}

export interface AdminAuditLog {
  id: string
  admin_id: string | null
  admin_name?: string | null
  actor_kind: string
  action: string
  entity_type: string
  entity_id: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface AdminConciergeFeedback {
  id: string
  conversation_id?: string
  proposal_id: string
  proposal_version: number
  config_version: number | string
  rating: 'perfect' | 'too_much' | 'too_little' | 'too_expensive' | 'dislike'
  feedback_text?: string
  customer_user_id: string | null
  actor_scope: string
  status: 'NEW' | 'REVIEWED' | 'DISMISSED'
  admin_notes?: string
  created_at: string
  updated_at: string
}
