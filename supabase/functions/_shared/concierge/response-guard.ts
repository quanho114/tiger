import { normalizeIntent } from './draft-intent.ts'

// The model writes conversational prose; authoritative values stay in server-built cards.
export function safeConciergeReply(raw: string, evidence = ''): string | null {
  const reply = raw.trim()
  if (!reply || reply.length > 700 || /<[^>]+>|https?:\/\//i.test(reply)) return null
  const text = normalizeIntent(reply)
  if (/\b(?:da dat|dat thanh cong|da thanh toan|thanh toan thanh cong|da them vao gio|order confirmed|booking confirmed)\b/.test(text)) return null
  if (/\b(?:tuyet doi an toan|an toan di ung|khong gay di ung|allergy.safe)\b/.test(text)) return null
  // Keep volatile facts in server-built cards. Amounts, opening times, or
  // availability may appear in prose only when the tool result contains them.
  const claimedAmounts = text.match(/\b\d[\d.,]*\s*(?:d|dong|vnd|nghin|trieu|k)\b/gi) ?? []
  const verifiedAmounts = [...evidence.matchAll(/"(?:price_vnd|price_min|price_max|subtotal_vnd|total_vnd)"\s*:\s*(\d+)/g)].map(match => match[1])
  if (claimedAmounts.some(claim => !verifiedAmounts.includes(claim.replace(/\D/g, '')))) return null
  const evidenceNumbers = new Set((evidence.match(/\d[\d.,]*/g) ?? []).map(value => value.replace(/\D/g, '')))
  const replyNumbers = (text.match(/\d[\d.,]*/g) ?? []).map(value => value.replace(/\D/g, ''))
  const allowedBrandNumber = text.includes('tiger 345') ? '345' : null
  if (replyNumbers.some(value => !evidenceNumbers.has(value) && value !== allowedBrandNumber)) return null
  const times = text.match(/\b\d{1,2}(?::\d{2}|h\d{0,2})\b/g) ?? []
  if (times.some(time => !normalizeIntent(evidence).includes(time))) return null
  if (!evidence && /\b(?:con ban|het ban|con mon|het mon|dang giam gia)\b/.test(text)) return null
  return reply
}

export function safeConversationReply(raw: string): string | null {
  const reply = safeConciergeReply(raw)
  if (!reply) return null
  const text = normalizeIntent(reply)
  if (/\b(?:dia chi (?:la|cua|nam tai)|hotline(?: la)?|so dien thoai(?: la)?|dien thoai nha hang|zalo(?: la)?|facebook(?: la)?|gio mo cua|gio dong cua|mo cua luc|dong cua luc|nguyen lieu cua mon|thanh phan cua mon|chua hanh|khuyen mai|mien phi|bao hanh|wifi mien phi|bai xe o dau|do xe o dau|ship den|giao hang den|giao mon den)\b/.test(text) ||
      /\b(?:nha hang|quan|tiger|ben minh|ben em|nha minh|chung toi)\b.{0,60}\b(?:nam o|dia chi|co dia chi|co ban(?: trong)?|con ban|het ban|nhan dat|co phong rieng|giao den|mo cua luc|dong cua luc|phuc vu den)\b/.test(text) ||
      /\b(?:mon|ga|bo|ca|tom|rau|com|lau)\b.{0,50}\b(?:gia|con mon|het mon|gom|chua hanh|co chua|ngon nhat)\b/.test(text)) return null
  return reply
}

export function safeGroundedReply(raw: string, evidence: string, evidenceStatus: 'known' | 'unknown' | 'unavailable' = 'known'): string | null {
  const reply = raw.trim()
  if (!reply || reply.length > 700 || /<[^>]+>/.test(reply)) return null
  const urls = reply.match(/https?:\/\/[^\s)]+/gi) ?? []
  if (urls.some(url => !evidence.includes(url.replace(/[.,!?]+$/, '')))) return null
  const replyWithoutVerifiedUrls = reply.replace(/https?:\/\/[^\s)]+/gi, '')
  if (!safeConciergeReply(replyWithoutVerifiedUrls, evidence)) return null
  if (evidenceStatus !== 'known') {
    const normalized = normalizeIntent(reply)
    if (!/(?:chua co thong tin|khong co thong tin|chua tim thay|chua tim duoc|khong tim thay|chua xac minh|khong xac minh|chua the kiem tra|khong the kiem tra|chua kiem tra duoc|khong du du lieu|chua co ket qua|khong co ket qua)/.test(normalized)) return null
  }
  return reply
}
