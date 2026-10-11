import { understandTurn } from '../_shared/concierge/understanding/engine.ts'
import { getCorsHeaders } from '../_shared/cors.ts'
import { parseJsonBody } from '../_shared/request.ts'
import { AppError } from '../_shared/errors.ts'
import { getConciergeFeatureFlags } from '../_shared/concierge/flags.ts'
import {
  ConciergeV2TurnRequestSchema,
  ConciergeV2ErrorEnvelopeSchema,
  ConciergeV2SessionReferenceSchema,
} from '../_shared/contracts/concierge-v2.ts'
import {
  processConciergeTurn,
  productionConciergeSessionStore,
  ConciergeRuntimeError,
} from '../_shared/concierge/runtime.ts'
import type { RouteContext } from './context.ts'
import { assertRateLimit } from '../_shared/rate-limit.ts'
import { sha256 } from '../_shared/crypto.ts'
import { claimGuestSession, prepareGuestClaim } from '../_shared/concierge/session-claim.ts'
import { createConciergeStream } from '../_shared/concierge/sse.ts'

export async function handleConciergeRoutes({
  req,
  path,
  url,
  actor,
  pool,
  ctx,
  clientIp,
}: RouteContext): Promise<Response | null> {
  if (path.startsWith('/concierge/') && req.method === 'POST') {
    const body = await parseJsonBody<Record<string, unknown>>(req.clone())
    const headerVersion = req.headers.get('x-concierge-protocol-version')
    const bodyVersion = body && typeof body === 'object' ? body.protocol_version : undefined
    const version = bodyVersion ?? headerVersion
    const requestId =
      typeof body?.request_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.request_id)
        ? body.request_id
        : crypto.randomUUID()
    const headers = new Headers(getCorsHeaders(req))
    headers.set('Cache-Control', 'no-store')
    headers.set('Content-Type', 'application/json; charset=utf-8')
    try {
      if (
        version &&
        (version !== 'concierge-v2' ||
          (headerVersion && bodyVersion && headerVersion !== bodyVersion))
      ) {
        throw new ConciergeRuntimeError({
          code: 'UNSUPPORTED_VERSION',
          message: 'Phiên bản giao thức không được hỗ trợ.',
        })
      }
      if (version !== 'concierge-v2') {
        throw new ConciergeRuntimeError({
          code: 'REFRESH_REQUIRED',
          message: 'Vui lòng tải lại trang để bắt đầu phiên mới.',
        })
      }
      if (path === '/concierge/prepare-claim') {
        const reference = ConciergeV2SessionReferenceSchema.safeParse(body.session)
        if (actor.userId || !reference.success) {
          throw new ConciergeRuntimeError({ code: 'OWNERSHIP_MISMATCH', message: 'Phiên khách không hợp lệ.' })
        }
        await assertRateLimit(pool, { key: `concierge-claim:${sha256(`guest:${clientIp}`)}`, limit: 10, windowSeconds: 60 })
        const ticket = await prepareGuestClaim(pool, reference.data)
        return new Response(JSON.stringify({ ticket }), { headers })
      }
      if (path === '/concierge/claim') {
        if (!actor.userId || typeof body.ticket !== 'string' || !/^cct_[a-f0-9]{64}$/.test(body.ticket)) {
          throw new ConciergeRuntimeError({ code: 'OWNERSHIP_MISMATCH', message: 'Không thể chuyển phiên khách.' })
        }
        await assertRateLimit(pool, { key: `concierge-claim:${actor.userId}`, limit: 10, windowSeconds: 60 })
        const claimed = await claimGuestSession(pool, body.ticket, actor.userId)
        return new Response(JSON.stringify(claimed), { headers })
      }
      const flags = await getConciergeFeatureFlags(pool, true)
      if (flags.concierge_disabled) {
        throw new ConciergeRuntimeError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Trợ lý đang tạm dừng.',
          retryable: true,
        })
      }
      if (!['/concierge/chat', '/concierge/action', '/concierge/feedback'].includes(path)) {
        throw new ConciergeRuntimeError({
          code: 'REFRESH_REQUIRED',
          message: 'Hành động này chưa được hỗ trợ.',
        })
      }
      const parsed = ConciergeV2TurnRequestSchema.safeParse({
        ...body,
        protocol_version: version,
      })
      if (!parsed.success) {
        throw new ConciergeRuntimeError({
          code: 'UNSUPPORTED_VERSION',
          message: 'Yêu cầu trợ lý không hợp lệ.',
        })
      }
      if ((flags.ordering_disabled && parsed.data.action?.type === 'handoff_draft') ||
          (flags.recommendation_disabled && parsed.data.message && understandTurn(parsed.data.message).intent === 'food')) {
        throw new ConciergeRuntimeError({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Chức năng này đang tạm dừng. Bạn vẫn có thể chọn món trực tiếp từ thực đơn.' })
      }
      await assertRateLimit(pool, { key: `concierge:${actor.userId ?? parsed.data.session?.session_id ?? parsed.data.resume_session?.session_id ?? sha256(`new-guest:${clientIp}`)}`,
        limit: actor.userId || parsed.data.session || parsed.data.resume_session ? 30 : 120, windowSeconds: 60 })
      const execute = (onActivity?: Parameters<typeof processConciergeTurn>[2]['onActivity'],
        onReady?: Parameters<typeof processConciergeTurn>[2]['onReady'], signal?: AbortSignal) => processConciergeTurn(
        parsed.data, { authenticated_user_id: actor.userId || null }, {
          pool, store: ctx.conciergeSessionStore ?? productionConciergeSessionStore(pool),
          orchestrator: ctx.orchestrator, onActivity, onReady, signal,
        })
      if (
        req.headers.get('accept')?.includes('text/event-stream') ||
        url.searchParams.get('stream') === 'true'
      ) {
        headers.set('Content-Type', 'text/event-stream; charset=utf-8')
        headers.set('Cache-Control', 'no-store, no-transform')
        const version = req.headers.get('x-concierge-stream-version') === '2' && process.env.CONCIERGE_STREAM_V2_DISABLED !== 'true' ? 2 : 1
        const stream = createConciergeStream({ requestId, version, signal: req.signal,
          execute: callbacks => execute(callbacks.onActivity, callbacks.onReady, callbacks.signal),
          error: error => {
            const detail = error instanceof ConciergeRuntimeError ? error.detail : error instanceof AppError && error.status === 503
              ? { code: 'DEPENDENCY_UNAVAILABLE' as const, message: 'Trợ lý AI tạm thời không phản hồi.', retryable: true }
              : { code: 'INTERNAL_SAFE_FAILURE' as const, message: 'Không thể hoàn tất phản hồi. Vui lòng thử lại.', retryable: true }
            return ConciergeV2ErrorEnvelopeSchema.parse({ protocol_version: 'concierge-v2', request_id: requestId,
              response_id: crypto.randomUUID(), error: detail })
          },
        })
        return new Response(stream, { headers })
      }
      const result = await execute()
      return new Response(JSON.stringify(result), { headers })
    } catch (error) {
      const runtimeError = error instanceof AppError && error.status === 503
        ? new ConciergeRuntimeError({
          code: 'DEPENDENCY_UNAVAILABLE',
          message: 'Trợ lý AI chưa được cấu hình hoặc tạm thời không phản hồi.',
          retryable: true,
        })
        : error
      if (!(runtimeError instanceof ConciergeRuntimeError)) throw runtimeError
      const status =
        {
          UNSUPPORTED_VERSION: 400,
          REFRESH_REQUIRED: 409,
          OWNERSHIP_MISMATCH: 403,
          SESSION_EXPIRED: 410,
          STATE_CONFLICT: 409,
          IDEMPOTENCY_MISMATCH: 409,
          DEPENDENCY_UNAVAILABLE: 503,
          PRICE_CHANGED: 409,
          ITEM_UNAVAILABLE: 409,
          ALLERGY_UNVERIFIED: 409,
          INVALID_HANDOFF: 409,
          TURN_CANCELLED: 409,
        }[runtimeError.detail.code as string] ?? 500
      const envelope = ConciergeV2ErrorEnvelopeSchema.parse({
        protocol_version: 'concierge-v2',
        request_id: requestId,
        response_id: crypto.randomUUID(),
        error: runtimeError.detail,
      })
      return new Response(JSON.stringify(envelope), { status, headers })
    }
  }

  return null
}
