import { normalizeIntent } from './draft-intent.ts'

// Small product vocabulary; this is lexical retrieval support, not an intent router.
const SYNONYMS: Record<string, string> = {
  salad: 'goi', hotpot: 'lau', noodles: 'mi', noodle: 'mi', tofu: 'dau hu',
  'dau phu': 'dau hu', chicken: 'ga', beef: 'bo', rice: 'com',
}
export function normalizeMenuSearch(text: string): string {
  let value = normalizeIntent(text).replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const [alias, canonical] of Object.entries(SYNONYMS)) {
    value = value.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical)
  }
  return value
}
export const PREFERENCE_WEIGHTS = { current: 24, explicit: 12, inferred: 6 } as const
export interface RetrievalPreference { text: string; source: keyof typeof PREFERENCE_WEIGHTS }
export function menuTextScore(query: string, name: string, tags: string, category: string, description: string) {
  const q = normalizeMenuSearch(query), n = normalizeMenuSearch(name)
  const t = normalizeMenuSearch(tags), c = normalizeMenuSearch(category), d = normalizeMenuSearch(description)
  let score = q ? n === q ? 200 : n.startsWith(q) ? 120 : n.includes(q) ? 80 : 0 : 50
  const stop = new Set(['quan', 'co', 'khong', 'gi', 'the', 'nao', 'cac', 'cho', 'minh', 'ban', 'o', 'tai', 'nha', 'hang', 'mon'])
  const tokens = [...new Set(q.split(' ').filter(token => token.length >= 2 && !stop.has(token)))]
  for (const token of tokens) {
    if (` ${n} `.includes(` ${token} `)) score += 20
    if (` ${t} `.includes(` ${token} `)) score += 10
    if (` ${c} `.includes(` ${token} `)) score += 5
  }
  if (q && t.includes(q)) score += 25
  if (q && c.includes(q)) score += 30
  if (q && d.includes(q)) score += 15
  return { score, exact: Boolean(q && n === q) }
}
