import type { ConciergeV2SessionMutableState } from '../contracts/concierge-v2.ts'

// UTF-8 bytes upper-bound byte-based tokenizers, including Vietnamese text.
export const tokenUpperBound = (text: string) => new TextEncoder().encode(text).length

export function summarizeSession(state: ConciergeV2SessionMutableState): ConciergeV2SessionMutableState {
  if (state.transcript.filter(m => m.role === 'user').length < 10 &&
      tokenUpperBound(JSON.stringify(state.transcript)) < 2500) return state
  // Canonical constraints/draft remain separate and never depend on lossy prose.
  const summary = JSON.stringify({
    source: 'session_state',
    draft_id: state.draft?.draft_id ?? null,
    accepted: state.draft?.items.slice(0, 3).map(i => i.menu_item_id) ?? [],
    pending: state.pending_suggestion_ids.slice(0, 3),
    unresolved: state.draft?.review_state ?? (state.pending_suggestion_ids.length ? 'SUGGESTIONS' : 'DISCOVERY'),
  })
  return { ...state, summary: tokenUpperBound(summary) <= 400 ? summary : JSON.stringify({ draft_id: state.draft?.draft_id ?? null, accepted_count: state.draft?.items.length ?? 0, pending_count: state.pending_suggestion_ids.length }), transcript: state.transcript.slice(-4) }
}
