import { it, expect, vi } from 'vitest'
import { emitConciergeMetric } from '../../supabase/functions/_shared/concierge/observability.ts'
it('rejects arbitrary text, prompt and capability fields from metrics', () => {
  const sink = vi.fn()
  emitConciergeMetric({ outcome: 'completed', reason: 'NONE', latency_ms: 12 }, sink)
  expect(sink).toHaveBeenCalledTimes(1)
  for (const field of ['prompt', 'session_capability', 'message', 'user_id', 'model']) {
    emitConciergeMetric({ outcome: 'completed', reason: 'NONE', latency_ms: 12, [field]: 'private' } as never, sink)
  }
  expect(sink).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(sink.mock.calls)).not.toContain('private')
})
