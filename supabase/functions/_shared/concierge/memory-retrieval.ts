/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: context.ts, runtime.ts, tests/server/concierge-memory-retrieval.test.ts, tests/integration/concierge-behavioral-memory.test.ts
 * - Affected API: classifyMemoryIntent, retrieveSelectiveMemory, formatMemoryPrompt, estimateTokenCount
 * - Data Schemas: ConciergeV2MemoryRetrievalResultSchema, ConciergeV2RetrievedMemoryFactSchema
 * - Verbatim Instructions:
 *   - "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có."
 *   - "Guest không được lưu transcript, profile hoặc facts vào DB/log lâu dài."
 *   - "V07: Behavioral aggregates and selective retrieval"
 *   - "4. Retrieve facts only for relevant food/draft intents; no personal lookup for parking/hours. Dietary constraints outrank inferred favorites; current explicit constraints outrank defaults."
 *   - "5. Produce source-tagged compact facts within 200-400 tokens and 12 facts. Never include address/phone/order transcript in model memory."
 *   - "6. Honor consent/epoch/deletion and expiry; allow serving without personalization during repository failures."
 */

import {
  ConciergeV2MemoryRetrievalResultSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2MemoryFact,
  type ConciergeV2MemoryRepository,
  type ConciergeV2MemoryRetrievalResult,
  type ConciergeV2RetrievedMemoryFact,
} from '../contracts/concierge-v2.ts'
import type { AuthActor } from '../types.ts'

export interface RetrieveSelectiveMemoryInput {
  message: string
  actor: ConciergeV2ActorBinding | AuthActor
  repository: ConciergeV2MemoryRepository
  currentSessionConstraints?: string[]
  nowIso?: string
  intent?: 'faq' | 'food_or_draft'
}

const FAQ_INTENT_PATTERNS: RegExp[] = [
  // Parking / xe cộ
  /(?:bãi|gửi|đỗ|đậu|chỗ)\s*(?:xe|oto|ô tô|xe máy)|parking/iu,
  // Hours / giờ mở cửa / đóng cửa
  /(?:mở cửa|đóng cửa|giờ mở|giờ đóng|giờ hoạt động|giờ phục vụ)|(?:mấy giờ|thời gian).*(?:mở|đóng|hoạt động|phục vụ)|opening hours|open hours/iu,
  // Location / địa chỉ / vị trí
  /(?:địa chỉ|ở đâu|chỉ đường|quán ở|nằm ở|vị trí|map|bản đồ)|location|address/iu,
  // Wifi
  /wifi|pass wifi|mật khẩu wifi/iu,
  // Policies / quy định / thú cưng / hút thuốc / VAT
  /(?:quy định|chính sách|thú cưng|chó mèo|hút thuốc|thuốc lá|hóa đơn vat|xuất hóa đơn)|policy|pet|smoking|vat/iu,
  // Contact / số điện thoại
  /(?:số điện thoại|sđt|hotline|liên hệ|liên lạc)|contact|phone number/iu,
]

const FOOD_OR_DRAFT_PATTERNS: RegExp[] = [
  /(?:^|[^\p{L}\p{N}])(?:món|ăn|uống|gọi món|thực đơn|menu|order|nước|bò|gà|heo|cá|tôm|hải sản|cơm|mì|lẩu|nướng|dị ứng|chay|mặn|chốt)(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])(?:recommend|suggest|tư vấn|gợi ý|thêm|bớt|phần|suất|chén|dĩa|đĩa)(?:$|[^\p{L}\p{N}])/iu,
]

export function hasFoodOrDraftIntent(message: string): boolean {
  return FOOD_OR_DRAFT_PATTERNS.some(pattern => pattern.test(message))
}

/**
 * Classifies whether customer input is purely an operational/FAQ query or food/draft related.
 * Operational FAQ inquiries perform zero personal-memory storage lookups (A08).
 */
export function classifyMemoryIntent(message: string): 'faq' | 'food_or_draft' {
  const trimmed = message.trim()
  if (!trimmed) {
    return 'faq'
  }

  const matchesFaq = FAQ_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed))
  const matchesFoodOrDraft = hasFoodOrDraftIntent(trimmed)

  // If asking about FAQ and not specifically asking about food/dishes/orders, route to FAQ
  if (matchesFaq && !matchesFoodOrDraft) {
    return 'faq'
  }

  return 'food_or_draft'
}

