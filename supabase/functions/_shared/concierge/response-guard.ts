import { normalizeIntent } from './draft-intent.ts'
import type { EvidenceStatus } from './context.ts'
import { AppError } from '../errors.ts'

export interface ReplyGuardMetrics {
  guard_checks: number
  guard_rejections: number
  repair_attempts: number
  repair_successes: number
  repair_latency_ms: number
}

export class ReplyGuardError extends AppError {
  constructor(readonly guardMetrics: ReplyGuardMetrics) {
    super('UNSAFE_CONCIERGE_RESPONSE', 'Trợ lý không tạo được câu trả lời có căn cứ.', 502)
  }
}

// Inspect local clauses so an abstention cannot license an unrelated positive
// claim after punctuation or a contrast. This is a bounded defense, not a judge.
function clauses(raw: string): string[] {
  return raw.split(/[;\n]|[.!?](?=\s|$)|,\s+|\b(?:nhưng|tuy nhiên|but|however)\b/iu).map(normalizeIntent).filter(Boolean)
}

const uncertainty = /\b(?:chua (?:co|du|xac minh|duoc xac minh|kiem tra|lay|tim|the|thuc hien)|khong (?:co thong tin|du du lieu|the|kiem tra duoc|lay duoc|truy xuat duoc)|(?:thong tin|du lieu|khau phan).{0,30}(?:chua|con can|can xac nhan)|chua duoc tra cuu|can (?:xac nhan|kiem tra)|no verified|cannot confirm)\b/
const retrievalFailure = /\b(?:chua (?:kiem tra|lay|truy xuat) duoc|khong (?:kiem tra|lay|truy xuat) duoc|khong the (?:kiem tra|tra cuu|truy xuat)|chua the (?:kiem tra|tra cuu)|tam thoi khong kha dung|dang loi|loi truy xuat|nguon.{0,30}(?:gian doan|dang loi))\b/
const negativeMenu = /\b(?:khong (?:co|con) mon|het mon|khong co ket qua|khong tim thay mon|chua (?:co|tim thay|tim duoc) (?:mon|lua chon))\b/
const restaurantFact = /\b(?:dia chi (?:la|cua|nam tai)|hotline|so dien thoai|dien thoai nha hang|zalo|facebook|gio mo cua|gio dong cua|mo cua luc|dong cua luc|wifi mien phi|bai xe o dau|do xe o dau|ship den|giao hang den|giao mon den|(?:nha hang|quan|tiger|ben minh|ben em|nha minh|chung toi).{0,60}(?:nam o|dia chi|co ban|con ban|het ban|nhan dat|co phong rieng|giao den|phuc vu den|co wifi))\b/
const menuFact = /\b(?:nguyen lieu cua mon|thanh phan cua mon|chua hanh|(?:mon|ga|bo|ca|tom|rau|com|lau).{0,50}(?:gia la|gia chi|co gia|gom|co chua|ngon nhat))\b/

function qualifiedClaim(clause: string, index: number): boolean {
  const prefix = clause.slice(0, index)
  return /\b(?:chua|khong|cannot|not|never)(?:\s+(?:the|he|duoc|xac nhan|cam ket|bao dam|dam bao|noi|tuyen bo)){0,4}(?:\s+(?:mon nay|dieu nay|rang|la)){0,2}\s*$/.test(prefix) ||
    /^\s*(?:neu ban|if you)\s*$/.test(prefix)
}

function unsafeCommitment(raw: string): boolean {
  return clauses(raw).some(clause => {
    const transactions = clause.matchAll(/\b(?:(?:da|vua|se) (?:duoc )?(?:dat(?: mon| ban)?|thanh toan|them.{0,25}vao gio|cap nhat.{0,25}gio|giu (?:cho|ban)|hoan tat.{0,20}(?:giu cho|dat mon|thanh toan))|(?:dat|thanh toan|them vao gio).{0,15}thanh cong|(?:gio(?: hang| nhap)?|don(?: hang)?|ban|mon).{0,35}?(?:da (?:duoc )?(?:xac nhan|cap nhat|giu|them|nam trong)|thanh cong)|thanh toan da hoan tat|(?:order|booking|payment|cart).{0,20}(?:confirmed|completed|successful|updated))\b/g)
    if ([...transactions].some(match => !qualifiedClaim(clause, match.index))) return true
    const allergies = clause.matchAll(/\b(?:tuyet doi an toan|an toan (?:cho (?:nguoi )?)?di ung|khong gay di ung|allergy[ .-]?safe|(?:khong (?:he )?(?:chua|co)) (?:dau phong|lac|hai san|tom|sua|trung|gluten)|khong (?:lo|so).{0,15}di ung|(?:di ung).{0,40}(?:yen tam|an toan))\b/g)
    if ([...allergies].some(match => !qualifiedClaim(clause, match.index))) return true
    const portions = /\b(?:chac chan|bao dam|dam bao).{0,35}(?:du no|du (?:cho|khau phan)|an no)|\b(?:du no|du cho ca nhom)\b/.exec(clause)
    return Boolean(portions && !qualifiedClaim(clause, portions.index) && !uncertainty.test(clause))
  })
}

