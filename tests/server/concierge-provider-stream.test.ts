import { afterEach, expect, it, vi } from 'vitest'
import { ConciergeLlmOrchestrator } from '../../supabase/functions/_shared/concierge/llm.ts'
import { buildConciergeContext } from '../../supabase/functions/_shared/concierge/context.ts'
import { emptyConciergeSession } from '../../supabase/functions/_shared/concierge/runtime.ts'

afterEach(() => vi.unstubAllGlobals())

it('consumes provider tokens incrementally when a safe text consumer is present', async () => {
  const chunks = [
    { choices: [{ delta: { content: 'Chào bạn, ' } }] },
    { choices: [{ delta: { content: 'mình giúp chọn món nhé.' } }] },
    { usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 }, choices: [] },
  ]
  const wire = `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`
  vi.stubGlobal('fetch', vi.fn(async (_url, init: RequestInit) => {
    expect(JSON.parse(init.body as string).stream).toBe(true)
    return new Response(new ReadableStream({ start(controller) {
      const bytes = new TextEncoder().encode(wire)
      controller.enqueue(bytes.slice(0, 23))
      controller.enqueue(bytes.slice(23))
      controller.close()
    } }), { status: 200 })
  }))
  const onTextDelta = vi.fn()
  const llm = new ConciergeLlmOrchestrator({ provider: 'openai', apiKey: 'synthetic-test-only' })
  const context = buildConciergeContext({ state: emptyConciergeSession(), message: 'Xin chào', tools: [] })
  const reply = await llm.orchestrateTurn('Xin chào', [], { bounded: context, onTextDelta })
  expect(onTextDelta.mock.calls.map(call => call[0])).toEqual(['Chào bạn, ', 'mình giúp chọn món nhé.'])
  expect(reply.reply_text).toBe('Chào bạn, mình giúp chọn món nhé.')
  expect(reply.tokens_used.total_tokens).toBe(22)
})
