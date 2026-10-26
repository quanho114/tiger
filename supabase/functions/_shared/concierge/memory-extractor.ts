/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: runtime.ts, orchestrator.ts, tests/server/concierge-memory-extractor.test.ts, tests/integration/concierge-memory-extractor.test.ts
 * - Affected API: extractExplicitFacts, processAndPersistExplicitMemory, slugifyFoodKey, cleanFoodText
 * - Data Schemas: ConciergeV2ExtractedFactCandidateSchema, ConciergeV2ExtractionResultSchema, ConciergeV2MemoryFactInputSchema, ConciergeV2MemoryWriteInputSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V06: Durable explicit fact extraction", "1. Implement strict structured extraction for food preferences, dislikes and dietary constraints, with schema validation and fact/token caps.", "2. Reject temporary statements such as today/eating with a friend, hypothetical/quoted text, negations and assistant claims.", "3. Require opt-in/auth before extraction persistence.", "Exit criteria: A durable statement is remembered only with enabled memory. Temporary/ambiguous text is excluded. Forget/disable while extraction runs defeats the later write."
 */

import {
  ConciergeV2ExtractionResultSchema,
  ConciergeV2MemoryFactInputSchema,
  type ConciergeV2ActorBinding,
  type ConciergeV2ExtractedFactCandidate,
  type ConciergeV2ExtractionResult,
  type ConciergeV2MemoryFactInput,
  type ConciergeV2MemoryRepository,
  type ConciergeV2MemoryType,
} from '../contracts/concierge-v2.ts'
import type { AuthActor } from '../types.ts'
import { normalizeAllergen } from './food-safety.ts'
import { redactPii } from './redact.ts'

export interface ProcessAndPersistInput {
  expectedMemoryEpoch?: number
  message: string
  actor: ConciergeV2ActorBinding | AuthActor
  repository: ConciergeV2MemoryRepository
  nowIso?: string
}

export interface ProcessAndPersistResult {
  persisted: number
  rejection_reason: string | null
  extracted_facts: ConciergeV2MemoryFactInput[]
  deleted_corrections: number
  epoch_checked: number | null
}

const MAX_FACTS_PER_TURN = 3
const MAX_MESSAGE_LENGTH = 1000

// Patterns identifying temporary, session-only requests (never durable)
const RE_TEMPORARY =
  /(?:^|[^\p{L}\p{N}])(?:hôm nay|bữa nay|hôm nay thôi|lát nữa|tối nay|trưa nay|chiều nay|sáng nay|bữa này|lần này|tạm thời|chốc nữa|đợt này|dịp này|today|tonight|this time|for now|just for today|this evening|this meal|for this order|right now|temporarily)(?:$|[^\p{L}\p{N}])/ui

// Patterns identifying third-party preferences (never durable for the user)
const RE_THIRD_PARTY =
  /(?:^|[^\p{L}\p{N}])(?:đi cùng|đi với|bạn (?:tôi|mình|em)|sếp|đồng nghiệp|người yêu|vợ|chồng|con|khách của tôi|bạn gái|bạn trai|nhóm|cho bạn|cho người đi cùng|with (?:a|my)? friend|my guest|my colleague|my boss|my partner|my wife|my husband|my kids?|for my friend|for the group)(?:$|[^\p{L}\p{N}])/ui

// Patterns identifying hypothetical, quoted, or speculative statements
const RE_HYPOTHETICAL =
  /(?:^|[^\p{L}\p{N}])(?:giả sử|ví dụ|nếu|lỡ như|liệu|thử|if|suppose|what if|hypothetically|for example|imagine)(?:$|[^\p{L}\p{N}])/ui

// Patterns identifying questions/inquiries (not explicit user declarations)
const RE_INQUIRY =
  /(?:\?|(?:^|[^\p{L}\p{N}])(?:có\s+.*không|không\s*\?|hả\s*\?|đúng\s*không|phải\s*không|nhỉ\s*\?)(?:$|[^\p{L}\p{N}])|^(?:quán có|bên mình có|cho hỏi|thực đơn có|ở đây có|menu có|có món nào|do you have|is there|are there|can i get|what are|does the menu have)(?:$|[^\p{L}\p{N}]))/ui

// Clean particles and punctuation from extracted food phrase
const RE_TRAILING_PARTICLES =
  /(?:[\s,.;!?]+|^)(?:nhé|nha|ạ|ạ\s*quán|nhé\s*quán|luôn|luôn\s*ạ|được\s*không|không\s*ạ|nhá|nè|nhe|với|rồi|rồi\s*nhé|rồi\s*nha|rất\s*nặng|nặng|quá|lắm|cực\s*kỳ|please|pls|thanks|thank\s*you)[\s,.;!?]*$/gui

