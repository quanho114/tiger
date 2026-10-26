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

const NON_FOOD_TARGETS = new Set([
  '', 'mon', 'mon an', 'do an', 'thuc an', 'thuc don', 'menu', 'mam', 'mam com',
  'bua', 'bua an', 'bua trua', 'bua toi', 'bua sang', 'bua chieu', 'set', 'combo',
  'dac san', 'dac trung', 'signature', 'ban chay', 'best seller', 'bestseller', 'mon moi', 'mon ngon',
  'gi', 'nao', 'gi ngon', 'mon gi', 'mon nao', 'an gi', 'lua chon', 'phuong an', 'khau phan',
  'nhau', 'mon nhau', 'lai rai', 'an nhe', 'snack', 'gia dinh', 'nhom', 'tiec',
  'toi', 'minh', 'em', 'anh', 'chi', 'ban', 'khach', 'nguoi', 'hom nay', 'toi nay', 'trua nay', 'bua nay',
])

function parseMealTargets(raw: string): string[] {
  const stripped = raw
    .replace(/(?<![\p{L}\p{N}])(?:cho\s+)?\d{1,2}\s*(?:người|nguoi|khách|khach|bé|be|trẻ|tre|con|món|mon|phần|phan)(?:\s+\d{1,2}\s*(?:tuổi|tuoi))?(?![\p{L}\p{N}])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:ngân sách|ngan sach|budget|tối đa|toi da|khoảng|khoang|tầm|tam|dưới|duoi|giá|gia|chi phí|chi phi)\s+[^,.;!?]+/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?\s*(?:triệu|trieu|tr\d?|k|nghìn|nghin|ngàn|ngan|đồng|dong|vnd|đ)(?![\p{L}\p{N}])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:không cay|khong cay|ít cay|it cay|ăn cay|an cay(?:\s+được|\s+duoc)?)(?![\p{L}\p{N}])/giu, ' ')
    .replace(/(?<![\p{L}\p{N}])(?:tư vấn|tu van|gợi ý|goi y|lên mâm|len mam|lên thực đơn|len thuc don|chọn giúp|chon giup)(?![\p{L}\p{N}]).*$/iu, ' ')
  return stripped
    .split(/[,;/]|\s+(?:và|va|với|voi|hoặc|hoac|hay|cùng|cung|kèm|kem)\s+/iu)
    .map(part => part
      .replace(/^(?:thêm|them|có|co|gồm|gom|về|ve|các|cac|những|nhung|mấy|may|vài|vai|một|mot|hai|ba|bốn|bon|năm|nam|\d+|\s)+/iu, '')
      .replace(/^(?:món|mon|phần|phan|dĩa|dia|tô|to|nồi|noi|loại|loai)\s+(?:ăn\s+|an\s+|nhậu\s+|nhau\s+)?(?:từ\s+|tu\s+|về\s+|ve\s+|như\s+|nhu\s+)?/iu, '')
      .replace(/^(?:từ|tu|về|ve|như|nhu)\s+/iu, '')
      .replace(/\s+(?:giúp|giup|hộ|ho|cho|với|voi|nhé|nhe|nha|ạ|đi|di|nữa|nua|thôi|thoi|xem|thử|thu|ngon|hợp lý|hop ly|phù hợp|phu hop|bên mình|ben minh|bên bạn|ben ban|của quán|cua quan|nhà hàng|nha hang|quán mình|quan minh|ở đây|o day|tối nay|toi nay|trưa nay|trua nay|hôm nay|hom nay|bữa nay|bua nay)(?:\s+.*)?$/iu, '')
    )
    .map(part => cleanFoodText(part).slice(0, 120))
    .filter(food => {
      const norm = normalizeIntent(food)
      return Boolean(norm) && !/^\d+$/.test(norm) && !NON_FOOD_TARGETS.has(norm) &&
        !/\b(?:ngan sach|budget|gioi han|yeu cau|best seller|bestseller|ban chay|dac san|mon thu|mon so|mon nay|mon do|cai nay|cai do|gio nhap|gio hang)\b/.test(norm)
    })
}

