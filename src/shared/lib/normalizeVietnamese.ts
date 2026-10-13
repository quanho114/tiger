/**
 * Utility to normalize Vietnamese strings by removing diacritics / tone marks,
 * mapping đ/Đ to d/D, and lowercasing for fuzzy/accent-insensitive search.
 *
 * Example:
 * normalizeVietnamese('Gà nướng muối ớt') -> 'ga nuong muoi ot'
 * normalizeVietnamese('Bò lúc lắc') -> 'bo luc lac'
 */
export function normalizeVietnamese(text: string): string {
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim()
}
