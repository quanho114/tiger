import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  ShoppingBag,
  Clock,
  RotateCcw,
  Loader2,
  AlertCircle,
  Package,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react'
import { fetchCustomerOrders, reorderCustomerOrder } from './api'
import type { CustomerOrderSummary, ReorderResponse } from './types'
import { OrderDetailModal } from './OrderDetailModal'
import { ReorderWarningModal } from './ReorderWarningModal'
import { useCart } from '@/store/cart'

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
      return { label: 'Đang chuẩn bị', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    case 'ready_for_pickup':
      return { label: 'Sẵn sàng giao', bg: 'bg-teal-50 text-teal-700 border-teal-200' }
    case 'delivering':
      return { label: 'Đang giao hàng', bg: 'bg-purple-50 text-purple-700 border-purple-200' }
    case 'completed':
      return { label: 'Hoàn tất', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'cancelled':
      return { label: 'Đã hủy', bg: 'bg-red-50 text-red-700 border-red-200' }
    default:
      return { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

const PAGE_SIZE = 10

export function AccountOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialOrderId = searchParams.get('id')

  const [orders, setOrders] = useState<CustomerOrderSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId)
  const [reorderData, setReorderData] = useState<ReorderResponse | null>(null)
  const [isReorderingId, setIsReorderingId] = useState<string | null>(null)

  const { add, clear, setCartOpen, setContext } = useCart()

  useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        setIsLoading(true)
        setError(null)
        const filter = statusFilter === 'all' ? undefined : statusFilter
        const data = await fetchCustomerOrders({
          status: filter,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        })
        if (isMounted) {
          setOrders(data)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [statusFilter, page])

  const handleReorder = async (order: CustomerOrderSummary) => {
    try {
      setIsReorderingId(order.id)
      const res = await reorderCustomerOrder(order.id, order.order_type)
      if (res.warnings.length > 0) {
        // Show warning modal so customer is aware of price/availability differences
        setReorderData(res)
      } else {
        // Direct apply to cart
        if (res.target_order_type === 'dine_in') {
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
        clear()
        for (const item of res.items) {
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
        setCartOpen(true)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể đặt lại đơn hàng này')
    } finally {
      setIsReorderingId(null)
    }
  }

  const filterTabs = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chờ xác nhận' },
    { key: 'delivering', label: 'Đang giao' },
    { key: 'completed', label: 'Hoàn tất' },
    { key: 'cancelled', label: 'Đã hủy' },
  ]

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
            <span>Lịch sử đơn hàng</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý, tra cứu tiến độ và đặt lại các đơn hàng đã đặt
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusFilter(tab.key)
                setPage(0)
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.key
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm font-medium">Đang tải danh sách đơn hàng...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-600 space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto opacity-80" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-bold text-slate-700">Không tìm thấy đơn hàng nào</p>
          <p className="text-xs text-slate-400 mt-1">
            {statusFilter !== 'all'
              ? 'Không có đơn hàng nào trong trạng thái này'
              : 'Hãy khám phá thực đơn thơm ngon của Tiger 345 ngay'}
          </p>
          <Link
            to="/menu"
            className="inline-block mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Xem thực đơn ngay
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {orders.map((order) => {
            const badge = getOrderStatusBadge(order.status)
            return (
              <div
                key={order.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 text-sm">
                      #{order.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {order.order_type === 'delivery' ? '• Giao tận nơi' : '• Tại bàn'}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 font-medium">
                    {order.items_summary.map((i) => `${i.quantity}x ${i.item_name}`).join(', ')}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(order.created_at)}
                    </span>
                    {order.order_type === 'delivery' && order.address_snapshot && (
                      <span className="truncate max-w-xs">• {order.address_snapshot}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                  <div className="text-left md:text-right">
                    <p className="text-xs text-slate-400">Tổng tiền</p>
                    <p className="text-base font-black text-amber-600">
                      {formatVnd(order.total_vnd)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderId(order.id)
                        setSearchParams({ id: order.id })
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-600 text-xs font-semibold transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem</span>
                    </button>

                    {order.status === 'completed' && (
                      <button
                        type="button"
                        disabled={isReorderingId === order.id}
                        onClick={() => handleReorder(order)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {isReorderingId === order.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Đặt lại</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {orders.length > 0 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs">
          <button
            type="button"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Trang trước</span>
          </button>

          <span className="font-semibold text-slate-500">Trang {page + 1}</span>

          <button
            type="button"
            disabled={orders.length < PAGE_SIZE || isLoading}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-slate-600"
          >
            <span>Trang sau</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modals */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => {
          setSelectedOrderId(null)
          searchParams.delete('id')
          setSearchParams(searchParams)
        }}
      />

      {reorderData && (
        <ReorderWarningModal
          isOpen={!!reorderData}
          onClose={() => setReorderData(null)}
          reorderData={reorderData}
        />
      )}
    </div>
  )
}
