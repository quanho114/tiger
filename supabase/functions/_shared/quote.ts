/**
 * Tiger 345 - Order Quote Engine & Canonical Request Utilities
 * Handles quote calculation, normalization, cryptographic signing (TTL 5 mins),
 * and deterministic canonical request hashing for idempotency.
 */

import { Buffer } from 'node:buffer'
import { createSignedToken, verifySignedToken, sha256 } from './crypto.ts'
import { AppError } from './errors.ts'

export const QUOTE_TTL_SECONDS = 300 // 5 minutes

export function getQuoteSecret(): string {
  return (
    process.env.QUOTE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'tiger345-order-quote-secret-2026'
  )
}

export interface RawLineItem {
  menu_item_id: string
  quantity: number
  note?: string
}

export interface NormalizedLineItem {
  menu_item_id: string
  quantity: number
  note: string
}

export interface QuotedLineItem extends NormalizedLineItem {
  item_name: string
  unit_price_vnd: number
  line_total_vnd: number
}

export interface DineInQuoteContext {
  table_id: string
  table_visit_id: string
  table_name: string
  epoch: number
}

export interface DeliveryQuoteContext {
  delivery_zone_id: string
  zone_name?: string
  fee_vnd?: number
  free_threshold_vnd?: number | null
  address?: string
  customer_name?: string
  customer_phone?: string
  [key: string]: unknown
}

export type OrderQuoteContext = DineInQuoteContext | DeliveryQuoteContext | Record<string, unknown>

export interface OrderQuotePayload {
  type: 'order_quote'
  actor_scope: string
  order_type: 'dine_in' | 'delivery'
  context: OrderQuoteContext
  items: QuotedLineItem[]
  subtotal_vnd: number
  shipping_fee_vnd: number
  total_vnd: number
  [key: string]: unknown
}

/**
 * Normalizes and aggregates raw line items:
 * - Groups duplicate (menu_item_id, trimmed_note) by summing quantities
 * - Enforces per-line limit: 1..99
 * - Enforces order limit: 1..50 normalized lines
 * - Sorts deterministically by menu_item_id ASC, then note ASC
 */
export function normalizeLineItems(rawItems: RawLineItem[]): NormalizedLineItem[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw AppError.validation('Danh sách món không được để trống', {
      items: ['Cần ít nhất 1 món ăn'],
    })
  }

  const map = new Map<string, NormalizedLineItem>()

  for (let idx = 0; idx < rawItems.length; idx++) {
    const raw = rawItems[idx]
    if (!raw || typeof raw !== 'object') {
      throw AppError.validation(`Dòng món thứ ${idx + 1} không hợp lệ`)
    }

    const menuItemId = typeof raw.menu_item_id === 'string' ? raw.menu_item_id.trim() : ''
    if (!menuItemId || !/^[0-9a-fA-F-]{36}$/.test(menuItemId)) {
      throw AppError.validation(`Mã món ăn (menu_item_id) tại dòng ${idx + 1} không hợp lệ`)
    }

    const qty = Number(raw.quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw AppError.validation(`Số lượng món tại dòng ${idx + 1} phải là số nguyên từ 1 đến 99`)
    }

    const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, 500) : ''
    const key = `${menuItemId}:::${note}`

    if (map.has(key)) {
      const existing = map.get(key)!
      existing.quantity += qty
      if (existing.quantity > 99) {
        throw AppError.validation(
          `Tổng số lượng cho món '${menuItemId}' cùng ghi chú vượt quá giới hạn 99 phần`
        )
      }
    } else {
      map.set(key, {
        menu_item_id: menuItemId,
        quantity: qty,
        note,
      })
    }
  }

  const normalized = Array.from(map.values())
  if (normalized.length > 50) {
    throw AppError.validation('Số lượng dòng món tối đa trong một đơn hàng là 50 dòng')
  }

  // Deterministic sorting
  normalized.sort((a, b) => {
    if (a.menu_item_id !== b.menu_item_id) {
      return a.menu_item_id.localeCompare(b.menu_item_id)
    }
    return a.note.localeCompare(b.note)
  })

  return normalized
}

/**
 * Computes canonical request hash for idempotency checking.
 * DOES NOT include quote_token or expiration, allowing safe retries and requotes of uncommitted payloads.
 */
export function computeCanonicalRequestHash(params: {
  order_type: string
  context: {
    table_id?: string | null
    table_visit_id?: string | null
    delivery_zone_id?: string | null
    address?: string | null
    customer_name?: string | null
    customer_phone?: string | null
  }
  items: NormalizedLineItem[]
  note?: string
  claim_secret_hash?: string | null
}): string {
  // Sort items deterministically
  const sortedItems = [...params.items]
    .map((i) => ({
      menu_item_id: i.menu_item_id,
      quantity: i.quantity,
      note: i.note,
    }))
    .sort((a, b) => {
      if (a.menu_item_id !== b.menu_item_id) {
        return a.menu_item_id.localeCompare(b.menu_item_id)
      }
      return a.note.localeCompare(b.note)
    })

  const canonicalObj = {
    claim_secret_hash: params.claim_secret_hash || null,
    context: {
      address: params.context.address ? params.context.address.trim() : null,
      customer_name: params.context.customer_name ? params.context.customer_name.trim() : null,
      customer_phone: params.context.customer_phone ? params.context.customer_phone.trim() : null,
      delivery_zone_id: params.context.delivery_zone_id || null,
      table_id: params.context.table_id || null,
      table_visit_id: params.context.table_visit_id || null,
    },
    items: sortedItems,
    note: (params.note || '').trim(),
    order_type: params.order_type,
  }

  return sha256(JSON.stringify(canonicalObj))
}

