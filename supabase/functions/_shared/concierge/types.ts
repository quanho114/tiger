/**
 * Tiger 345 - Concierge Agent Types & Schemas
 * Defined according to plans/tiger-345/09-concierge-agent-design.md
 */

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

export type AllergenStatus = 'contains' | 'may_contain' | 'unknown'

export interface ItemAllergenProfile {
  item_id: string
  allergens: Partial<Record<AllergenType, AllergenStatus>>
  kitchen_notes?: string
  cross_contact_risk?: boolean
  source?: 'system_seed' | 'demo_estimate' | 'kitchen_audited'
  verified_by_kitchen: boolean
  updated_by?: string
  updated_at?: string
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

export type ValidationStatus = 'PASS' | 'WARNING' | 'BLOCKED' | 'INSUFFICIENT_DATA'

export interface ValidationCheckItem {
  name: string
  status: ValidationStatus
  message: string
  details?: Record<string, unknown>
}

export interface ServingCoverage {
  target_equivalent_adults: number
  protein_coverage_ratio: number
  carb_coverage_ratio: number
  vegetable_coverage_ratio: number
  soup_coverage_ratio: number
  overall_fit_score: number
  is_sufficient: boolean
  surplus_detected?: boolean
  gaps: string[]
}

export interface CandidateValidation {
  status: ValidationStatus
  checks: ValidationCheckItem[]
  subtotal_vnd: number
  coverage: ServingCoverage
  assumptions: string[]
  warnings: string[]
  validated_at: string
  version: number
  action_eligible?: boolean
}

export interface CandidateItem {
  menu_item_id: string
  item_name?: string
  unit_price_vnd?: number
  quantity: number
  note?: string
  meal_role?: MealRole
  serving_size?: string
}

export interface MealProposal {
  id: string
  version: number
  title: string
  description: string
  concept_tag: 'budget_optimized' | 'balanced_harmony' | 'signature_experience'
  items: CandidateItem[]
  subtotal_vnd: number
  serving_summary: string
  validation: CandidateValidation
  created_at: string
  expires_at: string
  actor_scope?: string
  action_eligible?: boolean
}

export interface FeasibilityCheckResult {
  feasible: boolean
  reason?: string
}

export type ConciergeIntent =
  | 'restaurant_info'
  | 'menu_lookup'
  | 'food_recommendation'
  | 'order'
  | 'reservation'
  | 'order_status'
  | 'reservation_status'
  | 'customer_history'
  | 'general_chat'

export type ConversationStep =
  | 'IDLE'
  | 'ANSWERING'
  | 'RECOMMENDING_CLARIFYING'
  | 'RECOMMENDING_BUILDING'
  | 'RECOMMENDING_PROPOSAL_READY'
  | 'RECOMMENDING_CART_UPDATED'
  | 'ORDERING_COLLECTING'
  | 'ORDERING_QUOTED'
  | 'ORDERING_CONFIRMING'
  | 'ORDERING_SUBMITTING'
  | 'ORDERING_SUBMITTED'
  | 'ORDERING_RECONCILING'
  | 'RESERVING_COLLECTING'
  | 'RESERVING_CONFIRMING'
  | 'RESERVING_SUBMITTING'
  | 'RESERVING_SUBMITTED'
  | 'RESERVING_RECONCILING'

// UI Cards Contracts
export interface MenuItemCardData {
  type: 'menu_item'
  id: string
  name: string
  description: string
  price_vnd: number
  image_url: string
  is_available: boolean
  serving_size?: string
  pairing_note?: string
  tags: string[]
  is_signature: boolean
}

export interface MealRecommendationCardData {
  type: 'meal_recommendation'
  proposal: MealProposal
  added_to_cart?: boolean
}

export interface ClarificationChoice {
  label: string
  value: string
  field: 'guests' | 'children' | 'appetite' | 'budget' | 'allergies' | 'mode'
}

export interface ClarificationChoicesCardData {
  type: 'clarification_choices'
  question: string
  choices: ClarificationChoice[]
}

export interface OrderQuoteCardData {
  type: 'order_quote'
  action_id?: string
  quote_token: string
  quote_version: number
  order_type: 'dine_in' | 'delivery'
  items: {
    menu_item_id: string
    name: string
    quantity: number
    unit_price_vnd: number
    line_total_vnd: number
    note?: string
  }[]
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  expires_at: string
  target_summary: string
}

export interface ReservationSummaryCardData {
  type: 'reservation_summary'
  action_id?: string
  customer_name: string
  phone: string
  guest_count: number
  starts_at_iso: string
  starts_at_formatted: string
  seating_area_name?: string
  note?: string
  disclaimer: string
  hold_token?: string
}

export interface OrderStatusCardData {
  type: 'order_status'
  order_code: string
  status: string
  order_type: 'dine_in' | 'delivery'
  total_vnd: number
  created_at: string
  note?: string
}

export interface ReservationStatusCardData {
  type: 'reservation_status'
  reservation_code: string
  status: string
  starts_at_formatted: string
  guest_count: number
  customer_name: string
}

export interface SuggestedActionsCardData {
  type: 'suggested_actions'
  actions: {
    label: string
    action_type: 'chat_prompt' | 'add_to_cart' | 'checkout' | 'reserve'
    payload?: string
  }[]
}

export type ConciergeCard =
  | MenuItemCardData
  | MealRecommendationCardData
  | ClarificationChoicesCardData
  | OrderQuoteCardData
  | ReservationSummaryCardData
  | OrderStatusCardData
  | ReservationStatusCardData
  | SuggestedActionsCardData

export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant' | 'system'
  text: string
  timestamp: string
  cards?: ConciergeCard[]
}

