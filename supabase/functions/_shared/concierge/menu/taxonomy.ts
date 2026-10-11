/**
 * Tiger Agent V3 — Phase 5.5: Bounded taste taxonomy.
 *
 * Prevents free-text explosion from AI drafts and admin input.
 * Policy: known synonyms normalize; unknown tags are REJECTED (422),
 * never silently stored.
 */

export const TASTE_TAGS = [
  'spicy', 'smoky', 'savory', 'rich', 'light', 'fresh',
  'sour', 'sweet', 'herbal', 'crispy', 'bitter', 'fragrant',
  'hearty', 'tangy', 'creamy', 'nutty',
] as const

export type TasteTag = (typeof TASTE_TAGS)[number]

const SYNONYMS: Record<string, TasteTag> = {
  cay: 'spicy', 'siêu cay': 'spicy', 'cay nồng': 'spicy',
  'khói bếp': 'smoky', 'nướng than': 'smoky', smoky: 'smoky',
  'đậm đà': 'savory', mặn: 'savory', vừa: 'savory',
  béo: 'rich', ngậy: 'rich', 'nhiều dầu': 'rich',
  thanh: 'light', nhẹ: 'light', mát: 'light',
  tươi: 'fresh', rau: 'fresh',
  chua: 'sour', 'chua thanh': 'sour',
  ngọt: 'sweet', 'ngọt dịu': 'sweet',
  thơm: 'fragrant', dậy: 'fragrant',
  giòn: 'crispy', rụm: 'crispy',
  đắng: 'bitter', 'nhẫn': 'bitter',
  'thảo mộc': 'herbal', 'mùi rừng': 'herbal',
  'chắc bụng': 'hearty', 'no lâu': 'hearty',
  'chua cay': 'tangy', 'chua ngọt': 'tangy',
  'béo sữa': 'creamy', 'sốt kem': 'creamy',
  bùi: 'nutty', 'vị hạt': 'nutty',
}

export function normalizeTasteTag(input: string): TasteTag | null {
  const key = input.trim().toLowerCase()
  if ((TASTE_TAGS as readonly string[]).includes(key)) return key as TasteTag
  return SYNONYMS[key] ?? null
}

/** Returns {tags, rejected}: rejected must surface as 422, never stored. */
export function normalizeTasteTags(input: unknown): { tags: TasteTag[]; rejected: string[] } {
  if (!Array.isArray(input)) return { tags: [], rejected: [] }
  const tags: TasteTag[] = []
  const rejected: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const normalized = normalizeTasteTag(raw)
    if (normalized) {
      if (!tags.includes(normalized)) tags.push(normalized)
    } else {
      rejected.push(raw.slice(0, 60))
    }
  }
  return { tags, rejected }
}
