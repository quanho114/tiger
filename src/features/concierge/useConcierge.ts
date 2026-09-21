/**
 * Tiger 345 - Concierge Agent React Hook
 * Manages chat lifecycle, optimistic concurrency, cards, and cart integration.
 * Based on plans/tiger-345/09-concierge-agent-design.md
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { sendConciergeChat, sendConciergeAction, sendConciergeFeedback } from './api'
import type {
  ConciergeActionPayload,
  ConciergeChatMessage,
  ConciergeFeedbackRating,
  ConciergeFeedbackResponse,
  ConciergeIntent,
  ConciergeResponseEnvelope,
  ConversationStep,
  MealProposal,
} from './types'
import { useCart } from '@/store/cart'
import type { MenuItem } from '@/data/restaurantData'
import { supabase } from '@/lib/supabase'

export interface UseConciergeReturn {
  messages: ConciergeChatMessage[]
  conversationId: string | null
  sessionToken: string | null
  stateVersion: number
  currentStep: ConversationStep
  currentIntent: ConciergeIntent
  isLoading: boolean
  error: string | null
  warnings: string[]
  suggestedActions: string[]
  sendMessage: (text: string) => Promise<void>
  sendAction: (action: ConciergeActionPayload) => Promise<boolean>
  addProposalToCart: (proposal: MealProposal, acceptPriceChange?: boolean) => Promise<void>
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

const INITIAL_GREETING: ConciergeChatMessage = {
  id: 'msg-initial-greeting',
  sender: 'concierge',
  text: 'Chào bạn! Mình là Trợ lý Ẩm thực Tiger 345. Mình có thể giúp bạn chọn món theo khẩu phần (số người, sức ăn), tư vấn dị ứng thực phẩm, hoặc giải đáp thông tin nhà hàng.',
  timestamp: new Date().toISOString(),
  cards: [
    {
      type: 'suggested_actions',
      actions: [
        'Tư vấn mâm 2 người lớn',
        'Gợi ý tiệc 4-6 người ăn khỏe',
        'Có món gì không cay cho bé?',
        'Nhà hàng mở cửa đến mấy giờ?',
      ],
    },
  ],
}

export function useConcierge(): UseConciergeReturn {
  const [messages, setMessages] = useState<ConciergeChatMessage[]>([INITIAL_GREETING])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [stateVersion, setStateVersion] = useState<number>(1)
  const [currentStep, setCurrentStep] = useState<ConversationStep>('IDLE')
  const [currentIntent, setCurrentIntent] = useState<ConciergeIntent>('general_chat')
  const [suggestedActions, setSuggestedActions] = useState<string[]>([
    'Tư vấn mâm 2 người lớn',
    'Gợi ý tiệc 4-6 người ăn khỏe',
  ])
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const inFlightRef = useRef<boolean>(false)
  const sessionEpochRef = useRef<number>(0)

  const cart = useCart()

  const stateRef = useRef({ conversationId, sessionToken, stateVersion })
  const resetEpochRef = useRef<number | null>(null)
  const identityRef = useRef<string | null>(null)

  const clearConversation = useCallback(() => {
    stateRef.current = { conversationId: null, sessionToken: null, stateVersion: 1 }
    setMessages([INITIAL_GREETING])
    setConversationId(null)
    setSessionToken(null)
    setStateVersion(1)
    setCurrentStep('IDLE')
    setCurrentIntent('general_chat')
    setWarnings([])
    setSuggestedActions([])
    setError(null)
  }, [])

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const identity = session?.user.id ?? null
      if (identity === identityRef.current) return
      identityRef.current = identity
      sessionEpochRef.current += 1
      resetEpochRef.current = null
      clearConversation()
      inFlightRef.current = false
      setIsLoading(false)
    })
    return () => authListener.subscription.unsubscribe()
  }, [clearConversation])

  const applyEnvelope = useCallback(
    (envelope: ConciergeResponseEnvelope) => {
      stateRef.current = { conversationId: envelope.conversation_id, sessionToken: envelope.session_token, stateVersion: envelope.state_version }
      setConversationId(envelope.conversation_id)
      setSessionToken(envelope.session_token)
      setStateVersion(envelope.state_version)
      setCurrentStep(envelope.current_step)
      setCurrentIntent(envelope.intent)
      setWarnings(envelope.warnings || [])
      setSuggestedActions(envelope.suggested_actions || [])

      // Append assistant message
      const assistantMsg: ConciergeChatMessage = {
        id: `msg-concierge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: 'concierge',
        text: envelope.message,
        timestamp: new Date().toISOString(),
        cards: envelope.cards,
      }

      setMessages((prev) => [...prev, assistantMsg])

      // Handle cart additions if returned by explicit action
      if (envelope.cart_addition?.items && envelope.cart_addition.items.length > 0) {
        for (const item of envelope.cart_addition.items) {
          const dish: MenuItem = {
            id: item.menu_item_id,
            name: item.item_name || 'Món đặc sản Tiger',
            category: 'mon-chinh',
            description: item.note || 'Thêm từ trợ lý Tiger Concierge',
            price: item.unit_price_vnd,
            price_vnd: item.unit_price_vnd,
            image: '/tiger.svg',
            modes: ['dine-in', 'delivery'],
            is_available: true,
          }

          // Add item atomically with exact quantity
          cart.add(dish, item.note, item.quantity)
        }
        // Open cart drawer so user sees items added
        cart.setCartOpen(true)
      }
    },
    [cart]
  )

  const sendMessage = useCallback(
    async (text: string) => {
      const cleanText = text.trim()
      if (!cleanText || inFlightRef.current) return

      const requestEpoch = sessionEpochRef.current
      inFlightRef.current = true
      setError(null)
      setIsLoading(true)

      // Optimistic user message
      const userMsg: ConciergeChatMessage = {
        id: `msg-user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        sender: 'user',
        text: cleanText,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, userMsg])

      try {
        const envelope = await sendConciergeChat({
          conversation_id: stateRef.current.conversationId || undefined,
          session_token: stateRef.current.sessionToken || undefined,
          state_version: stateRef.current.stateVersion,
          message: cleanText,
        })
        // If logout or account switch occurred while request was in-flight, discard stale response
        if (requestEpoch !== sessionEpochRef.current) {
          return
        }
        applyEnvelope(envelope)
      } catch (err) {
        if (requestEpoch !== sessionEpochRef.current) {
          return
        }
        const msg = err instanceof Error ? err.message : 'Có lỗi khi kết nối với Trợ lý Tiger'
        setError(msg)
      } finally {
        if (requestEpoch === sessionEpochRef.current) {
          inFlightRef.current = false
          setIsLoading(false)
        }
      }
    },
    [applyEnvelope]
  )

  // Internal callers may opt into rejection; public actions always resolve a boolean.
  const performAction = useCallback(
    async (action: ConciergeActionPayload, propagateError = false) => {
      if (inFlightRef.current) return false

      const requestEpoch = sessionEpochRef.current
      inFlightRef.current = true
      setError(null)
      setIsLoading(true)

      try {
        const envelope = await sendConciergeAction({
          conversation_id: stateRef.current.conversationId || undefined,
          session_token: stateRef.current.sessionToken || undefined,
          state_version: stateRef.current.stateVersion,
          action,
        })
        // If logout or account switch occurred while action was in-flight, discard stale response
        if (requestEpoch !== sessionEpochRef.current) {
          return false
        }
        applyEnvelope(envelope)
        return true
      } catch (err) {
        if (requestEpoch !== sessionEpochRef.current) {
          return false
        }
        const msg = err instanceof Error ? err.message : 'Không thể thực hiện hành động này'
        setError(msg)
        if (propagateError) throw err instanceof Error ? err : new Error(msg)
        return false
      } finally {
        if (requestEpoch === sessionEpochRef.current) {
          inFlightRef.current = false
          setIsLoading(false)
        }
      }
    },
    [applyEnvelope]
  )

  const sendAction = useCallback((action: ConciergeActionPayload) => performAction(action), [performAction])

  const addProposalToCart = useCallback(
    async (proposal: MealProposal, acceptPriceChange = false) => {
      // First optimistic check: proposal must not be blocked
      if (proposal.validation.status === 'BLOCKED') {
        setError('Không thể thêm mâm ăn bị chặn bởi hệ thống kiểm nghiệm dị ứng hoặc ngân sách.')
        return
      }

      // Explicit user action to add proposal
      await performAction({
        type: 'add_proposal_to_cart',
        proposal_id: proposal.id,
        accept_price_change: acceptPriceChange,
      }, true)
    },
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
      return await sendConciergeFeedback({
        conversation_id: stateRef.current.conversationId || undefined,
        ...payload,
      })
    },
    []
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
    messages,
    conversationId,
    sessionToken,
    stateVersion,
    currentStep,
    currentIntent,
    isLoading,
    error,
    warnings,
    suggestedActions,
    sendMessage,
    sendAction,
    addProposalToCart,
    submitFeedback,
    resetConversation,
    dismissError,
  }
}