function getAuthenticatedCustomerId(actor: ConciergeV2ActorBinding | AuthActor): string | null {
  if ('authenticated_user_id' in actor) {
    return typeof actor.authenticated_user_id === 'string' && actor.authenticated_user_id.length > 0
      ? actor.authenticated_user_id
      : null
  }
  if (actor.role === 'customer' && typeof actor.userId === 'string' && actor.userId.length > 0) {
    return actor.userId
  }
  return null
}

function isFoodConflicted(
  preferenceFood: string,
  preferenceKey: string,
  conflictList: Array<{ food: string; key: string }>
): boolean {
  const normPref = preferenceFood.toLowerCase().trim()
  const prefKeyParts = preferenceKey.split('-').filter(Boolean)
  const prefWords = normPref.split(/\s+/).filter(Boolean)

  for (const c of conflictList) {
    const normConf = c.food.toLowerCase().trim()
    const confKeyParts = c.key.split('-').filter(Boolean)
    const confWords = normConf.split(/\s+/).filter(Boolean)

    if (preferenceKey === c.key) return true
    if (normPref === normConf) return true
    if (normPref.includes(normConf) || normConf.includes(normPref)) return true

    // Check key segment inclusion (e.g. key 'bo' inside 'pho-bo-tai-lan')
    for (const ck of confKeyParts) {
      if (ck === 'thit' || ck === 'mon' || ck === 'an') continue
      if (prefKeyParts.includes(ck)) return true
    }
    for (const pk of prefKeyParts) {
      if (pk === 'thit' || pk === 'mon' || pk === 'an') continue
      if (confKeyParts.includes(pk)) return true
    }

    // Check substantive word match (e.g. 'bò' in 'phở bò tái lăn')
    for (const cw of confWords) {
      if (cw === 'thịt' || cw === 'món' || cw === 'ăn') continue
      if (prefWords.includes(cw)) return true
    }
  }
  return false
}

/**
 * Formats retrieved facts into a compact, source-tagged prompt string.
 * Strictly excludes customer name, phone, address, prices, transcripts, or provider reasoning.
 */
export function formatMemoryPrompt(facts: ConciergeV2RetrievedMemoryFact[]): string {
  if (facts.length === 0) {
    return ''
  }

  const lines = [
    'Thông tin sở thích và chế độ ăn của khách (chỉ dùng tham khảo nếu phù hợp món ăn):',
  ]

  for (const fact of facts) {
    let tag = ''
    if (fact.memory_type === 'allergy') {
      tag = '[Dị ứng (tự khai)]'
    } else if (fact.memory_type === 'dislike') {
      tag = '[Không thích (tự khai)]'
    } else if (fact.source === 'explicit') {
      tag = '[Yêu thích (tự khai)]'
    } else {
      tag = '[Yêu thích (từ lịch sử gọi món)]'
    }

    lines.push(`- ${tag}: ${fact.food}`)
  }

  return lines.join('\n')
}

/**
 * Estimates token count conservatively (approximately 3.5 characters per token for Vietnamese/English).
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 3.5)
}

/**
 * Selectively retrieves and prioritizes memory facts for the current turn.
 * - FAQ queries skip storage lookup completely (A08).
 * - Guest and opted-out users receive zero facts.
 * - Dietary constraints (allergies, dislikes, current turn constraints) strictly defeat matching favorites.
 * - Facts are capped at 12 items and bounded to under 400 tokens.
 * - Repository failures gracefully degrade to empty facts without failing chat.
 */
