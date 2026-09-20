import type { CartOrderContext, PersistedCartState } from './types'

const CART_STORAGE_KEY = 'tiger_cart_draft_v1'
export const CART_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function createDefaultCartState(context?: CartOrderContext): PersistedCartState {
  return {
    version: 1,
    updatedAt: Date.now(),
    context: context || { mode: 'delivery' },
    items: [],
  }
}

export function getStoredCart(): PersistedCartState | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<PersistedCartState>
    if (!parsed || typeof parsed !== 'object') {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    if (parsed.version !== 1) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    if (typeof parsed.updatedAt !== 'number' || Date.now() - parsed.updatedAt > CART_TTL_MS) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    if (!parsed.context || typeof parsed.context !== 'object' || !('mode' in parsed.context)) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    if (!Array.isArray(parsed.items)) {
      window.localStorage.removeItem(CART_STORAGE_KEY)
      return null
    }

    // Validate item shapes safely
    const validItems = parsed.items.filter((item) => (
      item &&
      typeof item === 'object' &&
      typeof item.dishId === 'string' &&
      typeof item.quantity === 'number' &&
      item.quantity > 0
    ))

    return {
      version: 1,
      updatedAt: parsed.updatedAt,
      context: parsed.context as CartOrderContext,
      items: validItems,
      orderNote: typeof parsed.orderNote === 'string' ? parsed.orderNote : undefined,
    }
  } catch {
    try {
      window.localStorage.removeItem(CART_STORAGE_KEY)
    } catch {
      // Ignore
    }
    return null
  }
}

export function setStoredCart(cart: PersistedCartState): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    // Ignore quota or disabled storage error
  }
}

export function clearStoredCart(): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.removeItem(CART_STORAGE_KEY)
  } catch {
    // Ignore
  }
}
