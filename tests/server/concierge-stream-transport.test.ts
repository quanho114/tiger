import { afterEach, expect, it, vi } from 'vitest'
import { createConciergeStream } from '../../supabase/functions/_shared/concierge/sse.ts'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import type { ConciergeV2CompletionPayload, ConciergeV2ErrorEnvelope } from '../../supabase/functions/_shared/contracts/concierge-v2.ts'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const requestId = crypto.randomUUID()
const completion: ConciergeV2CompletionPayload = {
  protocol_version: 'concierge-v2', request_id: requestId, response_id: crypto.randomUUID(),
  session: { session_id: crypto.randomUUID(), session_capability: 'csc_' + 'a'.repeat(32), state_version: 2,
    idle_expires_at: new Date(Date.now() + 60000).toISOString(), absolute_expires_at: new Date(Date.now() + 600000).toISOString() },
  phase: 'DISCOVERY', message: 'Đây là phản hồi đã kiểm chứng, không phải token model thô.',
  cards: [{ type: 'service_link', destination: 'cart' }], warnings: [],
}
const error = (): ConciergeV2ErrorEnvelope => ({ protocol_version: 'concierge-v2', request_id: requestId,
  response_id: crypto.randomUUID(), error: { code: 'INTERNAL_SAFE_FAILURE', message: 'Chưa thể hoàn tất.' } })
const events = (wire: string) => wire.split('\n\n').filter(block => block.startsWith('event:')).map(block =>
  JSON.parse(block.slice(block.indexOf('data: ') + 6)))

it('publishes text/cards only after execution resolves and emits one terminal completion', async () => {
  let resolve!: (value: ConciergeV2CompletionPayload) => void
  const stream = createConciergeStream({ requestId, version: 2, signal: new AbortController().signal, error,
    execute: async callbacks => {
      callbacks.onReady(completion.session); callbacks.onActivity('checking_info')
      return new Promise(yes => { resolve = yes })
    } })
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let wire = decoder.decode((await reader.read()).value)
  wire += decoder.decode((await reader.read()).value)
  expect(events(wire).map(frame => frame.type)).toEqual(['start', 'status'])
  resolve(completion)
  for (;;) { const read = await reader.read(); if (read.done) break; wire += decoder.decode(read.value) }
  const frames = events(wire)
  expect(frames.map(frame => frame.seq)).toEqual(frames.map((_frame, index) => index + 1))
  expect(frames.filter(frame => frame.type === 'text_delta').map(frame => frame.data.text).join('')).toBe(completion.message)
  expect(frames.at(-1).data).toEqual(completion)
  expect(frames.filter(frame => frame.type === 'complete')).toHaveLength(1)
})

it('never emits presentation text when commit/execution fails', async () => {
  const stream = createConciergeStream({ requestId, version: 2, signal: new AbortController().signal, error,
    execute: async callbacks => { callbacks.onReady(completion.session); throw new Error('private upstream failure') } })
  const wire = await new Response(stream).text()
  expect(events(wire).map(frame => frame.type)).toEqual(['start', 'error'])
  expect(wire).not.toContain('private upstream')
})

it('sends heartbeat comments and aborts execution at the deadline', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  const stream = createConciergeStream({ requestId, version: 2, signal: new AbortController().signal, error,
    heartbeatMs: 100, deadlineMs: 300,
    execute: async callbacks => { signal = callbacks.signal; return new Promise(() => {}) } })
  const reader = stream.getReader()
  await vi.advanceTimersByTimeAsync(100)
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(': heartbeat')
  await vi.advanceTimersByTimeAsync(200)
  expect(signal.aborted).toBe(true)
  let wire = ''
  for (;;) { const read = await reader.read(); if (read.done) break; wire += new TextDecoder().decode(read.value) }
  expect(wire).toContain('event: error')
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels upstream and clears timers when the downstream reader cancels', async () => {
  vi.useFakeTimers()
  let signal!: AbortSignal
  const stream = createConciergeStream({ requestId, version: 2, signal: new AbortController().signal, error,
    execute: async callbacks => { signal = callbacks.signal; return new Promise(() => {}) } })
  await stream.cancel()
  expect(signal.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('retains legacy transport without exposing pre-commit text', async () => {
  const stream = createConciergeStream({ requestId, version: 1, signal: new AbortController().signal, error,
    execute: async callbacks => { callbacks.onActivity('thinking'); return completion } })
  const wire = await new Response(stream).text()
  expect(wire).toContain('event: status')
  expect(wire).toContain('event: complete')
  expect(wire).not.toContain('stream_version')
})

it.each(['openai', 'anthropic', 'gemini'] as const)('propagates cancellation to the %s provider without fallback', async provider => {
  const controller = new AbortController()
  vi.stubGlobal('fetch', vi.fn(async (_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    controller.abort()
  })))
  const llm = new ConciergeLlmOrchestrator({ provider, apiKey: 'synthetic-test-only' })
  await expect(llm.orchestrateTurn('Xin chào', [], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
})
