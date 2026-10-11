/**
 * Tiger Agent V2 — Phase 0: Data classification.
 *
 * Explicit security boundary: what the customer-facing agent may touch.
 * Enforcement lives in code (capability + tool gateway), never in prompts.
 */

export type DataClass = 'PUBLIC' | 'CUSTOMER_PRIVATE' | 'BUSINESS_INTERNAL' | 'SECRET'

/** Customer agent access decision per data class. */
export const DATA_CLASS_ACCESS = {
  PUBLIC: 'allow',
  CUSTOMER_PRIVATE: 'own-only',
  BUSINESS_INTERNAL: 'deny',
  SECRET: 'deny',
} as const

const BUSINESS_INTERNAL_PATTERNS = [
  /revenue/i,
  /doanh\s*thu/i,
  /sales_analytics/i,
  /margin/i,
  /ingredient.?cost/i,
  /giá\s*vốn/i,
  /staff/i,
  /nhân\s*viên/i,
  /internal_note/i,
  /fraud_score/i,
  /salary/i,
  /lương/i,
  /cost_price/i,
  /supplier/i,
  /nhà\s*cung\s*cấp/i,
]

const SECRET_PATTERNS = [
  /api.?key/i,
  /service.?role/i,
  /jwt.?secret/i,
  /database.?url/i,
  /db.?password/i,
  /provider.?token/i,
  /signing.?secret/i,
  /private.?key/i,
  /webhook.?secret/i,
  /supabase_.*key/i,
]

/**
 * Classify a field/table name for guardrails.
 * Defaults to BUSINESS_INTERNAL (fail-closed) for unknown fields.
 */
export function classifyField(fieldName: string): DataClass {
  const name = fieldName.trim()
  if (!name) return 'BUSINESS_INTERNAL'
  if (SECRET_PATTERNS.some((re) => re.test(name))) return 'SECRET'
  if (BUSINESS_INTERNAL_PATTERNS.some((re) => re.test(name))) return 'BUSINESS_INTERNAL'
  return 'BUSINESS_INTERNAL'
}

/** Fields the customer agent is allowed to see from its own profile. */
export const CUSTOMER_SELF_VISIBLE_FIELDS = [
  'display_name',
  'preferences',
  'favorite_items',
  'recent_orders',
  'saved_addresses',
] as const

export type CustomerSelfVisibleField = (typeof CUSTOMER_SELF_VISIBLE_FIELDS)[number]

/**
 * Project a raw customer record down to agent-visible fields only.
 * The LLM never receives raw DB rows.
 */
export function projectCustomerSelf<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of CUSTOMER_SELF_VISIBLE_FIELDS) {
    if (field in record) out[field] = record[field]
  }
  return out
}

/** Standard refusal for internal/secret data requests. */
export const INTERNAL_DATA_REFUSAL =
  'Mình không có quyền truy cập dữ liệu vận hành nội bộ của nhà hàng.'