interface Observation { name?: string; status?: string; result?: Record<string, unknown> }
function observations(evidence: string): Observation[] {
  try {
    const parsed: unknown = JSON.parse(evidence)
    return Array.isArray(parsed) ? parsed.filter(value => value && typeof value === 'object') : []
  } catch { return [] }
}

// The model writes conversational prose; authoritative values stay in server-built cards.
export function safeConciergeReply(raw: string, evidence = ''): string | null {
  const reply = raw.trim()
  if (!reply || reply.length > 700 || /<[^>]+>|https?:\/\//i.test(reply)) return null
  const text = normalizeIntent(reply)
  if (/\b(?:(?:da|se) (?:ghi nho|nho)|(?:minh|toi|em|tro ly|tiger) (?:da|se) luu|(?:da|se) luu (?:so thich|khau vi|thong tin nay|vao bo nho)|will remember|saved your preference|remembered your preference)\b/.test(text)) return null
  if (unsafeCommitment(reply)) return null
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
  if (clauses(reply).some(text => !uncertainty.test(text) &&
    (restaurantFact.test(text) || menuFact.test(text) || /\b(?:khuyen mai|mien phi|bao hanh)\b/.test(text) ||
      /\b(?:mon|ga|bo|ca|tom|rau|com|lau)\b.{0,50}\b(?:gia|con mon|het mon|gom|chua hanh|co chua|ngon nhat)\b/.test(text)))) return null
  return reply
}

export function safeGroundedReply(raw: string, evidence: string, evidenceStatus: EvidenceStatus = 'known'): string | null {
  const reply = raw.trim()
  if (!reply || reply.length > 700 || /<[^>]+>/.test(reply)) return null
  const urls = reply.match(/https?:\/\/[^\s)]+/gi) ?? []
  if (urls.some(url => !evidence.includes(url.replace(/[.,!?]+$/, '')))) return null
  const replyWithoutVerifiedUrls = reply.replace(/https?:\/\/[^\s)]+/gi, '')
  if (!safeConciergeReply(replyWithoutVerifiedUrls, evidence)) return null
  const sources = observations(evidence)
  const knownRestaurant = sources.filter(value => value.name === 'lookup_restaurant_info' && value.status === 'known')
  if (sources.length && clauses(reply).some(text => !uncertainty.test(text) && restaurantFact.test(text) &&
      !knownRestaurant.length && !sources.some(value => value.name === 'check_reservation_availability' && value.status === 'known'))) return null
  if (evidenceStatus !== 'known') {
    const normalized = normalizeIntent(reply)
    const verifiedEmptyMenu = sources.some(value =>
      ['search_menu_items', 'recommend_meal', 'get_menu_item'].includes(value.name ?? '') && value.status === 'empty')
    // A failed/unattempted read cannot justify a negative catalog conclusion.
    if (['unavailable', 'unknown', 'not_attempted'].includes(evidenceStatus) &&
        negativeMenu.test(normalized) &&
        !(verifiedEmptyMenu && !/\b(?:het mon|khong (?:co|con) mon nao)\b/.test(normalized))) return null
    if (evidenceStatus === 'unavailable' &&
        !retrievalFailure.test(normalized)) return null
    if (evidenceStatus === 'not_attempted' && clauses(reply).some(text => {
      const performed = /\b(?:(?:da|vua) (?:tra|kiem tra|tim)|tra xong)\b/.exec(text)
      return performed && !qualifiedClaim(text, performed.index)
    })) return null
    if (evidenceStatus === 'empty') {
      if (retrievalFailure.test(normalized)) return null
      if (negativeMenu.test(normalized)) return reply
    }
    if (!uncertainty.test(normalized) && !retrievalFailure.test(normalized) &&
        !/\b(?:chua tim thay|chua tim duoc|khong tim thay|khong xac minh|chua co ket qua|khong co ket qua|chua duoc tra cuu)\b/.test(normalized)) return null
  }
  return reply
}
