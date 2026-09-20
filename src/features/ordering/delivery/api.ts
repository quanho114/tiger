import { publicApi } from '@/lib/api/client'
import type {
  CreateDeliveryOrderRequest,
  DeliveryOrderReceipt,
  DeliveryQuoteRequest,
  DeliveryQuoteResponse,
} from './types'

export async function requestDeliveryQuote(
  payload: DeliveryQuoteRequest
): Promise<DeliveryQuoteResponse> {
  const res = await publicApi.post<DeliveryQuoteResponse>('/order-quotes', payload)
  return res.data
}

export async function submitDeliveryOrder(
  payload: CreateDeliveryOrderRequest,
  idempotencyKey: string
): Promise<DeliveryOrderReceipt> {
  const res = await publicApi.post<DeliveryOrderReceipt>('/orders', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
  return res.data
}
