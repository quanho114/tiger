import type { ConciergeV2Activity, ConciergeV2CompletionPayload, ConciergeV2Draft, ConciergeV2DraftOperation, ConciergeV2PageContext } from '@contracts/concierge-v2'
/**
 * Tiger 345 - Concierge Agent React Hook
 * Manages chat lifecycle, optimistic concurrency, cards, and cart integration.
 * Based on plans/tiger-345/09-concierge-agent-design.md
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { sendConciergeChat, sendConciergeAction, prepareConciergeClaim, claimConciergeSession,
  hasPendingConciergeClaim, clearPendingConciergeClaim, clearConciergeStreamRecovery, recoverConciergeTurn } from './api'
import type {
  ConciergeActionPayload,
  ConciergeChatMessage,
  ConciergeFeedbackRating,
  ConciergeFeedbackResponse,
  ConciergeRequestPayload,
} from './types'
import { useCart } from '@/features/cart'
import { ApiError } from '@/shared/lib/api/types'
import { supabase } from '@/shared/lib/supabase'

export interface UseConciergeReturn {
  draft: ConciergeV2Draft | null
  mutateDraft: (operation: ConciergeV2DraftOperation) => Promise<boolean>
  retryText: string
  messages: ConciergeChatMessage[]
  conversationId: string | null
  sessionToken: string | null
  stateVersion: number
  isLoading: boolean
  activity: ConciergeV2Activity | null
  streamingText: string
  stopResponse: () => void
  retryPendingAction: () => Promise<boolean>
  hasPendingAction: boolean
  error: string | null
  warnings: string[]
  suggestedActions: string[]
  viewedMenuItemId: string | null
  setViewedMenuItemId: (id: string | null) => void
  openConversation: () => Promise<boolean>
  prepareLoginTransition: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  sendAction: (action: ConciergeActionPayload) => Promise<boolean>
  submitFeedback: (payload: {
    proposal_id: string
    proposal_version?: number
    config_version?: string | number
    rating: ConciergeFeedbackRating
    feedback_text?: string
  }) => Promise<ConciergeFeedbackResponse>
  resetConversation: () => Promise<void>
  dismissError: () => void
}

const INITIAL_SUGGESTIONS = [
  'Chọn món',
  'Lên mâm cho nhóm',
  'Đặt bàn',
]

export function useConcierge(): UseConciergeReturn {
  const [messages, setMessages] = useState<ConciergeChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [stateVersion, setStateVersion] = useState<number>(1)
  const [suggestedActions, setSuggestedActions] = useState<string[]>(INITIAL_SUGGESTIONS)
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [activity, setActivity] = useState<ConciergeV2Activity | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef<boolean>(false)
  const sessionEpochRef = useRef<number>(0)

  const [draft, setDraft] = useState<ConciergeV2Draft | null>(null)
  const [retryText, setRetryText] = useState('')
  const expiryRef = useRef<number>(Infinity)
  const abortRef = useRef<AbortController | null>(null)
  const cart = useCart()
  const [viewedMenuItemId, setViewedMenuItemId] = useState<string | null>(null)
  const pageContext = useCallback((): ConciergeV2PageContext => {
    const path = window.location.pathname
    const page = /^\/(?:menu|thuc-don)/.test(path) ? 'menu' :
      /^\/reservation/.test(path) ? 'reservation' :
      /^\/(?:cart|checkout)/.test(path) ? 'cart' :
      /^\/account\/orders/.test(path) ? 'orders' :
      /^\/account/.test(path) ? 'account' : path === '/' ? 'home' : 'other'
    const orderMode = cart.context?.mode === 'dine-in' ? 'dine_in' :
      cart.context?.mode === 'takeaway' ? undefined :
      (page === 'cart' || (page === 'menu' && new URLSearchParams(window.location.search).get('mode') === 'delivery')) ? 'delivery' : undefined
    return { page, ...(page === 'menu' && viewedMenuItemId ? { menu_item_id: viewedMenuItemId } : {}),
      ...(orderMode ? { order_mode: orderMode } : {}) }
  }, [cart.context?.mode, viewedMenuItemId])
  const pendingChatRef = useRef<{ signature: string; requestId: string; message: string } | null>(null)
  const pendingActionRef = useRef<{ signature: string; requestId: string; payload: ConciergeRequestPayload } | null>(null)
  const [hasPendingAction, setHasPendingAction] = useState(false)
  const pendingAssistantRef = useRef<string | null>(null)
  const stoppedRef = useRef(false)

  const stateRef = useRef({ conversationId, sessionToken, stateVersion })
  const resetEpochRef = useRef<number | null>(null)
  const identityRef = useRef<string | null>(null)
  const claimInFlightRef = useRef(false)

  const clearConversation = useCallback(() => {
    clearConciergeStreamRecovery()
    pendingAssistantRef.current = null
    clearPendingConciergeClaim()
    abortRef.current?.abort()
    pendingActionRef.current = null
    setHasPendingAction(false)
    pendingChatRef.current = null
    expiryRef.current = Infinity
    setRetryText('')
    setDraft(null)
    stateRef.current = { conversationId: null, sessionToken: null, stateVersion: 1 }
    setMessages([])
    setConversationId(null)
    setSessionToken(null)
    setStateVersion(1)
    setWarnings([])
    setSuggestedActions(INITIAL_SUGGESTIONS)
    setError(null)
    setActivity(null)
    setStreamingText('')
  }, [])

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const identity = session?.user.id ?? null
      if (identity === identityRef.current) return
      const previousIdentity = identityRef.current
      identityRef.current = identity
      sessionEpochRef.current += 1
      resetEpochRef.current = null
      abortRef.current?.abort()
      inFlightRef.current = false
      setIsLoading(false)
      if (!previousIdentity && identity && hasPendingConciergeClaim() && !claimInFlightRef.current) {
        claimInFlightRef.current = true
        const epoch = sessionEpochRef.current
        setIsLoading(true)
        window.setTimeout(() => { void claimConciergeSession().then(claimed => {
          if (epoch !== sessionEpochRef.current || identityRef.current !== identity) return
          if (!claimed) { clearConversation(); return }
          expiryRef.current = Math.min(Date.parse(claimed.session.idle_expires_at), Date.parse(claimed.session.absolute_expires_at))
          stateRef.current = { conversationId: claimed.session.session_id,
            sessionToken: claimed.session.session_capability, stateVersion: claimed.session.state_version }
          setConversationId(claimed.session.session_id)
          setSessionToken(claimed.session.session_capability)
          setStateVersion(claimed.session.state_version)
          setDraft(claimed.draft)
          setMessages(previous => claimed.transcript.map((entry, index) => {
            const sender = entry.role === 'user' ? 'user' : 'concierge'
            const existing = previous[index]
            return existing?.sender === sender && existing.text === entry.content ? existing : {
              id: `restored-${index}`, sender, text: entry.content, timestamp: new Date().toISOString(),
            }
          }))
        }).catch(() => {
          if (epoch === sessionEpochRef.current) {
            clearConversation()
            setError('Không thể nối tiếp phiên khách sau đăng nhập. Bạn có thể bắt đầu cuộc trò chuyện mới.')
          }
        }).finally(() => {
          claimInFlightRef.current = false
          if (epoch === sessionEpochRef.current) setIsLoading(false)
        }) }, 0)
        return
      }
      clearConversation()
    })
    return () => authListener.subscription.unsubscribe()
  }, [clearConversation])

  const prepareLoginTransition = useCallback(async () => {
    const current = stateRef.current
    clearPendingConciergeClaim()
    if (!current.conversationId || !current.sessionToken || Date.now() >= expiryRef.current) return
    await prepareConciergeClaim({ session_id: current.conversationId, session_capability: current.sessionToken })
  }, [])

  useEffect(() => {
    const check = (event?: PageTransitionEvent) => {
      if (event?.persisted || Date.now() >= expiryRef.current) {
        sessionEpochRef.current += 1
        resetEpochRef.current = null
        clearConversation()
        inFlightRef.current = false
        setIsLoading(false)
        setError('Phiên trò chuyện đã kết thúc. Bạn có thể bắt đầu lại.')
      }
    }
    const visible = () => {
      if (document.visibilityState === 'visible') check()
    }
    window.addEventListener('pageshow', check)
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(check, 30_000)
    return () => {
      window.removeEventListener('pageshow', check)
      document.removeEventListener('visibilitychange', visible)
      window.clearInterval(timer)
      sessionEpochRef.current += 1
      abortRef.current?.abort()
    }
  }, [clearConversation])

  const applyEnvelope = useCallback(
    (completion: ConciergeV2CompletionPayload) => {
      expiryRef.current = Math.min(
        Date.parse(completion.session.idle_expires_at),
        Date.parse(completion.session.absolute_expires_at)
      )
      setRetryText('')
      setStreamingText('')
      if (completion.handoff) { cart.applyHandoff(completion.handoff); cart.setCartOpen(true) }
      setDraft(completion.draft ?? null)
      stateRef.current = {
        conversationId: completion.session.session_id,
        sessionToken: completion.session.session_capability,
        stateVersion: completion.session.state_version,
      }
      setConversationId(completion.session.session_id)
      setSessionToken(completion.session.session_capability)
      setStateVersion(completion.session.state_version)
      setWarnings(completion.warnings)
      setSuggestedActions(completion.suggested_actions ?? [])

      // Append assistant message
      const assistantMsg: ConciergeChatMessage = {
        id: pendingAssistantRef.current ?? `msg-concierge-${completion.request_id}`,
        delivery: 'complete',
        sender: 'concierge',
        text: completion.message,
        timestamp: new Date().toISOString(),
        cards: completion.cards,
      }

      setMessages(prev => prev.some(message => message.id === assistantMsg.id)
        ? prev.map(message => message.id === assistantMsg.id ? assistantMsg : message)
        : [...prev, assistantMsg])
      pendingAssistantRef.current = null
    },
    [cart]
  )

  const handleFailure = useCallback(
    async (err: unknown, text = '') => {
      if (err instanceof ApiError && err.code === 'STATE_CONFLICT') {
        const epoch = sessionEpochRef.current
        try {
          const current = stateRef.current
          const envelope = await sendConciergeAction({ conversation_id: current.conversationId ?? undefined,
            session_token: current.sessionToken ?? undefined, state_version: current.stateVersion, action: { type: 'refresh_session' } })
          if (epoch !== sessionEpochRef.current) return
          applyEnvelope(envelope)
          pendingChatRef.current = null
          pendingActionRef.current = null
          setHasPendingAction(false)
          setError('Giỏ nháp đã thay đổi. Hãy kiểm tra trước khi thực hiện lại thao tác.')
          setRetryText(text)
          return
        } catch { if (epoch !== sessionEpochRef.current) return }
      }
      if (
        err instanceof ApiError &&
        ['SESSION_EXPIRED', 'OWNERSHIP_MISMATCH', 'STATE_CONFLICT'].includes(err.code)
      ) {
        clearConversation()
        setError('Phiên đã hết hạn hoặc thay đổi. Hãy kiểm tra và gửi lại yêu cầu trong phiên mới.')
      } else {
        setError(err instanceof Error ? err.message : 'Không thể kết nối với trợ lý.')
      }
      setRetryText(text)
    },
    [clearConversation, applyEnvelope]
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const cleanText = text.trim()
      if (!cleanText || inFlightRef.current) return
      if (pendingActionRef.current || (pendingChatRef.current && pendingChatRef.current.message !== cleanText)) {
        setError('Hãy thử lại yêu cầu trước hoặc bắt đầu phiên mới để tránh thao tác trùng.')
        return
      }

      const requestEpoch = sessionEpochRef.current
      abortRef.current = new AbortController()
      inFlightRef.current = true
      setError(null)
      setActivity(null)
      setStreamingText('')
      setIsLoading(true)
      stoppedRef.current = false

      // Optimistic user message
      const userMsg: ConciergeChatMessage = {
        id: `msg-user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: 'user',
        text: cleanText,
        timestamp: new Date().toISOString(),
      }
      const signature = JSON.stringify({ ...stateRef.current, message: cleanText })
      const retrying = pendingChatRef.current?.signature === signature
      if (!retrying) pendingChatRef.current = { signature, requestId: crypto.randomUUID(), message: cleanText }
      const assistantId = `msg-concierge-${pendingChatRef.current!.requestId}`
      pendingAssistantRef.current = assistantId
      setMessages(prev => [...(retrying ? prev.filter(message => message.id !== assistantId) : [...prev, userMsg]), {
        id: assistantId, sender: 'concierge', delivery: 'pending', text: '', timestamp: new Date().toISOString(),
      }])

      try {
        const envelope = await sendConciergeChat(
          {
            conversation_id: stateRef.current.conversationId || undefined,
            session_token: stateRef.current.sessionToken || undefined,
            state_version: stateRef.current.stateVersion,
            message: cleanText,
            page_context: pageContext(),
            request_id: pendingChatRef.current!.requestId,
          },
          abortRef.current.signal,
          phase => { if (requestEpoch === sessionEpochRef.current) setActivity(phase) },
          text => { if (requestEpoch === sessionEpochRef.current) {
            setStreamingText(text)
            setMessages(prev => prev.map(message => message.id === assistantId ? { ...message, text } : message))
          } }
        )
        // If logout or account switch occurred while request was in-flight, discard stale response
        if (requestEpoch !== sessionEpochRef.current) {
          return
        }
        pendingChatRef.current = null
        applyEnvelope(envelope)
      } catch (err) {
        if (requestEpoch !== sessionEpochRef.current) {
          return
        }
        if (stoppedRef.current && pendingChatRef.current) {
          try {
            const completion = await recoverConciergeTurn(pendingChatRef.current.requestId)
            if (requestEpoch !== sessionEpochRef.current) return
            applyEnvelope(completion)
            pendingChatRef.current = null
            setError('Đã dừng hiển thị. Thao tác đã được xác nhận; hãy kiểm tra kết quả bên dưới.')
            return
          } catch { if (requestEpoch !== sessionEpochRef.current) return }
        }
        setMessages(prev => prev.map(message => message.id === assistantId ? { ...message, delivery: 'interrupted', text: '' } : message))
        pendingAssistantRef.current = null
        setStreamingText('')
        if (stoppedRef.current) {
          setError('Đã dừng nhận phản hồi. Chưa xác nhận được kết quả; thử lại cùng yêu cầu để kiểm tra, không tự thêm món lần hai.')
          setRetryText(cleanText)
        } else await handleFailure(err, cleanText)
      } finally {
        if (requestEpoch === sessionEpochRef.current) {
          inFlightRef.current = false
          setIsLoading(false)
          setActivity(null)
        }
      }
    },
    [applyEnvelope, handleFailure, pageContext]
  )

  const stopResponse = useCallback(() => {
    stoppedRef.current = true
    abortRef.current?.abort()
  }, [])

  // Internal callers may opt into rejection; public actions always resolve a boolean.
  const performAction = useCallback(
    async (action: ConciergeActionPayload | undefined, propagateError = false, draft_operation?: ConciergeV2DraftOperation) => {
      if (inFlightRef.current) return false
      if (pendingChatRef.current) {
        setError('Hãy thử lại tin nhắn trước hoặc bắt đầu phiên mới trước khi chỉnh giỏ.')
        return false
      }

      const requestEpoch = sessionEpochRef.current
      abortRef.current = new AbortController()
      inFlightRef.current = true
      setError(null)
      setActivity(null)
      setIsLoading(true)
      stoppedRef.current = false

      try {
        let payload: ConciergeRequestPayload = {
          conversation_id: stateRef.current.conversationId || undefined,
          session_token: stateRef.current.sessionToken || undefined,
          state_version: stateRef.current.stateVersion,
          action,
          draft_operation,
          page_context: pageContext(),
        }
        const signature = JSON.stringify(payload)
        if (pendingActionRef.current && (JSON.stringify(pendingActionRef.current.payload.action) !== JSON.stringify(action) ||
          JSON.stringify(pendingActionRef.current.payload.draft_operation) !== JSON.stringify(draft_operation))) {
          setError('Hãy kiểm tra lại thao tác trước trước khi thay đổi giỏ.')
          return false
        }
        if (!pendingActionRef.current) pendingActionRef.current = { signature, requestId: crypto.randomUUID(), payload: structuredClone(payload) }
        payload = pendingActionRef.current.payload
        setHasPendingAction(true)
        const assistantId = `msg-concierge-${pendingActionRef.current.requestId}`
        pendingAssistantRef.current = assistantId
        setMessages(previous => [...previous.filter(message => message.id !== assistantId), {
          id: assistantId, sender: 'concierge', text: '', delivery: 'pending', timestamp: new Date().toISOString(),
        }])
        const envelope = await sendConciergeAction(
          {
            ...payload,
            request_id: pendingActionRef.current.requestId,
          },
          abortRef.current.signal,
          phase => { if (requestEpoch === sessionEpochRef.current) setActivity(phase) }
        )
        // If logout or account switch occurred while action was in-flight, discard stale response
        if (requestEpoch !== sessionEpochRef.current) {
          return false
        }
        applyEnvelope(envelope)
        pendingActionRef.current = null
        setHasPendingAction(false)
        return true
      } catch (err) {
        if (requestEpoch !== sessionEpochRef.current) {
          return false
        }
        const msg = err instanceof Error ? err.message : 'Không thể thực hiện hành động này'
        if (action?.type === 'open_conversation') {
          pendingActionRef.current = null
          setHasPendingAction(false)
        }
        if (stoppedRef.current && pendingActionRef.current) {
          try {
            const completion = await recoverConciergeTurn(pendingActionRef.current.requestId)
            if (requestEpoch !== sessionEpochRef.current) return false
            applyEnvelope(completion)
            pendingActionRef.current = null
            setHasPendingAction(false)
            setError('Đã dừng hiển thị. Thao tác đã được xác nhận; hãy kiểm tra giỏ.')
            return true
          } catch { if (requestEpoch !== sessionEpochRef.current) return false }
          const interruptedId = pendingAssistantRef.current
          setMessages(previous => previous.map(message => message.id === interruptedId
            ? { ...message, delivery: 'interrupted', text: '' } : message))
          pendingAssistantRef.current = null
          setError('Đã dừng nhận phản hồi. Hãy kiểm tra lại thao tác trước để xác nhận trạng thái giỏ.')
          return false
        }
        const interruptedId = pendingAssistantRef.current
        setMessages(previous => previous.map(message => message.id === interruptedId ? { ...message, delivery: 'interrupted', text: '' } : message))
        pendingAssistantRef.current = null
        await handleFailure(err)
        if (propagateError) throw err instanceof Error ? err : new Error(msg)
        return false
      } finally {
        if (requestEpoch === sessionEpochRef.current) {
          inFlightRef.current = false
          setIsLoading(false)
          setActivity(null)
        }
      }
    },
    [applyEnvelope, handleFailure, pageContext]
  )

  const retryPendingAction = useCallback(() => {
    const pending = pendingActionRef.current
    return pending ? performAction(pending.payload.action, false, pending.payload.draft_operation) : Promise.resolve(false)
  }, [performAction])

  const openConversation = useCallback(async () => {
    if (stateRef.current.conversationId || inFlightRef.current) return false
    return performAction({ type: 'open_conversation' })
  }, [performAction])

  const mutateDraft = useCallback((operation: ConciergeV2DraftOperation) => performAction(undefined, false, operation), [performAction])

  const sendAction = useCallback(
    (action: ConciergeActionPayload) => performAction(action),
    [performAction]
  )

  const submitFeedback = useCallback(
    async (payload: {
      proposal_id: string
      proposal_version?: number
      config_version?: string | number
      rating: ConciergeFeedbackRating
      feedback_text?: string
    }): Promise<ConciergeFeedbackResponse> => {
      const completed = await performAction(
        {
          type: 'feedback_proposal',
          proposal_id: payload.proposal_id,
          proposal_version: payload.proposal_version ?? 1,
          rating: payload.rating,
        },
        true
      )
      if (!completed)
        throw new Error('Phiên đang xử lý yêu cầu khác hoặc đã thay đổi. Vui lòng thử lại.')
      return { success: true, message: 'Cảm ơn bạn đã gửi phản hồi!' }
    },
    [performAction]
  )

  const resetConversation = useCallback(async () => {
    if (resetEpochRef.current === sessionEpochRef.current) return
    const previous = stateRef.current
    const requestEpoch = ++sessionEpochRef.current
    resetEpochRef.current = requestEpoch
    inFlightRef.current = true
    clearConversation()
    setIsLoading(true)
    try {
      if (previous.conversationId) {
        await sendConciergeAction({
          conversation_id: previous.conversationId,
          session_token: previous.sessionToken || undefined,
          state_version: previous.stateVersion,
          action: { type: 'reset_conversation' },
        })
      }
    } catch {
      // Local context is already cleared even if the server reset fails.
    } finally {
      if (requestEpoch === sessionEpochRef.current) {
        resetEpochRef.current = null
        inFlightRef.current = false
        setIsLoading(false)
      }
    }
  }, [clearConversation])

  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  return {
    draft,
    mutateDraft,
    retryText,
    messages,
    conversationId,
    sessionToken,
    stateVersion,
    isLoading,
    activity,
    streamingText,
    stopResponse,
    retryPendingAction,
    hasPendingAction,
    error,
    warnings,
    suggestedActions,
    viewedMenuItemId,
    setViewedMenuItemId,
    openConversation,
    prepareLoginTransition,
    sendMessage,
    sendAction,
    submitFeedback,
    resetConversation,
    dismissError,
  }
}
