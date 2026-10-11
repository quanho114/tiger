import { describe, expect, it } from 'vitest'
import { understandTurn, understandDraft } from '../../supabase/functions/_shared/concierge/understanding/engine.ts'
import { normalizeTurn, normalizeIntent } from '../../supabase/functions/_shared/concierge/understanding/normalizer.ts'
import { extractConstraintDelta, mergeConstraintDelta } from '../../supabase/functions/_shared/concierge/understanding/constraint-extractor.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
// Compat shims must stay byte-identical:
import { classifyConciergeTurn, namedMenuQuery } from '../../supabase/functions/_shared/concierge/turn-intent.ts'
import { applyTurnConstraints } from '../../supabase/functions/_shared/concierge/turn-constraints.ts'
import { resolveDraftIntent } from '../../supabase/functions/_shared/concierge/draft-intent.ts'

const intentOf = (msg: string, pending = false) => understandTurn(msg, pending).intent

describe('Phase 3 — smalltalk', () => {
  it.each(['xin chào', 'chào bạn', 'cảm ơn', 'bye', 'Chào Tiger nha'])('%s', (msg) => {
    expect(['greeting', 'thanks', 'farewell']).toContain(intentOf(msg))
  })
  it('confidence is high for smalltalk', () => {
    expect(understandTurn('xin chào').confidence).toBe('high')
  })
})

describe('Phase 3 — restaurant faq', () => {
  it.each([
    'quán mở cửa mấy giờ',
    'có chỗ đậu xe không',
    'địa chỉ quán ở đâu',
  ])('%s → faq + memory faq', (msg) => {
    const u = understandTurn(msg)
    expect(u.intent).toBe('faq')
    expect(u.memoryIntent).toBe('faq')
  })
  // Known legacy quirk, intentionally unchanged: the delivery-fee question
  // matches a food token, so memory loads while intent stays faq.
  it('documents delivery-fee memory quirk', () => {
    const u = understandTurn('phí giao hàng bao nhiêu')
    expect(u.intent).toBe('faq')
    expect(u.memoryIntent).toBe('food_or_draft')
  })
})

describe('Phase 3 — reservation', () => {
  it.each(['đặt bàn tối mai', '7 giờ tối còn bàn 4 người không', 'tôi muốn giữ chỗ'])(
    '%s → reservation', (msg) => expect(intentOf(msg)).toBe('reservation'),
  )
})

describe('Phase 3 — menu search & recommendation', () => {
  it('names a specific dish without mutating', () => {
    const u = understandTurn('quán có món bò nướng không')
    expect(u.intent).toBe('food')
    expect(u.draftSignal).toBe('none')
  })
  it.each(['gợi ý món cho 4 người', '700k thì ăn gì', 'tư vấn mâm cho gia đình'])(
    '%s → food', (msg) => expect(intentOf(msg)).toBe('food'),
  )
})

describe('Phase 3 — bare constraints', () => {
  it.each(['4 người', 'tầm 700k', 'tối đa 1 triệu', 'không cay', 'ăn ít'])(
    '%s', (msg) => expect(['constraints', 'food']).toContain(intentOf(msg)),
  )
  // Known legacy gap, intentionally unchanged for Phase 3.5 (LLM fallback):
  // "2 người lớn 2 trẻ em" has no co/them/voi verb and no budget, so the
  // deterministic cascade yields 'other' — but the delta still parses party=2.
  it('documents multi-word party gap', () => {
    const u = understandTurn('2 người lớn 2 trẻ em')
    expect(u.intent).toBe('other')
    expect(u.constraintsDelta.partyTotal).toBe(2)
    expect(u.requiresClarification).toBe(true)
  })
  it('multi-signal message parses once', () => {
    const u = understandTurn('4 người khoảng 800k, không cay, gợi ý giúp tôi')
    expect(u.intent).toBe('food')
    expect(u.constraintsDelta.partyTotal).toBe(4)
    expect(u.constraintsDelta.budgetVnd).toBe(800_000)
    expect(u.constraintsDelta.spice).toBe('zero')
    expect(u.memoryIntent).toBe('food_or_draft')
  })
})

describe('Phase 3 — draft commands stay deterministic', () => {
  it.each(['thêm 2 trà đào', 'chốt'])('%s', (msg) => {
    expect(intentOf(msg)).toBe('food')
    expect(understandTurn(msg).draftSignal).not.toBe('none')
  })
  // 'xem giỏ' is a UI-button action (review_draft), not a chat intent — legacy 'other'.
  it('documents xem-gio chat behavior', () => {
    expect(intentOf('xem giỏ')).toBe('other')
  })
  it('informational questions never signal mutation', () => {
    for (const msg of ['bò có cay không?', 'có món bò nào không?', 'gợi ý món bò']) {
      expect(understandTurn(msg).draftSignal).toBe('none')
    }
  })
  it('understandDraft delegates with catalog safety', () => {
    const state = emptyConciergeSession()
    expect(understandDraft('OK', state, []).kind).toBe('clarify')
    expect(understandDraft('bò có cay không?', state, []).kind).toBe('none')
  })
})

