import { expect, it, vi } from 'vitest'
import { readConciergeStream } from '@/features/concierge/stream'

const completion = {
  protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), response_id: crypto.randomUUID(),
  session: { session_id: crypto.randomUUID(), session_capability: `csc_${'a'.repeat(64)}`,
    state_version: 2, idle_expires_at: new Date(Date.now() + 60_000).toISOString(),
    absolute_expires_at: new Date(Date.now() + 120_000).toISOString() },
  phase: 'DISCOVERY', message: 'Mình giúp bạn chọn món nhé?', cards: [], warnings: [],
}

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close() },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}

it('reads real status events across network chunks before the verified completion', async () => {
  const status = vi.fn()
  const wire = `event: status\ndata: {"phase":"checking_menu"}\n\nevent: complete\ndata: ${JSON.stringify(completion)}\n\n`
  const result = await readConciergeStream(streamResponse([wire.slice(0, 18), wire.slice(18, 65), wire.slice(65)]), status)
  expect(status).toHaveBeenCalledWith('checking_menu')
  expect(result.message).toBe(completion.message)
})

it('shows guarded model text as it arrives and still requires a committed completion', async () => {
  const text = vi.fn()
  const wire = `event: text\ndata: {"text":"Chào bạn, mình giúp chọn món"}\n\nevent: complete\ndata: ${JSON.stringify(completion)}\n\n`
  const result = await readConciergeStream(streamResponse([wire.slice(0, 27), wire.slice(27)]), vi.fn(), text)
  expect(text).toHaveBeenCalledWith('Chào bạn, mình giúp chọn món')
  expect(result.message).toBe(completion.message)
})

it('rejects a disconnected stream without a completion', async () => {
  await expect(readConciergeStream(streamResponse(['event: status\ndata: {"phase":"thinking"}\n\n']), vi.fn()))
    .rejects.toMatchObject({ code: 'STREAM_INTERRUPTED' })
})

it('surfaces the server error without treating it as a successful reply', async () => {
  const error = { protocol_version: 'concierge-v2', request_id: completion.request_id,
    response_id: crypto.randomUUID(), error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Menu tạm thời không khả dụng.' } }
  await expect(readConciergeStream(streamResponse([`event: error\ndata: ${JSON.stringify(error)}\n\n`]), vi.fn()))
    .rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' })
})

const streamId = crypto.randomUUID()
function frame(type: string, data: unknown, seq: number) {
  return `event: ${type}\r\ndata: ${JSON.stringify({ stream_version: 2, stream_id: streamId,
    request_id: completion.request_id, seq, type, data })}\r\n\r\n`
}
const start = () => frame('start', { session: { session_id: completion.session.session_id,
  session_capability: completion.session.session_capability } }, 1)
const delta = (text = completion.message, index = 0, seq = 2) => frame('text_delta', {
  message_id: completion.response_id, index, text,
}, seq)

it('validates v2 identity, receipt, ordered deltas and canonical completion', async () => {
  const text = vi.fn(); const ready = vi.fn()
  const wire = `${start()}: heartbeat\r\n\r\n${delta()}${frame('complete', completion, 3)}`
  const bytes = new TextEncoder().encode(wire)
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  } }))
  const result = await readConciergeStream(response, vi.fn(), text, completion.request_id, ready)
  expect(result).toEqual(completion)
  expect(ready).toHaveBeenCalledWith({ session_id: completion.session.session_id, session_capability: completion.session.session_capability })
  expect(text).toHaveBeenCalledWith(completion.message)
})

it.each([
  ['duplicate sequence', () => start() + delta() + frame('complete', completion, 2)],
  ['missing sequence', () => start() + delta(completion.message, 0, 3)],
  ['delta index', () => start() + delta(completion.message, 1)],
  ['canonical mismatch', () => start() + delta('Sai nội dung') + frame('complete', completion, 3)],
  ['duplicate complete', () => start() + delta() + frame('complete', completion, 3) + frame('complete', completion, 4)],
  ['wrong request', () => start() + delta() + frame('complete', { ...completion, request_id: crypto.randomUUID() }, 3)],
  ['unterminated frame', () => start() + delta() + frame('complete', completion, 3).trimEnd()],
] as const)('rejects %s without applying a completion', async (_name, wire) => {
  await expect(readConciergeStream(streamResponse([wire()]), vi.fn(), undefined, completion.request_id))
    .rejects.toMatchObject({ code: 'STREAM_PROTOCOL_ERROR' })
})

it('requires card previews to match the committed cards', async () => {
  const card = { type: 'service_link', destination: 'cart' }
  const wire = start() + delta() + frame('card', { message_id: completion.response_id, index: 0, card }, 3) +
    frame('complete', completion, 4)
  await expect(readConciergeStream(streamResponse([wire]), vi.fn())).rejects.toMatchObject({ code: 'STREAM_PROTOCOL_ERROR' })
})

it('cancels malformed streams and bounds total bytes, not only the unparsed buffer', async () => {
  const cancel = vi.fn()
  const response = new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('event: status\ndata: invalid\n\n'))
  }, cancel }))
  await expect(readConciergeStream(response, vi.fn())).rejects.toMatchObject({ code: 'STREAM_PROTOCOL_ERROR' })
  expect(cancel).toHaveBeenCalledOnce()
  await expect(readConciergeStream(streamResponse([': ' + 'a'.repeat(1_048_577)]), vi.fn()))
    .rejects.toMatchObject({ code: 'STREAM_PROTOCOL_ERROR' })
})
