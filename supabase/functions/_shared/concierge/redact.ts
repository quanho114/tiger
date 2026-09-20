/**
 * Tiger 345 - Concierge PII Redaction & Sanitization Utility
 * Based on plans/tiger-345/09-concierge-agent-design.md (§20, §23) and Task C09 (AT18)
 *
 * Requirements:
 * - Redacts phone numbers (VN mobile / landline formats).
 * - Redacts email addresses.
 * - Redacts sensitive tokens (JWTs, session tokens, Bearer tokens).
 * - Redacts detailed address strings.
 * - Strips internal model reasoning tags (<thought>, <reasoning>) completely.
 */

// Regular expressions for sensitive data patterns
const RE_PHONE = /(?:\+84|0)(?:[2-9]\d{8}|[2-9]\d{1}[.\s-]\d{3}[.\s-]\d{4}|[2-9]\d{2}[.\s-]\d{3}[.\s-]\d{3})/g
const RE_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
const RE_JWT = /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g
const RE_BEARER = /Bearer\s+[a-zA-Z0-9._~+/-]+=*/gi
const RE_SESSION_TOKEN = /\b(?:tok|sess)_[a-zA-Z0-9_-]{8,}\b/g
const RE_ADDRESS = /(?:Số\s+\d+[^,.\n]+(?:,\s*(?:Phường|Xã|Quận|Huyện|Thị xã|Thị trấn|TP(?:\.|\b)|Thành phố|Tỉnh)[^,.\n]*(?:\.[a-zA-Z]+)?)+)/gi
const RE_STREET_ADDRESS = /(?:Số\s+\d+[^,.\n]*(?:Đường|Phố|Hẻm|Ngõ)[^,.\n]*)/gi
const RE_THOUGHT_TAGS = /<(?:thought|reasoning)>[\s\S]*?<\/(?:thought|reasoning)>/gi

/**
 * Redact PII (phone, email, tokens, address) and strip hidden reasoning from text.
 */
export function redactPii(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  let sanitized = text

  // 1. Strip hidden reasoning completely
  sanitized = sanitized.replace(RE_THOUGHT_TAGS, '')

  // 2. Redact auth and session tokens
  sanitized = sanitized.replace(RE_BEARER, 'Bearer [REDACTED_TOKEN]')
  sanitized = sanitized.replace(RE_JWT, '[REDACTED_TOKEN]')
  sanitized = sanitized.replace(RE_SESSION_TOKEN, '[REDACTED_TOKEN]')

  // 3. Redact phone numbers
  sanitized = sanitized.replace(RE_PHONE, '[REDACTED_PHONE]')

  // 4. Redact emails
  sanitized = sanitized.replace(RE_EMAIL, '[REDACTED_EMAIL]')

  // 5. Redact street addresses
  sanitized = sanitized.replace(RE_ADDRESS, '[REDACTED_ADDRESS]')
  sanitized = sanitized.replace(RE_STREET_ADDRESS, '[REDACTED_ADDRESS]')

  return sanitized
}

/**
 * Recursively redacts PII in an object or array.
 */
export function redactObject<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return redactPii(value) as unknown as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactObject(item)) as unknown as T
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      // Sensitive key name exact matching
      if (['token', 'jwt', 'secret', 'password', 'authorization'].includes(k.toLowerCase())) {
        result[k] = '[REDACTED_SECRET]'
      } else {
        result[k] = redactObject(v)
      }
    }
    return result as T
  }

  return value
}
