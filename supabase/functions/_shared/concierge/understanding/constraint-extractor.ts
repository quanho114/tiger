/**
 * Tiger Agent V3 — Phase 3: Constraint extraction.
 *
 * Splits the legacy `applyTurnConstraints` into a pure parse step
 * (extractConstraintDelta — no session access) and a merge step
 * (mergeConstraintDelta — owns the legacy merge semantics verbatim).
 * `turn-constraints.ts` remains as a compat wrapper.
 */

import type { ConciergeV2SessionConstraints } from '../../contracts/concierge-v2.ts'
import { normalizeIntent } from './normalizer.ts'
import type { ConstraintDelta } from './types.ts'

const HARD_BUDGET_MARKERS = ['ngan sach', 'ngan sach con', 'toi da', 'duoi']

/** Pure parse: raw signals from text, no state. Never mutates anything. */
export function extractConstraintDelta(message: string): ConstraintDelta {
  const delta: ConstraintDelta = {}
  const text = normalizeIntent(message)

  const party = /\b(\d{1,2})\s*(?:nguoi|khach)\b/.exec(text)
  if (party && Number(party[1]) >= 1 && Number(party[1]) <= 30) {
    delta.partyTotal = Number(party[1])
  }
  const child = /\b(co|them|voi)\s+(?:(\d{1,2})\s*)?(?:be|tre|con)(?:\s+\d{1,2}\s*tuoi)?\b/.exec(text)
  const shortChild = /^(\d{1,2})\s+(?:be|tre|con)(?:\s+\d{1,2}\s*tuoi)?$/.exec(text)
  if (child || shortChild) {
    delta.childCount = Math.min(30, Number(child?.[2] || shortChild?.[1] || 1))
    if (child?.[1]) delta.childVerb = child[1]
  } else {
    delta.childCount = null
  }

  if (/\b(?:an cay duoc|bo yeu cau khong cay)\b/.test(text)) delta.spice = 'clear'
  else if (/\bkhong cay\b/.test(text)) delta.spice = 'zero'

  const priceQuestion = /\b(?:gia|bao nhieu|mon nao|combo|phi ship|phi giao)\b/.test(text)
  if (!priceQuestion) {
    const budget = /\b(ngan sach(?: con)?|budget(?: con)?|con|toi da|duoi|khoang|tam)\s*(\d+(?:[.,]\d+)?)\s*(trieu|tr(\d)?|k|nghin|ngan|dong|vnd)\b/.exec(text) ??
      (/\b\d{1,2}\s*(?:nguoi|khach)\b/.test(text)
        ? /\b(nguoi|khach)\s+(\d+(?:[.,]\d+)?)\s*(trieu|tr(\d)?|k|nghin|ngan|dong|vnd)\b/.exec(text) : null)
    if (budget) {
      const amount = Number(budget[2].replace(',', '.'))
      const multiplier = budget[3].startsWith('tr') ? 1_000_000 : ['k', 'nghin', 'ngan'].includes(budget[3]) ? 1_000 : 1
      const vnd = Math.round((amount + (budget[4] ? Number(budget[4]) / 10 : 0)) * multiplier)
      if (Number.isSafeInteger(vnd) && vnd >= 0 && Number.isFinite(amount)) {
        delta.budgetVnd = vnd
        delta.budgetMarker = budget[1]
      }
    }
  }
  return delta
}

/** Legacy merge semantics, verbatim. Returns a new object. */
export function mergeConstraintDelta(
  previous: ConciergeV2SessionConstraints,
  delta: ConstraintDelta,
): ConciergeV2SessionConstraints {
  const next = { ...previous }
  const childCount = delta.childCount ?? null
  if (delta.partyTotal !== undefined) {
    const total = delta.partyTotal
    next.party_size_confirmed = true
    if (childCount !== null && childCount < total) {
      next.children = childCount
      next.adults = total - childCount
    } else {
      next.children = Math.min(next.children, total - 1)
      next.adults = total - next.children
    }
  } else if (childCount !== null) {
    if (delta.childVerb === 'them') {
      next.children = Math.min(30, next.children + childCount)
    } else if (next.party_size_confirmed && childCount < next.adults + next.children) {
      next.adults = Math.max(1, next.adults + next.children - childCount)
      next.children = childCount
    } else {
      next.children = childCount
    }
  }
  if (delta.spice === 'clear') delete next.max_spice_level
  else if (delta.spice === 'zero') next.max_spice_level = 0
  if (delta.budgetVnd !== undefined) {
    next.budget_vnd = delta.budgetVnd
    next.is_hard_budget = HARD_BUDGET_MARKERS.includes(delta.budgetMarker ?? '') ||
      (['con', 'budget con'].includes(delta.budgetMarker ?? '') && previous.is_hard_budget)
  }
  return next
}

/** Compat: exact legacy entry point. */
export function applyTurnConstraints(
  message: string,
  previous: ConciergeV2SessionConstraints,
): ConciergeV2SessionConstraints {
  return mergeConstraintDelta(previous, extractConstraintDelta(message))
}
