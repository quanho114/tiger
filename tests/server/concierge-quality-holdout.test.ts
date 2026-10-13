import { describe, expect, it } from 'vitest'
import { classifyConciergeTurn } from '../../supabase/functions/_shared/concierge/turn-intent.ts'
import { applyTurnConstraints } from '../../supabase/functions/_shared/concierge/turn-constraints.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { searchRestaurantKnowledge } from '../../supabase/functions/_shared/concierge/rag.ts'
import { fixtureClock } from '../fixtures/concierge-quality/cases.ts'
import { holdoutKnowledge, holdoutRoutes, holdoutStates, holdoutVersion } from '../fixtures/concierge-quality/holdout.ts'

describe(`concierge quality holdout ${holdoutVersion}`, () => {
  it.each(holdoutRoutes)('$id routes independently', ({ input, intent }) => {
    expect(classifyConciergeTurn(input)).toBe(intent)
  })

  it.each(holdoutStates)('$id preserves state', ({ turns, expected }) => {
    let constraints = emptyConciergeSession().constraints
    for (const turn of turns) constraints = applyTurnConstraints(turn, constraints)
    for (const [key, value] of Object.entries(expected)) {
      expect(constraints[key as keyof typeof constraints]).toEqual(value)
    }
  })

  it.each(holdoutKnowledge)('$id retrieves only published evidence', ({ query, documentId }) => {
    expect(searchRestaurantKnowledge(query, 0.25, fixtureClock).results[0]?.document.id ?? null).toBe(documentId)
  })
})
