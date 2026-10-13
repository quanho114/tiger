import { expect, it } from 'vitest'
import { applyTurnConstraints } from '../../supabase/functions/_shared/concierge/turn-constraints.ts'
import { classifyConciergeTurn } from '../../supabase/functions/_shared/concierge/turn-intent.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionConstraints } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

it('keeps a family budget across short conversational turns without opening the menu', () => {
  let constraints: ConciergeV2SessionConstraints = emptyConciergeSession().constraints
  for (const message of ['4 người nha', 'khoảng 1 triệu', 'có bé 6 tuổi']) {
    expect(classifyConciergeTurn(message)).toBe('constraints')
    constraints = applyTurnConstraints(message, constraints)
  }
  expect(constraints).toMatchObject({ adults: 3, children: 1, party_size_confirmed: true,
    budget_vnd: 1_000_000, is_hard_budget: false })
  constraints = applyTurnConstraints('thêm bé 6 tuổi', constraints)
  expect(constraints).toMatchObject({ adults: 3, children: 2 })
  constraints = applyTurnConstraints('2 người', constraints)
  expect(constraints).toMatchObject({ adults: 1, children: 1 })
})

it('treats an explicit ceiling as hard and ignores vague numbers', () => {
  const base = emptyConciergeSession().constraints
  expect(applyTurnConstraints('tối đa 800k', base)).toMatchObject({ budget_vnd: 800_000, is_hard_budget: true })
  expect(applyTurnConstraints('Bò nướng giá 180k?', base).budget_vnd).toBeNull()
})
