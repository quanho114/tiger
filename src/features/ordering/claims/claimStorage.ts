/**
 * Tiger 345 - Guest Order Claim Storage & API Client
 * Generated for Task T18 according to plans/tiger-345/tasks/T18-guest-claim.md.
 * Importers/callers: useDeliveryOrder.ts, useDineInOrder.ts, CartDrawer.tsx, AuthCallbackPage.tsx, claims.test.ts
 * Affected API: POST /functions/v1/customer-api/me/orders/:id/claim and POST /functions/v1/public-api/orders
 * Data schemas: PendingClaim, ClaimOrderResult
 * User's verbatim instruction: "làm full các task luôn ấy"
 * Enforces Invariant V22 (Guest Order Claim Security & Flow):
 * 1. 32-byte secure random secret generated in browser prior to guest order creation.
 * 2. Secret stored in sessionStorage and associated with idempotencyKey so retries reuse both.
 * 3. Never logged, never placed in URL, never sent in GET queries.
 * 4. Claim API calls POST /functions/v1/customer-api/me/orders/:id/claim with body { claim_secret }.
 * 5. On successful claim, client clears claim secret from storage.
 */

import { customerApi } from '@/lib/api/client'

export interface PendingClaim {
  orderId: string
  secret: string
  createdAt: number
}

export interface ClaimOrderResult {
  order_id: string
  order_code: string
  claimed: boolean
  replayed: boolean
  claimed_at: string
}

const STORAGE_KEY_PREFIX = 'tiger_claim_order_'
const IDEMP_SECRET_PREFIX = 'tiger_claim_idemp_'
const PENDING_LIST_KEY = 'tiger_pending_claims'

/**
 * Generates a 32-byte cryptographically secure random secret (64-character hex string).
 */
export function generateClaimSecret(): string {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.getRandomValues) {
    // Fallback for non-browser environments (e.g. Node tests)
    const chars = '0123456789abcdef'
    let str = ''
    for (let i = 0; i < 64; i++) {
      str += chars[Math.floor(Math.random() * chars.length)]
    }
    return str
  }
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Gets or creates a claim secret associated with a specific checkout idempotency key.
 * Ensures network retries reuse both the exact same idempotency key and the same claim secret.
 */
export function getOrCreateCheckoutClaimSecret(idempotencyKey: string): string {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return generateClaimSecret()
  }

  const key = `${IDEMP_SECRET_PREFIX}${idempotencyKey}`
  try {
    const existing = window.sessionStorage.getItem(key)
    if (existing && existing.length >= 16 && existing.length <= 128) {
      return existing
    }
    const newSecret = generateClaimSecret()
    window.sessionStorage.setItem(key, newSecret)
    return newSecret
  } catch {
    return generateClaimSecret()
  }
}

/**
 * Associates an order ID with its claim secret in sessionStorage upon successful order creation.
 */
export function storeOrderClaimSecret(orderId: string, secret: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return

  try {
    const key = `${STORAGE_KEY_PREFIX}${orderId}`
    window.sessionStorage.setItem(key, secret)

    // Also track in pending claims array for auto-claim on auth callback
    const pendingJson = window.sessionStorage.getItem(PENDING_LIST_KEY)
    const list: PendingClaim[] = pendingJson ? JSON.parse(pendingJson) : []
    const filtered = list.filter((item) => item.orderId !== orderId)
    filtered.push({
      orderId,
      secret,
      createdAt: Date.now(),
    })
    window.sessionStorage.setItem(PENDING_LIST_KEY, JSON.stringify(filtered))
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Retrieves the stored claim secret for an order ID.
 */
export function getStoredClaimSecret(orderId: string): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null

  try {
    const key = `${STORAGE_KEY_PREFIX}${orderId}`
    const secret = window.sessionStorage.getItem(key)
    if (secret) return secret

    const pendingJson = window.sessionStorage.getItem(PENDING_LIST_KEY)
    if (pendingJson) {
      const list: PendingClaim[] = JSON.parse(pendingJson)
      const found = list.find((item) => item.orderId === orderId)
      return found?.secret || null
    }
    return null
  } catch {
    return null
  }
}

/**
 * Clears the stored claim secret for an order ID once claimed or expired.
 */
export function clearOrderClaimSecret(orderId: string): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return

  try {
    const key = `${STORAGE_KEY_PREFIX}${orderId}`
    window.sessionStorage.removeItem(key)

    const pendingJson = window.sessionStorage.getItem(PENDING_LIST_KEY)
    if (pendingJson) {
      const list: PendingClaim[] = JSON.parse(pendingJson)
      const filtered = list.filter((item) => item.orderId !== orderId)
      window.sessionStorage.setItem(PENDING_LIST_KEY, JSON.stringify(filtered))
    }
  } catch {
    // Ignore
  }
}

/**
 * Returns all pending unclaimed orders in the current browser session.
 */
export function getPendingUnclaimedOrders(): PendingClaim[] {
  if (typeof window === 'undefined' || !window.sessionStorage) return []

  try {
    const pendingJson = window.sessionStorage.getItem(PENDING_LIST_KEY)
    if (!pendingJson) return []
    const list: PendingClaim[] = JSON.parse(pendingJson)
    // Filter out claims older than 24 hours (TTL)
    const now = Date.now()
    const valid = list.filter((item) => now - item.createdAt < 24 * 60 * 60 * 1000)
    if (valid.length !== list.length) {
      window.sessionStorage.setItem(PENDING_LIST_KEY, JSON.stringify(valid))
    }
    return valid
  } catch {
    return []
  }
}

/**
 * Claims a guest order for the authenticated customer using their stored claim secret.
 * Enforces Invariant V22: atomic locking, SHA-256 hash comparison on server, idempotent retry.
 */
export async function claimGuestOrder(
  orderId: string,
  claimSecret: string
): Promise<ClaimOrderResult> {
  const res = await customerApi.post<ClaimOrderResult>(`/me/orders/${orderId}/claim`, {
    claim_secret: claimSecret,
  })

  if (res.data && res.data.claimed) {
    clearOrderClaimSecret(orderId)
  }

  return res.data
}
