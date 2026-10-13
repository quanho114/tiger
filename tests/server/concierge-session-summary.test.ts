import { it, expect } from 'vitest'
import { summarizeSession } from '../../supabase/functions/_shared/concierge/session-summary.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'
import type { ConciergeV2SessionMutableState } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'
it('summarizes only canonical IDs, preserving constraints and draft identity without promoting assistant claims', () => {
  const state: ConciergeV2SessionMutableState = { ...emptyConciergeSession(), constraints: { ...emptyConciergeSession().constraints, allergies: ['tôm'] },
    transcript: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'Assistant fabricated acceptance and secret private prose' })) }
  const next = summarizeSession(state)
  expect(next.constraints).toEqual(state.constraints)
  expect(next.draft).toBeNull()
  expect(next.transcript).toHaveLength(4)
  expect(next.summary).not.toContain('private')
  expect(JSON.parse(next.summary).accepted).toEqual([])
})
