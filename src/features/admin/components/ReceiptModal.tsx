import { useEffect, useRef, useState, type FC } from 'react'
import { Printer, X, CheckCircle2 } from 'lucide-react'
import { adminApi } from '@/shared/lib/api/client'
import type { AdminRestaurantSettings, AdminInvoiceItem, AdminOrderDetail } from '../types'

export interface ReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  invoice?: AdminInvoiceItem | null
  orderDetail?: AdminOrderDetail | null
}

export const ReceiptModal: FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  invoice,
  orderDetail,
}) => {
  const paperRef = useRef<HTMLDivElement>(null)
  const [settings, setSettings] = useState<AdminRestaurantSettings | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  useEffect(() => {
    if (!isOpen) return
    let active = true
    setSettings(null); setSettingsError(null)
    void adminApi.get<AdminRestaurantSettings>('/settings').then(res => { if (active) setSettings(res.data) })
      .catch(() => { if (active) setSettingsError('Không thể tải thông tin quán để in. Vui lòng mở lại hóa đơn.') })
    return () => { active = false }
  }, [isOpen])
  if (!isOpen || (!invoice && !orderDetail)) return null

  // Normalize data between invoice and orderDetail
  const code = invoice?.code || orderDetail?.order.code || 'HD-000'
  const orderType = invoice ? invoice.order_type : orderDetail?.order.order_type
  const isDineIn = orderType === 'dine_in'
  const isTakeaway = orderType === 'takeaway'
  const targetName = invoice
    ? isDineIn ? (invoice.table_name || 'Bàn chưa đặt tên') : (invoice.customer_name || 'Khách hàng')
    : isDineIn ? (orderDetail?.order.table_name_snapshot || 'Bàn chưa đặt tên') : (orderDetail?.order.customer_name || 'Khách hàng')
  const phone = invoice?.customer_phone || orderDetail?.order.customer_phone
  const createdAt = invoice?.paid_at || invoice?.created_at || orderDetail?.order.created_at || new Date().toISOString()
  const subtotal = invoice ? invoice.subtotal_vnd : (orderDetail?.order.subtotal_vnd || 0)
  const shippingFee = invoice ? (invoice.shipping_fee_vnd || 0) : (orderDetail?.order.shipping_fee_vnd || 0)
  const discount = invoice?.discount_vnd || 0
  const total = invoice ? invoice.total_vnd : (orderDetail?.order.total_vnd || 0)
  const method = invoice?.payment_method || orderDetail?.order.payment_method
  const paymentMethod = method === 'cash' ? 'Tiền mặt' : method === 'bank_transfer' ? 'Chuyển khoản' : 'Chưa ghi nhận phương thức'
  const paid = Boolean(invoice) || orderDetail?.order.payment_status === 'paid'
  const paymentLabel = paid ? `Đã thanh toán (${paymentMethod})` : orderDetail?.order.payment_status === 'refunded' ? 'Đã hoàn tiền' : 'Chưa thanh toán'

  const items = invoice?.items || (orderDetail?.items.map((i) => ({
    name: i.name_snapshot,
    quantity: i.quantity,
    unit_price_vnd: i.price_vnd,
    line_total_vnd: i.subtotal_vnd,
  })) || [])

  const handlePrint = () => {
    if (!paperRef.current || !settings) return
    const frame = document.createElement('iframe')
    frame.title = 'In phiếu thanh toán'
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc || !frame.contentWindow) { frame.remove(); return }
    doc.title = code
    const style = doc.createElement('style')
    style.textContent = 'body{font:12px sans-serif;max-width:80mm;margin:auto;padding:8mm}h2,h3{text-align:center}table{width:100%;border-collapse:collapse}td,th{padding:6px 2px;text-align:left}p{margin:6px 0}.flex{display:flex;justify-content:space-between}.text-center{text-align:center}button{display:none}'
    doc.head.appendChild(style)
    doc.body.appendChild(paperRef.current.cloneNode(true))
    frame.contentWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 60000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            <Printer className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Chi tiết Hóa đơn & Xuất Bill</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Paper View */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-100/60">
          <div
            id="printable-receipt"
            ref={paperRef}
            className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs font-sans text-slate-800 text-xs max-w-sm mx-auto"
          >
            {/* Store Header */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <h2 className="text-base font-bold tracking-tight text-slate-900 uppercase">
                {settings?.name || 'Đang tải thông tin quán...'}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{settings?.address}</p>
              <p className="text-[11px] text-slate-500">{settings?.phone ? `Hotline: ${settings.phone}` : ''}</p>
              <div className="mt-2 inline-block px-2.5 py-0.5 bg-slate-100 rounded text-[11px] font-semibold tracking-wider text-slate-700 uppercase">
                {paid ? 'Phiếu thanh toán' : 'Phiếu tạm tính'}
              </div>
            </div>

            {/* Meta Info */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Mã hóa đơn:</span>
                <span className="font-mono font-semibold text-slate-900">{code}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Thời gian:</span>
                <span>{new Date(createdAt).toLocaleString('vi-VN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isDineIn ? 'Bàn phục vụ:' : 'Khách nhận:'}</span>
                <span className="font-semibold text-slate-900">{targetName}</span>
              </div>
              {phone && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Số điện thoại:</span>
                  <span>{phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Hình thức:</span>
                <span>
                  {isDineIn ? 'Tại quán' : isTakeaway ? 'Mang đi' : 'Giao hàng online'}
                </span>
              </div>
              {isTakeaway && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Giờ nhận:</span>
                  <span>{orderDetail?.order.pickup_time || 'Càng sớm càng tốt'}</span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="py-3 border-b border-dashed border-slate-300">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-slate-400 text-[10px] uppercase font-semibold border-b border-slate-100">
                    <th className="pb-1.5 font-medium">Món</th>
                    <th className="pb-1.5 text-center font-medium">SL</th>
                    <th className="pb-1.5 text-right font-medium">Đơn giá</th>
                    <th className="pb-1.5 text-right font-medium">T.Tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px]">
                  {items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1.5 font-medium text-slate-900 pr-1">{item.name}</td>
                      <td className="py-1.5 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-1.5 text-right text-slate-500 font-mono">
                        {item.unit_price_vnd.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-1.5 text-right font-medium text-slate-900 font-mono">
                        {item.line_total_vnd.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pricing Breakdown */}
            <div className="py-3 border-b border-dashed border-slate-300 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Tạm tính:</span>
                <span className="font-mono">{subtotal.toLocaleString('vi-VN')}đ</span>
              </div>
              {shippingFee > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Phí giao hàng:</span>
                  <span className="font-mono">{shippingFee.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Giảm giá:</span>
                  <span className="font-mono">-{discount.toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              <div className="flex justify-between pt-1.5 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>TỔNG CỘNG:</span>
                <span className="font-mono text-blue-600">{total.toLocaleString('vi-VN')}đ</span>
              </div>
            </div>

            {/* Payment & Footer */}
            <div className="pt-3 text-center space-y-1">
              <div className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px] font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{paymentLabel}</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-2">
                Cảm ơn quý khách và hẹn gặp lại!
              </p>

            </div>
          </div>
        </div>

        {settingsError && <p role="alert" className="text-rose-600 p-3">{settingsError}</p>}
        {/* Modal Actions */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={!settings}
            onClick={handlePrint}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition shadow-xs"
          >
            <Printer className="w-4 h-4" />
            <span>In hóa đơn</span>
          </button>
        </div>
      </div>
    </div>
  )
}
