import { describe, expect, it } from 'vitest'
import { extractConstraintDelta, mergeConstraintDelta } from '../../supabase/functions/_shared/concierge/understanding/constraint-extractor.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'

const base = () => emptyConciergeSession().constraints
const apply = (message: string, previous = base()) => mergeConstraintDelta(previous, extractConstraintDelta(message))

describe('dynamic recommendation budget understanding', () => {
  it.each([
    ['Tôi có 1 triệu đồng, tư vấn cho tôi những món best seller ngon nhất.', 1_000_000],
    ['Gợi ý combo cho 4 người ngân sách tối đa 500k', 500_000],
    ['Tối đa 1.000.000 đồng', 1_000_000],
    ['Ngân sách 1 000 000đ', 1_000_000],
    ['ngân sách 1tr5', 1_500_000],
    ['ngân sách 1,5 triệu', 1_500_000],
    ['ngân sách 1.5 triệu', 1_500_000],
    ['ngân sách 1,000,000 vnd', 1_000_000],
    ['4 người 700k', 700_000],
    ['giảm xuống 700k', 700_000],
    ['Bò giá bao nhiêu? Ngân sách tối đa 800k', 800_000],
    ['Combo giá 300k, tôi có 1 triệu', 1_000_000],
    ['ngân sách 0 đồng', 0],
  ])('extracts a grounded budget from %s', (message, budget) => {
    expect(extractConstraintDelta(message)).toMatchObject({ budgetVnd: budget, budgetBasis: 'total' })
    expect(apply(message).budget_vnd).toBe(budget)
  })

  it.each([
    'Bò nướng giá 180k?', 'Combo 500k có những món gì?', 'Món nào khoảng 200k?',
    'Phí giao tối đa 50k?', 'Giá 200k/người phải không?', 'Menu dưới 200k có món nào?', 'Tôi có 4 người',
    'Ngân sách -500k', 'Ngân sách 1.2.3 triệu', 'Ngân sách 0,1 đồng',
    'Ngân sách 999999999999999999999999999999k',
  ])('does not invent a budget from a price or invalid amount: %s', message => {
    expect(extractConstraintDelta(message).budgetVnd).toBeUndefined()
  })

  it('preserves a previous budget when only asking menu prices', () => {
    const previous = apply('ngân sách 700k')
    expect(apply('Bò nướng giá 180k?', previous).budget_vnd).toBe(700_000)
  })

  it('keeps per-person money pending without using default adults', () => {
    const delta = extractConstraintDelta('Mỗi người 200k')
    expect(delta).toMatchObject({ budgetVnd: 200_000, budgetBasis: 'per_person' })
    const pending = mergeConstraintDelta(base(), delta)
    expect(pending).toMatchObject({ budget_vnd: null, budget_basis: 'per_person', budget_per_person_vnd: 200_000 })
    const confirmed = apply('4 người', pending)
    expect(confirmed.budget_vnd).toBe(800_000)
    expect(apply('3 người', confirmed).budget_vnd).toBe(600_000)
  })

  it.each(['Mỗi người 200k cho 4 người', 'Ngân sách 200k/người cho 4 người', '200k mỗi người, 4 người'])('multiplies a confirmed per-person budget: %s', message => {
    expect(apply(message)).toMatchObject({ budget_vnd: 800_000, budget_basis: 'per_person', budget_per_person_vnd: 200_000 })
  })

  it('replaces per-person basis when the customer gives a new total', () => {
    const previous = apply('Mỗi người 200k cho 4 người')
    const next = apply('Tổng ngân sách 1 triệu', previous)
    expect(next).toMatchObject({ budget_vnd: 1_000_000, budget_basis: 'total' })
    expect(next.budget_per_person_vnd).toBeUndefined()
    expect(apply('5 người', next).budget_vnd).toBe(1_000_000)
  })

  it('clears both resolved and pending per-person budgets', () => {
    for (const previous of [apply('Mỗi người 200k'), apply('Mỗi người 200k cho 4 người')]) {
      const next = apply('Bỏ giới hạn ngân sách', previous)
      expect(next.budget_vnd).toBeNull()
      expect(next.budget_basis).toBeUndefined()
      expect(next.budget_per_person_vnd).toBeUndefined()
      expect(next.is_hard_budget).toBe(false)
      expect(apply('5 người', next).budget_vnd).toBeNull()
    }
  })

  it('does not mutate prior constraints or wrap overflowing per-person totals', () => {
    const previous = { ...base(), party_size_confirmed: true, adults: 4, children: 0 }
    const snapshot = { ...previous }
    const next = mergeConstraintDelta(previous, { budgetVnd: Number.MAX_SAFE_INTEGER, budgetBasis: 'per_person' })
    expect(next.budget_vnd).toBeNull()
    expect(previous).toEqual(snapshot)
  })
})

describe('requested distinct dish counts', () => {
  it.each([
    ['Gợi ý 5 món cho 4 người tối đa 500k', 5, 'final_meal'],
    ['Chọn đúng một món', 1, 'final_meal'],
    ['Mâm đúng 30 món', 30, 'final_meal'],
    ['Thêm 5 món mới', 5, 'new_additions'],
    ['Thêm đúng ba món', 3, 'new_additions'],
    ['Đổi cả mâm thành 4 món', 4, 'final_meal'],
  ])('extracts exact count and scope: %s', (message, count, scope) => {
    expect(extractConstraintDelta(message)).toMatchObject({ requestedDishCount: count, requestedDishCountScope: scope })
    expect(apply(message)).toMatchObject({ requested_dish_count: count, requested_dish_count_scope: scope })
  })

  it.each(['Gợi ý 0 món', 'Chọn 31 món', 'Tôi muốn 2,5 món', 'Chọn -2 món'])('reports unsupported counts without clamping: %s', message => {
    const delta = extractConstraintDelta(message)
    expect(delta.requestedDishCountInvalid).toBe(true)
    expect(delta.requestedDishCount).toBeUndefined()
  })

  it.each(['thêm 2 phần gà', 'gợi ý cho 4 người', 'khoảng 5 món', 'tối đa 5 món', 'ít nhất 3 món', 'từ 3 đến 5 món', '3-5 món', 'Tôi đã ăn 5 món', 'Quán có 5 món không?'])('does not confuse quantity/party/approximation with exact count: %s', message => {
    expect(extractConstraintDelta(message).requestedDishCount).toBeUndefined()
  })
})
