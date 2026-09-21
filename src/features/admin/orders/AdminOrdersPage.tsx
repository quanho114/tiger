import { useState, useEffect, useCallback, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Clock,
  CheckCircle2,
  ChefHat,
  Armchair,
  Truck,
  XCircle,
  Eye,
  RefreshCw,
} from 'lucide-react'
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
        return (
          <span className="inline-flex items-center gap-1 bg-[#faf1dc] text-[#a06b00] border border-[#f2deae] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <Clock className="w-3 h-3 text-[#b57a0b]" />
            <span>Chờ nhận</span>
          </span>
        )
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 bg-[#e8f2fe] text-[#1e60d5] border border-[#c8e0fc] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <CheckCircle2 className="w-3 h-3 text-[#1e60d5]" />
            <span>Đã nhận</span>
          </span>
        )
      case 'preparing':
        return (
          <span className="inline-flex items-center gap-1 bg-[#fff7ed] text-[#c2410c] border border-[#fed7aa] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <ChefHat className="w-3 h-3 text-[#ea580c]" />
            <span>Đang nấu</span>
          </span>
        )
      case 'served':
        return (
          <span className="inline-flex items-center gap-1 bg-[#e4f7c6] text-[#3e6300] border border-[#c4e899] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <Armchair className="w-3 h-3 text-[#3e6300]" />
            <span>Đã ra bàn</span>
          </span>
        )
      case 'delivering':
        return (
          <span className="inline-flex items-center gap-1 bg-[#f3e8ff] text-[#7e22ce] border border-[#e1c5fc] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <Truck className="w-3 h-3 text-[#7e22ce]" />
            <span>Đang ship</span>
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 bg-[#e4f7c6] text-[#24541c] border border-[#7cd56e]/50 px-2 py-0.5 rounded-full font-bold text-[11px]">
            Hoàn tất
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 bg-[#fceae6] text-[#d93826] border border-[#f5c6c0] px-2 py-0.5 rounded-full font-medium text-[11px]">
            <XCircle className="w-3 h-3" />
            <span>Từ chối</span>
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 bg-[#edece9] text-[#787979] border border-[#e2e3e3] px-2 py-0.5 rounded-full font-medium text-[11px]">
            Đã hủy
          </span>
        )
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Title & Counter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171a17]">
            Hàng đợi Đơn hàng (Orders Queue)
          </h1>
          <p className="text-xs text-[#787979] mt-1">
            Quản lý tập trung mọi đơn tại bàn và đơn giao hàng theo thời gian thực
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1.5 bg-white border border-[#e2e3e3] rounded-xl text-xs text-[#5c5e63] font-medium shadow-2xs">
            Tổng số: <strong className="text-[#171a17] font-mono font-bold">{orders.length}</strong> đơn
          </span>
          <button
            type="button"
            onClick={() => {
              void loadOrders()
              triggerRefresh()
            }}
            disabled={isLoading}
            className="elera-icon-btn shadow-2xs"
            title="Làm mới danh sách"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#7cd56e]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Toolbar (Elera Style) */}
      <div className="bg-white border border-[#e2e3e3] rounded-2xl p-4 shadow-sm space-y-3">
        {/* Type Filter (Scope Tabs) */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#787979] mr-1">Kênh:</span>
          <div className="elera-scope-tabs">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'dine_in', label: 'Tại bàn' },
              { key: 'delivery', label: 'Giao hàng' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setType(item.key as OrderType | 'all')}
                className={`elera-pill-scope ${typeFilter === item.key ? 'selected' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter (Filter Chips) */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-[#e2e3e3]">
          <span className="text-xs font-semibold text-[#787979] mr-1">Trạng thái:</span>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'pending', label: 'Chờ xử lý' },
            { key: 'confirmed', label: 'Đã nhận' },
            { key: 'preparing', label: 'Đang nấu' },
            { key: 'served', label: 'Đã phục vụ' },
            { key: 'delivering', label: 'Đang ship' },
            { key: 'completed', label: 'Hoàn thành' },
            { key: 'cancelled', label: 'Đã hủy' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(item.key as OrderStatus | 'all')}
              className={`elera-filter-chip ${statusFilter === item.key ? 'selected' : ''}`}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table (Elera Card Table) */}
      <div className="bg-white border border-[#e2e3e3] rounded-2xl shadow-sm overflow-hidden">
        {isLoading && orders.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-[#787979]">
            <div className="w-8 h-8 border-2 border-[#7cd56e] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-xs">Đang tải danh sách đơn hàng...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-4 text-center">
            <p className="text-xs text-rose-600 mb-3">{error}</p>
            <button
              type="button"
              onClick={loadOrders}
              className="elera-btn-secondary text-xs"
            >
              Tải lại
            </button>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-[#787979]">
            <p className="text-xs font-medium">Không tìm thấy đơn hàng nào phù hợp với bộ lọc</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[#787979] bg-[#faf9f7] border-b border-[#e2e3e3] uppercase text-[11px] font-semibold">
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
              <tbody className="divide-y divide-[#e2e3e3] text-[#5c5e63]">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#faf9f7] transition cursor-pointer"
                    onClick={() => openOrderDetail(order.id)}
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-[#171a17] whitespace-nowrap">
                      {order.code}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium ${
                          order.order_type === 'dine_in'
                            ? 'bg-[#e4f7c6] text-[#3e6300] border border-[#c4e899]'
                            : 'bg-[#f3e8ff] text-[#7e22ce] border border-[#e1c5fc]'
                        }`}
                      >
                        {order.order_type === 'dine_in' ? 'Tại bàn' : 'Giao hàng'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[#171a17]">
                      {order.order_type === 'dine_in'
                        ? (order.table_name_snapshot || 'Bàn không tên')
                        : `${order.customer_name || 'Khách online'} (${order.customer_phone || ''})`}
                    </td>
                    <td className="py-3.5 px-3 text-[#787979]">
                      {order.item_count} món
                    </td>
                    <td className="py-3.5 px-3 font-mono font-semibold text-[#171a17]">
                      {order.total_vnd.toLocaleString('vi-VN')}đ
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      {statusBadge(order.status)}
                    </td>
                    <td className="py-3.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          order.payment_status === 'paid'
                            ? 'bg-[#e4f7c6] text-[#3e6300] border border-[#c4e899]'
                            : 'bg-[#faf1dc] text-[#a06b00] border border-[#f2deae]'
                        }`}
                      >
                        {order.payment_status === 'paid' ? 'Đã trả' : 'Chưa trả'}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-[#787979] font-mono text-[11px] whitespace-nowrap">
                      {new Date(order.created_at).toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openOrderDetail(order.id)}
                        className="elera-btn-secondary h-7 px-2.5 text-xs gap-1 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Chi tiết</span>
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
