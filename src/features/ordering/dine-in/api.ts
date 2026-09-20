import { publicApi } from '@/lib/api/client'
import type {
  CreateDineInOrderRequest,
  DineInOrderReceipt,
  DineInQuoteRequest,
  DineInQuoteResponse,
} from './types'

export async function requestDineInQuote(
  payload: DineInQuoteRequest
): Promise<DineInQuoteResponse> {
  const res = await publicApi.post<DineInQuoteResponse>('/order-quotes', payload)
  return res.data
}

export async function submitDineInOrder(
  payload: CreateDineInOrderRequest,
  idempotencyKey: string
): Promise<DineInOrderReceipt> {
  const res = await publicApi.post<DineInOrderReceipt>('/orders', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
  return res.data
}
