import { ConciergeStreamFrameSchema, type ConciergeStreamFrame, type ConciergeV2Activity,
  type ConciergeV2CompletionPayload, type ConciergeV2ErrorEnvelope, type ConciergeV2SessionReference } from '../contracts/concierge-v2.ts'

type StreamExecution = (callbacks: { signal: AbortSignal; onReady: (reference: ConciergeV2SessionReference) => void;
  onActivity: (activity: ConciergeV2Activity) => void }) => Promise<ConciergeV2CompletionPayload>

export function createConciergeStream(options: { requestId: string; version: 1 | 2; signal: AbortSignal;
  execute: StreamExecution; error: (error: unknown) => ConciergeV2ErrorEnvelope;
  heartbeatMs?: number; deadlineMs?: number }) {
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  const streamId = crypto.randomUUID()
  let seq = 0
  let closed = false
  let bytes = 0
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let deadline: ReturnType<typeof setTimeout> | undefined
  const started = Date.now()
  let firstStatus: number | null = null
  let firstText: number | null = null
  let outcome = 'interrupted'
  let reported = false
  const abort = () => abortController.abort()
  const cleanup = () => {
    clearInterval(heartbeat); clearTimeout(deadline)
    options.signal.removeEventListener('abort', abort)
    if (!reported) {
      reported = true
      console.info({ event: 'concierge_stream', version: options.version, outcome, latency_ms: Date.now() - started,
        wire_bytes: bytes, events: seq, first_status_ms: firstStatus, first_verified_text_ms: firstText })
    }
  }
  if (options.signal.aborted) abort()
  else options.signal.addEventListener('abort', abort, { once: true })
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        const wire = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        bytes += wire.byteLength
        if (bytes > 1_048_576) throw new Error('STREAM_LIMIT')
        controller.enqueue(wire)
      }
      const frame = (type: ConciergeStreamFrame['type'], data: unknown) => {
        if (closed) return
        const parsed = ConciergeStreamFrameSchema.parse({ stream_version: 2, request_id: options.requestId,
          stream_id: streamId, seq: seq + 1, type, data })
        send(type, parsed)
        seq++
      }
      const close = () => {
        cleanup()
        if (!closed) { closed = true; controller.close() }
      }
      const fail = (error: unknown) => {
        if (closed) return
        outcome = 'error'
        const detail = options.error(error)
        try {
          if (options.version === 2) frame('error', detail)
          else send('error', detail)
        } catch { closed = true; controller.error(new Error('STREAM_PROTOCOL_ERROR')) }
        close()
      }
      heartbeat = setInterval(() => {
        if (!closed && (controller.desiredSize ?? 0) > 0) controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }, options.heartbeatMs ?? 10_000)
      deadline = setTimeout(() => {
        abort()
        fail(new Error('STREAM_DEADLINE'))
      }, options.deadlineMs ?? 25_000)
      void options.execute({ signal: abortController.signal,
        onReady: reference => { if (options.version === 2) frame('start', { session: {
          session_id: reference.session_id, session_capability: reference.session_capability,
        } }) },
        onActivity: phase => {
          if (closed || (controller.desiredSize ?? 0) < 0) return
          firstStatus ??= Date.now() - started
          if (options.version === 2) frame('status', { phase })
          else send('status', { phase })
        },
      }).then(result => {
        if (closed) return
        firstText = result.message ? Date.now() - started : null
        if (options.version === 2) {
          const words = result.message.match(/\S+\s*/gu) ?? []
          for (let offset = 0; offset < words.length; offset += 8) frame('text_delta', {
            message_id: result.response_id, index: offset / 8, text: words.slice(offset, offset + 8).join(''),
          })
          result.cards.forEach((card, index) => frame('card', { message_id: result.response_id, index, card }))
          frame('complete', result)
        } else {
          if (result.message && result.message.length <= 700) send('text', { text: result.message })
          send('complete', result)
        }
        outcome = 'completed'
      }).catch(fail).finally(close)
    },
    cancel() { closed = true; abort(); cleanup() },
  })
}
