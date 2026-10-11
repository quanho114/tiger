/**
 * Tiger Agent V3 — Phase 3: Canonical normalization.
 *
 * The single normalizer every classifier must use. Byte-identical to the
 * legacy `normalizeIntent` behavior; other modules keep importing it
 * through their existing paths (re-exported as a compat shim).
 */

import type { NormalizedTurnText } from './types.ts'

/** Diacritic-insensitive match form (legacy behavior, preserved exactly). */
export function normalizeIntent(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().trim().replace(/[.!?]+$/g, '')
}

export function normalizeTurn(message: string): NormalizedTurnText {
  const original = message
  const lowercase = message.toLowerCase().trim().replace(/\s+/g, ' ')
  return { original, lowercase, searchForm: normalizeIntent(message) }
}

/** Idempotency guard used by tests: match-form of a match-form is stable. */
export function isNormalizedStable(searchForm: string): boolean {
  return normalizeIntent(searchForm) === searchForm
}
