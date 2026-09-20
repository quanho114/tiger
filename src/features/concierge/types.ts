/**
 * Tiger 345 - Concierge Agent Frontend Types
 * Based on plans/tiger-345/09-concierge-agent-design.md
 */

export type ConciergeIntent =
  | 'food_recommendation'
  | 'menu_lookup'
  | 'order'
  | 'order_status'
  | 'reservation'
  | 'restaurant_info'
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

export type ValidationStatus = 'PASS' | 'WARNING' | 'BLOCKED' | 'INSUFFICIENT_DATA'

export interface ServingCoverage {
  target_equivalent_adults: number
  protein_coverage_ratio: number
  carb_coverage_ratio: number
  vegetable_coverage_ratio: number
  soup_coverage_ratio: number
  overall_fit_score: number
  is_sufficient: boolean
  gaps: string[]
}

export interface ValidationCheckItem {
  name: string
  status: ValidationStatus
  message: string
  details?: Record<string, unknown>
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
}

export interface CandidateItem {
  menu_item_id: string
  item_name?: string
  unit_price_vnd: number
  quantity: number
  meal_role?: string
  serving_size?: string
  note?: string
}

export interface MealProposal {
  id: string
  version: number
  title: string
  description: string
  concept_tag: 'balanced_harmony' | 'signature_experience' | 'budget_optimized'
  items: CandidateItem[]
  subtotal_vnd: number
  serving_summary: string
  validation: CandidateValidation
  created_at: string
  expires_at: string
}

export interface MenuItemCardData {
  type: 'menu_item'
  id: string
  name: string
  description: string
  price_vnd: number
  image_url?: string
  is_available: boolean
  serving_size?: string
  pairing_note?: string
  tags: string[]
  is_signature?: boolean
}

export interface MealRecommendationCardData {
  type: 'meal_recommendation'
  proposal: MealProposal
}

export interface ClarificationChoiceOption {
  label: string
  value: string
  field: string
}

export interface ClarificationChoicesCardData {
  type: 'clarification_choices'
  question: string
  choices: ClarificationChoiceOption[]
}

export interface OrderQuoteLineItem {
  menu_item_id: string
  item_name: string
  name?: string
  quantity: number
  unit_price_vnd: number
  line_total_vnd: number
  note?: string
}

export interface OrderQuoteCardData {
  type: 'order_quote'
  quote_token: string
  quote_version: number
  order_type: 'dine_in' | 'delivery'
  items: OrderQuoteLineItem[]
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  expires_at: string
  target_summary?: string
}

export interface ReservationSummaryCardData {
  type: 'reservation_summary'
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
  total_vnd: number
  item_count: number
  created_at: string
  estimated_delivery_time?: string
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
  actions: string[]
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

export interface KnowledgeReference {
  source: string
  topic: string
  title: string
}

export interface ConciergeActionPayload {
  type:
    | 'add_proposal_to_cart'
    | 'confirm_quote'
    | 'confirm_reservation'
    | 'answer_clarification'
    | 'reset_conversation'
    | 'reorder_order'
  order_id?: string
  order_code?: string
  proposal_id?: string
  quote_token?: string
  hold_token?: string
  choice_field?: string
  choice_value?: string
  idempotency_key?: string
  accept_price_change?: boolean
  note?: string
  delivery_details?: {
    customer_name?: string
    phone?: string
    address?: string
  }
  reservation_details?: {
    customer_name?: string
    phone?: string
    guest_count?: number
    starts_at_iso?: string
    seating_area_id?: string
    note?: string
  }
}

export interface ConciergeRequestPayload {
  conversation_id?: string
  state_version?: number
  session_token?: string
  message?: string
  action?: ConciergeActionPayload
}

export interface CartAdditionItem {
  menu_item_id: string
  item_name?: string
  quantity: number
  note?: string
  unit_price_vnd: number
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
  cart_addition?: {
    items: CartAdditionItem[]
  }
}

export interface ConciergeChatMessage {
  id: string
  sender: 'user' | 'concierge'
  text: string
  timestamp: string
  cards?: ConciergeCard[]
}

export type ConciergeFeedbackRating =
  | 'perfect'
  | 'too_much'
  | 'too_little'
  | 'too_expensive'
  | 'dislike'

export interface ConciergeFeedbackPayload {
  conversation_id?: string
  proposal_id: string
  proposal_version?: number
  config_version?: string | number
  rating: ConciergeFeedbackRating
  feedback_text?: string
}

export interface ConciergeFeedbackResponse {
  success: boolean
  message: string
  feedback_id?: string
}
