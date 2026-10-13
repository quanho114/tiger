export type PricingMode = 'fixed' | 'range' | 'market' | 'unknown'
export type ImageSource = 'restaurant' | 'illustration' | 'none'

export interface Category {
  id: string
  name: string
  slug: string
  sort_order: number
}

export interface MenuItem {
  id: string
  category_id: string
  name: string
  slug: string
  description: string
  price_vnd: number
  pricing_mode?: PricingMode
  price_min?: number | null
  price_max?: number | null
  image_source?: ImageSource
  review_note?: string | null
  image_path: string
  image_url: string
  available: boolean
  is_available: boolean
  allow_dine_in: boolean
  allow_delivery: boolean
  featured_rank: number | null
  is_featured: boolean
  tags: string[]
  serving_size: string
  pairing_note: string
  delivery_eta: string
  spice_level: number
  is_signature: boolean
  is_bestseller: boolean
  is_new: boolean
}

export interface BusinessHour {
  id: string
  weekday: number
  service_type: 'restaurant' | 'delivery' | 'reservation' | 'dine_in' | 'both'
  open_time: string
  close_time: string
}

export interface BusinessClosure {
  id: string
  date: string
  service_type: 'dine_in' | 'delivery' | 'all'
  reason: string
}

export interface DeliveryZone {
  id: string
  name: string
  description: string
  fee_vnd: number
  free_threshold_vnd: number | null
}

export interface SeatingArea {
  id: string
  code: string
  name: string
}

export interface ReservationPolicy {
  min_notice_minutes: number
  max_days_ahead: number
  duration_minutes: number
  cancel_notice_minutes: number
  no_show_grace_minutes: number
}

export interface RestaurantSettings {
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
  reservation_policy: ReservationPolicy
  business_hours: BusinessHour[]
  business_closures: BusinessClosure[]
  delivery_zones: DeliveryZone[]
  seating_areas: SeatingArea[]
}

export interface MenuResponse {
  categories: Category[]
  items: MenuItem[]
}
