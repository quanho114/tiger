import { isRestaurantFactQuestion, restaurantFactField } from '../restaurant-info.ts'
import type { ConciergeTurnIntent, ReadNeed } from './types.ts'

/** Retrieval goals are independent of the primary intent and never grant account access. */
export function interpretReadNeeds(message: string, text: string, intent: ConciergeTurnIntent, named: string | null): ReadNeed[] {
  const needs: ReadNeed[] = []
  const policy = /\b(?:chinh sach|quy dinh|hoan tien|huy don|doi tra|quy trinh)\b/.test(text)
  const merchandising: ('signature' | 'bestseller' | 'new')[] = []
  if (/\b(?:dac san|dac trung|signature)\b/.test(text)) merchandising.push('signature')
  if (/\b(?:ban chay|best seller|bestseller)\b/.test(text)) merchandising.push('bestseller')
  if (/\bmon moi\b/.test(text)) merchandising.push('new')
  const browse = /\b(?:menu|thuc don|danh sach mon|xem mon)\b/.test(text)
  const recommend = /\b(?:goi y|tu van|bua an|bua trua|bua toi|mam|combo|set|an gi)\b/.test(text)
  // A policy mentioning food is not itself a dish request. Explicit menu goals coexist with it.
  if (browse || merchandising.length || named || recommend || (intent === 'food' && !policy)) {
    needs.push({ kind: 'menu', mode: browse ? 'browse' : named ? 'detail' : recommend ? 'recommendation' : 'browse', merchandising })
    if ((browse || named) && recommend) needs.push({ kind: 'menu', mode: 'recommendation', merchandising })
  }
  if (intent === 'faq' || policy || restaurantFactField(message) || (!needs.length && isRestaurantFactQuestion(message))) {
    needs.push({ kind: 'restaurant', query: message.slice(0, 200) })
  }
  return needs
}

/** Operational lookup currently answers one field; expose additional fields as deferred. */
export function deferredRestaurantReads(message: string, clauses: string[]): ReadNeed[] {
  const seen = new Set([restaurantFactField(message)])
  const deferred: ReadNeed[] = []
  for (const clause of clauses) {
    const field = restaurantFactField(clause)
    if (field && !seen.has(field)) {
      seen.add(field)
      deferred.push({ kind: 'restaurant', query: clause.slice(0, 200) })
    }
  }
  return deferred
}
