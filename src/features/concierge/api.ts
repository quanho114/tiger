import { publicApi } from '@/shared/lib/api/client'
import { ApiError } from '@/shared/lib/api/types'
import { supabase, supabaseUrl } from '@/shared/lib/supabase'
import {
  ConciergeV2CompletionPayloadSchema,
  ConciergeV2ClaimResultSchema,
  ConciergeV2TurnRequestSchema,
  type ConciergeV2CompletionPayload,
  type ConciergeV2Activity,
  type ConciergeV2TurnRequest,
} from '@contracts/concierge-v2'
import type { ConciergeRequestPayload } from './types'
import { readConciergeStream } from './stream'

const CLAIM_TICKET_KEY = 'tiger-concierge-claim-ticket'
const pendingStreams = new Map<string, { payload: ConciergeV2TurnRequest; actor: string | null;
  resume?: ConciergeV2TurnRequest['resume_session'] }>()

export function clearConciergeStreamRecovery() { pendingStreams.clear() }

export function recoverConciergeTurn(requestId: string) {
  const pending = pendingStreams.get(requestId)
  if (!pending || (!pending.payload.session && !pending.resume)) return Promise.reject(new Error('Chưa có thông tin để kiểm tra kết quả.'))
  return sendConciergeTurn({ ...pending.payload, ...(pending.resume && !pending.payload.session ? { resume_session: pending.resume } : {}),
    recover_only: true }, undefined, () => {})
}

export async function prepareConciergeClaim(session: { session_id: string; session_capability: string }): Promise<void> {
  const response = await publicApi.post<{ ticket: string }>('/concierge/prepare-claim', {
    protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), session,
  })
  if (!/^cct_[a-f0-9]{64}$/.test(response.data.ticket)) throw new Error('Phiên chuyển tiếp không hợp lệ.')
  localStorage.setItem(CLAIM_TICKET_KEY, JSON.stringify({ ticket: response.data.ticket, expires_at: Date.now() + 5 * 60_000 }))
}

export function hasPendingConciergeClaim(): boolean {
  try {
    const raw = localStorage.getItem(CLAIM_TICKET_KEY)
    if (!raw) return false
    const stored: unknown = JSON.parse(raw)
    if (stored && typeof stored === 'object' &&
        'ticket' in stored && typeof stored.ticket === 'string' && /^cct_[a-f0-9]{64}$/.test(stored.ticket) &&
        'expires_at' in stored && typeof stored.expires_at === 'number' && stored.expires_at > Date.now()) return true
  } catch { return false }
  localStorage.removeItem(CLAIM_TICKET_KEY)
  return false
}

export async function claimConciergeSession() {
  if (!hasPendingConciergeClaim()) return null
  const stored = JSON.parse(localStorage.getItem(CLAIM_TICKET_KEY)!) as { ticket: string }
  const response = await publicApi.post<unknown>('/concierge/claim', {
    protocol_version: 'concierge-v2', request_id: crypto.randomUUID(), ticket: stored.ticket,
  })
  const claimed = ConciergeV2ClaimResultSchema.parse(response.data)
  localStorage.removeItem(CLAIM_TICKET_KEY)
  return claimed
}

export function clearPendingConciergeClaim(): void {
  try { localStorage.removeItem(CLAIM_TICKET_KEY) } catch { /* Storage may be disabled. */ }
}

