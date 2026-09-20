import { useState, useEffect, useCallback, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../../../lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import { AdminOrderDetailModal } from './AdminOrderDetailModal'
import type { AdminOrderSummary, OrderStatus, OrderType } from '../types'

export const AdminOrdersPage: FC = () => {
  const { refreshKey, triggerRefresh } = useAdmin()
  const [searchParams, setSearchParams] = useSearchParams()

  const [orders, setOrders] = useState<AdminOrderSummary[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Selected order for modal
  const selectedOrderId = searchParams.get('orderId')
  const typeFilter = (searchParams.get('type') as OrderType | 'all') || 'all'
  const statusFilter = (searchParams.get('status') as OrderStatus | 'all') || 'all'

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)

      const queryString = params.toString() ? `?${params.toString()}` : ''
      const res = await adminApi.get<any>(`/orders${queryString}`)
      const items = Array.isArray(res.data)
        ? res.data
        : res.data?.items || res.data?.orders || []
      setOrders(items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng')
    } finally {
      setIsLoading(false)
    }
  }, [typeFilter, statusFilter])

  useEffect(() => {
    void loadOrders()
  }, [loadOrders, refreshKey])

  const setType = (type: OrderType | 'all') => {
    const newParams = new URLSearchParams(searchParams)
    if (type === 'all') {
      newParams.delete('type')
    } else {
      newParams.set('type', type)
    }
    setSearchParams(newParams)
  }

  const setStatus = (status: OrderStatus | 'all') => {
    const newParams = new URLSearchParams(searchParams)
    if (status === 'all') {
      newParams.delete('status')
    } else {
      newParams.set('status', status)
    }
    setSearchParams(newParams)
  }

  const openOrderDetail = (orderId: string) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('orderId', orderId)
    setSearchParams(newParams)
  }

  const closeOrderDetail = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('orderId')
    setSearchParams(newParams)
  }

  const statusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Chờ nhận</span>
      case 'confirmed':
        return <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Đã nhận</span>
      case 'preparing':
        return <span className="bg-sky-950 text-sky-300 border border-sky-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Đang nấu</span>
      case 'served':
        return <span className="bg-teal-950 text-teal-300 border border-teal-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Đã ra bàn</span>
      case 'delivering':
        return <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Đang ship</span>
      case 'completed':
        return <span className="bg-emerald-950 text-emerald-400 border border-emerald-700/80 px-2 py-0.5 rounded font-bold text-[11px]">Hoàn tất</span>
      case 'rejected':
        return <span className="bg-rose-950 text-rose-300 border border-rose-800/80 px-2 py-0.5 rounded font-medium text-[11px]">Từ chối</span>
      case 'cancelled':
        return <span className="bg-stone-800 text-stone-400 border border-stone-700 px-2 py-0.5 rounded font-medium text-[11px]">Đã hủy</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 tracking-tight">
            Hàng đợi Đơn hàng (Orders Queue)
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Quản lý tập trung mọi đơn tại bàn và đơn giao hàng theo thời gian thực
          </p>
        </div>
        <div className="text-xs text-stone-400">
          Tổng số: <strong className="text-amber-400 font-mono">{orders.length}</strong> đơn
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3">
        {/* Type Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-stone-400 mr-2">Loại đơn:</span>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'dine_in', label: 'Tại bàn (Dine-in)' },
            { key: 'delivery', label: 'Giao hàng (Delivery)' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setType(item.key as OrderType | 'all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                typeFilter === item.key
                  ? 'bg-amber-500 text-stone-950 font-bold shadow-sm'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-stone-800">
          <span className="text-xs font-semibold text-stone-400 mr-2">Trạng thái:</span>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'pending', label: 'Chờ xử lý' },
            { key: 'confirmed', label: 'Đã nhận' },
            { key: 'preparing', label: 'Đang nấu' },
            { key: 'served', label: 'Đã phục vụ' },
            { key: 'delivering', label: 'Đang ship' },
            { key: 'completed', label: 'Hoàn thành' },
            { key: 'cancelled', label: 'Đã hủy/từ chối' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(item.key as OrderStatus | 'all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                statusFilter === item.key
                  ? 'bg-amber-400 text-stone-950 font-bold'
                  : 'bg-stone-800/80 text-stone-400 hover:bg-stone-700 hover:text-stone-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-xl shadow-sm overflow-hidden">
        {isLoading && orders.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs text-stone-400">Đang tải danh sách đơn hàng...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs text-rose-300 mb-3">{error}</p>
            <button
              type="button"
              onClick={loadOrders}
              className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 rounded-lg"
            >
              Tải lại
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-stone-500">
            <span className="text-3xl mb-2 block">📭</span>
            <p className="text-xs font-medium">Không tìm thấy đơn hàng nào phù hợp với bộ lọc</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-stone-400 bg-stone-950/70 border-b border-stone-800 uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Mã đơn</th>
                  <th className="py-3 px-3">Loại đơn</th>
                  <th className="py-3 px-4">Khách / Bàn</th>
                  <th className="py-3 px-3">Số món</th>
                  <th className="py-3 px-3">Tổng tiền</th>
                  <th className="py-3 px-3">Trạng thái</th>
                  <th className="py-3 px-3">Thanh toán</th>
                  <th className="py-3 px-3">Thời gian</th>
                  <th className="py-3 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800 text-stone-300">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-stone-800/40 transition cursor-pointer"
                    onClick={() => openOrderDetail(order.id)}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                      {order.code}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
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
                    <td className="py-3.5 px-4 font-medium">
                      {order.order_type === 'dine_in' ? (
                        <div className="space-y-0.5">
                          <span className="text-stone-200 font-semibold block">
                            {order.table_name_snapshot || 'Bàn không tên'}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="text-stone-200 font-semibold block">
                            {order.customer_name || 'Khách vãng lai'}
                          </span>
                          <span className="text-stone-400 font-mono text-[11px] block">
                            {order.customer_phone || ''}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-stone-400">
                      {order.item_count} món
                    </td>
                    <td className="py-3.5 px-3 font-mono font-bold text-stone-100 whitespace-nowrap">
                      {order.total_vnd.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {statusBadge(order.status)}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${
                          order.payment_status === 'paid'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}
                      >
                        {order.payment_status === 'paid' ? 'Đã trả' : 'Chưa trả'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-stone-400 font-mono text-[11px] whitespace-nowrap">
                      {new Date(order.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openOrderDetail(order.id)}
                        className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white font-medium text-xs border border-stone-700 transition"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrderId && (
        <AdminOrderDetailModal
          orderId={selectedOrderId}
          onClose={closeOrderDetail}
          onOrderUpdated={() => {
            void loadOrders()
            triggerRefresh()
          }}
        />
      )}
    </div>
  )
}
