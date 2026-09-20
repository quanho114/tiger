/**
 * Tiger 345 - Customer Account API Client
 * Strongly typed consumer of /functions/v1/customer-api
 * Enforces Invariant V04 (Private DTO Whitelist) and V20/V21.
 */

import { customerApi } from '@/lib/api/client'
import type {
  CustomerProfile,
  CustomerProfilePatch,
  CustomerHomeSummary,
  CustomerOrderSummary,
  CustomerOrderDetail,
  CustomerReservationSummary,
  CustomerCancelReservationPayload,
  CustomerAddress,
  CustomerAddressCreate,
  CustomerAddressUpdate,
  CustomerFavoriteItem,
  ReorderResponse,
} from './types'

export async function fetchCustomerHome(): Promise<CustomerHomeSummary> {
  const res = await customerApi.get<CustomerHomeSummary>('/customer/home')
  return res.data
}

export async function fetchCustomerProfile(): Promise<CustomerProfile> {
  const res = await customerApi.get<CustomerProfile>('/customer/profile')
  return res.data
}

export async function updateCustomerProfile(
  patch: CustomerProfilePatch
): Promise<CustomerProfile> {
  const res = await customerApi.patch<CustomerProfile>('/customer/profile', patch)
  return res.data
}

export async function fetchCustomerOrders(params?: {
  status?: string
  limit?: number
  offset?: number
}): Promise<CustomerOrderSummary[]> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params?.offset !== undefined) searchParams.set('offset', String(params.offset))

  const queryStr = searchParams.toString()
  const path = `/customer/orders${queryStr ? `?${queryStr}` : ''}`
  const res = await customerApi.get<CustomerOrderSummary[]>(path)
  return res.data
}

export async function fetchCustomerOrderDetail(id: string): Promise<CustomerOrderDetail> {
  const res = await customerApi.get<CustomerOrderDetail>(`/customer/orders/${id}`)
  return res.data
}

export async function fetchCustomerReservations(params?: {
  status?: string
  limit?: number
  offset?: number
}): Promise<CustomerReservationSummary[]> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params?.offset !== undefined) searchParams.set('offset', String(params.offset))

  const queryStr = searchParams.toString()
  const path = `/customer/reservations${queryStr ? `?${queryStr}` : ''}`
  const res = await customerApi.get<CustomerReservationSummary[]>(path)
  return res.data
}

export async function cancelCustomerReservation(
  id: string,
  payload: CustomerCancelReservationPayload
): Promise<{ success: boolean; reservation: CustomerReservationSummary }> {
  const res = await customerApi.post<{ success: boolean; reservation: CustomerReservationSummary }>(
    `/customer/reservations/${id}/cancel`,
    payload
  )
  return res.data
}

export async function fetchCustomerAddresses(): Promise<CustomerAddress[]> {
  const res = await customerApi.get<CustomerAddress[]>('/customer/addresses')
  return res.data
}

export async function createCustomerAddress(
  data: CustomerAddressCreate
): Promise<CustomerAddress> {
  const res = await customerApi.post<CustomerAddress>('/customer/addresses', data)
  return res.data
}

export async function updateCustomerAddress(
  id: string,
  data: CustomerAddressUpdate
): Promise<CustomerAddress> {
  const res = await customerApi.put<CustomerAddress>(`/customer/addresses/${id}`, data)
  return res.data
}

export async function deleteCustomerAddress(
  id: string
): Promise<{ success: boolean; id: string }> {
  const res = await customerApi.delete<{ success: boolean; id: string }>(
    `/customer/addresses/${id}`
  )
  return res.data
}

export async function fetchCustomerFavorites(): Promise<CustomerFavoriteItem[]> {
  const res = await customerApi.get<CustomerFavoriteItem[]>('/customer/favorites')
  return res.data
}

export async function addCustomerFavorite(
  menuItemId: string
): Promise<CustomerFavoriteItem> {
  const res = await customerApi.post<CustomerFavoriteItem>('/customer/favorites', {
    menu_item_id: menuItemId,
  })
  return res.data
}

export async function removeCustomerFavorite(
  menuItemId: string
): Promise<{ success: boolean; menu_item_id: string }> {
  const res = await customerApi.delete<{ success: boolean; menu_item_id: string }>(
    `/customer/favorites/${menuItemId}`
  )
  return res.data
}

export async function reorderCustomerOrder(
  orderId: string,
  targetOrderType?: 'dine_in' | 'delivery'
): Promise<ReorderResponse> {
  const res = await customerApi.post<ReorderResponse>(
    `/customer/orders/${orderId}/reorder`,
    { target_order_type: targetOrderType }
  )
  return res.data
}

export async function requestDeleteAccount(
  confirmation: string
): Promise<{ deleted: boolean; status: string; message: string }> {
  const res = await customerApi.delete<{ deleted: boolean; status: string; message: string }>(
    '/customer/profile',
    { body: { confirmation } }
  )
  return res.data
}
