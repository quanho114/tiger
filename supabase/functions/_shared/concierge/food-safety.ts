/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: menu-retrieval.ts, orchestrator.ts, tests/server/concierge-menu-retrieval-contract.test.ts
 * - Affected API: evaluateFoodSafety, sanitizeCatalogText, checkAllergenConflict, normalizeAllergen, isItemSafeForRecommendation
 * - Data Schemas: ConciergeV2FoodSafetyStateSchema, ConciergeV2FoodSafetyEvaluationSchema
 * - Verbatim Instructions: "Triển khai Concierge V2 cho Tiger 345 theo bộ kế hoạch đã có.", "V08: Verified menu and food-safety retrieval", "4. Return explicit unknown/unverified/conflict safety states. Allergy-related recommendation blocks unsafe or unverified claims and suggests staff confirmation.", "Exit criteria: Unknown ingredients cannot yield an allergy-safe label."
 */

import type { AllergenType, ItemAllergenProfile } from './types.ts'
import { normalizeIntent } from './draft-intent.ts'
import {
  type ConciergeV2FoodSafetyEvaluation,
} from '../contracts/concierge-v2.ts'

export interface CatalogItemForSafety {
  id: string
  name: string
  description?: string | null
  tags?: string[]
}

const ALLERGEN_ALIAS_MAP: Record<string, AllergenType> = {
  seafood: 'seafood',
  'hải sản': 'seafood',
  hai_san: 'seafood',
  tôm: 'seafood',
  tom: 'seafood',
  cua: 'seafood',
  mực: 'seafood',
  muc: 'seafood',
  cá: 'seafood',
  ca: 'seafood',
  hàu: 'seafood',
  hau: 'seafood',
  ghẹ: 'seafood',
  ghe: 'seafood',
  'chả cá': 'seafood',
  cha_ca: 'seafood',
  fish: 'seafood',
  shrimp: 'seafood',
  crab: 'seafood',
  squid: 'seafood',
  oyster: 'seafood',
  peanuts: 'peanuts',
  'đậu phộng': 'peanuts',
  dau_phong: 'peanuts',
  lạc: 'peanuts',
  lac: 'peanuts',
  peanut: 'peanuts',
  eggs: 'eggs',
  trứng: 'eggs',
  trung: 'eggs',
  egg: 'eggs',
  dairy: 'dairy',
  sữa: 'dairy',
  sua: 'dairy',
  'phô mai': 'dairy',
  pho_mai: 'dairy',
  cheese: 'dairy',
  milk: 'dairy',
  butter: 'dairy',
  gluten: 'gluten',
  'bột mì': 'gluten',
  bot_mi: 'gluten',
  'lúa mì': 'gluten',
  lua_mi: 'gluten',
  wheat: 'gluten',
  soy: 'soy',
  'đậu nành': 'soy',
  dau_nanh: 'soy',
  'đậu phụ': 'soy',
  dau_phu: 'soy',
  'đậu hũ': 'soy',
  dau_hu: 'soy',
  sesame: 'sesame',
  mè: 'sesame',
  me: 'sesame',
  vừng: 'sesame',
  vung: 'sesame',
}

const ALLERGEN_KEYWORD_PATTERNS: Record<AllergenType, RegExp[]> = {
  seafood: [
    /(?:^|[^\p{L}\p{N}])(?:tôm|cua|mực|cá|hải sản|hàu|ghẹ|chả cá|shrimp|crab|fish|squid|seafood)(?:$|[^\p{L}\p{N}])/ui,
  ],
  peanuts: [
    /(?:^|[^\p{L}\p{N}])(?:đậu phộng|lạc|peanut|peanuts)(?:$|[^\p{L}\p{N}])/ui,
  ],
  eggs: [
    /(?:^|[^\p{L}\p{N}])(?:trứng|egg|eggs)(?:$|[^\p{L}\p{N}])/ui,
  ],
  dairy: [
    /(?:^|[^\p{L}\p{N}])(?:sữa|phô mai|cheese|milk|butter)(?:$|[^\p{L}\p{N}])/ui,
  ],
  gluten: [
    /(?:^|[^\p{L}\p{N}])(?:bột mì|lúa mì|wheat|gluten|mì trứng)(?:$|[^\p{L}\p{N}])/ui,
  ],
  soy: [
    /(?:^|[^\p{L}\p{N}])(?:đậu nành|đậu phụ|đậu hũ|soy|tofu|nước tương)(?:$|[^\p{L}\p{N}])/ui,
  ],
  sesame: [
    /(?:^|[^\p{L}\p{N}])(?:mè|vừng|sesame|dầu mè)(?:$|[^\p{L}\p{N}])/ui,
  ],
}

