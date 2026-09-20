import { publicApi, adminApi } from '@/lib/api/client'
import type {
  CreateReservationRequest,
  ReservationReceipt,
  AdminReservationListResponse,
  AdminReservationItem,
  ReservationTransitionRequest,
  ReservationContactRequest,
  ReservationNoteRequest,
} from './types'

export async function submitReservation(
  payload: CreateReservationRequest,
  idempotencyKey: string
): Promise<ReservationReceipt> {
  const res = await publicApi.post<ReservationReceipt>('/reservations', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
  })
  return res.data
}

export async function getAdminReservations(params: {
  date?: string
  status?: string
  search?: string
  limit?: number
  cursor?: string
} = {}): Promise<AdminReservationListResponse> {
  const searchParams = new URLSearchParams()
  if (params.date) searchParams.set('date', params.date)
  if (params.status && params.status !== 'all') searchParams.set('status', params.status)
  if (params.search) searchParams.set('search', params.search)
  if (params.limit) searchParams.set('limit', String(params.limit))
  if (params.cursor) searchParams.set('cursor', params.cursor)

  const queryString = searchParams.toString()
  const path = queryString ? `/reservations?${queryString}` : '/reservations'
  const res = await adminApi.get<AdminReservationListResponse>(path)
  return res.data
}

export async function getAdminReservation(id: string): Promise<AdminReservationItem> {
  const res = await adminApi.get<AdminReservationItem>(`/reservations/${id}`)
  return res.data
}

export async function transitionReservation(
  id: string,
  payload: ReservationTransitionRequest
): Promise<AdminReservationItem> {
  const res = await adminApi.post<AdminReservationItem>(
    `/reservations/${id}/transition`,
    payload
  )
  return res.data
}

export async function updateReservationContact(
  id: string,
  payload: ReservationContactRequest
): Promise<AdminReservationItem> {
  const res = await adminApi.patch<AdminReservationItem>(
    `/reservations/${id}/contact`,
    payload
  )
  return res.data
}

export async function updateReservationNote(
  id: string,
  payload: ReservationNoteRequest
): Promise<AdminReservationItem> {
  const res = await adminApi.patch<AdminReservationItem>(
    `/reservations/${id}/note`,
    payload
  )
  return res.data
}
