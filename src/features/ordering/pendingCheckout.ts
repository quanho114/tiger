import { publicApi } from '@/shared/lib/api/client'
import { ApiError } from '@/shared/lib/api/types'
import { getOrCreateCheckoutClaimSecret } from './claims/claimStorage'

type OrderMode = 'delivery' | 'dine_in' | 'takeaway'
export interface PendingCheckout {
  key: string
  claimSecret: string
  createdAt: number
}
const storageKey = (mode: OrderMode) => `tiger_pending_checkout_${mode}`
const storageError = 'Không thể lưu trạng thái đặt món an toàn. Vui lòng bật lưu trữ cho trang web rồi thử lại.'

export class CheckoutRecoveryError extends Error {}

export function readPendingCheckout(mode: OrderMode): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(storageKey(mode))
    if (!raw) return null
    const value = JSON.parse(raw) as PendingCheckout
    if (typeof value.key !== 'string' || value.key.length < 16 ||
        typeof value.claimSecret !== 'string' || value.claimSecret.length < 16 ||
        !Number.isFinite(value.createdAt)) throw new CheckoutRecoveryError(storageError)
    // Never silently issue a new key after server deduplication records expire.
    if (Date.now() - value.createdAt >= 24 * 60 * 60 * 1000) {
      throw new CheckoutRecoveryError('Đơn trước chưa xác định kết quả. Vui lòng liên hệ nhà hàng trước khi đặt lại.')
    }
    return value
  } catch (error) {
    if (error instanceof CheckoutRecoveryError) throw error
    throw new CheckoutRecoveryError(storageError)
  }
}

export function beginCheckout(mode: OrderMode, key: string): PendingCheckout {
  const existing = readPendingCheckout(mode)
  if (existing) return existing
  const pending = { key, claimSecret: getOrCreateCheckoutClaimSecret(key), createdAt: Date.now() }
  try {
    // Persist only opaque credentials, never names, phone numbers or addresses.
    sessionStorage.setItem(storageKey(mode), JSON.stringify(pending))
  } catch {
    throw new CheckoutRecoveryError(storageError)
  }
  return pending
}

export function finishCheckout(mode: OrderMode, key: string): void {
  try {
    const raw = sessionStorage.getItem(storageKey(mode))
    if (raw && (JSON.parse(raw) as PendingCheckout).key === key) sessionStorage.removeItem(storageKey(mode))
  } catch {
    // Keeping the key is safe: the next attempt will recover the same receipt.
  }
}

export function isDefinitiveCheckoutRejection(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 &&
    ![408, 429].includes(error.status) && error.code !== 'IDEMPOTENCY_CONFLICT'
}

export async function recoverCheckout<T>(pending: PendingCheckout): Promise<T | null> {
  const result = await publicApi.post<{ receipt: T | null }>('/orders/recover', {
    idempotency_key: pending.key,
    claim_secret: pending.claimSecret,
  })
  return result.data.receipt
}
