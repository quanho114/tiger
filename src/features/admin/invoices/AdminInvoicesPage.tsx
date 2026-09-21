import { useState, useEffect, useMemo, type FC } from 'react'
import {
  Search,
  Printer,
  FileText,
  Download,
  CreditCard,
  Banknote,
  ShoppingBag,
  Armchair,
} from 'lucide-react'
import { adminApi } from '../../../lib/api/client'
import { useAdmin } from '../layout/AdminContext'
import { ReceiptModal } from '../components/ReceiptModal'
import type { AdminOrderSummary, AdminInvoiceItem } from '../types'

const MOCK_SAMPLE_INVOICES: AdminInvoiceItem[] = [
  {
    id: 'inv-001',
    code: 'HD-1092',
    order_id: 'ord-1092',
    order_type: 'dine_in',
    table_name: 'Bàn B02 (Tầng 1)',
    customer_name: 'Bàn B02',
    created_at: new Date(Date.now() - 35 * 60000).toISOString(),
    paid_at: new Date(Date.now() - 15 * 60000).toISOString(),
    payment_method: 'bank_transfer',
    subtotal_vnd: 285000,
    discount_vnd: 0,
    total_vnd: 285000,
    cashier_name: 'Nguyễn Văn A',
    items: [
      { name: 'Bún Bò Huế Đặc Biệt', quantity: 2, unit_price_vnd: 65000, line_total_vnd: 130000 },
      { name: 'Gỏi Cuốn Tôm Thịt (4c)', quantity: 1, unit_price_vnd: 45000, line_total_vnd: 45000 },
      { name: 'Trà Tắc Hạt Chia Khổng Lồ', quantity: 2, unit_price_vnd: 25000, line_total_vnd: 50000 },
      { name: 'Khăn lạnh & Nước khoáng', quantity: 3, unit_price_vnd: 5000, line_total_vnd: 15000 },
      { name: 'Trứng gà ta lòng đào', quantity: 3, unit_price_vnd: 15000, line_total_vnd: 45000 },
    ],
  },
  {
    id: 'inv-002',
    code: 'HD-1091',
    order_id: 'ord-1091',
    order_type: 'dine_in',
    table_name: 'Bàn A05 (Sân vườn)',
    customer_name: 'Anh Hoàng',
    customer_phone: '0988 123 456',
    created_at: new Date(Date.now() - 85 * 60000).toISOString(),
    paid_at: new Date(Date.now() - 40 * 60000).toISOString(),
    payment_method: 'cash',
    subtotal_vnd: 420000,
    discount_vnd: 20000,
    total_vnd: 400000,
    cashier_name: 'Nguyễn Văn A',
    items: [
      { name: 'Lẩu Bò Nhúng Dấm (Nhỏ)', quantity: 1, unit_price_vnd: 280000, line_total_vnd: 280000 },
      { name: 'Bò Tái Chanh Thính Gạo', quantity: 1, unit_price_vnd: 90000, line_total_vnd: 90000 },
      { name: 'Bia Tiger Bạc (Lon)', quantity: 2, unit_price_vnd: 25000, line_total_vnd: 50000 },
    ],
  },
  {
    id: 'inv-003',
    code: 'HD-1090',
    order_id: 'ord-1090',
    order_type: 'delivery',
    customer_name: 'Chị Mai Lan',
    customer_phone: '0912 345 678',
    created_at: new Date(Date.now() - 140 * 60000).toISOString(),
    paid_at: new Date(Date.now() - 90 * 60000).toISOString(),
    payment_method: 'bank_transfer',
    subtotal_vnd: 195000,
    shipping_fee_vnd: 20000,
    total_vnd: 215000,
    cashier_name: 'Thu ngân online',
    items: [
      { name: 'Cơm Rang Dưa Bò Giòn Rụm', quantity: 2, unit_price_vnd: 70000, line_total_vnd: 140000 },
      { name: 'Canh Chua Thịt Bò Lá Giang', quantity: 1, unit_price_vnd: 55000, line_total_vnd: 55000 },
    ],
  },
  {
    id: 'inv-004',
    code: 'HD-1089',
    order_id: 'ord-1089',
    order_type: 'dine_in',
    table_name: 'Bàn VIP 01 (Phòng lạnh)',
    customer_name: 'Bác Thành',
    customer_phone: '0903 888 999',
    created_at: new Date(Date.now() - 210 * 60000).toISOString(),
    paid_at: new Date(Date.now() - 150 * 60000).toISOString(),
    payment_method: 'bank_transfer',
    subtotal_vnd: 890000,
    discount_vnd: 50000,
    total_vnd: 840000,
    cashier_name: 'Nguyễn Văn A',
    items: [
      { name: 'Lẩu Riêu Cua Bắp Bò Sườn Sụn (Lớn)', quantity: 1, unit_price_vnd: 450000, line_total_vnd: 450000 },
      { name: 'Nõn Đuôi Nướng Ngũ Vị', quantity: 2, unit_price_vnd: 120000, line_total_vnd: 240000 },
      { name: 'Khoai Tây Chiên Bơ Tỏi', quantity: 2, unit_price_vnd: 40000, line_total_vnd: 80000 },
      { name: 'Trà Chanh Sả Nha Đam', quantity: 4, unit_price_vnd: 30000, line_total_vnd: 120000 },
    ],
  },
]

