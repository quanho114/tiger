import { useState, type FC } from 'react'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ShoppingCart,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import type { MealProposal, ValidationStatus, ConciergeFeedbackRating } from '../types'

interface MealRecommendationCardProps {
  proposal: MealProposal
  onAddToCart: (proposal: MealProposal, acceptPriceChange?: boolean) => void | Promise<void>
  onFeedback?: (rating: ConciergeFeedbackRating, text?: string) => Promise<void>
  disabled?: boolean
}

const STATUS_CONFIG: Record<
  ValidationStatus,
  {
    label: string
    badgeBg: string
    badgeText: string
    icon: typeof CheckCircle2
  }
> = {
  PASS: {
    label: 'Đạt chuẩn kiểm định khẩu phần & an toàn',
    badgeBg: 'bg-emerald-50 border-emerald-200',
    badgeText: 'text-emerald-800',
    icon: CheckCircle2,
  },
  WARNING: {
    label: 'Cần lưu ý nhẹ về dị ứng hoặc ngân sách',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-800',
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: 'Bị chặn bởi kiểm định an toàn / ngân sách',
    badgeBg: 'bg-rose-50 border-rose-200',
    badgeText: 'text-rose-800',
    icon: XCircle,
  },
  INSUFFICIENT_DATA: {
    label: 'Chưa đủ dữ liệu dị ứng - Cần bếp trưởng xác nhận',
    badgeBg: 'bg-orange-50 border-orange-200',
    badgeText: 'text-orange-800',
    icon: HelpCircle,
  },
}

export const MealRecommendationCard: FC<MealRecommendationCardProps> = ({
  proposal,
  onAddToCart,
  onFeedback,
  disabled = false,
}) => {
  const statusInfo = STATUS_CONFIG[proposal.validation.status]
  const StatusIcon = statusInfo.icon
  const isBlocked = proposal.validation.status === 'BLOCKED'

  const [feedbackRating, setFeedbackRating] = useState<ConciergeFeedbackRating | null>(null)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState<boolean>(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<boolean>(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState<boolean>(false)
  const [priceChangeNotice, setPriceChangeNotice] = useState<string | null>(null)

  const handleAddToCart = async (acceptPriceChange = false) => {
    if (disabled || isBlocked || isAdding) return
    setIsAdding(true)
    try {
      if (acceptPriceChange) {
        await onAddToCart(proposal, true)
      } else {
        await onAddToCart(proposal)
      }
      setPriceChangeNotice(null)
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('PRICE_CHANGED')) {
        setPriceChangeNotice(err.message)
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleRatingClick = async (rating: ConciergeFeedbackRating) => {
    if (isSubmittingFeedback || feedbackSubmitted || !onFeedback) return
    setIsSubmittingFeedback(true)
    setFeedbackError(null)
    try {
      await onFeedback(rating)
      setFeedbackRating(rating)
      setFeedbackSubmitted(true)
    } catch (err: unknown) {
      setFeedbackError(err instanceof Error ? err.message : 'Không thể gửi phản hồi')
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-transparent border-b border-stone-100 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 uppercase tracking-wider">
              {proposal.concept_tag === 'balanced_harmony'
                ? 'Hài hòa cân đối'
                : proposal.concept_tag === 'signature_experience'
                ? 'Đặc sản trứ danh'
                : 'Tối ưu ngân sách'}
            </span>
            <span className="text-xs text-stone-500">v{proposal.version}</span>
          </div>
          <h4 className="text-base font-bold text-stone-900 mt-1">{proposal.title}</h4>
          <p className="text-xs text-stone-600 mt-0.5">{proposal.description}</p>
        </div>
      </div>

      {/* Item List */}
      <div className="p-4 space-y-2">
        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider flex items-center gap-1 mb-2">
          <UtensilsCrossed className="w-3.5 h-3.5" />
          <span>Danh sách món đề xuất ({proposal.items.length} món)</span>
        </div>
        <ul className="divide-y divide-stone-100">
          {proposal.items.map((item, idx) => (
            <li key={idx} className="py-2 flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium text-stone-800">
                  {item.quantity}x {item.item_name || 'Món Tiger'}
                </span>
                {item.meal_role && (
                  <span className="ml-2 text-xs text-stone-600">
                    ({item.meal_role})
                  </span>
                )}
                {item.serving_size && (
                  <span className="ml-1 text-xs text-stone-600">· {item.serving_size}</span>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <span className="font-semibold text-stone-900">
                  {(item.unit_price_vnd * item.quantity).toLocaleString('vi-VN')} đ
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Serving and Subtotal */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-stone-600">
            <Users className="w-4 h-4 text-stone-400" />
            <span>{proposal.serving_summary}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-stone-500 mr-2">Tổng tiền:</span>
            <span className="text-base font-extrabold text-[#234386]">
              {proposal.subtotal_vnd.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </div>

        {/* Validation Status Box */}
        <div
          className={`mt-3 p-3 rounded-lg border text-xs flex items-start gap-2.5 ${statusInfo.badgeBg} ${statusInfo.badgeText}`}
        >
          <StatusIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">{statusInfo.label}</p>
            {proposal.validation.warnings.length > 0 && (
              <ul className="list-disc list-inside space-y-0.5 text-stone-700">
                {proposal.validation.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
            {proposal.validation.assumptions.length > 0 && (
              <p className="text-[11px] text-stone-500 italic">
                {proposal.validation.assumptions.join(' ')}
              </p>
            )}
          </div>
        </div>

        {/* Customer Feedback Bar (§22) */}
        <div className="mt-3 pt-3 border-t border-stone-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-medium text-stone-600">Đánh giá độ phù hợp của gợi ý:</span>
            {feedbackSubmitted && (
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Đã ghi nhận phản hồi
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { value: 'perfect', label: 'Phù hợp', icon: '👍' },
                { value: 'too_much', label: 'Nhiều quá', icon: '🍲' },
                { value: 'too_little', label: 'Ít quá', icon: '🥣' },
                { value: 'too_expensive', label: 'Quá đắt', icon: '💰' },
                { value: 'dislike', label: 'Không hợp vị', icon: '👎' },
              ] as const
            ).map((opt) => {
              const isSelected = feedbackRating === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled || isSubmittingFeedback || feedbackSubmitted}
                  onClick={() => void handleRatingClick(opt.value)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    isSelected
                      ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-xs font-semibold'
                      : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-100 disabled:opacity-60 disabled:cursor-not-allowed'
                  }`}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
          {feedbackError && (
            <p className="mt-1 text-[11px] text-rose-600">{feedbackError}</p>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-stone-50/80 border-t border-stone-100 flex flex-col items-end gap-2">
        {priceChangeNotice && (
          <div className="w-full p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
            <p className="font-medium mb-1.5">{priceChangeNotice}</p>
            <button
              type="button"
              onClick={() => void handleAddToCart(true)}
              disabled={disabled || isAdding}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded text-xs font-semibold hover:bg-amber-700 disabled:opacity-50"
            >
              <span>{isAdding ? 'Đang cập nhật...' : 'Xác nhận đồng ý giá mới & thêm vào giỏ'}</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleAddToCart(false)}
          disabled={disabled || isBlocked || isAdding}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors ${
            isBlocked
              ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
              : 'bg-[#ffc400] text-[#234386] hover:bg-[#e6b000] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>{isBlocked ? 'Không thể đặt mâm này' : isAdding ? 'Đang thêm vào giỏ...' : 'Thêm mâm này vào giỏ'}</span>
        </button>
      </div>
    </div>
  )
}
