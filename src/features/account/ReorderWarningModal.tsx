import { AlertTriangle, Check, X, AlertCircle } from 'lucide-react'
import type { ReorderResponse } from './types'
import { useCart } from '@/store/cart'

interface ReorderWarningModalProps {
  isOpen: boolean
  onClose: () => void
  reorderData: ReorderResponse
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

export function ReorderWarningModal({
  isOpen,
  onClose,
  reorderData,
}: ReorderWarningModalProps) {
  const { add, clear, setCartOpen, setContext } = useCart()

  if (!isOpen) return null

  const handleApplyToCart = () => {
    // 1. Set mode to target order type
    if (reorderData.target_order_type === 'dine_in') {
      setContext({
        mode: 'dine-in',
        tableId: '',
        tableCode: '',
        tableName: 'Bàn tại quán',
        visitId: '',
      })
    } else {
      setContext({
        mode: 'delivery',
      })
    }

    // 2. Clear old cart and add reordered items
    clear()
    for (const item of reorderData.items) {
      if (item.available) {
        add(
          {
            id: item.menu_item_id,
            name: item.item_name,
            price: item.unit_price_vnd,
            category: 'Thực đơn',
            category_id: '',
            description: '',
            image: '/images/bo-nuong.jpg',
            available: item.available,
            modes: ['dine-in', 'delivery'],
          },
          item.note || undefined
        )
      }
    }

    onClose()
    setCartOpen(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-amber-100 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <h3 className="text-lg font-bold text-slate-900">
              Đặt lại đơn #{reorderData.source_order_code}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warnings List */}
        {reorderData.warnings.length > 0 ? (
          <div className="mb-5 space-y-2.5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Thay đổi so với đơn hàng cũ
            </p>
            <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 p-3.5 space-y-2">
              {reorderData.warnings.map((w, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">{w.item_name}: </span>
                    <span>{w.message}</span>
                    {w.type === 'PRICE_CHANGED' && w.old_price_vnd && w.new_price_vnd && (
                      <span className="ml-1 font-semibold text-amber-800">
                        ({formatVnd(w.old_price_vnd)} → {formatVnd(w.new_price_vnd)})
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 mb-4">
            Tất cả các món trong đơn hàng đều giữ nguyên mức giá và sẵn sàng phục vụ.
          </p>
        )}

        {/* Valid Items to Add */}
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Các món sẽ được thêm vào giỏ hàng
          </p>
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/30">
            {reorderData.items.map((item) => (
              <div
                key={item.menu_item_id}
                className="p-3 flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-bold text-slate-800">
                    {item.quantity}x {item.item_name}
                  </p>
                  {item.note && <p className="text-slate-400 italic">Ghi chú: {item.note}</p>}
                </div>
                <p className="font-bold text-amber-700">
                  {formatVnd(item.line_total_vnd)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-2 px-1 text-sm font-bold text-slate-800">
            <span>Tạm tính mới:</span>
            <span className="text-amber-600 font-extrabold text-base">
              {formatVnd(reorderData.subtotal_vnd)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleApplyToCart}
            className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <Check className="w-4 h-4" />
            <span>Cập nhật vào giỏ hàng</span>
          </button>
        </div>
      </div>
    </div>
  )
}
