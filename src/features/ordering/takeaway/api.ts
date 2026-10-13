import { publicApi } from '@/shared/lib/api/client'
import type {
  CreateTakeawayOrderRequest,
  TakeawayOrderReceipt,
  TakeawayQuoteRequest,
  TakeawayQuoteResponse,
} from './types'

export async function requestTakeawayQuote(
  payload: TakeawayQuoteRequest
): Promise<TakeawayQuoteResponse> {
  const res = await publicApi.post<TakeawayQuoteResponse>('/order-quotes', payload)
  return res.data
}

export async function submitTakeawayOrder(
  payload: CreateTakeawayOrderRequest,
  idempotencyKey: string
): Promise<TakeawayOrderReceipt> {
  const res = await publicApi.post<TakeawayOrderReceipt>('/orders', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
  return res.data
}
