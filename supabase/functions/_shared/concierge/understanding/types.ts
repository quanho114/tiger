/**
 * Tiger Agent V3 — Phase 3: Understanding types.
 *
 * ONE canonical interpretation per customer turn. Deterministic only —
 * no LLM calls in this phase. Low confidence is metadata for a future
 * structured-fallback phase, never a behavior change by itself.
 */

import type { ConciergeV2DraftOperation } from '../../contracts/concierge-v2.ts'

/** Contract intent names — identical to the legacy classifier. */
export type ConciergeTurnIntent =
  | 'greeting' | 'identity' | 'thanks' | 'farewell' | 'reservation'
  | 'faq' | 'food' | 'constraints' | 'order_history' | 'saved_address' | 'other'

export type UnderstandingConfidence = 'high' | 'medium' | 'low'

export type ReadNeed =
  | { kind: 'menu'; mode: 'browse' | 'detail' | 'recommendation'; merchandising: ('signature' | 'bestseller' | 'new')[]; query?: string }
  | { kind: 'restaurant'; query: string }

export type MemoryIntent = 'faq' | 'food_or_draft'

/** Canonical text forms. `searchForm` is the diacritic-insensitive match form. */
export interface NormalizedTurnText {
  original: string
  /** Lowercase, whitespace-collapsed original (diacritics kept). */
  lowercase: string
  /** Diacritic-stripped, `đ`→`d`, lowercased, trailing `.installed!?` removed. */
  searchForm: string
}

/** Pure parse output — a DELTA, never a session mutation. */
export interface ConstraintDelta {
  partyTotal?: number
  childCount?: number | null
  /** 'co' | 'them' | 'voi' — verb driving the child-count merge. */
  childVerb?: string
  spice?: 'zero' | 'clear'
  budgetVnd?: number
  budgetBasis?: 'total' | 'per_person'
  clearBudget?: boolean
  requestedDishCount?: number
  requestedDishCountScope?: 'final_meal' | 'new_additions'
  /** Invalid explicit count must be clarified, never silently clamped. */
  requestedDishCountInvalid?: boolean
  /** Raw budget marker word (`ngan sach`, `toi da`, `con`, …) for hard-budget merge. */
  budgetMarker?: string
}

export type DraftCommand =
  | { kind: 'none' | 'reject' | 'clarify' | 'review' }
  | { kind: 'operations'; operations: ConciergeV2DraftOperation[] }

export interface TurnUnderstanding {
  normalized: NormalizedTurnText
  intent: ConciergeTurnIntent
  readNeeds: ReadNeed[]
  /** Goals recognized but not executed by this bounded turn implementation. */
  deferredReadNeeds: ReadNeed[]
  confidence: UnderstandingConfidence
  constraintsDelta: ConstraintDelta
  /** Catalog/state-free signal; full resolution via understandDraft(). */
  draftSignal: 'none' | 'possible_operation' | 'review' | 'reject'
  memoryIntent: MemoryIntent
  entities: {
    /** Present when intent is food and the message names one specific dish. */
    namedMenuQuery: string | null
  }
  requiresClarification: boolean
}
