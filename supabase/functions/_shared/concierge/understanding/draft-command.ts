/**
 * Tiger Agent V3 — Phase 3: Draft command understanding.
 *
 * Canonical home of deterministic draft-command resolution. Logic is
 * verbatim the legacy `resolveDraftIntent` — deterministic safety rules
 * preserved (questions never mutate; ambiguity clarifies, never guesses).
 * `draft-intent.ts` remains as a compat re-export.
 */

import type { ConciergeV2SessionMutableState } from '../../contracts/concierge-v2.ts'
import { normalizeIntent } from './normalizer.ts'
import type { DraftCommand } from './types.ts'

type NamedItem = { id: string; name: string }

export type { DraftCommand }

export function resolveDraftIntent(message: string, state: ConciergeV2SessionMutableState, catalog: NamedItem[]): DraftCommand {
  const text = normalizeIntent(message)
  if (/^bò(?:\s|$)/iu.test(message.trim())) return { kind: 'none' }
  if (/^bo(?:\s|$)/.test(text) && message.includes('?') &&
      /\b(?:gia|bao nhieu|con khong|nguyen lieu|thanh phan)\b/.test(text)) return { kind: 'none' }
  if (/^(?:goi y|tu van|tim|co mon)/.test(text)) return { kind: 'none' }
  if (/^(?:chot|chot mon|xem gio nhap|xem lai|chot don)$/.test(text)) return { kind: 'review' }
  if (/^(?:khong|chua|chua chot|dung|de xem|nghe ngon|khong (?:lay|chon|them) .+)$/.test(text)) return { kind: 'reject' }
  const pending = state.pending_items ?? []
  if (/^(?:ok|okay|dong y|lay mon nay|lay mon do|lay cai nay)$/.test(text)) {
    if (pending.length !== 1) return { kind: 'clarify' }
    const item = pending[0]
    return { kind: 'operations', operations: [{ type: 'add_item', pending_suggestion_id: item.suggestion_id,
      menu_item_id: item.menu_item_id, quantity: item.quantity, note: '' }] }
  }
  const verb = /^(?:cho (?:toi|minh) |toi |minh )?(lay|them|goi|bo|xoa|doi|sua)\s+(.+)$/.exec(text)
  if (!verb) return { kind: 'none' }
  if (message.includes('?')) return { kind: 'clarify' }
  const body = verb[2].replace(/[,;:]/g, ' ').replace(/\s+/g, ' ').trim()
  const matches = catalog.filter(item => ` ${body} `.includes(` ${normalizeIntent(item.name)} `))
  if (verb[1] === 'doi' && matches.length !== 1 && state.pending_items?.length) return { kind: 'none' }
  if (matches.length !== 1) return { kind: 'clarify' }
  const item = matches[0]
  // Only a bounded quantity and ordinary command particles may surround a named dish.
  // Questions, times, variants and unparsed words require clarification.
  const remaining = body.replace(normalizeIntent(item.name), ' ').replace(/\b(?:mon|phan|suat|dia|chen|to|cho toi|cho minh|nhe|nha|voi|di)\b/g, ' ').replace(/\bx(?=\d)/g, '').trim()
  if (!/^[\d\s]*$/.test(remaining)) return { kind: 'clarify' }
  const number = remaining.match(/\b(\d+)\b/g)
  const lines = state.draft?.items.filter(line => line.menu_item_id === item.id) ?? []
  if (['bo', 'xoa'].includes(verb[1])) {
    if (number) return { kind: 'clarify' }
    return lines.length === 1 ? { kind: 'operations', operations: [{ type: 'remove_item', line_id: lines[0].line_id }] } : { kind: 'clarify' }
  }
  const quantity = number?.length === 1 ? Number(number[0]) : number ? 0 : 1
  if (quantity < 1 || quantity > 99) return { kind: 'clarify' }
  if (['doi', 'sua'].includes(verb[1])) {
    return lines.length === 1 && number ? { kind: 'operations', operations: [{ type: 'set_quantity', line_id: lines[0].line_id, quantity }] } : { kind: 'clarify' }
  }
  // Named imperative is independent evidence of acceptance, not a model-supplied flag.
  return { kind: 'operations', operations: [{ type: 'add_item', pending_suggestion_id: item.id,
    menu_item_id: item.id, quantity, note: '' }] }
}
