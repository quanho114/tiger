/**
 * Tiger Agent V3 — Phase 3: Intent classification.
 *
 * Canonical home of the deterministic turn classifier. Logic is verbatim
 * the legacy `turn-intent.ts` cascade — precedence documented below.
 * `turn-intent.ts` remains as a compat re-export.
 *
 * Precedence (first match wins):
 *   greeting > identity > thanks > farewell (exact smalltalk)
 *   > reservation (booking signals)
 *   > order_history / saved_address (account reads)
 *   > faq (fees, hours, rooms, memory-faq)
 *   > food (party+budget, pending+budget, named dish, food verbs, pending answers)
 *   > constraints (bare party/budget/children fragments)
 *   > other
 */

import { normalizeIntent } from './normalizer.ts'
import type { ConciergeTurnIntent } from './types.ts'
import { classifyMemoryIntent, hasFoodOrDraftIntent } from '../memory-retrieval.ts'
import { isDeliveryFeeQuestion, isRestaurantHoursQuestion } from '../restaurant-hours.ts'

export type { ConciergeTurnIntent }

export function namedMenuQuery(message: string): string | null {
  const text = normalizeIntent(message)
  const entity = /^(?:(?:ben minh|quan minh) )?co (?:mon )?(.+?) (?:khong|k)$/.exec(text)?.[1] ??
    /^(.+?) (?:gia bao nhieu|bao nhieu|con (?:khong|k))$/.exec(text)?.[1]
  if (!entity || /\b(?:nao|gi|ngon|khau vi|phu hop)\b/.test(entity) ||
      /\b(?:phong|wifi|xe|ban|nhac|ship|giao hang|dia chi|gio mo|gio dong)\b/.test(entity)) return null
  return entity
}

export function classifyConciergeTurn(message: string, hasPendingSuggestion = false): ConciergeTurnIntent {
  const text = normalizeIntent(message).replace(/[,;:]+$/g, '').trim()
  if (/^(?:(?:xin )?chao(?: buoi (?:sang|trua|chieu|toi))?(?: (?:ban|shop|ad|admin|tiger|nha hang|em|anh|chi|moi nguoi|ca nha|bac|bot))?(?: (?:a|oi|nhe|nha|ne|nhen|nhi|nh1|nhe1|nha1|a1|ha|he))?|(?:hi|hello|hey|alo|good (?:morning|afternoon|evening))(?: (?:ban|shop|ad|admin|tiger|nha hang|em|anh|chi|moi nguoi|ca nha|bac|bot))?(?: (?:a|oi|nhe|nha|ne|nhen|nhi|nh1|nhe1|nha1|a1|ha|he))?)$/.test(text)) return 'greeting'
  if (/^(?:ban la ai|ban ten gi|ban lam duoc gi|ban co the lam gi|tro ly nay la ai|ai day|ai the)(?: (?:vay|the|a))?$/.test(text)) return 'identity'
  if (/^(?:cam on|thank you|thanks)(?: (?:ban|shop|ad|tiger|em|anh|chi))?(?: (?:nhe|nha|ne|nhen|nh1|a|oi))?$/.test(text)) return 'thanks'
  if (/^(?:tam biet|bye|goodbye)(?: (?:ban|shop|ad|tiger|em|anh|chi))?(?: (?:nhe|nha|ne|nh1|a|oi))?$/.test(text)) return 'farewell'
  if (/\b(?:dat ban|giu cho|con ban|kiem tra ban)\b/.test(text) ||
      /\bco ban\b.{0,80}\b(?:cho|luc|gio|trong|toi|mai|khong|k)\b/.test(text)) return 'reservation'
  if (/\b(?:don hang|don cu|don truoc|lan truoc|lich su don|dat lai)\b/.test(text)) return 'order_history'
  if (/\b(?:dia chi (?:da luu|cua toi|cua minh|giao hang|giao mon|nha toi|nha minh)|so dia chi)\b/.test(text)) return 'saved_address'
  if (isDeliveryFeeQuestion(message) || isRestaurantHoursQuestion(message) ||
      /\b(?:phi (?:ship|giao(?: hang)?)|ship|giao hang)\b/.test(text) &&
      /\b(?:phi|bao nhieu|may ngay|bao lau|chinh sach|thoi gian)\b/.test(text)) return 'faq'
  if (/\b(?:phong rieng|phong vip)\b/.test(text)) return 'faq'
  if (classifyMemoryIntent(message) === 'faq') return 'faq'
  const hasParty = /\b\d{1,2}\s*(?:nguoi|khach)\b/.test(text)
  const hasBudget = /\b\d+(?:[.,]\d+)?\s*(?:trieu|tr\d?|k|nghin|ngan|dong|vnd)\b/.test(text)
  if (hasParty && (hasBudget || /\b(?:co|them|voi)\s+(?:\d{1,2}\s*)?(?:be|tre|con)\b/.test(text))) return 'food'
  if (hasPendingSuggestion && hasBudget && /\b(?:ngan sach|budget|toi da|duoi|khoang|tam|con)\b/.test(text)) return 'food'
  if (namedMenuQuery(message) || hasFoodOrDraftIntent(message) ||
      /\b(?:bua|mam|tiec|khau phan|ngan sach|do an|mon|cay|chay|doi bung|gio nhap|gio hang|chot|pizza|combo)\b/.test(text) ||
      /^(?:cho (?:toi|minh) |toi |minh )?(?:lay|them|goi|bo|xoa|doi|sua)\s+/.test(text) ||
      (hasPendingSuggestion && /^(?:ok|okay|dong y|lay mon nay|lay mon do|lay cai nay|khong|chua|dung|de xem|\d{1,2}\s*(?:nguoi|khach))$/.test(text))) return 'food'
  if (/^(?:\d{1,2}\s*(?:nguoi|khach)(?:\s+(?:nha|a|nhe))?|(?:ngan sach(?: con)?|budget(?: con)?|con|toi da|duoi|khoang|tam)\s*\d+(?:[.,]\d+)?\s*(?:trieu|tr\d?|k|nghin|ngan|dong|vnd)(?:\s+thoi)?|(?:(?:co|them|voi)\s+(?:\d{1,2}\s*)?|\d{1,2}\s+)(?:be|tre|con)(?:\s+\d{1,2}\s*tuoi)?)$/.test(text)) return 'constraints'
  return 'other'
}