/**
 * Generates a signed Order Quote with 5-minute TTL.
 */
export function createOrderQuote(
  params: {
    actor_scope: string
    order_type: 'dine_in' | 'delivery'
    context: OrderQuoteContext
    items: QuotedLineItem[]
    subtotal_vnd: number
    shipping_fee_vnd: number
    total_vnd: number
  },
  secret = getQuoteSecret(),
  ttlSeconds = QUOTE_TTL_SECONDS
): { quote_token: string; expires_at: string } {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const payload: OrderQuotePayload = {
    type: 'order_quote',
    actor_scope: params.actor_scope,
    order_type: params.order_type,
    context: params.context,
    items: params.items,
    subtotal_vnd: params.subtotal_vnd,
    shipping_fee_vnd: params.shipping_fee_vnd,
    total_vnd: params.total_vnd,
  }

  const quote_token = createSignedToken(payload, secret, {
    expiresInSeconds: ttlSeconds,
    kid: 'v1',
  })

  return { quote_token, expires_at: expiresAt }
}

/**
 * Cryptographically verifies an Order Quote token.
 */
export function verifyOrderQuote(
  token: string,
  secret = getQuoteSecret(),
  options?: { allowExpired?: boolean }
): OrderQuotePayload & { is_expired?: boolean } {
  const result = verifySignedToken<OrderQuotePayload>(token, secret, {
    ignoreExpiration: options?.allowExpired,
  })
  if (!result.valid) {
    if (result.error.toLowerCase().includes('expired')) {
      throw new AppError(
        'QUOTE_EXPIRED',
        'Báo giá đã hết hạn (giới hạn 5 phút). Vui lòng kiểm tra lại giỏ hàng và nhận báo giá mới.',
        409
      )
    }
    throw new AppError(
      'QUOTE_CHANGED',
      `Token báo giá không hợp lệ hoặc đã bị thay đổi: ${result.error}`,
      409
    )
  }

  const payload = result.payload
  if (
    payload.type !== 'order_quote' ||
    !payload.actor_scope ||
    (payload.order_type !== 'dine_in' && payload.order_type !== 'delivery') ||
    !payload.context ||
    !Array.isArray(payload.items) ||
    typeof payload.total_vnd !== 'number'
  ) {
    throw new AppError('QUOTE_CHANGED', 'Cấu trúc token báo giá không hợp lệ', 409)
  }

  return {
    ...payload,
    is_expired: result.expired,
  }
}

/**
 * Extracts payload from quote token without signature/expiry check,
 * solely to extract table context for idempotency request hash lookup prior to replay.
 */
export function extractQuotePayloadUnchecked(token: string): OrderQuotePayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (payload && payload.type === 'order_quote' && payload.context) {
      return payload as OrderQuotePayload
    }
    return null
  } catch {
    return null
  }
}

export interface ReservationHoldPayload {
  type: 'reservation_hold'
  actor_scope: string
  customer_name: string
  phone: string
  guest_count: number
  starts_at_iso: string
  seating_area_name?: string
  note?: string
  [key: string]: unknown
}

/**
 * Generates a signed Reservation Hold Token with 5-minute TTL.
 */
export function createReservationHoldToken(
  params: {
    actor_scope: string
    customer_name: string
    phone: string
    guest_count: number
    starts_at_iso: string
    seating_area_name?: string
    note?: string
  },
  secret = getQuoteSecret(),
  ttlSeconds = QUOTE_TTL_SECONDS
): { hold_token: string; expires_at: string } {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString()
  const payload: ReservationHoldPayload = {
    type: 'reservation_hold',
    actor_scope: params.actor_scope,
    customer_name: params.customer_name.trim(),
    phone: params.phone.trim(),
    guest_count: Number(params.guest_count),
    starts_at_iso: params.starts_at_iso,
    seating_area_name: params.seating_area_name,
    note: params.note,
  }

  const hold_token = createSignedToken(payload, secret, {
    expiresInSeconds: ttlSeconds,
    kid: 'v1',
  })

  return { hold_token, expires_at: expiresAt }
}

/**
 * Cryptographically verifies a Reservation Hold Token.
 */
export function verifyReservationHoldToken(
  token: string,
  secret = getQuoteSecret(),
  options?: { allowExpired?: boolean }
): ReservationHoldPayload & { is_expired?: boolean } {
  const result = verifySignedToken<ReservationHoldPayload>(token, secret, {
    ignoreExpiration: options?.allowExpired,
  })
  if (!result.valid) {
    if (result.error.toLowerCase().includes('expired')) {
      throw new AppError(
        'QUOTE_EXPIRED',
        'Phiếu giữ chỗ tạm thời đã hết hạn (giới hạn 5 phút). Vui lòng xác nhận lại thông tin đặt bàn.',
        409
      )
    }
    throw new AppError(
      'RESERVATION_PAYLOAD_CHANGED',
      `Token giữ chỗ không hợp lệ hoặc đã bị thay đổi: ${result.error}`,
      409
    )
  }

  const payload = result.payload
  if (
    payload.type !== 'reservation_hold' ||
    !payload.actor_scope ||
    !payload.customer_name ||
    !payload.phone ||
    !payload.guest_count ||
    !payload.starts_at_iso
  ) {
    throw new AppError('RESERVATION_PAYLOAD_CHANGED', 'Cấu trúc token giữ chỗ không hợp lệ', 409)
  }

  return {
    ...payload,
    is_expired: result.expired,
  }
}