function extractSessionMealFacts(message: string): { preferences: string[]; dislikes: string[] } {
  if (/(?:(?<![\p{L}\p{N}])(?:có|co)\s+.*(?<![\p{L}\p{N}])(?:không|khong|k)\s*\??$|(?<![\p{L}\p{N}])(?:giá bao nhiêu|gia bao nhieu|gồm những gì|gom nhung gi|thành phần gì|thanh phan gi|làm từ gì|lam tu gi)(?![\p{L}\p{N}]))/iu.test(message.trim())) {
    return { preferences: [], dislikes: [] }
  }
  const preferences: string[] = []
  const dislikes: string[] = []
  const replaceMatch = /(?<![\p{L}\p{N}])(?:đổi|doi|thay)\s+(?:món\s+|mon\s+)?([^,.;!?]+?)\s+(?:sang|bằng|bang|qua|thành|thanh)\s+(?:món\s+|mon\s+)?([^.;!?]+)/iu.exec(message)
  if (replaceMatch) {
    dislikes.push(...parseMealTargets(replaceMatch[1]))
    preferences.push(...parseMealTargets(replaceMatch[2]))
    return { preferences, dislikes }
  }
  const switchMatch = /(?<![\p{L}\p{N}])(?:đổi sang|doi sang|đổi qua|doi qua|thay bằng|thay bang|chuyển sang|chuyen sang|chuyển qua|chuyen qua)\s+([^.;!?]+)/iu.exec(message)
  if (switchMatch) {
    preferences.push(...parseMealTargets(switchMatch[1]))
  }
  const rejectMatch = /(?<![\p{L}\p{N}])(?:bỏ\s+món|bo\s+mon|không lấy|khong lay|không gọi|khong goi|đừng cho|dung cho|không muốn\s+ăn|khong muon\s+an)\s+([^.;!?]+)/iu.exec(message)
  if (rejectMatch) {
    dislikes.push(...parseMealTargets(rejectMatch[1]))
  }
  const desireMatch = /(?<![\p{L}\p{N}])(?:muốn\s+(?:ăn|gọi|dùng|chọn)|muon\s+(?:an|goi|dung|chon)|thèm(?:\s+ăn|\s+món)?|thêm\s+món|them\s+mon)\s+([^.;!?]+)/iu.exec(message)
  if (desireMatch) {
    preferences.push(...parseMealTargets(desireMatch[1]))
  }
  const consultMatch = /(?<![\p{L}\p{N}])(?:tư vấn|tu van|gợi ý|goi y|lên mâm|len mam|lên thực đơn|len thuc don|chọn giúp|chon giup)(?![\p{L}\p{N}])([^.;!?]+)/iu.exec(message)
  if (consultMatch) {
    const tail = consultMatch[1].replace(
      /^\s*(?:giúp|giup|hộ|ho)?\s*(?:cho\s+)?(?:tôi|toi|mình|minh|em|anh|chị|chi|bọn mình|bon minh|tụi mình|tui minh|gia đình|gia dinh|nhà mình|nha minh|khách|khach)?\s*(?:mâm|mam|bữa|bua|thực đơn|thuc don|set|combo)?(?:\s+\d{1,2}\s*(?:người|nguoi|khách|khach|món|mon))*\s*/iu,
      '',
    )
    preferences.push(...parseMealTargets(tail))
  }
  return { preferences: [...new Set(preferences)], dislikes: [...new Set(dislikes)] }
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
  if (!['QUOTED_TEXT', 'HYPOTHETICAL_OR_SPECULATIVE'].includes(extracted.rejection_reason ?? '')) {
    const mealFacts = extractSessionMealFacts(message)
    for (const food of mealFacts.dislikes) {
      state.constraints.dislikes = merge(state.constraints.dislikes, [food])
      state.constraints.preferences = state.constraints.preferences.filter(value => normalizeIntent(value) !== normalizeIntent(food))
    }
    for (const food of mealFacts.preferences) {
      state.constraints.preferences = merge(state.constraints.preferences, [food])
      state.constraints.dislikes = state.constraints.dislikes.filter(value => normalizeIntent(value) !== normalizeIntent(food))
    }
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