export async function sendConciergeTurn(
  payload: ConciergeV2TurnRequest,
  signal?: AbortSignal,
  onActivity?: (activity: ConciergeV2Activity) => void,
  onText?: (text: string) => void
): Promise<ConciergeV2CompletionPayload> {
  payload = ConciergeV2TurnRequestSchema.parse(payload)
  const recoveryOnly = payload.recover_only
  if (onActivity) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) controller.abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(abort, 30_000)
    try {
      const { data } = await supabase.auth.getSession()
      const actor = data.session?.user?.id ?? null
      let pending = pendingStreams.get(payload.request_id)
      if (pending && pending.actor !== actor) { pendingStreams.delete(payload.request_id); throw new ApiError('OWNERSHIP_MISMATCH', 'Tài khoản đã thay đổi.', 403, payload.request_id) }
      if (!pending) {
        if (pendingStreams.size >= 32) throw new ApiError('STREAM_RECOVERY_LIMIT', 'Hãy bắt đầu phiên mới để tiếp tục.', 409, payload.request_id)
        pending = { payload: structuredClone(payload), actor }
        pendingStreams.set(payload.request_id, pending)
      }
      payload = { ...pending.payload, ...(pending.resume && !pending.payload.session ? { resume_session: pending.resume } : {}),
        ...(recoveryOnly ? { recover_only: true } : {}) }
      const response = await fetch(`${supabaseUrl}/functions/v1/public-api${payload.message ? '/concierge/chat' : '/concierge/action'}`, {
        method: 'POST', signal: controller.signal,
        headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-Concierge-Stream-Version': '2',
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null)
        const error = body && typeof body === 'object' && 'error' in body ? body.error as { code?: string; message?: string } : null
        throw new ApiError(error?.code ?? 'HTTP_ERROR', error?.message ?? 'Không thể kết nối trợ lý.', response.status, payload.request_id)
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        const completion = ConciergeV2CompletionPayloadSchema.parse(await response.json())
        if (completion.request_id !== payload.request_id) throw new ApiError('STREAM_PROTOCOL_ERROR', 'Phản hồi không khớp yêu cầu.', 502, payload.request_id)
        pendingStreams.delete(payload.request_id)
        return completion
      }
      const completion = await readConciergeStream(response, onActivity, onText, payload.request_id,
        reference => { pending!.resume = reference })
      pendingStreams.delete(payload.request_id)
      return completion
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  const response = await publicApi.post<unknown>(
    payload.message ? '/concierge/chat' : '/concierge/action',
    payload,
    { signal, timeoutMs: 30_000 }
  )
  return ConciergeV2CompletionPayloadSchema.parse(response.data)
}

function reference(payload: ConciergeRequestPayload) {
  return payload.conversation_id && payload.session_token
    ? {
        session: { session_id: payload.conversation_id, session_capability: payload.session_token },
        expected_state_version: payload.state_version,
      }
    : {}
}

export function sendConciergeChat(payload: ConciergeRequestPayload, signal?: AbortSignal,
  onActivity?: (activity: ConciergeV2Activity) => void, onText?: (text: string) => void) {
  return sendConciergeTurn(
    {
      protocol_version: 'concierge-v2',
      request_id: payload.request_id ?? crypto.randomUUID(),
      ...reference(payload),
      page_context: payload.page_context,
      message: payload.message,
    },
    signal, onActivity, onText
  )
}

export function sendConciergeAction(payload: ConciergeRequestPayload, signal?: AbortSignal, onActivity?: (activity: ConciergeV2Activity) => void) {
  const action = payload.action
  if (
    !payload.draft_operation && (!action ||
    ![
      'open_conversation', 'refresh_session', 'review_draft', 'accept_meal_plan', 'accept_prices', 'handoff_draft',
      'reset_conversation',
      'feedback_proposal',
      'answer_clarification',
    ].includes(action.type))
  ) {
    return Promise.reject(new Error('Vui lòng xác nhận tại giỏ hàng hoặc trang đặt bàn.'))
  }
  const parsed = ConciergeV2TurnRequestSchema.parse({
    protocol_version: 'concierge-v2',
    request_id: payload.request_id ?? crypto.randomUUID(),
    ...reference(payload),
    page_context: payload.page_context,
    draft_operation: payload.draft_operation,
    action:
      action?.type === 'feedback_proposal'
        ? {
            type: 'feedback_proposal',
            proposal_id: action.proposal_id,
            proposal_version: action.proposal_version ?? 1,
            rating: action.rating,
          }
        : action,
  })
  return sendConciergeTurn(parsed, signal, onActivity)
}
