import { useState, useEffect, type FC } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../../../lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import type { AdminDashboardData } from '../types'

const DEFAULT_SETTINGS = {
  accepting_orders: true,
  accepting_dine_in_orders: true,
  accepting_delivery_orders: true,
  booking_enabled: true,
}

export const AdminDashboardPage: FC = () => {
  const { refreshKey } = useAdmin()
  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false)

  const settings = data?.settings ?? DEFAULT_SETTINGS

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      try {
        setError(null)
        const res = await adminApi.get<AdminDashboardData>('/dashboard')
        if (mounted) {
          setData(res.data)
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Dashboard')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      mounted = false
    }
  }, [refreshKey])

  const handleToggleSetting = async (key: keyof AdminDashboardData['settings']) => {
    if (!data || isUpdatingSettings) return

    const currentSettings = data.settings ?? DEFAULT_SETTINGS
    const newSettings = {
      ...currentSettings,
      [key]: !currentSettings[key],
    }

    // Optimistic UI update
    setData({
      ...data,
      settings: newSettings,
    })

    setIsUpdatingSettings(true)
    try {
      await adminApi.patch('/settings', newSettings)
    } catch (err: unknown) {
      // Rollback on failure
      setData(data)
      alert(err instanceof Error ? err.message : 'Không thể cập nhật cấu hình')
    } finally {
      setIsUpdatingSettings(false)
    }
  }

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-stone-300">Đang tải dữ liệu vận hành...</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="bg-rose-950/60 border border-rose-800 rounded-xl p-6 text-center max-w-xl mx-auto my-8">
        <div className="text-rose-400 text-3xl mb-2">⚠️</div>
        <h3 className="text-base font-bold text-rose-200">Không thể kết nối đến hệ thống</h3>
        <p className="text-xs text-rose-300 mt-1">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition"
        >
          Thử lại
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 tracking-tight">Tổng quan Vận hành</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Giám sát thời gian thực các đơn hàng, trạng thái bàn và tiếp nhận đơn
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to="/admin/orders"
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs tracking-wider transition shadow-sm"
          >
            <span>Xử lý Hàng đợi</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Orders */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400">Chờ tiếp nhận</span>
            <span className="text-lg">⏳</span>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-amber-400">
              {data?.pending_orders_count ?? 0}
            </span>
            <span className="text-xs text-stone-400">đơn</span>
          </div>
          <div className="mt-3">
            <Link
              to="/admin/orders?status=pending"
              className="text-xs text-amber-400/90 hover:text-amber-300 font-medium flex items-center space-x-1"
            >
              <span>Xem đơn chờ</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Preparing Orders */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400">Đang chế biến</span>
            <span className="text-lg">🍳</span>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-sky-400">
              {data?.preparing_orders_count ?? 0}
            </span>
            <span className="text-xs text-stone-400">món/đơn</span>
          </div>
          <div className="mt-3">
            <Link
              to="/admin/orders?status=preparing"
              className="text-xs text-sky-400/90 hover:text-sky-300 font-medium flex items-center space-x-1"
            >
              <span>Xem danh sách bếp</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Delivering Orders */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400">Đang giao hàng</span>
            <span className="text-lg">🛵</span>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-indigo-400">
              {data?.delivering_orders_count ?? 0}
            </span>
            <span className="text-xs text-stone-400">đơn</span>
          </div>
          <div className="mt-3">
            <Link
              to="/admin/orders?status=delivering"
              className="text-xs text-indigo-400/90 hover:text-indigo-300 font-medium flex items-center space-x-1"
            >
              <span>Xem tiến độ ship</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* Active Tables */}
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-400">Bàn đang có khách</span>
            <span className="text-lg">🪑</span>
          </div>
          <div className="mt-2 flex items-baseline space-x-2">
            <span className="text-3xl font-black text-emerald-400">
              {data?.active_tables_count ?? 0}
            </span>
            <span className="text-xs text-stone-400">bàn</span>
          </div>
          <div className="mt-3">
            <Link
              to="/admin/tables"
              className="text-xs text-emerald-400/90 hover:text-emerald-300 font-medium flex items-center space-x-1"
            >
              <span>Quản lý sơ đồ bàn</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Intake Control Center */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider">
              Kiểm soát Tiếp nhận Đơn hàng
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Bật/tắt nhanh các luồng khách đặt món khi quán đông hoặc hết giờ phục vụ
            </p>
          </div>
          {isUpdatingSettings && (
            <span className="text-xs text-amber-400 flex items-center space-x-1 font-medium">
              <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <span>Đang lưu...</span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Main Toggle */}
          <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-stone-200">Nhận đơn chung</p>
              <p className="text-[11px] text-stone-400">Tổng công tắc toàn quán</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSetting('accepting_orders')}
              disabled={isUpdatingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.accepting_orders ? 'bg-emerald-500' : 'bg-stone-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.accepting_orders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Dine-in Toggle */}
          <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-stone-200">Tại bàn (Dine-in)</p>
              <p className="text-[11px] text-stone-400">Gọi món qua mã QR bàn</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSetting('accepting_dine_in_orders')}
              disabled={isUpdatingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.accepting_dine_in_orders ? 'bg-emerald-500' : 'bg-stone-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.accepting_dine_in_orders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Delivery Toggle */}
          <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-stone-200">Giao hàng (Delivery)</p>
              <p className="text-[11px] text-stone-400">Đặt ship qua website</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSetting('accepting_delivery_orders')}
              disabled={isUpdatingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.accepting_delivery_orders ? 'bg-emerald-500' : 'bg-stone-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.accepting_delivery_orders ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Booking Toggle */}
          <div className="p-3.5 rounded-lg bg-stone-950 border border-stone-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-stone-200">Đặt bàn trước</p>
              <p className="text-[11px] text-stone-400">Khách gửi form đặt chỗ</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleSetting('booking_enabled')}
              disabled={isUpdatingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                settings.booking_enabled ? 'bg-emerald-500' : 'bg-stone-700'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.booking_enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Pending Orders */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider">
              Đơn hàng cần xử lý gấp ({data?.recent_pending_orders.length || 0})
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Các đơn mới tạo đang chờ xác nhận từ Bếp / Thu ngân
            </p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
          >
            Xem tất cả đơn →
          </Link>
        </div>

        {(!data?.recent_pending_orders || data.recent_pending_orders.length === 0) ? (
          <div className="py-10 text-center text-stone-500 bg-stone-950/40 rounded-lg border border-dashed border-stone-800">
            <span className="text-2xl mb-1 block">✨</span>
            <p className="text-xs font-medium">Hiện không có đơn hàng mới nào chờ tiếp nhận</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-stone-400 border-b border-stone-800 uppercase font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Mã đơn</th>
                  <th className="py-2.5 px-3">Loại đơn</th>
                  <th className="py-2.5 px-3">Vị trí / Khách</th>
                  <th className="py-2.5 px-3">Số món</th>
                  <th className="py-2.5 px-3">Tổng tiền</th>
                  <th className="py-2.5 px-3">Thời gian</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800 text-stone-300">
                {data.recent_pending_orders.map((order) => (
                  <tr key={order.id} className="hover:bg-stone-800/40 transition">
                    <td className="py-3 px-3 font-mono font-bold text-amber-400">
                      {order.code}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          order.order_type === 'dine_in'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : 'bg-indigo-950 text-indigo-300 border border-indigo-800/60'
                        }`}
                      >
                        {order.order_type === 'dine_in' ? 'Tại bàn' : 'Giao hàng'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium">
                      {order.order_type === 'dine_in'
                        ? (order.table_name_snapshot || 'Bàn không tên')
                        : `${order.customer_name || 'Khách'} (${order.customer_phone || ''})`}
                    </td>
                    <td className="py-3 px-3 text-stone-400">
                      {order.item_count} món
                    </td>
                    <td className="py-3 px-3 font-mono font-semibold text-stone-100">
                      {order.total_vnd.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="py-3 px-3 text-stone-400 font-mono text-[11px]">
                      {new Date(order.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        to={`/admin/orders?orderId=${order.id}`}
                        className="inline-flex items-center px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-[11px] transition"
                      >
                        Xử lý ngay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
