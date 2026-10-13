import { adminApi } from '@/shared/lib/api/client'
import type { AdminOrderSummary, OrderStatus, OrderType } from '../types'

export interface OrderFilters {
  type: OrderType | 'all'
  status: OrderStatus | 'all'
  search: string
  page: number
}

export async function fetchAdminOrders({ type, status, search, page }: OrderFilters) {
  const params = new URLSearchParams({ limit: '50', offset: String(page * 50) })
  if (type !== 'all') params.set('order_type', type)
  if (status !== 'all') params.set('status', status)
  if (search) params.set('search', search)
  const response = await adminApi.get<{ items: AdminOrderSummary[]; total: number }>(
    `/orders?${params}`
  )
  return response.data
}
