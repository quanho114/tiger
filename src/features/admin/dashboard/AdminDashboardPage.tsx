import { useState, useEffect, useMemo, type FC } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Clock,
  UtensilsCrossed,
  Armchair,
  CalendarCheck,
  CalendarDays,
  Plus,
  ShoppingBag,
  Printer,
  ChevronRight,
  ArrowUpRight,
  Sparkles,
  Flame,
} from 'lucide-react'
import { adminApi } from '@/shared/lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import { ReceiptModal } from '../components/ReceiptModal'
import { AdminLoading } from '../components/AdminLoading'
import type {
  AdminDashboardData,
  AdminTableItem,
  AdminOrderSummary,
  AdminInvoiceItem,
} from '../types'

export const AdminDashboardPage: FC = () => {
  const { refreshKey } = useAdmin()
  const navigate = useNavigate()

  const [data, setData] = useState<AdminDashboardData | null>(null)
  const [tables, setTables] = useState<AdminTableItem[]>([])
  const [orders, setOrders] = useState<AdminOrderSummary[]>([])
  const [recentInvoices, setRecentInvoices] = useState<AdminInvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Primary Scope Tab: all | dine_in | delivery | takeaway
  const [orderFilterTab, setOrderFilterTab] = useState<'all' | 'dine_in' | 'delivery' | 'takeaway'>('all')

  // Receipt Modal state
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false)
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoiceItem | null>(null)

  // Shift & Date presentation
  const todayFormatted = useMemo(() => {
    const now = new Date()
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']
    const dayName = days[now.getDay()]
    const dateStr = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    const hour = now.getHours()
    const shift = hour >= 6 && hour < 14 ? 'Ca sáng' : hour >= 14 && hour < 22 ? 'Ca chiều/tối' : 'Ca đêm'
    return `${dayName}, ${dateStr} · ${shift}`
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadDashboardData() {
      try {
        setError(null)
        const [dashRes, tablesRes, ordersRes, invoicesRes] = await Promise.all([
          adminApi.get<AdminDashboardData>('/dashboard'),
          adminApi.get<{ items: AdminTableItem[] }>('/tables'),
          adminApi.get<{ items: AdminOrderSummary[] }>('/orders?limit=100&actionable=true'),
          adminApi.get<{ items: AdminInvoiceItem[] }>('/invoices?limit=6'),
        ])

        if (mounted) {
          setData(dashRes.data)
          if (tablesRes?.data?.items) {
            setTables(tablesRes.data.items)
          }
          if (ordersRes?.data?.items) {
            setOrders(ordersRes.data.items)
          }
          setRecentInvoices(invoicesRes.data.items)
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

    void loadDashboardData()

    return () => {
      mounted = false
    }
  }, [refreshKey])

  // Process orders needing action (pending, confirmed, preparing)
  const ordersNeedingAction = useMemo(() => {
    const activeOrders = orders.filter((o) =>
      ['pending', 'confirmed', 'preparing'].includes(o.status)
    )
    if (orderFilterTab === 'all') return activeOrders
    return activeOrders.filter((o) => o.order_type === orderFilterTab)
  }, [orders, orderFilterTab])

  // Calculate wait duration in minutes
  const getWaitMinutes = (createdAt: string): number => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
    return Math.max(1, diff)
  }

  const handleOpenReceipt = (invoice: AdminInvoiceItem) => {
    setSelectedInvoice(invoice)
    setReceiptModalOpen(true)
  }

  const handleQuickPrint = () => {
    if (recentInvoices.length) handleOpenReceipt(recentInvoices[0])
    else navigate('/admin/invoices')
  }

  if (isLoading && !data) {
    return <AdminLoading variant="block" label="Đang tải dữ liệu tổng quan..." />
  }

  if (error) {
    return (
      <div className="bg-white border border-[#e2e3e3] rounded-2xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3 font-bold">
          !
        </div>
        <h3 className="text-sm font-semibold text-[#171a17]">Không thể kết nối máy chủ</h3>
        <p className="text-xs text-[#787979] mt-1">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="elera-btn-primary mt-4 h-8 px-4"
        >
          Thử lại
        </button>
      </div>
    )
  }

  const pendingCount = data?.pending_orders_count ?? 0
  const preparingCount = data?.preparing_orders_count ?? 0
  const activeTablesCount = data?.open_visits_count ?? tables.filter((t) => t.current_visit_id).length
  const totalTablesCount = tables.filter(t => t.active).length
  const bookingsCount = data?.confirmed_bookings_today_count ?? 0

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Operational Header (Elera Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171a17] flex items-center gap-2.5">
            <span>Tổng quan vận hành</span>
            <span className="text-[11px] font-semibold text-[#3e6300] bg-[#e4f7c6] px-2 py-0.5 rounded-full">
              Bếp &amp; Quán
            </span>
          </h1>
          <p className="text-xs text-[#787979] font-medium mt-1">
            {todayFormatted}
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <div className="elera-btn-secondary gap-1.5 shadow-2xs">
            <CalendarDays className="w-3.5 h-3.5 text-[#787979]" />
            <span>Hôm nay</span>
          </div>
          <Link
            to="/admin/orders"
            className="elera-btn-primary gap-1.5 shadow-xs"
          >
            <span>Xem hàng đợi</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* 2. Unified Stats Strip (Elera .stats-strip 20px radius) */}
      <div className="elera-stats-strip">
        {/* Stat 1: Đơn chờ */}
        <div className="elera-stat-tile">
          <div className="elera-stat-icon bg-[#faf1dc] text-[#b57a0b] border-[#f2deae]">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#787979] font-medium leading-none">Đơn chờ</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#171a17] tracking-tight font-mono">
                {pendingCount}
              </span>
              <span className="elera-stat-badge amber">
                Cần duyệt
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#8a8f89]">Thời gian chờ TB: ~3p</span>
              <Link
                to="/admin/orders?status=pending"
                className="font-medium text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-0.5"
              >
                <span>Xử lý</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stat 2: Đang chế biến */}
        <div className="elera-stat-tile">
          <div className="elera-stat-icon bg-[#e8f2fe] text-[#1e60d5] border-[#c8e0fc]">
            <UtensilsCrossed className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#787979] font-medium leading-none">Đang chế biến</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#171a17] tracking-tight font-mono">
                {preparingCount}
              </span>
              <span className="elera-stat-badge neutral">
                Tại bếp
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#8a8f89]">Bếp đang hoạt động</span>
              <Link
                to="/admin/orders?status=preparing"
                className="font-medium text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-0.5"
              >
                <span>Xem bếp</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stat 3: Bàn phục vụ */}
        <div className="elera-stat-tile">
          <div className="elera-stat-icon bg-[#e4f7c6] text-[#3e6300] border-[#c4e899]">
            <Armchair className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#787979] font-medium leading-none">Bàn đang phục vụ</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#171a17] tracking-tight font-mono">
                {activeTablesCount}<span className="text-sm font-normal text-[#8a8f89]">/{totalTablesCount}</span>
              </span>
              <span className="elera-stat-badge success">
                {totalTablesCount ? Math.round((activeTablesCount / totalTablesCount) * 100) : 0}% công suất
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#8a8f89]">Còn {totalTablesCount - activeTablesCount} bàn trống</span>
              <Link
                to="/admin/tables"
                className="font-medium text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-0.5"
              >
                <span>Sơ đồ</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* Stat 4: Đặt bàn hôm nay */}
        <div className="elera-stat-tile">
          <div className="elera-stat-icon bg-[#f3e8ff] text-[#7e22ce] border-[#e1c5fc]">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#787979] font-medium leading-none">Đặt bàn hôm nay</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#171a17] tracking-tight font-mono">
                {bookingsCount}
              </span>
              <span className="elera-stat-badge neutral">
                Đã xác nhận
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#8a8f89]">Đặt chỗ đã xác nhận hôm nay</span>
              <Link
                to="/admin/reservations"
                className="font-medium text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-0.5"
              >
                <span>Chi tiết</span>
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Operational Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN: 2/3 width on large screens */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top: "Đơn cần xử lý" */}
          <div className="bg-white border border-[#e2e3e3] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[#e2e3e3] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
              <div>
                <h2 className="text-sm font-bold text-[#171a17]">
                  Đơn cần xử lý
                </h2>
                <p className="text-[11px] text-[#787979]">
                  Danh sách đơn mới tạo hoặc đang chế biến cần giám sát
                </p>
              </div>

              {/* Scope Pills */}
              <div className="elera-scope-tabs self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setOrderFilterTab('all')}
                  className={`elera-pill-scope ${orderFilterTab === 'all' ? 'selected' : ''}`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setOrderFilterTab('dine_in')}
                  className={`elera-pill-scope ${orderFilterTab === 'dine_in' ? 'selected' : ''}`}
                >
                  Tại bàn
                </button>
                <button
                  type="button"
                  onClick={() => setOrderFilterTab('delivery')}
                  className={`elera-pill-scope ${orderFilterTab === 'delivery' ? 'selected' : ''}`}
                >
                  Giao hàng
                </button>
                <button
                  type="button"
                  onClick={() => setOrderFilterTab('takeaway')}
                  className={`elera-pill-scope ${orderFilterTab === 'takeaway' ? 'selected' : ''}`}
                >
                  Mang đi
                </button>
              </div>
            </div>

            {ordersNeedingAction.length === 0 ? (
              <div className="py-12 text-center text-[#787979] bg-[#faf9f7]/50">
                <div className="w-9 h-9 rounded-full bg-[#e4f7c6] text-[#3e6300] flex items-center justify-center mx-auto mb-2">
                  ✓
                </div>
                <p className="text-xs font-medium text-[#171a17]">
                  Hàng đợi sạch sẽ! Không có đơn nào cần xử lý ngay
                </p>
                <p className="text-[11px] text-[#787979] mt-0.5">
                  Các đơn hàng mới sẽ tự động xuất hiện tại đây
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#e2e3e3] text-[11px] font-semibold text-[#787979] uppercase bg-[#faf9f7]">
                      <th className="py-2.5 px-4 font-medium">Mã đơn</th>
                      <th className="py-2.5 px-4 font-medium">Vị trí / Khách</th>
                      <th className="py-2.5 px-4 font-medium">Chi tiết</th>
                      <th className="py-2.5 px-4 font-medium">Tổng tiền</th>
                      <th className="py-2.5 px-4 font-medium">Trạng thái</th>
                      <th className="py-2.5 px-4 font-medium text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e3e3] text-[#5c5e63]">
                    {ordersNeedingAction.slice(0, 7).map((order) => {
                      const isPending = order.status === 'pending'
                      const waitMins = getWaitMinutes(order.created_at)

                      return (
                        <tr key={order.id} className="hover:bg-[#faf9f7] transition">
                          <td className="py-3 px-4">
                            <span className="font-mono font-bold text-[#171a17] block">
                              {order.code}
                            </span>
                            <span className="text-[10px] text-[#787979] font-mono">
                              {new Date(order.created_at).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-[#171a17] block">
                              {order.order_type === 'dine_in'
                                ? order.table_name_snapshot || 'Bàn chưa đặt'
                                : order.customer_name || 'Khách online'}
                            </span>
                            <span className="text-[10px] text-[#787979]">
                              {order.order_type === 'dine_in'
                                ? 'Tại quán'
                                : order.order_type === 'takeaway'
                                ? order.customer_phone || 'Mang đi'
                                : order.customer_phone || 'Giao hàng'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-[#171a17] font-medium">
                              {order.item_count} món
                            </span>
                            {order.note && (
                              <p className="text-[10px] text-[#787979] truncate max-w-[140px]">
                                {order.note}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono font-semibold text-[#171a17]">
                            {order.total_vnd.toLocaleString('vi-VN')}đ
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`elera-time-pill ${
                                isPending
                                  ? waitMins > 15
                                    ? 'red'
                                    : 'amber'
                                  : 'neutral'
                              }`}
                            >
                              {isPending ? (
                                <>
                                  <Clock className="w-3 h-3" />
                                  <span>Chờ xác nhận</span>
                                </>
                              ) : (
                                <>
                                  <Flame className="w-3 h-3 text-orange-500" />
                                  <span>Đang nấu</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              to={`/admin/orders?orderId=${order.id}`}
                              className="elera-btn-accent h-7 px-3 text-xs shadow-xs"
                            >
                              <span>Xử lý</span>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-3 border-t border-[#e2e3e3] bg-[#faf9f7]/40 text-center">
              <Link
                to="/admin/orders"
                className="text-xs font-semibold text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-1"
              >
                <span>Xem toàn bộ danh sách đơn hàng</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Bottom: "Sơ đồ bàn" */}
          <div className="bg-white border border-[#e2e3e3] rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[#e2e3e3] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[#171a17]">
                  Sơ đồ bàn
                </h2>
                <p className="text-[11px] text-[#787979]">
                  Tình trạng trực tiếp tại các tầng &amp; khu vực phục vụ
                </p>
              </div>

              {/* Status legend dots */}
              <div className="flex items-center space-x-3 text-[11px] text-[#787979]">
                <span className="inline-flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#7cd56e]" />
                  <span>Trống</span>
                </span>
                <span className="inline-flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#2b2e2c]" />
                  <span>Đang phục vụ</span>
                </span>
                <span className="inline-flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Đã đặt</span>
                </span>
                <span className="inline-flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  <span>Khóa</span>
                </span>
              </div>
            </div>

            {/* Grid of Tables */}
            <div className="p-4 bg-[#faf9f7]">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {tables.map((table) => {
                  const isServing = Boolean(table.current_visit_id)
                  const isInactive = !table.active

                  return (
                    <div
                      key={table.id}
                      onClick={() => navigate(`/admin/tables`)}
                      className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                        isInactive
                          ? 'bg-[#edece9] border-[#e2e3e3] opacity-60'
                          : isServing
                          ? 'bg-[#e4f7c6]/40 border-[#7cd56e]/50 shadow-2xs hover:border-[#7cd56e]'
                          : 'bg-white border-[#e2e3e3] hover:border-[#7cd56e] shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#171a17] font-mono">
                          {table.code}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isInactive
                              ? 'bg-slate-400'
                              : isServing
                              ? 'bg-[#7cd56e] animate-pulse'
                              : 'bg-[#7cd56e]'
                          }`}
                        />
                      </div>
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-[#171a17] truncate">
                          {table.name}
                        </p>
                        <p className="text-[9.5px] text-[#787979]">
                          {isServing
                            ? `${table.unpaid_orders_count || 1} đơn đang phục vụ`
                            : isInactive
                            ? 'Tạm ngưng'
                            : 'Sẵn sàng đón khách'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="p-3 border-t border-[#e2e3e3] bg-white flex items-center justify-between text-xs">
              <span className="text-[#787979] text-[11px]">
                Nhấn vào bàn để xem chi tiết gọi món hoặc mở phiên
              </span>
              <Link
                to="/admin/tables"
                className="font-semibold text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-1"
              >
                <span>Quản lý sơ đồ bàn</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 1/3 width on large screens */}
        <div className="space-y-6">
          {/* Top: "Thao tác nhanh" (Elera Sleek Buttons) */}
          <div className="bg-white border border-[#e2e3e3] rounded-2xl p-4.5 shadow-sm">
            <h2 className="text-sm font-bold text-[#171a17] mb-3 flex items-center justify-between">
              <span>Thao tác nhanh</span>
              <Sparkles className="w-4 h-4 text-[#7cd56e]" />
            </h2>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => navigate('/admin/orders?action=new&type=dine_in')}
                className="elera-btn-secondary w-full justify-between h-10 px-3.5 rounded-xl border border-[#e2e3e3] bg-white text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="elera-icon-btn w-6 h-6 rounded-lg text-[#171a17]">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                  <span>Tạo đơn tại bàn</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#787979]" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/orders?action=new&type=delivery')}
                className="elera-btn-secondary w-full justify-between h-10 px-3.5 rounded-xl border border-[#e2e3e3] bg-white text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="elera-icon-btn w-6 h-6 rounded-lg text-[#171a17]">
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </div>
                  <span>Tạo đơn giao hàng</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#787979]" />
              </button>

              <button
                type="button"
                onClick={handleQuickPrint}
                className="elera-btn-secondary w-full justify-between h-10 px-3.5 rounded-xl border border-[#e2e3e3] bg-white text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="elera-icon-btn w-6 h-6 rounded-lg text-[#171a17]">
                    <Printer className="w-3.5 h-3.5" />
                  </div>
                  <span>Xuất hóa đơn</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#787979]" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/menu')}
                className="elera-btn-secondary w-full justify-between h-10 px-3.5 rounded-xl border border-[#e2e3e3] bg-white text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="elera-icon-btn w-6 h-6 rounded-lg text-[#171a17]">
                    <UtensilsCrossed className="w-3.5 h-3.5" />
                  </div>
                  <span>Thêm món mới</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#787979]" />
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/tables')}
                className="elera-btn-secondary w-full justify-between h-10 px-3.5 rounded-xl border border-[#e2e3e3] bg-white text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <div className="elera-icon-btn w-6 h-6 rounded-lg text-[#171a17]">
                    <Armchair className="w-3.5 h-3.5" />
                  </div>
                  <span>Thêm bàn mới</span>
                </div>
                <ChevronRight className="w-4 h-4 text-[#787979]" />
              </button>
            </div>
          </div>

          {/* Bottom: "Hóa đơn gần đây" */}
          <div className="bg-white border border-[#e2e3e3] rounded-2xl p-4.5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-bold text-[#171a17]">
                  Hóa đơn gần đây
                </h2>
                <p className="text-[11px] text-[#787979]">
                  Các bill vừa thanh toán tại quầy &amp; online
                </p>
              </div>
              <Link
                to="/admin/invoices"
                className="text-xs font-semibold text-[#171a17] hover:text-[#7cd56e] inline-flex items-center gap-0.5"
              >
                <span>Tất cả</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="py-8 text-center text-[#787979] text-xs bg-[#faf9f7] rounded-xl">
                Chưa có hóa đơn nào hoàn tất trong ca
              </div>
            ) : (
              <div className="divide-y divide-[#e2e3e3]">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-2.5 flex items-center justify-between text-xs hover:bg-[#faf9f7] px-1.5 rounded-lg transition"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-mono font-bold text-[#171a17]">
                          {inv.code}
                        </span>
                        <span className="text-[10px] text-[#787979]">
                          · {inv.table_name || inv.customer_name || 'Khách'}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#787979]">
                        {new Date(inv.paid_at).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-semibold text-[#171a17] text-xs">
                        {inv.total_vnd.toLocaleString('vi-VN')}đ
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenReceipt(inv)}
                        className="elera-icon-btn w-6 h-6 rounded-md"
                        title="Xem bill & in lại"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <ReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        invoice={selectedInvoice}
      />
    </div>
  )
}
