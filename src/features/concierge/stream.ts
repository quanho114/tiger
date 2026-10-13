import { ConciergeV2CompletionPayloadSchema, ConciergeV2ErrorEnvelopeSchema,
  ConciergeV2SseStatusEventSchema, ConciergeV2SseTextEventSchema, ConciergeStreamFrameSchema,
  type ConciergeV2Activity, type ConciergeV2SessionReference, type ConciergeV2CompletionPayload } from '@contracts/concierge-v2'
import { ApiError } from '@/shared/lib/api/types'

export async function readConciergeStream(response: Response, onActivity: (activity: ConciergeV2Activity) => void,
  onText?: (text: string) => void, expectedRequestId?: string, onReady?: (reference: ConciergeV2SessionReference) => void): Promise<ConciergeV2CompletionPayload> {
  const invalid = () => new ApiError('STREAM_PROTOCOL_ERROR', 'Phản hồi trợ lý không hợp lệ.', 502, expectedRequestId ?? '')
  if (!response.body) throw new ApiError('STREAM_INTERRUPTED', 'Luồng phản hồi bị gián đoạn.', 502, expectedRequestId ?? '')
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''
  let bytes = 0
  let events = 0
  let streamId: string | undefined
  let mode: 'legacy' | 'v2' | undefined
  let sequence = 0
  let text = ''
  let textIndex = 0
  let messageId: string | undefined
  const cards: unknown[] = []
  let completed: ReturnType<typeof ConciergeV2CompletionPayloadSchema.parse> | null = null
  const assertRequest = (requestId: string) => { if (expectedRequestId && requestId !== expectedRequestId) throw invalid() }
  const consume = (block: string) => {
    const lines = block.split('\n').filter(line => !line.startsWith(':'))
    if (!lines.some(line => line.startsWith('data:'))) return
    if (completed || ++events > 2048) throw invalid()
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
    const raw = JSON.parse(lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'))
    if (raw?.stream_version === 2) {
      if (mode === 'legacy') throw invalid()
      mode = 'v2'
      const frame = ConciergeStreamFrameSchema.parse(raw)
      assertRequest(frame.request_id)
      if (event !== frame.type || frame.seq !== sequence + 1 || (streamId && streamId !== frame.stream_id)) throw invalid()
      if (!streamId && !['start', 'error'].includes(frame.type)) throw invalid()
      streamId = frame.stream_id
      sequence = frame.seq
      switch (frame.type) {
        case 'start':
          if (sequence !== 1) throw invalid()
          onReady?.(frame.data.session)
          break
        case 'status': onActivity(frame.data.phase); break
        case 'text_delta':
          if (frame.data.index !== textIndex++ || (messageId && messageId !== frame.data.message_id) || cards.length) throw invalid()
          messageId = frame.data.message_id
          text += frame.data.text
          if (text.length > 2000) throw invalid()
          onText?.(text)
          break
        case 'card':
          if (frame.data.index !== cards.length || (messageId && messageId !== frame.data.message_id)) throw invalid()
          messageId = frame.data.message_id
          cards.push(frame.data.card)
          break
        case 'complete':
          assertRequest(frame.data.request_id)
          if ((messageId && messageId !== frame.data.response_id) || text !== frame.data.message ||
              JSON.stringify(cards) !== JSON.stringify(frame.data.cards)) throw invalid()
          completed = frame.data
          break
        case 'error': {
          assertRequest(frame.data.request_id)
          throw new ApiError(frame.data.error.code, frame.data.error.message, 503, frame.request_id)
        }
      }
    } else {
      if (mode === 'v2') throw invalid()
      mode = 'legacy'
      if (event === 'status') onActivity(ConciergeV2SseStatusEventSchema.parse({ event, data: raw }).data.phase)
      else if (event === 'text') onText?.(ConciergeV2SseTextEventSchema.parse({ event, data: raw }).data.text)
      else if (event === 'complete') {
        completed = ConciergeV2CompletionPayloadSchema.parse(raw)
        assertRequest(completed.request_id)
      } else if (event === 'error') {
        const envelope = ConciergeV2ErrorEnvelopeSchema.parse(raw)
        assertRequest(envelope.request_id)
        throw new ApiError(envelope.error.code, envelope.error.message, 503, envelope.request_id)
      } else throw invalid()
    }
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      bytes += value?.byteLength ?? 0
      if (bytes > 1_048_576) throw invalid()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 262_144) throw invalid()
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        consume(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
      }
      if (done) break
    }
    if (buffer.trim() && !buffer.trim().startsWith(':')) throw invalid()
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof ApiError || (error instanceof Error && error.name === 'AbortError')) throw error
    throw invalid()
  } finally { reader.releaseLock() }
  if (!completed) throw new ApiError('STREAM_INTERRUPTED', 'Luồng phản hồi bị gián đoạn. Hãy thử lại.', 502, expectedRequestId ?? '')
  return completed
}