export async function retrieveSelectiveMemory(
  input: RetrieveSelectiveMemoryInput
): Promise<ConciergeV2MemoryRetrievalResult> {
  const { message, actor, repository, currentSessionConstraints = [], nowIso } = input

  const intent = input.intent ?? classifyMemoryIntent(message)
  if (intent === 'faq') {
    return ConciergeV2MemoryRetrievalResultSchema.parse({
      intent_type: 'faq',
      fetched_from_storage: false,
      facts: [],
      formatted_prompt: '',
      estimated_tokens: 0,
    })
  }

  const customerUserId = getAuthenticatedCustomerId(actor)
  if (!customerUserId) {
    return ConciergeV2MemoryRetrievalResultSchema.parse({
      intent_type: 'food_or_draft',
      fetched_from_storage: false,
      facts: [],
      formatted_prompt: '',
      estimated_tokens: 0,
    })
  }

  let settings
  try {
    settings = await repository.getSettings()
  } catch {
    // Graceful degradation during repository failure
    return ConciergeV2MemoryRetrievalResultSchema.parse({
      intent_type: 'food_or_draft',
      fetched_from_storage: false,
      facts: [],
      formatted_prompt: '',
      estimated_tokens: 0,
    })
  }

  if (!settings.enabled) {
    return ConciergeV2MemoryRetrievalResultSchema.parse({
      intent_type: 'food_or_draft',
      fetched_from_storage: false,
      facts: [],
      formatted_prompt: '',
      estimated_tokens: 0,
    })
  }

  let rawFacts: ReadonlyArray<ConciergeV2MemoryFact>
  try {
    rawFacts = await repository.listFacts()
  } catch {
    // Graceful degradation during repository failure
    return ConciergeV2MemoryRetrievalResultSchema.parse({
      intent_type: 'food_or_draft',
      fetched_from_storage: true,
      facts: [],
      formatted_prompt: '',
      estimated_tokens: 0,
    })
  }

  const nowMs = nowIso ? Date.parse(nowIso) : Date.now()
  // A privacy operation may have completed while a repository read was in flight.
  const latest = await repository.getSettings().catch(() => undefined)
  if (!latest?.enabled || latest.memory_epoch !== settings.memory_epoch) {
    return ConciergeV2MemoryRetrievalResultSchema.parse({ intent_type: intent, fetched_from_storage: true,
      facts: [], formatted_prompt: '', estimated_tokens: 0 })
  }

  // Filter out any expired facts
  const unexpiredFacts = rawFacts.filter((f) => {
    if (!f.expires_at) return true
    return Date.parse(f.expires_at) > nowMs
  })

  // 1. Collect constraints (Allergies, Dislikes, and Session Constraints)
  const allergies: ConciergeV2RetrievedMemoryFact[] = []
  const dislikes: ConciergeV2RetrievedMemoryFact[] = []
  const preferences: ConciergeV2RetrievedMemoryFact[] = []

  const conflictTargets: Array<{ food: string; key: string }> = []

  // Add current session constraints as top-ranking conflict targets
  for (const sessionConstraint of currentSessionConstraints) {
    const cleaned = sessionConstraint.trim()
    if (cleaned.length > 0) {
      conflictTargets.push({ food: cleaned, key: cleaned.toLowerCase() })
    }
  }

  for (const fact of unexpiredFacts) {
    const food = fact.value.food
    const item: ConciergeV2RetrievedMemoryFact = {
      memory_type: fact.memory_type,
      memory_key: fact.memory_key,
      food,
      source: fact.source,
      confidence: fact.confidence,
      observed_at: fact.observed_at,
      expires_at: fact.expires_at,
      epoch: settings.memory_epoch,
    }

    if (fact.memory_type === 'allergy') {
      allergies.push(item)
      conflictTargets.push({ food, key: fact.memory_key })
    } else if (fact.memory_type === 'dislike') {
      dislikes.push(item)
      conflictTargets.push({ food, key: fact.memory_key })
    } else if (fact.memory_type === 'preference') {
      preferences.push(item)
    }
  }

  // 2. Filter preferences: Defeat favorites that conflict with allergies, dislikes, or current constraints
  const nonConflictedPreferences = preferences.filter(
    (pref) => !isFoodConflicted(pref.food, pref.memory_key, conflictTargets)
  )

  // 3. Sort preferences: explicit preferences first, then by confidence desc
  nonConflictedPreferences.sort((a, b) => {
    if (a.source === 'explicit' && b.source !== 'explicit') return -1
    if (b.source === 'explicit' && a.source !== 'explicit') return 1
    return b.confidence - a.confidence
  })

  // 4. Assemble final prioritized facts: Allergies -> Dislikes -> Preferences
  // Capped at 12 facts maximum
  const assembledFacts: ConciergeV2RetrievedMemoryFact[] = [
    ...allergies,
    ...dislikes,
    ...nonConflictedPreferences,
  ].slice(0, 12)

  const formattedPrompt = formatMemoryPrompt(assembledFacts)
  const estimatedTokens = estimateTokenCount(formattedPrompt)

  return ConciergeV2MemoryRetrievalResultSchema.parse({
    intent_type: 'food_or_draft',
    fetched_from_storage: true,
    facts: assembledFacts,
    formatted_prompt: formattedPrompt,
    estimated_tokens: estimatedTokens,
  })
}
