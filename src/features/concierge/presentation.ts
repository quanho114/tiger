export function segmentText(text: string): string[] {
  return typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(text), entry => entry.segment)
    : Array.from(text)
}
