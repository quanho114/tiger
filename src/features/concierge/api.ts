/**
 * Tiger 345 - Concierge API Client Gateway
 * Reuses existing publicApi client from @/lib/api/client
 */

import { publicApi } from '@/lib/api/client'
import type {
  ConciergeFeedbackPayload,
  ConciergeFeedbackResponse,
  ConciergeRequestPayload,
  ConciergeResponseEnvelope,
} from './types'

export async function sendConciergeChat(
  payload: ConciergeRequestPayload
): Promise<ConciergeResponseEnvelope> {
  const res = await publicApi.post<ConciergeResponseEnvelope>('/concierge/chat', payload)
  return res.data
}

export async function sendConciergeAction(
  payload: ConciergeRequestPayload
): Promise<ConciergeResponseEnvelope> {
  const res = await publicApi.post<ConciergeResponseEnvelope>('/concierge/action', payload)
  return res.data
}

export async function sendConciergeFeedback(
  feedback: ConciergeFeedbackPayload
): Promise<ConciergeFeedbackResponse> {
  const res = await publicApi.post<ConciergeFeedbackResponse>(
    '/concierge/feedback',
    feedback
  )
  return res.data
}