describe('Phase 3 — ambiguity', () => {
  it('bare ok without pending is low-confidence food', () => {
    const u = understandTurn('ok')
    expect(u.confidence).toBe('low')
    expect(u.requiresClarification).toBe(true)
  })
})

describe('Phase 3 — account reads', () => {
  it.each(['đơn hàng gần nhất của tôi', 'địa chỉ đã lưu'])(
    '%s', (msg) => expect(['order_history', 'saved_address']).toContain(intentOf(msg)),
  )
  // Known legacy quirk: 'lịch sử đặt món' matches a food token → food, not history.
  it('documents lich-su-dat-mon quirk', () => {
    expect(intentOf('lịch sử đặt món')).toBe('food')
  })
})

describe('Phase 3 — compat parity (shims == engine)', () => {
  const messages = [
    'xin chào', 'cảm ơn bạn', 'đặt bàn tối mai 4 người', 'quán mở cửa mấy giờ',
    'có chỗ đậu xe không', 'gợi ý món cho 4 người tầm 700k', '4 người', 'tối đa 1 triệu',
    'không cay', 'thêm 2 trà đào', 'bỏ trà đào đi', 'xem giỏ', 'chốt', 'ok',
    'bò có cay không?', 'đơn hàng gần nhất của tôi', 'địa chỉ đã lưu của mình',
    'quán có món bò nướng không', '7 giờ tối còn bàn không', 'bye',
  ]
  it('intent parity across pending states', () => {
    for (const pending of [false, true]) {
      for (const msg of messages) {
        expect(understandTurn(msg, pending).intent, `${msg} pending=${pending}`).toBe(
          classifyConciergeTurn(msg, pending),
        )
      }
    }
  })
  it('constraint parity', () => {
    for (const msg of messages) {
      const base = emptyConciergeSession().constraints
      expect(mergeConstraintDelta(base, extractConstraintDelta(msg))).toEqual(applyTurnConstraints(msg, base))
    }
  })
  it('named-menu + draft parity', () => {
    const state = emptyConciergeSession()
    const catalog = [{ id: 'id-1', name: 'Trà đào' }]
    for (const msg of messages) {
      const u = understandTurn(msg)
      if (u.intent === 'food') {
        expect(u.entities.namedMenuQuery, msg).toBe(namedMenuQuery(msg))
      }
      expect(understandDraft(msg, state, catalog), msg).toEqual(resolveDraftIntent(msg, state, catalog))
    }
  })
  it('normalizer is byte-identical to legacy', () => {
    for (const msg of [...messages, 'Bò Nướng!!!', '  Trà Đào?  ']) {
      expect(normalizeTurn(msg).searchForm).toBe(normalizeIntent(msg))
    }
  })
})

describe('Phase 3 — invariants', () => {
  it('normalization is idempotent', () => {
    for (const msg of ['Chào Tiger!!!', '4 NGƯỜI tầm 700K?', 'Bò nướng']) {
      const once = normalizeTurn(msg).searchForm
      expect(normalizeTurn(once).searchForm).toBe(once)
    }
  })
  it('understanding never mutates input state', () => {
    const state = emptyConciergeSession()
    const snapshot = JSON.parse(JSON.stringify(state))
    understandTurn('4 người 700k thêm trà đào')
    understandDraft('thêm 2 trà đào', state, [{ id: 'x', name: 'Trà đào' }])
    expect(state).toEqual(snapshot)
  })
  it('no negative party counts, no NaN', () => {
    for (const msg of ['0 người', '99 người', '100000000000000000000k', 'abc', '']) {
      const d = extractConstraintDelta(msg)
      expect(d.partyTotal === undefined || (d.partyTotal >= 1 && d.partyTotal <= 30)).toBe(true)
      expect(d.budgetVnd === undefined || Number.isSafeInteger(d.budgetVnd)).toBe(true)
    }
  })
  it('deterministic: same input, same result', () => {
    const a = understandTurn('4 người khoảng 700k gợi ý giúp tôi', true)
    const b = understandTurn('4 người khoảng 700k gợi ý giúp tôi', true)
    expect(a).toEqual(b)
  })
})