const RE_LEADING_PARTICLES =
  /^(?:món|đồ|loại|các\s*món|món\s*ăn)\s+/gui

/**
 * Transforms a raw food string into a stable kebab-case key adhering to ConciergeV2MemoryKeySchema.
 */
export function slugifyFoodKey(food: string, memoryType?: ConciergeV2MemoryType): string {
  if (memoryType === 'allergy') {
    const normalized = normalizeAllergen(food)
    if (normalized) return normalized
  }

  const clean = food
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // Enforce at most 16 segments
  const segments = clean.split('-').filter(Boolean).slice(0, 16)
  const slug = segments.join('-').slice(0, 80).replace(/-+$/, '')

  return slug || 'item'
}

/**
 * Cleans extracted food string, strips prompt injection & PII, and bounds length.
 */
export function cleanFoodText(raw: string): string {
  if (!raw) return ''

  let text = raw.trim()

  // Strip script tags and their content first
  text = text.replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gi, '')

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // Strip prompt injection tokens
  text = text.replace(/(?:system\s*instruction|ignore\s+(?:all\s+)?previous\s+instructions?)/gi, '')

  // Redact PII
  text = redactPii(text)

  // Strip trailing punctuation before checking particles
  text = text.replace(/[.,;!?:~"'“”‘’)\]\s]+$/gu, '').trim()

  // Strip trailing particles repeatedly
  let prev = ''
  while (prev !== text) {
    prev = text
    text = text.replace(RE_TRAILING_PARTICLES, '').trim()
  }

  // Strip leading particles
  text = text.replace(RE_LEADING_PARTICLES, '').trim()

  // Strip trailing/leading punctuation
  text = text.replace(/^[.,;!?:~"'“”‘’([\s]+|[.,;!?:~"'“”‘’)\]\s]+$/gu, '').trim()

  if (text.length === 0 || text.includes('[REDACTED_')) {
    return ''
  }

  // Capitalize first letter
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Checks if text is quoted (direct speech or citation from another source).
 */
function isQuotedText(text: string): boolean {
  return /^["'“‘].+["'”’]$/.test(text.trim()) || /:\s*["'“‘].+["'”’]/.test(text.trim())
}

/**
 * Pure deterministic rule-based extractor for explicit user food facts.
 */
export function extractExplicitFacts(rawMessage: string): ConciergeV2ExtractionResult {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'EMPTY_OR_OVERSIZED',
    }
  }

  const trimmed = rawMessage.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_LENGTH) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'EMPTY_OR_OVERSIZED',
    }
  }

  // 1. Quoted text check
  if (isQuotedText(trimmed)) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'QUOTED_TEXT',
    }
  }

  // 2. Question / inquiry check
  if (RE_INQUIRY.test(trimmed)) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'INQUIRY_OR_QUESTION',
    }
  }

  // 3. Temporary time-constraint check
  if (RE_TEMPORARY.test(trimmed)) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'TEMPORARY_STATEMENT',
    }
  }

  // 4. Third-party preference check
  if (RE_THIRD_PARTY.test(trimmed)) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'THIRD_PARTY_STATEMENT',
    }
  }

  // 5. Hypothetical / speculative check
  if (RE_HYPOTHETICAL.test(trimmed)) {
    return {
      extracted: false,
      facts: [],
      rejection_reason: 'HYPOTHETICAL_OR_SPECULATIVE',
    }
  }

  const candidates: ConciergeV2ExtractedFactCandidate[] = []

  // --- A. Corrections (clearing or updating a prior dislike/allergy) ---
  const correctionMatches = [
    // VN: "mình ăn được hành rồi", "tôi hết dị ứng tôm rồi", "không còn ghét cay nữa"
    trimmed.match(/^(?:mình|tôi|em)?\s*(?:đã\s+)?(?:ăn được|hết dị ứng|không còn ghét|không còn kiêng|bình thường với)\s+(?:ăn\s+)?([^.,;!]+)/i),
    // EN: "i can eat onions now", "cured of my seafood allergy", "no longer hate coriander"
    trimmed.match(/^(?:i can eat|no longer hate|no longer dislike|not allergic to anymore|cured of my allergy to)\s+(?:eating\s+)?([^.,;!]+)/i),
  ]
  for (const m of correctionMatches) {
    if (m && m[1]) {
      const food = cleanFoodText(m[1])
      if (food.length >= 2 && food.length <= 120) {
        const isAllergy = /dị ứng|allergy/i.test(trimmed)
        const memoryType: ConciergeV2MemoryType = isAllergy ? 'allergy' : 'dislike'
        const memoryKey = slugifyFoodKey(food, memoryType)
        candidates.push({
          memory_type: memoryType,
          memory_key: memoryKey,
          food,
          confidence: 95,
          is_correction: true,
          target_memory_key: memoryKey,
        })
      }
    }
  }

  // --- B. Explicit Allergies ---
  const allergyMatches = [
    // VN: "mình bị dị ứng tôm", "tôi dị ứng với đậu phộng", "kiêng hoàn toàn vì dị ứng cá"
    trimmed.match(/^(?:mình|tôi|em|anh|chị)?\s*(?:bị\s+)?dị ứng\s+(?:với\s+|nặng\s+với\s+)?([^.;!]+)/i),
    trimmed.match(/^(?:không ăn được vì dị ứng|kiêng hoàn toàn vì dị ứng)\s+(?:với\s+)?([^.;!]+)/i),
    // EN: "i am allergic to peanuts", "i have an allergy to shellfish"
    trimmed.match(/^(?:i am|i'm)\s+allergic\s+to\s+([^.;!]+)/i),
    trimmed.match(/^(?:i have an allergy to|allergy to|allergic to)\s+([^.;!]+)/i),
  ]
  for (const m of allergyMatches) {
    if (m && m[1]) {
      for (const part of m[1].split(/\s+(?:và|and)\s+|[,/]/iu)) {
        const food = cleanFoodText(part)
        if (food.length >= 2 && food.length <= 120) {
          const memoryKey = slugifyFoodKey(food, 'allergy')
          candidates.push({
            memory_type: 'allergy',
            memory_key: memoryKey,
            food,
            confidence: 100,
            is_correction: false,
          })
        }
      }
    }
  }

  // --- C. Explicit Dislikes ---
  const dislikeMatches = [
    // VN: "mình không thích ăn hành lá", "tôi ghét đậu bắp", "mình không ăn được đồ cay"
    trimmed.match(/^(?:mình|tôi|em|anh|chị)?\s*(?:ghét|không thích|không ăn được|kiêng|sợ)\s+(?:ăn\s+)?([^.,;!]+)/i),
    // EN: "i don't like coriander", "i hate raw fish", "i avoid spicy food"
    trimmed.match(/^(?:i don't like|i dislike|i hate|i can't eat|i avoid)\s+(?:eating\s+)?([^.,;!]+)/i),
  ]
  for (const m of dislikeMatches) {
    if (m && m[1]) {
      const food = cleanFoodText(m[1])
      if (food.length >= 2 && food.length <= 120) {
        const memoryKey = slugifyFoodKey(food, 'dislike')
        candidates.push({
          memory_type: 'dislike',
          memory_key: memoryKey,
          food,
          confidence: 90,
          is_correction: false,
        })
      }
    }
  }

  // --- D. Explicit Preferences ---
  const preferenceMatches = [
    // VN: "mình thích sườn nướng mật ong", "tôi mê ăn cá hồi", "em nghiện món bò"
    trimmed.match(/^(?:mình|tôi|em|anh|chị)?\s*(?:rất thích|thích|mê|nghiện|khoái)\s+(?:ăn\s+)?([^.,;!]+)/i),
    // EN: "i love spicy beef", "i prefer grilled dishes", "my favorite is salmon"
    trimmed.match(/^(?:i love|i really like|i like|i prefer|my favorite is)\s+(?:eating\s+)?([^.,;!]+)/i),
  ]
  for (const m of preferenceMatches) {
    if (m && m[1]) {
      const food = cleanFoodText(m[1])
      if (food.length >= 2 && food.length <= 120) {
        const memoryKey = slugifyFoodKey(food, 'preference')
        candidates.push({
          memory_type: 'preference',
          memory_key: memoryKey,
          food,
          confidence: 90,
          is_correction: false,
        })
      }
    }
  }

  // Deduplicate by memory_type + memory_key
  const seen = new Set<string>()
  const uniqueCandidates: ConciergeV2ExtractedFactCandidate[] = []

  for (const cand of candidates) {
    const id = `${cand.memory_type}:${cand.memory_key}`
    if (!seen.has(id)) {
      seen.add(id)
      uniqueCandidates.push(cand)
      if (uniqueCandidates.length >= MAX_FACTS_PER_TURN) break
    }
  }

  const result: ConciergeV2ExtractionResult = {
    extracted: uniqueCandidates.length > 0,
    facts: uniqueCandidates,
    rejection_reason: uniqueCandidates.length > 0 ? null : 'NO_EXPLICIT_FACT_DETECTED',
  }

  return ConciergeV2ExtractionResultSchema.parse(result)
}

/**
 * Determines whether the given actor is an authenticated customer eligible for memory persistence.
 */
function isAuthenticatedCustomer(actor: ConciergeV2ActorBinding | AuthActor): boolean {
  if ('authenticated_user_id' in actor) {
    return typeof actor.authenticated_user_id === 'string' && actor.authenticated_user_id.length > 0
  }
  return actor.role === 'customer' && typeof actor.userId === 'string' && actor.userId.length > 0
}

/**
 * End-to-end extraction and persistence pipeline:
 * 1. Checks customer auth (guests strictly denied).
 * 2. Checks customer opt-in memory settings & captures memory_epoch.
 * 3. Extracts explicit facts and corrections with time/social/question filtering.
 * 4. Deletes corrected facts if any.
 * 5. Persists new durable facts with atomic expected_memory_epoch fencing.
 */
export async function processAndPersistExplicitMemory(
  input: ProcessAndPersistInput
): Promise<ProcessAndPersistResult> {
  const { message, actor, repository, nowIso } = input

  // Gate 1: Authentication check
  if (!isAuthenticatedCustomer(actor)) {
    return {
      persisted: 0,
      rejection_reason: 'GUEST_OR_UNAUTHENTICATED',
      extracted_facts: [],
      deleted_corrections: 0,
      epoch_checked: null,
    }
  }

  // Gate 2: Opt-in settings & epoch check
  let settings
  try {
    settings = await repository.getSettings()
  } catch {
    return {
      persisted: 0,
      rejection_reason: 'MEMORY_STORAGE_UNAVAILABLE',
      extracted_facts: [],
      deleted_corrections: 0,
      epoch_checked: null,
    }
  }

  if (!settings.enabled || (input.expectedMemoryEpoch !== undefined && input.expectedMemoryEpoch !== settings.memory_epoch)) {
    return {
      persisted: 0,
      rejection_reason: settings.enabled ? 'MEMORY_EPOCH_MISMATCH' : 'MEMORY_DISABLED',
      extracted_facts: [],
      deleted_corrections: 0,
      epoch_checked: settings.memory_epoch,
    }
  }

  let expectedEpoch = settings.memory_epoch

  // Gate 3: Extract candidates
  const extraction = extractExplicitFacts(message)
  if (!extraction.extracted || extraction.facts.length === 0) {
    return {
      persisted: 0,
      rejection_reason: extraction.rejection_reason,
      extracted_facts: [],
      deleted_corrections: 0,
      epoch_checked: expectedEpoch,
    }
  }

  let persistedCount = 0
  let deletedCorrections = 0
  let finalRejectionReason: string | null = null
  const persistedFacts: ConciergeV2MemoryFactInput[] = []

  // Gate 4: Process corrections and write facts
  for (const candidate of extraction.facts) {
    if (candidate.is_correction) {
      if (candidate.memory_type === 'allergy') {
        finalRejectionReason = 'ALLERGY_CORRECTION_REQUIRES_REVIEW'
        continue
      }
      try {
        const delResult = await repository.deleteFact({
          memory_type: candidate.memory_type,
          memory_key: candidate.memory_key,
          source: 'explicit',
          expected_memory_epoch: expectedEpoch,
        })
        if (delResult.ok) expectedEpoch++
        if (delResult.ok && delResult.deleted) {
          deletedCorrections++
        }
      } catch {
        // Soft-fail on deletion error, do not crash turn
      }
      continue
    }

    const factInput: ConciergeV2MemoryFactInput = {
      memory_type: candidate.memory_type,
      memory_key: candidate.memory_key,
      value: { food: candidate.food },
      source: 'explicit',
      confidence: candidate.confidence,
      observed_at: nowIso || new Date().toISOString(),
      expires_at: null,
      schema_version: 1,
    }

    try {
      const validatedFact = ConciergeV2MemoryFactInputSchema.parse(factInput)
      const writeOp = await repository.writeFact({
        expected_memory_epoch: expectedEpoch,
        fact: validatedFact,
      })

      if (writeOp.ok) {
        persistedCount++
        persistedFacts.push(validatedFact)
      } else {
        finalRejectionReason = writeOp.reason
        // If memory epoch changed or memory was disabled mid-flight, break immediately
        if (
          writeOp.reason === 'MEMORY_EPOCH_MISMATCH' ||
          writeOp.reason === 'MEMORY_DISABLED'
        ) {
          break
        }
      }
    } catch {
      finalRejectionReason = 'INVALID_MEMORY_FACT'
    }
  }

  return {
    persisted: persistedCount,
    rejection_reason: finalRejectionReason,
    extracted_facts: persistedFacts,
    deleted_corrections: deletedCorrections,
    epoch_checked: expectedEpoch,
  }
}