// Explicit ingredient families, including sauces and derivatives. Never used
// to infer absence from a dish name. Compound allergy inputs stay unresolved.
const INGREDIENT_ALIASES: Record<string, AllergenType> = {
  'hai san': 'seafood', 'nuoc mam': 'seafood', 'mam tom': 'seafood', 'mam ruoc': 'seafood',
  'dau hao': 'seafood', 'fish sauce': 'seafood', 'oyster sauce': 'seafood',
  'tep': 'seafood', 'ngheu': 'seafood', 'ngao': 'seafood', 'so': 'seafood', 'hen': 'seafood',
  'dau phong': 'peanuts', 'dau lac': 'peanuts', 'dau dau phong': 'peanuts',
  'bo dau phong': 'peanuts', 'bot dau phong': 'peanuts', 'peanut oil': 'peanuts', 'peanut butter': 'peanuts',
}

/**
 * Strips prompt-injection patterns, malicious tags, and control characters from menu descriptions.
 */
export function sanitizeCatalogText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    // oxlint-disable-next-line no-control-regex
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<\s*script[^>]*>.*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/(?:system\s*instruction|ignore\s+(?:all\s+)?previous\s+instructions?)/gi, '[REDACTED]')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
    .trim()
    .slice(0, 500)
}

/**
 * Normalizes a customer allergy string to standard AllergenType.
 */
export function normalizeAllergen(input: string): AllergenType | null {
  if (!input) return null
  const clean = input.toLowerCase().trim()
  const search = normalizeIntent(input).replace(/_/g, ' ')
  if (INGREDIENT_ALIASES[search]) return INGREDIENT_ALIASES[search]
  if (ALLERGEN_ALIAS_MAP[clean]) {
    return ALLERGEN_ALIAS_MAP[clean]
  }

  const matches = (Object.entries(ALLERGEN_KEYWORD_PATTERNS) as [AllergenType, RegExp[]][])
    .filter(([allergen, patterns]) => patterns.some((p) => p.test(clean)) ||
      Object.entries(ALLERGEN_ALIAS_MAP).some(([alias, type]) => type === allergen && normalizeIntent(alias).replace(/_/g, ' ') === search))
  // A compound constraint must never be reduced to its first allergen.
  return matches.length === 1 ? matches[0][0] : null
}

/**
 * Checks for conflicts between catalog text/tags and the recorded allergen profile.
 */
