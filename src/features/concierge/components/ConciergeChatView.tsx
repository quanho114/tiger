import { useState, useRef, useEffect } from 'react'
import type { FC, FormEvent } from 'react'
import {
  Send,
  Sparkles,
  RotateCcw,
  AlertCircle,
  X,
  Loader2,
  Bot,
  User,
  ShieldAlert,
} from 'lucide-react'
import { useConcierge } from '../useConcierge'
import { MealRecommendationCard } from './MealRecommendationCard'
import { MenuItemCard } from './MenuItemCard'
import { ClarificationChoices } from './ClarificationChoices'
import { OrderQuoteCard } from './OrderQuoteCard'
import { ReservationSummaryCard } from './ReservationSummaryCard'
import { ReservationStatusCard } from './ReservationStatusCard'
import { OrderStatusCard } from './OrderStatusCard'
import { SuggestedActions } from './SuggestedActions'
import type { ConciergeCard } from '../types'

interface ConciergeChatViewProps {
  onClose?: () => void
}

export const ConciergeChatView: FC<ConciergeChatViewProps> = ({ onClose }) => {
  const {
    messages,
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
  } = useConcierge()

  const [inputVal, setInputVal] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || isLoading) return
    const text = inputVal
    setInputVal('')
    sendMessage(text)
  }

  const renderCard = (card: ConciergeCard, idx: number) => {
    switch (card.type) {
      case 'meal_recommendation':
        return (
          <MealRecommendationCard
            key={`card-meal-${idx}`}
            proposal={card.proposal}
            onAddToCart={addProposalToCart}
            onFeedback={async (rating, text) => {
              await submitFeedback({
                proposal_id: card.proposal.id,
                proposal_version: card.proposal.version,
                config_version: '1.0',
                rating,
                feedback_text: text,
              })
            }}
            disabled={isLoading}
          />
        )
      case 'menu_item':
        return <MenuItemCard key={`card-item-${idx}`} item={card} />
      case 'clarification_choices':
        return (
          <ClarificationChoices
            key={`card-clarify-${idx}`}
            card={card}
            disabled={isLoading}
            onSelectChoice={(field, value) => {
              sendAction({
                type: 'answer_clarification',
                choice_field: field,
                choice_value: value,
              })
            }}
          />
        )
      case 'order_quote':
        return (
          <OrderQuoteCard
            key={`card-quote-${idx}`}
            quote={card}
            disabled={isLoading}
            onConfirmQuote={(token) => {
              sendAction({
                type: 'confirm_quote',
                quote_token: token,
              })
            }}
          />
        )
      case 'reservation_summary':
        return (
          <ReservationSummaryCard
            key={`card-res-${idx}`}
            reservation={card}
            disabled={isLoading}
            onConfirmReservation={() => {
              sendAction({
                type: 'confirm_reservation',
                hold_token: card.hold_token,
                reservation_details: {
                  customer_name: card.customer_name,
                  phone: card.phone,
                  guest_count: card.guest_count,
                  starts_at_iso: card.starts_at_iso,
                  note: card.note,
                },
              })
            }}
          />
        )
      case 'order_status':
        return <OrderStatusCard key={`card-status-${idx}`} orderStatus={card} />
      case 'reservation_status':
        return <ReservationStatusCard key={`card-res-status-${idx}`} reservationStatus={card} />
      case 'suggested_actions':
        return (
          <SuggestedActions
            key={`card-actions-${idx}`}
            actions={card.actions}
            disabled={isLoading}
            onSelectAction={(action) => sendMessage(action)}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#fbf9f6] text-stone-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#234386] text-white shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#ffc400] flex items-center justify-center text-[#234386] shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold leading-tight">Tiger Concierge</h3>
            <p className="text-[11px] text-amber-200/90 leading-tight">
              Trợ lý ẩm thực & khẩu phần Tiger 345
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetConversation}
            title="Bắt đầu hội thoại mới"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Đóng cửa sổ"
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Warnings Bar if any */}
      {warnings.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 text-xs text-amber-900 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        </div>
      )}

      {/* Error Banner if any */}
      {error && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs text-rose-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={dismissError}
            className="text-rose-600 hover:text-rose-900 font-bold px-1.5 py-0.5 text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className="flex items-start gap-2 max-w-[85%]">
              {msg.sender === 'concierge' && (
                <div className="w-6 h-6 rounded-full bg-[#234386] text-white flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px]">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}

              <div
                className={`rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-[#234386] text-white rounded-tr-xs'
                    : 'bg-white border border-stone-200/80 text-stone-800 rounded-tl-xs shadow-xs'
                }`}
              >
                {msg.text}
              </div>

              {msg.sender === 'user' && (
                <div className="w-6 h-6 rounded-full bg-stone-300 text-stone-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px]">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            {/* Render Cards underneath message */}
            {msg.cards && msg.cards.length > 0 && (
              <div className="w-full max-w-[95%] sm:max-w-[88%] mt-2.5 space-y-2.5 pl-8">
                {msg.cards.map((card, idx) => renderCard(card, idx))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-stone-500 text-xs pl-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#234386]" />
            <span>Trợ lý đang tra cứu dữ liệu & tính toán khẩu phần...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Actions Pill Row */}
      {suggestedActions.length > 0 && (
        <div className="px-4 py-1.5 bg-stone-50/90 border-t border-stone-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <SuggestedActions
            actions={suggestedActions}
            disabled={isLoading}
            onSelectAction={(action) => sendMessage(action)}
          />
        </div>
      )}

      {/* Chat Input Footer */}
      <form
        onSubmit={handleSend}
        className="p-3 bg-white border-t border-stone-200 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Hỏi món, số người ăn, dị ứng hoặc đặt bàn..."
          disabled={isLoading}
          className="flex-1 px-3.5 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-hidden focus:border-[#234386] focus:bg-white transition-colors"
        />
        <button
          type="submit"
          disabled={!inputVal.trim() || isLoading}
          className="p-2.5 rounded-xl bg-[#234386] text-white hover:bg-[#1c356b] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
