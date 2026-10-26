/**
 * Tiger Agent V3 — Phase 3: Constraint extraction.
 *
 * Splits the legacy `applyTurnConstraints` into a pure parse step
 * (extractConstraintDelta — no session access) and a merge step
 * (mergeConstraintDelta — preserves party/spice and owns budget basis/count).
 * `turn-constraints.ts` remains as a compat wrapper.
 */

import type { ConciergeV2SessionConstraints } from '../../contracts/concierge-v2.ts'
import { normalizeIntent } from './normalizer.ts'
import type { ConstraintDelta } from './types.ts'
import { clearsCustomerBudget, parseCustomerBudget, parseRequestedDishCount } from './money-parser.ts'

const HARD_BUDGET_MARKERS = ['ngan sach', 'ngan sach con', 'toi da', 'duoi']

/** Pure parse: raw signals from text, no state. Never mutates anything. */
export function extractConstraintDelta(message: string): ConstraintDelta {
  const delta: ConstraintDelta = {}
  let text = normalizeIntent(message)
  const writtenNumbers: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, lam: 5, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 }
  text = text.replace(/\b(hai muoi(?: (?:mot|hai|ba|bon|tu|lam|nam|sau|bay|tam|chin))?|ba muoi|muoi(?: (?:mot|hai|ba|bon|tu|lam|nam|sau|bay|tam|chin))?|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin)\s+(nguoi|khach)\b/g,
    (_whole, phrase: string, unit: string) => {
      const words = phrase.split(' ')
      const count = words[1] === 'muoi' ? writtenNumbers[words[0]] * 10 + (writtenNumbers[words[2]] ?? 0)
        : words[0] === 'muoi' ? 10 + (writtenNumbers[words[1]] ?? 0) : writtenNumbers[words[0]]
      return `${count} ${unit}`
    })

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

  if (clearsCustomerBudget(text)) delta.clearBudget = true
  const budget = parseCustomerBudget(text)
  if (budget) {
    delta.budgetVnd = budget.amountVnd
    delta.budgetMarker = budget.marker
    delta.budgetBasis = budget.basis
  }
  const dishCount = parseRequestedDishCount(text)
  if (dishCount?.invalid) delta.requestedDishCountInvalid = true
  if (dishCount?.count !== undefined) {
    delta.requestedDishCount = dishCount.count
    delta.requestedDishCountScope = dishCount.scope
  }
  return delta
}

/** Preserve legacy party/spice behavior; merge normalized budget/count immutably. */
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
  if (delta.clearBudget) {
    next.budget_vnd = null
    next.is_hard_budget = false
    delete next.budget_basis
    delete next.budget_per_person_vnd
  }
  if (delta.budgetVnd !== undefined) {
    next.budget_basis = delta.budgetBasis ?? 'total'
    if (next.budget_basis === 'per_person') next.budget_per_person_vnd = delta.budgetVnd
    else {
      delete next.budget_per_person_vnd
      next.budget_vnd = delta.budgetVnd
    }
    next.is_hard_budget = HARD_BUDGET_MARKERS.includes(delta.budgetMarker ?? '') ||
      (['con', 'budget con'].includes(delta.budgetMarker ?? '') && previous.is_hard_budget)
  }
  if (next.budget_basis === 'per_person' && next.budget_per_person_vnd !== undefined) {
    const total = next.party_size_confirmed
      ? next.budget_per_person_vnd * (next.adults + next.children) : null
    next.budget_vnd = total !== null && Number.isSafeInteger(total) && total >= 0 ? total : null
  }
  if (delta.requestedDishCount !== undefined) {
    next.requested_dish_count = delta.requestedDishCount
    next.requested_dish_count_scope = delta.requestedDishCountScope ?? 'final_meal'
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
