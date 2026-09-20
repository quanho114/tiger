import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingBag,
  CalendarCheck,
  Heart,
  Clock,
  ArrowRight,
  AlertCircle,
  Loader2,
  UtensilsCrossed,
  Package,
} from 'lucide-react'
import { fetchCustomerHome } from './api'
import type { CustomerHomeSummary } from './types'
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

export function AccountOverviewPage() {
  const [data, setData] = useState<CustomerHomeSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { add, setCartOpen } = useCart()

  useEffect(() => {
    let isMounted = true
    async function load() {
      try {
        setIsLoading(true)
        setError(null)
        const res = await fetchCustomerHome()
        if (isMounted) {
          setData(res)
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Không thể tải thông tin tổng quan')
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
  }, [])

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl p-8 border border-amber-100 flex flex-col items-center justify-center min-h-[360px] text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
        <p className="text-sm font-medium">Đang tổng hợp thông tin tài khoản...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-red-200 text-red-700">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <h3 className="font-bold text-base">Đã xảy ra lỗi</h3>
        </div>
        <p className="text-sm mb-4">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
        >
          Tải lại trang
        </button>
      </div>
    )
  }

  const recentOrders = data?.recent_orders || []
  const frequentItems = data?.frequent_items || []
  const upcomingReservations = data?.upcoming_reservations || []

  return (
    <div className="space-y-6">
      {/* Quick Stat Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Đơn hàng gần đây
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">{recentOrders.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Lịch đặt bàn
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">
              {upcomingReservations.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <CalendarCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-amber-100 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Món ưa thích
            </p>
            <p className="text-2xl font-black text-slate-800 mt-1">{frequentItems.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center">
            <Heart className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Upcoming Reservations */}
      {upcomingReservations.length > 0 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-amber-600" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">
                Lịch đặt bàn sắp tới
              </h2>
            </div>
            <Link
              to="/account/reservations"
              className="text-xs sm:text-sm font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <span>Xem tất cả</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {upcomingReservations.map((res) => (
              <div
                key={res.id}
                className="p-4 rounded-xl bg-amber-50/40 border border-amber-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                      #{res.code}
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {res.guest_count} khách
                    </span>
                    {res.area_name_snapshot && (
                      <span className="text-xs text-slate-500 font-medium">
                        • {res.area_name_snapshot}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-medium flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDate(res.starts_at)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {res.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ xác nhận'}
                  </span>
                  <Link
                    to="/account/reservations"
                    className="text-xs font-semibold text-amber-600 hover:underline"
                  >
                    Chi tiết
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders Section */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-600" />
            <h2 className="text-base sm:text-lg font-bold text-slate-900">Đơn hàng gần đây</h2>
          </div>
          <Link
            to="/account/orders"
            className="text-xs sm:text-sm font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            <span>Xem lịch sử</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Bạn chưa có đơn hàng nào</p>
            <Link
              to="/menu"
              className="inline-block mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Khám phá thực đơn
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map((order) => {
              const badge = getOrderStatusBadge(order.status)
              return (
                <div
                  key={order.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-700">
                        #{order.code}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {order.order_type === 'delivery' ? '• Giao tận nơi' : '• Tại bàn'}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                      {order.items_summary.map((i) => `${i.quantity}x ${i.item_name}`).join(', ')}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {formatDate(order.created_at)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <p className="text-sm font-black text-amber-600">
                      {formatVnd(order.total_vnd)}
                    </p>
                    <Link
                      to={`/account/orders?id=${order.id}`}
                      className="text-xs font-semibold text-slate-600 hover:text-amber-600 border border-slate-200 hover:border-amber-300 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      Chi tiết
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Frequently Ordered Items */}
      {frequentItems.length > 0 && (
        <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5 text-amber-600" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900">Món bạn thường gọi</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {frequentItems.map((item) => (
              <div
                key={item.menu_item_id}
                className="p-3.5 rounded-xl border border-slate-100 hover:border-amber-200 bg-slate-50/50 hover:bg-white flex items-center justify-between gap-3 transition-all"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-slate-800 truncate">{item.name}</h4>
                  <p className="text-xs font-black text-amber-600 mt-0.5">
                    {formatVnd(item.price_vnd)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Đã gọi {item.total_quantity} lần ({item.order_count} đơn)
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!item.available}
                  onClick={() => {
                    add({
                      id: item.menu_item_id,
                      name: item.name,
                      price: item.price_vnd,
                      category: item.category_name,
                      category_id: item.category_id,
                      description: '',
                      image: item.image_path || '/images/bo-nuong.jpg',
                      available: item.available,
                      modes: ['dine-in', 'delivery'],
                    })
                    setCartOpen(true)
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-colors ${
                    item.available
                      ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {item.available ? 'Thêm giỏ' : 'Tạm hết'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