export interface KnowledgeReference {
  document_id?: string
  source: string
  topic: string
  title: string
  version?: number
}

export interface ActionWaiting {
  action_type: 'confirm_quote' | 'confirm_reservation' | 'clarify_choice'
  payload_id: string
  expires_at: string
  summary: string
}

export type PendingActionType = 'confirm_quote' | 'confirm_reservation'
export type PendingActionStatus = 'pending' | 'processing' | 'completed' | 'expired' | 'cancelled'

export interface PendingAction {
  id: string
  action_type: PendingActionType
  actor_scope: string
  conversation_id: string
  state_version: number
  content_fingerprint: string
  reference_id: string
  expires_at: string
  status: PendingActionStatus
  payload: Record<string, unknown>
  stable_business_idempotency_key?: string
  transaction_receipt?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CustomerContextData {
  customer_user_id: string
  display_name?: string
  phone?: string
  favorites: {
    menu_item_id: string
    item_name: string
    price_vnd: number
    is_available: boolean
  }[]
  recent_orders: {
    order_id: string
    order_code: string
    order_type: 'dine_in' | 'delivery'
    status: string
    total_vnd: number
    created_at: string
    items: {
      menu_item_id: string
      item_name: string
      quantity: number
      unit_price_vnd: number
      is_available: boolean
    }[]
  }[]
  frequent_items: {
    menu_item_id: string
    item_name: string
    total_ordered_quantity: number
    price_vnd: number
    is_available: boolean
  }[]
  default_address?: {
    id: string
    label: string
    recipient_name: string
    phone: string
    address_line: string
    ward?: string
    district?: string
    province?: string
  }
}

export interface ConciergeState {
  conversation_id: string
  state_version: number
  session_token: string
  customer_user_id: string | null
  current_step: ConversationStep
  current_intent: ConciergeIntent
  constraints: CustomerConstraints
  last_proposals: MealProposal[]
  active_proposal_id?: string
  active_quote?: OrderQuoteCardData
  pending_reservation?: ReservationSummaryCardData
  action_waiting?: ActionWaiting
  pending_action?: PendingAction
  messages: ChatMessage[]
  created_at: string
  updated_at: string
}

export interface ConciergeRequestPayload {
  conversation_id?: string
  state_version?: number
  session_token?: string
  message?: string
  action?: {
    type:
      | 'add_proposal_to_cart'
      | 'confirm_quote'
      | 'confirm_reservation'
      | 'answer_clarification'
      | 'feedback_proposal'
      | 'reset_conversation'
      | 'reorder_order'
      | 'order_status'
      | 'reservation_status'
      | 'submit_order'
      | 'create_order_quote'
      | 'submit_reservation'
    order_id?: string
    order_code?: string
    action_id?: string
    proposal_id?: string
    proposal_version?: number
    quote_token?: string
    quote_version?: number
    idempotency_key?: string
    accept_price_change?: boolean
    note?: string
    delivery_details?: {
      customer_name?: string
      phone?: string
      address?: string
    }
    choice_value?: string
    choice_field?: string
    rating?: 'perfect' | 'too_much' | 'too_little' | 'too_expensive' | 'dislike'
    feedback_text?: string
    hold_token?: string
    reservation_details?: {
      customer_name?: string
      phone?: string
      guest_count?: number
      starts_at_iso?: string
      seating_area_id?: string
      note?: string
    }
  }
}

export interface ConciergeResponseEnvelope {
  conversation_id: string
  state_version: number
  session_token: string
  intent: ConciergeIntent
  current_step: ConversationStep
  message: string
  cards: ConciergeCard[]
  suggested_actions: string[]
  warnings: string[]
  references: KnowledgeReference[]
  action_waiting?: ActionWaiting
  cart_addition?: {
    items: {
      menu_item_id: string
      item_name?: string
      quantity: number
      note?: string
      unit_price_vnd: number
    }[]
    proposal_id?: string
  }
}
