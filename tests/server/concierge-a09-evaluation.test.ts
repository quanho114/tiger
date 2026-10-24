import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, expect, it, vi } from 'vitest'
import { memoryFixture } from './concierge-a05-fixture.ts'
import { usage } from './concierge-a03-a05-fixture.ts'
import { processConciergeTurn, productionConciergeSessionStore } from '../../supabase/functions/_shared/concierge/runtime.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { createConciergeStream } from '../../supabase/functions/_shared/concierge/sse.ts'

afterEach(() => vi.restoreAllMocks())

it('measures synthetic status/verified completion and repair on the actual runtime/stream boundary', async () => {
  const metric = vi.spyOn(console, 'info').mockImplementation(() => {})
  const samples = []
  for (let index = 0; index < 6; index++) {
    const repairing = index >= 3
    const database = memoryFixture([])
    const store = productionConciergeSessionStore(database.pool)
    const requestId = crypto.randomUUID()
    let drafts = 0
    const adapter = new ConciergeLlmOrchestrator({ customAdapter: async (_message, _history, context) => {
      if (!context.bounded!.exchanges.length) return { reply_text: '', tool_calls: [], tokens_used: usage }
      drafts++
      return { reply_text: repairing && drafts === 1 ? 'Giỏ hàng đã được cập nhật thành công.' : 'Bạn xem các lựa chọn trong thẻ; đây vẫn là đề xuất.',
        tool_calls: [], tokens_used: usage }
    } })
    const started = performance.now()
    let firstStatus: number | null = null
    let firstText: number | null = null
    const stream = createConciergeStream({ requestId, version: 2, signal: new AbortController().signal,
      execute: callbacks => processConciergeTurn({ protocol_version: 'concierge-v2', request_id: requestId, message: 'Cho xem menu' },
        { authenticated_user_id: null }, { pool: database.pool, store, orchestrator: adapter, ...callbacks }),
      error: () => ({ protocol_version: 'concierge-v2', request_id: requestId, response_id: crypto.randomUUID(),
        error: { code: 'INTERNAL_SAFE_FAILURE', message: 'Chưa thể hoàn tất.' } }) })
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let pending = ''
    const frames: { type: string; data: { text?: string; message?: string; cards?: unknown[] } }[] = []
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      pending += decoder.decode(chunk.value, { stream: true })
      let boundary: number
      while ((boundary = pending.indexOf('\n\n')) >= 0) {
        const block = pending.slice(0, boundary)
        pending = pending.slice(boundary + 2)
        if (!block.startsWith('event:')) continue
        const frame = JSON.parse(block.slice(block.indexOf('data: ') + 6))
        frames.push(frame)
        if (frame.type === 'status' && firstStatus === null) firstStatus = performance.now() - started
        if (frame.type === 'text_delta' && firstText === null) firstText = performance.now() - started
      }
    }
    const completion = frames.filter(frame => frame.type === 'complete')
    expect(frames.some(frame => frame.type === 'error')).toBe(false)
    expect(completion).toHaveLength(1)
    expect(completion[0].data.cards!.length).toBeGreaterThan(0)
    expect(frames.filter(frame => frame.type === 'text_delta').map(frame => frame.data.text).join('')).toBe(completion[0].data.message)
    expect(firstStatus).not.toBeNull()
    expect(firstText).not.toBeNull()
    expect(firstText!).toBeGreaterThanOrEqual(firstStatus!)
    const turn = metric.mock.calls.map(call => call[0] as Record<string, unknown>).filter(value => value.event === 'concierge_v2_turn').at(-1)!
    expect(turn.repair_attempts).toBe(repairing ? 1 : 0)
    expect(turn.repair_successes).toBe(repairing ? 1 : 0)
    samples.push({ id: `synthetic-${index + 1}`, repairing, first_status_ms: firstStatus, first_verified_text_ms: firstText,
      completion_ms: performance.now() - started, repair_latency_ms: turn.repair_latency_ms,
      model_calls: turn.model_calls, tool_count: turn.tool_count })
  }
  if (process.env.A09_TIMING_OUTPUT) {
    const destination = path.resolve(process.env.A09_TIMING_OUTPUT)
    const allowed = path.resolve('../tiger-a09-a10-baseline') + path.sep
    if (!destination.startsWith(allowed)) throw new Error('Timing output must stay in task baseline directory')
    fs.writeFileSync(destination, JSON.stringify({ version: 'a09-synthetic-runtime-timing-v1',
      environment: 'Windows; real runtime/CAS adapter/SSE functions; synthetic SQL and injected immediate model; no HTTP/browser/provider/database',
      sample_size: samples.length, policy: 'Diagnostic samples only; no p95, performance acceptance or before/after runtime claim', samples }, null, 2) + '\n')
  }
})
