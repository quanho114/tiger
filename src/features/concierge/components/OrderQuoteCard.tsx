import { useState, useEffect } from 'react'
import type { FC } from 'react'
import { ShieldCheck, Clock, CheckCircle } from 'lucide-react'
import type { OrderQuoteCardData } from '../types'

interface OrderQuoteCardProps {
  quote: OrderQuoteCardData
  onConfirmQuote: (quoteToken: string) => void | boolean | Promise<void | boolean>
  disabled?: boolean
}

export const OrderQuoteCard: FC<OrderQuoteCardProps> = ({
  quote,
  onConfirmQuote,
  disabled = false,
}) => {
  const [timeLeftSec, setTimeLeftSec] = useState<number>(() => {
    const exp = new Date(quote.expires_at).getTime()
    const now = Date.now()
    return Math.max(0, Math.floor((exp - now) / 1000))
  })
  const [isConfirming, setIsConfirming] = useState<boolean>(false)
  const [confirmationFailed, setConfirmationFailed] = useState(false)

  const handleConfirm = async () => {
    if (disabled || isExpired || isConfirming) return
    setIsConfirming(true)
    setConfirmationFailed(false)
    try {
      const outcome = await onConfirmQuote(quote.quote_token)
      setConfirmationFailed(outcome === false)
    } catch {
      setConfirmationFailed(true)
    } finally {
      setIsConfirming(false)
    }
  }

  useEffect(() => {
    if (timeLeftSec <= 0) return

    const timer = setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeftSec])

  const isExpired = timeLeftSec <= 0
  const minutes = Math.floor(timeLeftSec / 60)
  const seconds = timeLeftSec % 60
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`

  return (
    <div className="bg-white rounded-xl border border-stone-200/90 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-3.5 bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-transparent border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-700" />
          <span className="text-xs font-bold text-blue-900 uppercase tracking-wider">
            Kiểm tra đơn trước khi xác nhận
          </span>
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
            isExpired ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
          }`}
        >
          <Clock className="w-3 h-3" />
          <span>{isExpired ? 'Đã hết hạn' : formattedTime}</span>
        </div>
      </div>

      {/* Items */}
      <div className="p-4 space-y-2 text-xs">
        <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
          Món ăn ({quote.order_type === 'delivery' ? 'Giao hàng tận nơi' : 'Dùng tại quán'})
        </div>
        <ul className="divide-y divide-stone-100">
          {quote.items.map((item, idx) => (
            <li key={idx} className="py-1.5 flex justify-between items-center">
              <div>
                <span className="font-medium text-stone-800">
                  {item.quantity}x {item.item_name || item.name}
                </span>
                {item.note && <span className="text-stone-600 block text-[11px] italic">{item.note}</span>}
              </div>
              <span className="font-semibold text-stone-900">
                {item.line_total_vnd.toLocaleString('vi-VN')} đ
              </span>
            </li>
          ))}
        </ul>

        {/* Totals */}
        <div className="pt-2 border-t border-stone-100 space-y-1">
          <div className="flex justify-between text-stone-600">
            <span>Tạm tính món:</span>
            <span>{quote.subtotal_vnd.toLocaleString('vi-VN')} đ</span>
          </div>
          {quote.shipping_fee_vnd > 0 && (
            <div className="flex justify-between text-stone-600">
              <span>Phí vận chuyển:</span>
              <span>{quote.shipping_fee_vnd.toLocaleString('vi-VN')} đ</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-extrabold text-stone-900 pt-1 border-t border-dashed border-stone-200">
            <span>Tổng cộng:</span>
            <span className="text-[#234386]">{quote.total_vnd.toLocaleString('vi-VN')} đ</span>
          </div>
        </div>

        <p className="text-[10px] text-stone-600 truncate pt-1">
          Vui lòng kiểm tra món ăn, số lượng và tổng tiền trước khi đặt đơn.
        </p>
      </div>

      {confirmationFailed && <p role="alert" className="px-4 py-2 text-xs text-rose-800">Chưa thể xác nhận. Vui lòng kiểm tra thông báo và thử lại.</p>}
      {/* Action */}
      <div className="p-3 bg-stone-50 border-t border-stone-100 flex justify-end">
        <button
          type="button"
          disabled={disabled || isExpired || isConfirming}
          onClick={() => void handleConfirm()}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all ${
            isExpired || isConfirming
              ? 'bg-stone-200 text-stone-600 cursor-not-allowed'
              : 'bg-[#234386] text-white hover:bg-[#1b3469] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>{isExpired ? 'Báo giá đã hết hạn' : isConfirming ? 'Đang gửi xác nhận...' : 'Xác nhận đặt đơn'}</span>
        </button>
      </div>
    </div>
  )
}
