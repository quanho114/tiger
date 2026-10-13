import type { ConciergeV2Card, ConciergeV2DraftOperation, ConciergeV2PageContext, ConciergeV2TurnRequest } from '@contracts/concierge-v2'

export type ConciergeCard = ConciergeV2Card

export type ConciergeActionPayload = NonNullable<ConciergeV2TurnRequest['action']>

export interface ConciergeRequestPayload {
  page_context?: ConciergeV2PageContext
  draft_operation?: ConciergeV2DraftOperation
  request_id?: string
  conversation_id?: string
  state_version?: number
  session_token?: string
  message?: string
  action?: ConciergeActionPayload
}

export interface ConciergeChatMessage {
  delivery?: 'pending' | 'interrupted' | 'complete'
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

export interface ConciergeFeedbackResponse {
  success: boolean
  message: string
  feedback_id?: string
}