export function checkAllergenConflict(
  item: CatalogItemForSafety,
  allergen: AllergenType,
  profile?: ItemAllergenProfile
): boolean {
  const combinedText = `${item.name} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase()
  const patterns = ALLERGEN_KEYWORD_PATTERNS[allergen] || []
  const textMentionsAllergen = patterns.some((p) => p.test(combinedText))
    || Object.entries(INGREDIENT_ALIASES).some(([alias, type]) => type === allergen &&
      ` ${normalizeIntent(combinedText)} `.includes(` ${alias} `))

  if (!profile) {
    return false
  }

  const profileStatus = profile.allergens ? profile.allergens[allergen] : undefined

  // Conflict: Description/name explicitly mentions the allergen, but profile claims it does NOT contain it
  if (textMentionsAllergen && profileStatus !== 'contains' && profileStatus !== 'may_contain') {
    return true
  }

  return false
}

/**
 * Evaluates food safety for an item against customer allergies.
 * Guarantees:
 * - Missing profile or unknown ingredient CANNOT yield 'verified_safe'.
 * - Unverified kitchen profile yields 'allergen_unverified', never 'verified_safe'.
 * - Contradictions between text and profile yield 'conflict'.
 * - Confirmed presence yields 'contains_allergen'.
 * - Cross-contact yields 'cross_contact_risk'.
 */
export function evaluateFoodSafety(
  item: CatalogItemForSafety,
  customerAllergies: string[],
  profile?: ItemAllergenProfile,
  options: { ingredientOnly?: boolean } = {},
): ConciergeV2FoodSafetyEvaluation {
  if (profile?.snapshot_expires_at && !(Date.parse(profile.snapshot_expires_at) > Date.now())) {
    profile = { ...profile, verified_by_kitchen: false }
  }
  if (options.ingredientOnly && profile && (profile.item_id !== item.id || profile.source !== 'kitchen_audited' ||
      !profile.verified_at || !Number.isFinite(Date.parse(profile.verified_at)) || Date.parse(profile.verified_at) > Date.now())) {
    profile = { ...profile, verified_by_kitchen: false }
  }
  if (!customerAllergies || customerAllergies.length === 0) {
    if (profile?.verified_by_kitchen) {
      return {
        safety_state: 'verified_safe',
        matched_allergens: [],
        staff_confirmation_required: false,
        notes: 'Hồ sơ thành phần của món có xác nhận của bếp.',
        verified_at: profile.verified_at,
      }
    }
    if (profile) {
      return {
        safety_state: 'allergen_unverified',
        matched_allergens: [],
        staff_confirmation_required: false,
        notes: 'Hồ sơ dinh dưỡng ước lượng, chưa qua kiểm nghiệm thực tế tại bếp.',
      }
    }
    return {
      safety_state: 'allergen_unknown',
      matched_allergens: [],
      staff_confirmation_required: false,
      notes: 'Chưa có hồ sơ kiểm nghiệm dinh dưỡng hoặc dị ứng cho món này.',
    }
  }

  const matchedContains: string[] = []
  const matchedCrossContact: string[] = []
  const matchedUnknown: string[] = []
  let hasConflict = false

  for (const rawAllergy of customerAllergies) {
    const normalized = normalizeAllergen(rawAllergy)
    if (!normalized) {
      matchedUnknown.push(rawAllergy)
      continue
    }

    if (checkAllergenConflict(item, normalized, profile)) {
      hasConflict = true
      break
    }

    if (!profile) {
      matchedUnknown.push(normalized)
      continue
    }

    const status = profile.allergens ? profile.allergens[normalized] : undefined
    if (status === 'contains') {
      matchedContains.push(normalized)
    } else if (status === 'may_contain') {
      if (options.ingredientOnly) matchedUnknown.push(normalized)
      else matchedCrossContact.push(normalized)
    } else if (status !== 'absent') {
      matchedUnknown.push(normalized)
    }
  }

  if (hasConflict) {
    return {
      safety_state: 'conflict',
      matched_allergens: customerAllergies,
      staff_confirmation_required: true,
      notes: `Phát hiện xung đột thông tin giữa tên/mô tả món và hồ sơ dị ứng bếp. Cần kiểm tra lại trực tiếp với bếp trưởng.`,
    }
  }

  if (matchedContains.length > 0) {
    return {
      safety_state: 'contains_allergen',
      matched_allergens: matchedContains,
      staff_confirmation_required: true,
      notes: `Món [${item.name}] có chứa dị nguyên: ${matchedContains.join(', ')}. Không an toàn cho khách dị ứng.`,
    }
  }

  if (!options.ingredientOnly && (matchedCrossContact.length > 0 || profile?.cross_contact_risk)) {
    const reasons = matchedCrossContact.length > 0 ? matchedCrossContact : ['nguy cơ nhiễm chéo tại khu vực chế biến']
    return {
      safety_state: 'cross_contact_risk',
      matched_allergens: reasons,
      staff_confirmation_required: true,
      notes: `Món [${item.name}] có nguy cơ nhiễm chéo dị ứng (${reasons.join(', ')}). Cần báo nhân viên phục vụ lưu ý bếp.`,
    }
  }

  if (matchedUnknown.length > 0) {
    return {
      safety_state: 'allergen_unknown',
      matched_allergens: matchedUnknown,
      staff_confirmation_required: true,
      notes: `Món [${item.name}] chưa có dữ liệu kiểm nghiệm đầy đủ cho: ${matchedUnknown.join(', ')}. Không tự ý khẳng định an toàn.`,
    }
  }

  // All requested allergens are explicitly cleared in profile. Check kitchen verification!
  if (!profile || !profile.verified_by_kitchen ||
      (options.ingredientOnly ? profile.item_id !== item.id || profile.source !== 'kitchen_audited' ||
        !profile.verified_at || !Number.isFinite(Date.parse(profile.verified_at)) || Date.parse(profile.verified_at) > Date.now()
        : profile.cross_contact_risk !== false)) {
    return {
      safety_state: 'allergen_unverified',
      matched_allergens: [],
      staff_confirmation_required: true,
      notes: `Món [${item.name}] chưa có xác nhận kiểm nghiệm chính thức từ bếp trưởng đối với dị ứng yêu cầu. Cần nhân viên xác nhận tại bàn.`,
    }
  }

  return {
    safety_state: 'verified_safe',
    matched_allergens: [],
    staff_confirmation_required: false,
    notes: `Hồ sơ thành phần đã được bếp xác nhận không chứa các dị nguyên đã nêu; không phải cam kết an toàn tuyệt đối.`,
    verified_at: profile.verified_at,
  }
}

/**
 * Returns false if an item is confirmed unsafe (contains allergen or has conflict).
 */
export function isItemSafeForRecommendation(evaluation: ConciergeV2FoodSafetyEvaluation): boolean {
  return evaluation.safety_state !== 'contains_allergen' && evaluation.safety_state !== 'conflict'
}
