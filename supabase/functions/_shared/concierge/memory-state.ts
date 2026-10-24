import type { ConciergeV2SessionMutableState, ConciergeV2SessionMemoryContext, ConciergeV2RetrievedMemoryFact } from '../contracts/concierge-v2.ts'
import { extractExplicitFacts, cleanFoodText } from './memory-extractor.ts'
import { normalizeIntent } from './draft-intent.ts'

type Constraints = ConciergeV2SessionMutableState['constraints']
const keys = ['preferences', 'dislikes', 'allergies'] as const
const constraintKey = (type: string) => type === 'allergy' ? 'allergies' : type === 'dislike' ? 'dislikes' : 'preferences'

export function initializeMemoryContext(state: ConciergeV2SessionMutableState, ownerId?: string): void {
  if (state.memory_context && !state.memory_context.owner_id && ownerId) {
    // Guest claim carries independently supplied meal facts, never durable imports.
    state.memory_context.owner_id = ownerId
    state.memory_context.imported = []
    state.constraints = structuredClone(state.memory_context.current)
    return
  }
  if (state.memory_context && state.memory_context.owner_id === ownerId) {
    state.constraints = structuredClone(state.memory_context.current)
    return
  }
  const current = structuredClone(state.constraints)
  // Authenticated pre-provenance records cannot prove which strings were
  // imported. Drop unauditable personalization; retain a conservative safety
  // block instead of treating a possibly imported allergy as a verified fact.
  if (ownerId && (state.transcript.length || state.summary || state.memory_context)) {
    current.preferences = []; current.dislikes = []
    if (current.allergies.length) current.allergies = ['unverified-additional-allergens']
    state.transcript = []; state.summary = ''
    state.pending_items = []; state.pending_suggestion_ids = []
    if (state.conversation_context) delete state.conversation_context.displayed
  }
  state.memory_context = { schema_version: 1, source: 'user', scope: 'meal', current,
    ...(ownerId ? { owner_id: ownerId } : {}), imported: [] }
  state.constraints = structuredClone(current)
}

function merge(previous: string[], values: string[], allergy = false): string[] {
  const combined = [...new Set([...previous, ...values])]
  return allergy && combined.length > 12 ? [...combined.slice(0, 11), 'unverified-additional-allergens'] : combined.slice(0, 12)
}

export function collectSessionFacts(state: ConciergeV2SessionMutableState, message: string): boolean {
  const extracted = extractExplicitFacts(message.replace(/^(?:hôm nay|bữa nay|bữa này|tối nay)[, ]*/iu, ''))
  let allergyCorrection = false
  for (const fact of extracted.facts) {
    const key = constraintKey(fact.memory_type)
    if (fact.is_correction) {
      if (key === 'allergies') { allergyCorrection = true; continue }
      state.constraints[key] = state.constraints[key].filter(value => normalizeIntent(value) !== normalizeIntent(fact.food))
    } else {
      state.constraints[key] = merge(state.constraints[key], [fact.food], key === 'allergies')
      const opposite = key === 'preferences' ? 'dislikes' : key === 'dislikes' ? 'preferences' : null
      if (opposite) state.constraints[opposite] = state.constraints[opposite].filter(value => normalizeIntent(value) !== normalizeIntent(fact.food))
    }
  }
  // Temporary/group declarations apply to this meal, never to durable personal facts.
  if (['TEMPORARY_STATEMENT', 'THIRD_PARTY_STATEMENT'].includes(extracted.rejection_reason ?? '')) {
    const preference = /(?:không thích|không ăn|kiêng|thích)\s+(?:ăn\s+)?([^.;!?]+)/iu.exec(message)
    if (preference) {
      const key = /^(?:không|kiêng)/iu.test(preference[0]) ? 'dislikes' : 'preferences'
      const food = cleanFoodText(preference[1]).slice(0, 120)
      if (food) state.constraints[key] = merge(state.constraints[key], [food])
    }
  }
  const allergy = /(?:dị ứng|di ung)\s+(?:với\s+)?([^.;!?]+)/iu.exec(message)
  if (allergy && !/(?:không|khong|hết|het|chưa|chua).{0,12}$/iu.test(message.slice(0, allergy.index)) &&
      !['QUOTED_TEXT', 'HYPOTHETICAL_OR_SPECULATIVE'].includes(extracted.rejection_reason ?? '')) {
    const foods = allergy[1].split(/[,/]|\s+(?:và|and)\s+/iu).map(value => cleanFoodText(value).slice(0, 120)).filter(Boolean)
    state.constraints.allergies = merge(state.constraints.allergies, foods, true)
  }
  state.memory_context!.current = structuredClone(state.constraints)
  return allergyCorrection
}

function conflicts(food: string, other: string): boolean {
  const a = normalizeIntent(food); const b = normalizeIntent(other)
  return a === b || ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `)
}

export function applyEffectiveMemory(state: ConciergeV2SessionMutableState, facts: ConciergeV2RetrievedMemoryFact[], epoch: number, now = Date.now()): void {
  const context = state.memory_context!
  const imported: ConciergeV2SessionMemoryContext['imported'] = facts.filter(fact => fact.epoch === epoch && fact.observed_at &&
    (fact.expires_at == null || Date.parse(fact.expires_at) > now)).map(fact => ({
    ...fact, observed_at: fact.observed_at!, expires_at: fact.expires_at ?? null, epoch, scope: 'personal' as const,
  }))
  context.imported = imported.slice(0, 12)
  const effective = structuredClone(context.current)
  for (const fact of context.imported) {
    const key = constraintKey(fact.memory_type)
    if (key !== 'allergies' && context.current.preferences.concat(context.current.dislikes).some(value => conflicts(fact.food, value))) continue
    effective[key] = merge(effective[key], [fact.food], key === 'allergies')
  }
  effective.preferences = effective.preferences.filter(food => !effective.dislikes.concat(effective.allergies).some(value => conflicts(food, value)))
  state.constraints = effective
}

/** Handler scalar updates are current-meal data. Imported strings never flow back. */
export function finishMemoryState(state: ConciergeV2SessionMutableState): void {
  if (!state.memory_context) return
  const current = state.memory_context.current
  const scalars = Object.fromEntries(Object.entries(state.constraints).filter(([key]) => !keys.includes(key as typeof keys[number])))
  state.memory_context.current = { ...scalars, preferences: current.preferences, dislikes: current.dislikes, allergies: current.allergies } as Constraints
}
