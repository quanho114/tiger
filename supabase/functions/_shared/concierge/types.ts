/** Shared food knowledge and LLM adapter types for the current concierge. */

export type MealRole =
  | 'main_protein'
  | 'carb'
  | 'vegetable'
  | 'soup_hotpot'
  | 'side'
  | 'dessert'
  | 'drink'
  | 'alcohol'
  | 'set'

export type MealContext = 'single_main' | 'shared' | 'side_pairing'

export type ServingUnit =
  | 'con'
  | 'phần'
  | 'cây'
  | 'đĩa'
  | 'nồi'
  | 'tô'
  | 'cuốn'
  | 'ly'
  | 'chai'
  | 'cái'
  | 'bát'
  | 'ống'

export type ConfidenceLevel = 'restaurant_defined' | 'estimated' | 'unknown'

export interface MacroContributions {
  protein: number // 0..1 scale of meal target contribution
  carb: number
  vegetable: number
  soup: number
}

export interface ServingProfile {
  item_id: string
  serving_unit: ServingUnit
  pieces_or_weight?: string
  people_min: number
  people_max: number
  meal_role: MealRole
  contributions: MacroContributions
  meal_context: MealContext
  confidence: ConfidenceLevel
  notes?: string
  provenance: string
  updated_by?: string
  updated_at?: string
}

export type AllergenType =
  | 'seafood' // Hải sản
  | 'peanuts' // Đậu phộng / Lạc
  | 'eggs' // Trứng
  | 'dairy' // Sữa / Lactose
  | 'gluten' // Bột mì / Gluten
  | 'soy' // Đậu nành
  | 'sesame' // Mè / Vừng

export type AllergenStatus = 'contains' | 'may_contain' | 'absent' | 'unknown'

export interface ItemAllergenProfile {
  item_id: string
  allergens: Partial<Record<AllergenType, AllergenStatus>>
  kitchen_notes?: string
  cross_contact_risk?: boolean
  source?: 'system_seed' | 'demo_estimate' | 'kitchen_audited'
  verified_by_kitchen: boolean
  verified_at?: string
  updated_by?: string
  updated_at?: string
  /** Cache validity, independent from the kitchen verification date. */
  snapshot_expires_at?: string
}

export type AppetiteLevel = 'light' | 'normal' | 'heavy'

export interface CustomerConstraints {
  adults: number
  children: number
  appetite: AppetiteLevel
  budget_vnd?: number | null
  is_hard_budget: boolean
  preferences: string[]
  dislikes: string[]
  allergies: AllergenType[]
  meal_purpose?: string
  order_mode?: 'dine_in' | 'delivery'
}

export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string
  cards?: unknown[]
}

export interface KnowledgeReference {
  document_id?: string
  source: string
  topic: string
  title: string
  version?: number
}
