/** Deterministic money parsing. Menu prices are not customer spending constraints. */
export interface ParsedBudget {
  amountVnd: number
  basis: 'total' | 'per_person'
  marker: string
}

const MONEY = /(?<![\w\d.,-])(\d{1,3}(?:[ .,\u00a0]\d{3})+|\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|ngan|dong|vnd|k|d)(\d)?(?![\w\d]|[.,]\d)/g

function amountVnd(raw: string, unit: string, shorthand?: string): number | undefined {
  const grouped = /^\d{1,3}(?:([ .,\u00a0])\d{3})(?:\1\d{3})*$/.test(raw)
  const normalized = grouped ? raw.replace(/[ .,\u00a0]/g, '') : raw.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined
  if (shorthand && unit !== 'tr') return undefined
  const [whole, decimal = ''] = normalized.split('.')
  if (shorthand && decimal) return undefined
  // Integer arithmetic avoids rounding an invalid fractional VND into a budget.
  const denominator = 10n ** BigInt(decimal.length)
  const numerator = BigInt(whole + decimal)
  const multiplier = ['trieu', 'tr'].includes(unit) ? 1_000_000n : ['k', 'nghin', 'ngan'].includes(unit) ? 1_000n : 1n
  const scaled = numerator * multiplier
  if (scaled % denominator !== 0n) return undefined
  const result = scaled / denominator + (shorthand ? BigInt(shorthand) * 100_000n : 0n)
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : undefined
}

/** Input uses the existing diacritic-insensitive normalizer. */
export function parseCustomerBudget(text: string): ParsedBudget | undefined {
  const matches = text.matchAll(MONEY)
  let result: ParsedBudget | undefined
  for (const match of matches) {
    const amount = amountVnd(match[1], match[2], match[3])
    if (amount === undefined) continue
    const before = text.slice(0, match.index)
    const after = text.slice(match.index + match[0].length)
    const clause = before.split(/[;!?\n]|,(?!\d)/).at(-1) ?? ''
    const perPersonBefore = /\b(?:moi|tren|cho moi)\s+(?:nguoi|khach)\s*(?:(?:toi da|khoang|tam|la|co)\s*)?$/.test(clause)
    const perPersonAfter = /^\s*(?:\/\s*(?:nguoi|khach)|(?:moi|mot|tren)\s+(?:nguoi|khach))\b/.test(after)
    const explicit = /\b(ngan sach(?: con)?|budget(?: con)?|toi co|minh co|em co|chung toi co|tui co|co ngan sach|giam(?: xuong| con)?|tang(?: len)?|doi ngan sach(?: thanh)?|con lai)\s*(?:(?:la|toi da|duoi|khoang|tam|chi|con)\s*)?$/.exec(clause)
    const simple = /\b(toi da|duoi|khoang|tam|con)\s*$/.exec(clause)
    const legacyParty = /\b\d{1,2}\s*(?:nguoi|khach)\s*$/.test(clause)
    const priceContext = /\b(?:gia|bao nhieu|mon nao|menu|thuc don|phi ship|phi giao)\b/.test(clause)
    if (perPersonBefore || perPersonAfter) {
      // A menu price "gia 200k/nguoi" still isn't a customer budget.
      if (priceContext && !explicit && !/\b(?:ngan sach|budget|toi co|minh co)\b/.test(clause)) continue
      result = { amountVnd: amount, basis: 'per_person', marker: explicit?.[1] ?? simple?.[1] ?? 'moi nguoi' }
    } else if (explicit || simple && !priceContext || legacyParty && !priceContext) {
      result = { amountVnd: amount, basis: 'total', marker: explicit?.[1] ?? simple?.[1] ?? 'nguoi' }
    }
  }
  return result
}

export function clearsCustomerBudget(text: string): boolean {
  return /\b(?:bo|xoa|huy)\s+(?:(?:gioi han|rang buoc)\s+)?(?:ngan sach|budget)\b|\b(?:khong|ko)\s+(?:gioi han|han che)\s+(?:ngan sach|budget)\b|\bbo gioi han chi tieu\b/.test(text)
}

export interface ParsedDishCount {
  count?: number
  scope?: 'final_meal' | 'new_additions'
  invalid?: boolean
}

/** Count requests never include portion quantities or silently clamp >30. */
export function parseRequestedDishCount(text: string): ParsedDishCount | undefined {
  const numbers: Record<string, number> = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 }
  const match = /\b(\d+(?:[.,]\d+)?|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s+mon\b/.exec(text)
  if (!match) return undefined
  const before = text.slice(0, match.index)
  const clauseBefore = before.split(/[;!?\n]|,(?!\d)/).at(-1) ?? ''
  const requested = /\b(?:goi y|tu van|chon|muon|lay|them|doi|mam|combo|set|dung|chinh xac|\d{1,2}\s*(?:nguoi|khach))\b/.test(clauseBefore) || !clauseBefore.trim()
  if (!requested) return undefined
  // Price questions, item ordinals and approximate/ranged counts are not exact requests.
  if (/\b(?:mon thu|mon so|gia|bao nhieu)\s*$/.test(before) || /\b(?:khoang|tam|tu|it nhat|toi da|hon)\s*$/.test(before) || /\d+\s*(?:den|toi|[-–])\s*$/.test(before) || /^\s*(?:den|toi|[-–])\s*\d+\s+mon\b/.test(text.slice(match.index + match[0].length))) return undefined
  if (/[-−]\s*$/.test(before)) return { invalid: true }
  const count = numbers[match[1]] ?? Number(match[1].replace(',', '.'))
  if (!Number.isSafeInteger(count) || count < 1 || count > 30) return { invalid: true }
  const scope = /\bthem\s*(?:(?:dung|chinh xac)\s*)?$/.test(before) ? 'new_additions' : 'final_meal'
  return { count, scope }
}
