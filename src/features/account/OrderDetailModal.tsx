import { useEffect, useState } from 'react'
import {
  X,
  MapPin,
  Utensils,
  AlertCircle,
  Loader2,
  Phone,
  User,
} from 'lucide-react'
import { fetchCustomerOrderDetail } from './api'
import type { CustomerOrderDetail } from './types'

interface OrderDetailModalProps {
  orderId: string | null
  onClose: () => void
}

function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function getOrderStatusBadge(status: string) {
  switch (status) {
    case 'pending':
      return { label: 'Chờ xác nhận', bg: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'confirmed':
      return { label: 'Đã xác nhận', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'preparing':
      return { label: 'Đang chuẩn bị món', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    case 'ready_for_pickup':
      return { label: 'Sẵn sàng giao', bg: 'bg-teal-50 text-teal-700 border-teal-200' }
    case 'delivering':
      return { label: 'Đang giao hàng', bg: 'bg-purple-50 text-purple-700 border-purple-200' }
    case 'completed':
      return { label: 'Đã hoàn tất', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'cancelled':
      return { label: 'Đã hủy', bg: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

export function OrderDetailModal({ orderId, onClose }: OrderDetailModalProps) {
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orderId) return

    let isMounted = true
    let pollTimer: ReturnType<typeof setInterval> | null = null

    async function load(isPolling = false) {
      try {
        if (!isPolling) setIsLoading(true)
        const data = await fetchCustomerOrderDetail(orderId!)
        if (isMounted) {
          setOrder(data)
          setError(null)

          // Poll every 15s if status is not terminal
          const isTerminal = data.status === 'completed' || data.status === 'cancelled'
          if (!isTerminal && !pollTimer) {
            pollTimer = setInterval(() => {
              load(true)
            }, 15000)
          } else if (isTerminal && pollTimer) {
            clearInterval(pollTimer)
            pollTimer = null
          }
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Không thể tải chi tiết đơn hàng')
        }
      } finally {
        if (isMounted && !isPolling) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [orderId])

  if (!orderId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 border border-amber-100 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                {order ? `Đơn hàng #${order.code}` : 'Chi tiết đơn hàng'}
              </h3>
              {order && (
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getOrderStatusBadge(order.status).bg}`}
                >
                  {getOrderStatusBadge(order.status).label}
                </span>
              )}
            </div>
            {order && (
              <p className="text-xs text-slate-500 mt-1">
                Đặt lúc: {formatDate(order.created_at)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-16 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-2" />
            <p className="text-sm">Đang tải chi tiết...</p>
          </div>
        ) : error ? (
          <div className="py-8 text-center text-red-600">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : order ? (
          <div className="py-4 space-y-6">
            {/* Delivery / Table Info */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                {order.order_type === 'delivery' ? (
                  <>
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>Địa chỉ giao hàng:</span>
                  </>
                ) : (
                  <>
                    <Utensils className="w-4 h-4 text-amber-600" />
                    <span>Dùng bữa tại bàn:</span>
                  </>
                )}
                <span className="font-normal text-slate-700">
                  {order.order_type === 'delivery'
                    ? order.address_snapshot || 'Giao tận nơi'
                    : order.table_name_snapshot || 'Bàn chưa chỉ định'}
                </span>
              </div>
              <div className="flex items-center gap-4 text-slate-600 pt-1 border-t border-slate-200/60">
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  {order.customer_name}
                </span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  {order.customer_phone}
                </span>
              </div>
              {order.note && (
                <p className="text-slate-500 italic pt-1">
                  Ghi chú đơn: &ldquo;{order.note}&rdquo;
                </p>
              )}
            </div>

            {/* Items List */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Danh sách món ({order.items.length})
              </p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-800">
                        {item.quantity}x {item.item_name}
                      </span>
                      {item.note && (
                        <p className="text-slate-400 italic mt-0.5">Ghi chú: {item.note}</p>
                      )}
                    </div>
                    <span className="font-bold text-slate-800">
                      {formatVnd(item.line_total_vnd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-100">
              <div className="flex justify-between">
                <span>Tạm tính món ăn:</span>
                <span className="font-semibold text-slate-800">
                  {formatVnd(order.subtotal_vnd)}
                </span>
              </div>
              {order.order_type === 'delivery' && (
                <div className="flex justify-between">
                  <span>Phí giao hàng:</span>
                  <span className="font-semibold text-slate-800">
                    {formatVnd(order.shipping_fee_vnd)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-100">
                <span>Tổng cộng:</span>
                <span className="text-amber-600 font-black text-base">
                  {formatVnd(order.total_vnd)}
                </span>
              </div>
            </div>

            {/* Timeline */}
            {order.timeline && order.timeline.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Tiến trình đơn hàng
                </p>
                <div className="space-y-2 border-l-2 border-amber-200 pl-3 ml-2">
                  {order.timeline.map((step, idx) => (
                    <div key={idx} className="relative text-xs">
                      <div className="absolute -left-[19px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-white" />
                      <p className="font-bold text-slate-800">
                        {getOrderStatusBadge(step.to_status).label}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(step.created_at)}
                      </p>
                      {step.reason && (
                        <p className="text-slate-500 italic mt-0.5">{step.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
