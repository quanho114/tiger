/**
2026-09-20: Task T12 - Reservation Data Types & Contracts
Invariants: V13 (Customer Privacy), V15 (Reservation Timing & Honest Status), V16 (State Machine), V24 (Idempotency)
*/

export type ReservationStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'seated'
  | 'completed'
  | 'no_show'

export interface CreateReservationRequest {
  customer_name: string
  customer_phone: string
  starts_at: string
  guest_count: number
  seating_area_id?: string | null
  note?: string
}

export interface ReservationReceipt {
  id: string
  code: string
  status: ReservationStatus
  customer_name: string
  customer_phone: string
  starts_at: string
  ends_at: string
  guest_count: number
  seating_area_id: string | null
  area_name_snapshot: string | null
  note: string
  created_at: string
  version: number
}

export interface AdminReservationItem extends ReservationReceipt {
  internal_note: string
  contact_outcome: string | null
  contacted_at: string | null
  customer_user_id: string | null
  updated_at: string
}

export interface AdminReservationListResponse {
  items: AdminReservationItem[]
  next_cursor: string | null
}

export interface ReservationTransitionRequest {
  expected_version: number
  target_status: ReservationStatus
  reason?: string
}

export interface ReservationContactRequest {
  expected_version: number
  outcome: string
  contacted_at?: string
}

export interface ReservationNoteRequest {
  expected_version: number
  internal_note: string
}
