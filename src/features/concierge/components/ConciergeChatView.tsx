import { DraftCartPreview } from '../DraftCartPreview'
import { DraftCartReview } from '../DraftCartReview'
import { useCart } from '@/features/cart'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { FC, FormEvent } from 'react'
import {
  Send,
  RotateCcw,
  AlertCircle,
  X,
  ShieldAlert,
  Maximize2,
  Minimize2,
  Ellipsis,
  Square,
  ArrowDown,
} from 'lucide-react'
import { useConciergeSession } from '../ConciergeProvider'
import { SuggestedActions } from './SuggestedActions'
import { StreamingMessage } from './StreamingMessage'
import type { ConciergeCard } from '../types'

function menuPrice(item: { pricing_mode?: string; price_vnd: number; price_min?: number | null; price_max?: number | null }): string {
  const money = (value: number) => `${value.toLocaleString('vi-VN')} đ`
  if (item.pricing_mode === 'market') return 'Giá thị trường · cần xác nhận'
  if (item.pricing_mode === 'unknown') return 'Giá chưa xác minh'
  if (item.pricing_mode === 'range') return item.price_min != null && item.price_max != null
    ? `${money(item.price_min)} – ${money(item.price_max)}` : 'Khoảng giá chưa xác minh'
  return money(item.price_vnd)
}

interface ConciergeChatViewProps {
  onClose?: () => void
  onMore?: () => void
  surfaceExpanded?: boolean
  onToggleExpand?: () => void
}

