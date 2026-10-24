import type { PriceNormalization, RecommendationItem } from './types.ts'

export function isMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
export function checkedAdd(left: number, right: number): number | null {
  const result = left + right
  return isMoney(left) && isMoney(right) && isMoney(result) ? result : null
}
export function checkedMultiply(price: number, quantity: number): number | null {
  const result = price * quantity
  return isMoney(price) && Number.isSafeInteger(quantity) && quantity > 0 && isMoney(result) ? result : null
}

/** A range is an estimate interval, never an inferred orderable size/variant. */
export function normalizeRecommendationPrice(item: Pick<RecommendationItem, 'price_vnd' | 'pricing_mode' | 'price_min' | 'price_max'>): PriceNormalization {
  const mode = item.pricing_mode ?? 'fixed'
  if (mode === 'market' || mode === 'unknown') return { ok: false, reason: 'UNBOUNDED_PRICE' }
  if (mode === 'fixed') return isMoney(item.price_vnd)
    ? { ok: true, price: { min: item.price_vnd, max: item.price_vnd, kind: 'fixed', orderableExact: true } }
    : { ok: false, reason: 'INVALID_PRICE' }
  if (mode === 'range' && isMoney(item.price_min) && isMoney(item.price_max) && item.price_min <= item.price_max)
    return { ok: true, price: { min: item.price_min, max: item.price_max, kind: 'range', orderableExact: false } }
  return { ok: false, reason: 'INVALID_PRICE' }
}