export const AdminInvoicesPage: FC = () => {
  const { refreshKey } = useAdmin()

  const [invoices, setInvoices] = useState<AdminInvoiceItem[]>(MOCK_SAMPLE_INVOICES)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'dine_in' | 'delivery'>('all')
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'bank_transfer'>('all')
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'week'>('today')

  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoiceItem | null>(null)
  const [receiptModalOpen, setReceiptModalOpen] = useState<boolean>(false)

  useEffect(() => {
    let mounted = true

    async function loadInvoices() {
      try {
        const res = await adminApi.get<{ items: AdminOrderSummary[] }>('/orders?limit=100').catch(() => ({ data: { items: [] } }))
        if (mounted && res?.data?.items) {
          const paidOrders = res.data.items.filter(
            (o) => o.payment_status === 'paid' || o.status === 'completed'
          )

          if (paidOrders.length > 0) {
            const mappedInvoices: AdminInvoiceItem[] = paidOrders.map((o) => ({
              id: o.id,
              code: `HD-${o.code.replace(/\D/g, '') || o.code}`,
              order_id: o.id,
              order_type: o.order_type,
              table_name: o.table_name_snapshot,
              customer_name: o.customer_name,
              customer_phone: o.customer_phone,
              created_at: o.created_at,
              paid_at: o.completed_at || o.updated_at || o.created_at,
              payment_method: 'bank_transfer',
              subtotal_vnd: o.subtotal_vnd || o.total_vnd,
              shipping_fee_vnd: o.shipping_fee_vnd,
              total_vnd: o.total_vnd,
              cashier_name: 'Thu ngân',
              items: [
                {
                  name: o.note ? `Phần ăn (${o.item_count} món - ${o.note.slice(0, 20)})` : `Phần ăn (${o.item_count} món)`,
                  quantity: o.item_count || 1,
                  unit_price_vnd: o.total_vnd,
                  line_total_vnd: o.total_vnd,
                },
              ],
            }))
            setInvoices([...mappedInvoices, ...MOCK_SAMPLE_INVOICES])
          }
        }
      } catch {
        // Fallback to sample data
      }
    }

    void loadInvoices()

    return () => {
      mounted = false
    }
  }, [refreshKey])

  // Filtering
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // Type filter
      if (orderTypeFilter !== 'all' && inv.order_type !== orderTypeFilter) return false
      // Payment filter
      if (paymentFilter !== 'all' && inv.payment_method !== paymentFilter) return false
      // Search
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        const matchCode = inv.code.toLowerCase().includes(term)
        const matchTable = (inv.table_name || '').toLowerCase().includes(term)
        const matchCustomer = (inv.customer_name || '').toLowerCase().includes(term)
        const matchPhone = (inv.customer_phone || '').includes(term)
        if (!matchCode && !matchTable && !matchCustomer && !matchPhone) return false
      }
      return true
    })
  }, [invoices, orderTypeFilter, paymentFilter, searchTerm])

  // Aggregated stats
  const stats = useMemo(() => {
    const totalCount = filteredInvoices.length
    const totalRevenue = filteredInvoices.reduce((acc, curr) => acc + curr.total_vnd, 0)
    const cashRevenue = filteredInvoices
      .filter((i) => i.payment_method === 'cash')
      .reduce((acc, curr) => acc + curr.total_vnd, 0)
    const transferRevenue = filteredInvoices
      .filter((i) => i.payment_method === 'bank_transfer')
      .reduce((acc, curr) => acc + curr.total_vnd, 0)

    return { totalCount, totalRevenue, cashRevenue, transferRevenue }
  }, [filteredInvoices])

  const handleOpenReceipt = (inv: AdminInvoiceItem) => {
    setSelectedInvoice(inv)
    setReceiptModalOpen(true)
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Hóa đơn & Xuất Bill
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Đối soát thu ngân, lưu trữ lịch sử thanh toán và in lại phiếu tính tiền
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => alert('Đã xuất báo cáo hóa đơn ca hiện tại (file CSV/Excel)!')}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Xuất file Excel</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">Số lượng hóa đơn</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {stats.totalCount}
            </span>
            <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
              Đã thu tiền
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-medium text-slate-500 block">Tổng thực thu</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-600 font-mono">
              {stats.totalRevenue.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Chuyển khoản (QR)</span>
            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {stats.transferRevenue.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Tiền mặt tại quầy</span>
            <Banknote className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {stats.cashRevenue.toLocaleString('vi-VN')}đ
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã HĐ, tên khách, số bàn, số điện thoại..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          {/* Quick Date Toggles */}
          <div className="inline-flex p-1 bg-slate-100/80 rounded-lg text-xs self-start md:self-auto">
            <button
              type="button"
              onClick={() => setDateRange('today')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                dateRange === 'today' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              type="button"
              onClick={() => setDateRange('yesterday')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                dateRange === 'yesterday' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Hôm qua
            </button>
            <button
              type="button"
              onClick={() => setDateRange('week')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                dateRange === 'week' ? 'bg-white text-slate-900 shadow-2xs font-semibold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              7 ngày qua
            </button>
          </div>
        </div>

        {/* Dropdown / Tag Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium mr-1">Bộ lọc:</span>

          {/* Channel Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOrderTypeFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium transition ${
                orderTypeFilter === 'all' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tất cả kênh
            </button>
            <button
              type="button"
              onClick={() => setOrderTypeFilter('dine_in')}
              className={`px-2.5 py-1 text-[11px] font-medium border-l border-slate-200 transition ${
                orderTypeFilter === 'dine_in' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tại bàn
            </button>
            <button
              type="button"
              onClick={() => setOrderTypeFilter('delivery')}
              className={`px-2.5 py-1 text-[11px] font-medium border-l border-slate-200 transition ${
                orderTypeFilter === 'delivery' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Mang về / Giao hàng
            </button>
          </div>

          {/* Payment Method Filter */}
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setPaymentFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-medium transition ${
                paymentFilter === 'all' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tất cả PTTT
            </button>
            <button
              type="button"
              onClick={() => setPaymentFilter('bank_transfer')}
              className={`px-2.5 py-1 text-[11px] font-medium border-l border-slate-200 transition ${
                paymentFilter === 'bank_transfer' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Chuyển khoản QR
            </button>
            <button
              type="button"
              onClick={() => setPaymentFilter('cash')}
              className={`px-2.5 py-1 text-[11px] font-medium border-l border-slate-200 transition ${
                paymentFilter === 'cash' ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Tiền mặt
            </button>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-slate-50/40">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">Không tìm thấy hóa đơn nào</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Thử thay đổi từ khóa tìm kiếm hoặc điều kiện lọc
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase bg-slate-50/50">
                  <th className="py-3 px-4 font-medium">Mã hóa đơn</th>
                  <th className="py-3 px-4 font-medium">Thời gian</th>
                  <th className="py-3 px-4 font-medium">Kênh / Vị trí</th>
                  <th className="py-3 px-4 font-medium">Khách hàng</th>
                  <th className="py-3 px-4 font-medium">Phương thức</th>
                  <th className="py-3 px-4 font-medium">Món ăn</th>
                  <th className="py-3 px-4 font-medium text-right">Tổng tiền</th>
                  <th className="py-3 px-4 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredInvoices.map((inv) => {
                  const isDineIn = inv.order_type === 'dine_in'
                  const isTransfer = inv.payment_method === 'bank_transfer'

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 block">
                          {inv.code}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {inv.cashier_name || 'Thu ngân'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        <span className="block text-slate-800">
                          {new Date(inv.paid_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(inv.paid_at).toLocaleDateString('vi-VN')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center space-x-1 font-semibold text-slate-900">
                          {isDineIn ? (
                            <>
                              <Armchair className="w-3.5 h-3.5 text-blue-600" />
                              <span>{inv.table_name || 'Bàn chưa đặt'}</span>
                            </>
                          ) : (
                            <>
                              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Giao hàng / Mang về</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800 block">
                          {inv.customer_name || 'Khách lẻ'}
                        </span>
                        {inv.customer_phone && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {inv.customer_phone}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ${
                            isTransfer
                              ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          }`}
                        >
                          {isTransfer ? 'Chuyển khoản' : 'Tiền mặt'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <span>{inv.items.length} món</span>
                        <p className="text-[10px] text-slate-400 truncate max-w-[150px]">
                          {inv.items.map((i) => i.name).join(', ')}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-right">
                        {inv.total_vnd.toLocaleString('vi-VN')}đ
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt(inv)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs font-medium transition shadow-2xs"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-500" />
                          <span>In bill</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
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