export const ConciergeChatView: FC<ConciergeChatViewProps> = ({ onClose, onMore, surfaceExpanded, onToggleExpand }) => {
  const {
    draft, mutateDraft, retryText,
    messages,
    isLoading,
    activity,
    stopResponse, retryPendingAction, hasPendingAction,
    error,
    warnings,
    suggestedActions,
    viewedMenuItemId,
    sendMessage,
    sendAction,
    resetConversation,
    dismissError,
  } = useConciergeSession()

  const cart = useCart()
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (draft?.review_state === 'ready_for_review' || draft?.blocked_items.length) setExpanded(true) }, [draft])
  const names = Object.fromEntries(messages.flatMap(m => m.cards ?? []).flatMap(c => c.type === 'draft_suggestion'
    ? [[c.item.id, c.item.name]] : c.type === 'meal_plan' ? c.lines.map(line => [line.item.id, line.item.name]) : []))
  const [inputVal, setInputVal] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const [hasNewContent, setHasNewContent] = useState(false)
  const followContent = useCallback(() => {
    if (followingRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    else setHasNewContent(true)
  }, [])

  useEffect(() => {
    followContent()
  }, [messages, isLoading, followContent])

  const handleSend = (e: FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim() || isLoading) return
    const text = inputVal
    setInputVal('')
    sendMessage(text)
  }

  // Only the latest server reply may offer state-changing actions.
  const latestReply = [...messages].reverse().find((message) => message.sender === 'concierge' && message.delivery !== 'pending' && message.delivery !== 'interrupted')
  const renderCard = (card: ConciergeCard, idx: number, stale: boolean) => {
    switch (card.type) {
      case 'menu_item_detail':
        return <article key={card.item.id} className="max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm">
          {card.item.image_url && <img src={card.item.image_url} alt="" className="h-36 w-full object-cover" loading="lazy" />}
          <div className="space-y-2 p-4">
            <h4 className="font-semibold text-[#173866]">{card.item.name}</h4>
            <p className="font-semibold">{card.item.pricing_mode === 'market' ? 'Giá thị trường · hỏi nhân viên' :
              card.item.pricing_mode === 'unknown' ? 'Giá chưa được xác minh' :
              card.item.pricing_mode === 'range' ? card.item.price_min != null && card.item.price_max != null
                ? `${card.item.price_min.toLocaleString('vi-VN')} – ${card.item.price_max.toLocaleString('vi-VN')} đ`
                : 'Khoảng giá chưa được xác minh' : `${card.item.price_vnd.toLocaleString('vi-VN')} đ`}</p>
            <p className="leading-relaxed text-stone-700">{card.description || 'Thực đơn chưa ghi mô tả thành phần cho món này.'}</p>
            {card.item.spice_level != null && <p className="text-stone-600">Mức cay trên thực đơn: {card.item.spice_level}/2</p>}
            {!card.item.is_available && <p className="text-amber-900">Món hiện chưa nhận đặt theo hình thức đang chọn.</p>}
            <p className="text-stone-600">Mô tả chưa phải danh sách nguyên liệu đầy đủ. Nếu có dị ứng, hãy hỏi nhân viên để xác nhận với bếp.</p>
          </div>
        </article>
      case 'draft_suggestion':
        return <div key={card.suggestion_id} className="w-[210px] shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white text-sm">
          {card.item.image_url && <img src={card.item.image_url} alt="" className="h-28 w-full object-cover" loading="lazy" />}
          <div className="p-3">
          <p className="text-xs text-stone-600">Gợi ý · Chưa chọn</p>
          <strong>{card.item.name}</strong><p>{menuPrice(card.item)}</p>
           {card.item.is_bestseller === true && <p className="text-xs text-stone-600">Món bán chạy theo thực đơn</p>}
          {card.item.safety_state !== 'verified_safe' && <p className="text-amber-900">Chưa xác minh an toàn dị ứng. Cần hỏi nhân viên.</p>}
          <button type="button" disabled={isLoading || stale || (card.item.pricing_mode ?? 'fixed') !== 'fixed'} className="mt-2 rounded-lg bg-[#173866] px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            onClick={() => mutateDraft({ type: 'add_item', pending_suggestion_id: card.suggestion_id, menu_item_id: card.item.id, quantity: 1, note: '' })}>Chọn vào giỏ nháp</button>
          </div>
        </div>

      case 'meal_plan':
        return <div key={card.plan_id} className="rounded-xl border border-stone-300 bg-white p-4 text-sm">
          <p className="font-semibold text-[#173866]">Mâm tham khảo</p>
          <ul className="mt-2 space-y-1">
            {card.lines.map(line => <li key={line.suggestion_id}>{line.quantity} × {line.item.name} · {menuPrice(line.item)}/phần{line.item.is_bestseller === true ? ' · Bán chạy' : ''}</li>)}
          </ul>
          <p className="mt-2 font-semibold">Tạm tính món: {menuPrice({ price_vnd: card.subtotal_vnd,
            pricing_mode: card.subtotal_min_vnd != null && card.subtotal_max_vnd != null && card.subtotal_min_vnd !== card.subtotal_max_vnd ? 'range' : 'fixed',
            price_min: card.subtotal_min_vnd, price_max: card.subtotal_max_vnd })}</p>
          {card.budget_status === 'conditional' && <p className="mt-1 text-amber-900">Chưa xác định đầy đủ phí bắt buộc; chưa bảo đảm tổng hóa đơn cuối cùng.</p>}
          {card.orderable_exact === false && <p className="mt-1 text-stone-600">Đây là dự toán khoảng giá, chưa phải giá đặt món đã chốt.</p>}
          {card.warnings.map(warning => <p key={warning} className="mt-1 text-amber-900">{warning}</p>)}
          <p className="mt-1 text-stone-600">Chưa bao gồm phí giao hàng. Vui lòng kiểm tra giá và dị ứng trước khi đặt.</p>
          <button type="button" disabled={isLoading || stale || card.orderable_exact === false} className="mt-3 rounded-lg bg-[#173866] px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            onClick={() => sendAction({ type: 'accept_meal_plan', plan_id: card.plan_id,
              suggestion_ids: card.lines.map(line => line.suggestion_id) })}>Chọn cả mâm vào giỏ nháp</button>
        </div>

      case 'service_link':
        return card.destination === 'cart' ? (
          <button key={`service-${idx}`} type="button" onClick={() => { onClose?.(); cart.setCartOpen(true) }}
            className="rounded-xl bg-[#234386] px-4 py-2 text-sm text-white">Kiểm tra giỏ hàng</button>
        ) : (
          <a key={`service-${idx}`} href={card.destination === 'reservations' ? '/reservation' : '/account/orders'}
            className="inline-block rounded-xl bg-[#234386] px-4 py-2 text-sm text-white">
            {card.destination === 'reservations' ? 'Mở trang đặt bàn' : 'Xem đơn hàng của tôi'}
          </a>
        )
      case 'reservation_option': {
        const when = new Date(card.starts_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh',
          dateStyle: 'full', timeStyle: 'short' })
        const params = new URLSearchParams({ starts_at: card.starts_at, guest_count: String(card.guest_count) })
        return <div key={`reservation-${card.starts_at}`} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <p className="font-semibold text-[#173866]">{when}</p>
          <p className="mt-1 text-stone-600">{card.guest_count} khách · {card.status === 'available'
            ? 'Có thể gửi yêu cầu đặt bàn' : card.status === 'unavailable' ? 'Chưa có bàn phù hợp' : 'Cần nhà hàng xác nhận'}</p>
          {card.status !== 'unavailable' && <a href={`/reservation?${params.toString()}`}
            className="mt-3 inline-block rounded-xl bg-[#234386] px-4 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2">
            Gửi yêu cầu đặt bàn</a>}
        </div>
      }
      case 'order_status':
        return <div key={card.order_id} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
          <p className="font-semibold text-[#173866]">Đơn {card.code}</p>
          <p className="mt-1 text-stone-600">{card.order_type === 'delivery' ? 'Giao tận nơi' : card.order_type === 'takeaway' ? 'Mang đi' : 'Tại quán'} · {card.status}</p>
          <p className="text-xs text-stone-500">{new Date(card.created_at).toLocaleString('vi-VN')}</p>
          <a href={`/account/orders?id=${encodeURIComponent(card.order_id)}`}
            className="mt-2 inline-block text-sm font-semibold text-[#173866] underline underline-offset-2">Xem chi tiết</a>
        </div>
      case 'saved_address':
        return <div key={card.address_id} className="rounded-xl border border-stone-200 bg-white p-3 text-sm">
          <p className="font-semibold text-[#173866]">{card.label}{card.is_default ? ' · Mặc định' : ''}</p>
          <p className="mt-1 text-stone-700">{[card.address_line, card.ward, card.district, card.province].filter(Boolean).join(', ')}</p>
          <a href="/account/addresses" className="mt-2 inline-block font-semibold text-[#173866] underline underline-offset-2">Quản lý địa chỉ</a>
        </div>
      default:
        return null
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-stone-900 bg-[#fbf9f6]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-200 bg-[#fffdf9] px-3 py-2.5 text-[#173866] sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <img src="/tiger.svg" alt="" className="h-8 w-8 shrink-0 rounded-full border border-stone-200 bg-white object-contain" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold leading-tight">Tiger Concierge</h3>
            <p className="truncate text-[11px] leading-tight text-stone-500">
              AI ẩm thực của Tiger 345
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={resetConversation}
            title="Bắt đầu hội thoại mới"
            aria-label="Bắt đầu hội thoại mới"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#173866] transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173866]"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          {onToggleExpand && <button type="button" onClick={onToggleExpand} title={surfaceExpanded ? 'Thu gọn' : 'Mở rộng'}
            aria-label={surfaceExpanded ? 'Thu gọn hội thoại' : 'Mở rộng hội thoại'}
            className="hidden min-h-10 min-w-10 items-center justify-center rounded-lg text-[#173866] hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173866] md:inline-flex">
            {surfaceExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>}
          {onMore && <button type="button" onClick={onMore} title="Các cách liên hệ khác" aria-label="Các cách liên hệ khác"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#173866] hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173866]">
            <Ellipsis className="h-5 w-5" />
          </button>}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Đóng cửa sổ"
              aria-label="Đóng cửa sổ"
              className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-[#173866] transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173866]"
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
            <span role="alert">{error}</span>
          </div>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Đóng thông báo lỗi"
            className="text-rose-700 hover:text-rose-900 font-bold min-w-6 min-h-6 px-1.5 py-0.5 text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Chat Messages Body */}
      <div ref={scrollRef} role="log" aria-label="Nội dung trò chuyện" aria-live="off" className="min-h-0 flex-1 overflow-y-auto space-y-4 p-4"
        onScroll={() => {
          const element = scrollRef.current
          if (!element) return
          followingRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
          if (followingRef.current) setHasNewContent(false)
        }}>
        {messages.length === 0 && <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center py-10 text-center">
          <img src="/tiger.svg" alt="" className="mx-auto mb-5 h-12 w-12 rounded-full bg-white object-contain" />
          <h4 className="text-xl font-semibold text-[#173866]">Tiger Concierge</h4>
          <p className="mt-3 text-sm leading-relaxed text-stone-600">Nói mình biết bạn muốn ăn gì, đi mấy người hoặc khoảng ngân sách. Mình sẽ giúp bạn chọn.</p>
        </div>}
        {messages.map((msg) => (
          <div
            key={msg.id}
            data-message-id={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className={`flex items-start gap-2 ${msg.sender === 'user' ? 'max-w-[85%]' : 'max-w-full'}`}>
              <div
                className={`text-sm leading-relaxed ${
                  msg.sender === 'user'
                    ? 'rounded-2xl rounded-tr-sm bg-[#e9eef5] px-3.5 py-2.5 text-[#173866]'
                    : 'py-1 text-stone-800'
                }`}
              >
                {msg.sender === 'user' ? msg.text : <>
                  <StreamingMessage text={msg.text} animate={Boolean(msg.delivery)} complete={msg.delivery !== 'pending' && msg.delivery !== 'interrupted'} onAdvance={followContent} />
                  {msg.delivery === 'pending' && !msg.text && <span role="status" className="motion-safe:animate-pulse">
                    {activity === 'checking_menu' ? 'Đang kiểm tra thực đơn và giá...' : activity === 'checking_info'
                      ? 'Đang kiểm tra thông tin...' : 'Tiger đang soạn câu trả lời...'}
                  </span>}
                  {msg.delivery === 'interrupted' && <span className="text-stone-500">Phản hồi chưa hoàn tất.</span>}
                </>}
              </div>
            </div>

            {/* Render Cards underneath message */}
            {msg.delivery !== 'pending' && msg.delivery !== 'interrupted' && msg.cards && msg.cards.length > 0 && (
              <div className={`w-full mt-2.5 ${msg.cards.some(card => card.type === 'draft_suggestion') ? 'flex gap-3 overflow-x-auto pb-2' : 'space-y-2.5'}`}>
                {msg.cards.map((card, idx) => renderCard(card, idx, msg.id !== latestReply?.id))}
              </div>
            )}
          </div>
        ))}

        {isLoading && !messages.some(message => message.delivery === 'pending') && (
          <div className="flex items-center gap-2 border-l-2 border-[#ed7328] pl-3 text-sm text-stone-600">
            <span role="status" className="motion-safe:animate-pulse">{activity === 'checking_menu' ? 'Đang kiểm tra thực đơn và giá...' :
              activity === 'checking_info' ? 'Đang kiểm tra thông tin...' :
              activity === 'thinking' ? 'Tiger đang soạn câu trả lời...' :
              'Tiger đang xử lý yêu cầu...'}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      {hasNewContent && <button type="button" onClick={() => {
        followingRef.current = true; setHasNewContent(false); followContent()
      }} className="mx-auto flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-[#173866]">
        <ArrowDown size={14} aria-hidden="true" /> Có phản hồi mới
      </button>}

      {/* Suggested Actions Pill Row */}
      {suggestedActions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-stone-100 bg-stone-50/90 no-scrollbar px-4 py-1.5">
          <SuggestedActions
            actions={suggestedActions}
            disabled={isLoading}
            onSelectAction={(action) => sendMessage(action)}
          />
        </div>
      )}

      {draft && <>
        <DraftCartPreview draft={draft} expanded={expanded} onToggle={() => setExpanded(value => !value)} />
        {expanded && <DraftCartReview draft={draft} names={names} busy={isLoading} onEdit={mutateDraft}
          onReview={() => sendAction({ type: 'review_draft' })}
          onAcceptPrices={() => sendAction({ type: 'accept_prices', draft_version: draft.version })}
          onHandoff={() => sendAction({ type: 'handoff_draft', draft_id: draft.draft_id, draft_version: draft.version,
            order_mode: cart.context.mode === 'dine-in' ? 'dine_in' : 'delivery' })} />}
      </>}
      {retryText && <button type="button" disabled={isLoading} className="p-2 text-sm underline" onClick={() => void sendMessage(retryText)}>Thử lại yêu cầu trước</button>}
      {hasPendingAction && !isLoading && <button type="button" className="p-2 text-sm underline" onClick={() => void retryPendingAction()}>Kiểm tra lại thao tác trước</button>}
      {/* Chat Input Footer */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 border-t border-stone-200 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] p-3"
      >
        <input
          aria-label="Tin nhắn cho trợ lý"
          maxLength={2000}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={viewedMenuItemId ? 'Hỏi về món đang xem...' : cart.context.mode === 'dine-in' ? 'Hỏi món hoặc gọi thêm cho bàn...' : 'Hỏi về món, ngân sách hoặc đặt bàn...'}
          disabled={isLoading}
          className="flex-1 min-w-0 px-3.5 py-2 text-xs sm:text-sm bg-stone-50 border border-stone-200 rounded-xl focus-visible:outline-2 focus-visible:outline-[#234386] focus:border-[#234386] focus:bg-white transition-colors"
        />
        {isLoading ? <button type="button" aria-label="Dừng phản hồi" onClick={stopResponse}
          className="rounded-xl bg-[#234386] p-2.5 text-white hover:bg-[#1c356b]">
          <Square className="h-4 w-4" aria-hidden="true" />
        </button> : <button
          aria-label="Gửi tin nhắn"
          type="submit"
          disabled={!inputVal.trim() || isLoading}
          className="p-2.5 rounded-xl bg-[#234386] text-white hover:bg-[#1c356b] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>}
      </form>
    </div>
  )
}
