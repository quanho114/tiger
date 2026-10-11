/**
 * Tiger Agent V3 — Phase 3: Understanding Engine entry point.
 *
 * ONE canonical interpretation per turn. Pure, deterministic, offline.
 * Text understanding (understandTurn) is separated from contextual
 * resolution (understandDraft, which needs session state + catalog)
 * so the engine never touches the database.
 */

import type { ConciergeV2SessionMutableState } from '../../contracts/concierge-v2.ts'
import { normalizeTurn } from './normalizer.ts'
import { classifyConciergeTurn, namedMenuQuery } from './intent-classifier.ts'
import { extractConstraintDelta } from './constraint-extractor.ts'
import { resolveDraftIntent } from './draft-command.ts'
import { classifyMemoryIntent } from '../memory-retrieval.ts'
import type {
  DraftCommand,
  TurnUnderstanding,
  UnderstandingConfidence,
} from './types.ts'

export type { TurnUnderstanding, DraftCommand }

type NamedItem = { id: string; name: string }

/** Cheap catalog-free draft signal. Authoritative result: understandDraft(). */
function detectDraftSignal(searchForm: string, hasQuestionMark: boolean): TurnUnderstanding['draftSignal'] {
  // Mirror resolveDraftIntent's informational guards: recommendation phrases
  // and dish questions are never draft commands.
  if (/^(?:goi y|tu van|tim|co mon)/.test(searchForm)) return 'none'
  if (/^(?:chot|chot mon|xem gio nhap|xem lai|chot don)$/.test(searchForm)) return 'review'
  if (/^(?:khong|chua|chua chot|dung|de xem|nghe ngon|khong (?:lay|chon|them) .+)$/.test(searchForm)) return 'reject'
  if (!hasQuestionMark &&
      /^(?:cho (?:toi|minh) |toi |minh )?(?:lay|them|goi|bo|xoa|doi|sua)\s+/.test(searchForm)) {
    return 'possible_operation'
  }
  return 'none'
}

/**
 * Deterministic confidence heuristic (metadata for future fallback phases).
 * HIGH: exact smalltalk / booking / account classifiers.
 * MEDIUM: faq, constraints, or food with supporting evidence.
 * LOW: ambiguous / unrecognized.
 */
function confidenceFor(
  intent: TurnUnderstanding['intent'],
  opts: { hasNamedDish: boolean; hasPartyOrBudget: boolean; hasDraftSignal: boolean },
): UnderstandingConfidence {
  switch (intent) {
    case 'greeting':
    case 'identity':
    case 'thanks':
    case 'farewell':
    case 'reservation':
    case 'order_history':
    case 'saved_address':
      return 'high'
    case 'food':
      return opts.hasNamedDish || opts.hasPartyOrBudget || opts.hasDraftSignal ? 'high' : 'medium'
    case 'faq':
    case 'constraints':
      return 'medium'
    default:
      return 'low'
  }
}

export function understandTurn(message: string, hasPendingSuggestion = false): TurnUnderstanding {
  const normalized = normalizeTurn(message)
  const intent = classifyConciergeTurn(message, hasPendingSuggestion)
  const constraintsDelta = extractConstraintDelta(message)
  const memoryIntent = classifyMemoryIntent(message)
  const named = intent === 'food' ? namedMenuQuery(message) : null
  const draftSignal = detectDraftSignal(normalized.searchForm, message.includes('?'))
  const hasPartyOrBudget = constraintsDelta.partyTotal !== undefined || constraintsDelta.budgetVnd !== undefined
  const confidence = confidenceFor(intent, {
    hasNamedDish: named !== null,
    hasPartyOrBudget,
    hasDraftSignal: draftSignal !== 'none',
  })
  return {
    normalized,
    intent,
    confidence,
    constraintsDelta,
    draftSignal,
    memoryIntent,
    entities: { namedMenuQuery: named },
    requiresClarification: confidence === 'low',
  }
}

/** Second-stage resolution: needs live session state + authoritative catalog. */
export function understandDraft(
  message: string,
  state: ConciergeV2SessionMutableState,
  catalog: NamedItem[],
): DraftCommand {
  return resolveDraftIntent(message, state, catalog)
}
