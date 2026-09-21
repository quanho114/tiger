import { useState, type FC } from 'react'
import {
  X,
  CreditCard,
  Banknote,
  CheckCircle2,
  AlertCircle,
  Armchair,
} from 'lucide-react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import type { AdminTableItem, TableVisitDetail, PaymentMethod } from '../types'

interface AdminTableSettleModalProps {
  table: AdminTableItem
  visitDetail: TableVisitDetail | null
  isLoadingVisit: boolean
  onClose: () => void
  onVisitUpdated: () => void
  onReloadVisit: (visitId: string) => Promise<void>
}

export const AdminTableSettleModal: FC<AdminTableSettleModalProps> = ({
  table,
  visitDetail,
  isLoadingVisit,
  onClose,
  onVisitUpdated,
  onReloadVisit,
}) => {
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash')
  const [isSettling, setIsSettling] = useState<boolean>(false)
  const [isClosingVisit, setIsClosingVisit] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSettleVisit = async () => {
    if (!visitDetail) return
    const unpaidOrders = visitDetail.orders.filter(
      (o) => o.payment_status === 'unpaid' && !['cancelled', 'rejected'].includes(o.status)
    )

    if (unpaidOrders.length === 0) {
      setError('Không có đơn hàng nào cần thanh toán.')
      return
    }

    setIsSettling(true)
    setError(null)
    setSuccess(null)

    try {
      const idempotencyKey = crypto.randomUUID()
      await adminApi.post(
        `/visits/${visitDetail.visit.id}/settle`,
        {
          expected_version: visitDetail.visit.version,
          expected_orders: unpaidOrders.map((o) => ({ id: o.id, version: o.version })),
          method: settleMethod,
          payment_method: settleMethod,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      )

      setSuccess(`Đã thanh toán toàn bộ ${unpaidOrders.length} đơn hàng thành công!`)
      await onReloadVisit(visitDetail.visit.id)
      onVisitUpdated()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ORDER_LIST_MISMATCH') {
          setError(
            'Danh sách đơn hàng đã thay đổi (có thể vừa có món gọi thêm hoặc trạng thái đơn bị đổi). Vui lòng kiểm tra lại danh sách trước khi thanh toán.'
          )
          await onReloadVisit(visitDetail.visit.id)
        } else if (err.code === 'VERSION_CONFLICT') {
          setError('Xung đột phiên bản: Phiên phục vụ đã được cập nhật từ phiên làm việc khác.')
          await onReloadVisit(visitDetail.visit.id)
        } else {
          setError(err.message)
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi khi thanh toán phiên')
      }
    } finally {
      setIsSettling(false)
    }
  }

  const handleCloseVisit = async () => {
    if (!visitDetail) return
    setIsClosingVisit(true)
    setError(null)
    setSuccess(null)

    try {
      await adminApi.post(`/visits/${visitDetail.visit.id}/close`, {
        expected_version: visitDetail.visit.version,
      })

      onVisitUpdated()
      onClose()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'VISIT_HAS_ACTIVE_ORDERS') {
          setError('Không thể đóng bàn: Còn đơn hàng chưa hoàn thành hoặc chưa hủy.')
        } else if (err.code === 'VISIT_HAS_UNPAID_ORDERS') {
          setError('Không thể đóng bàn: Còn đơn hàng chưa thanh toán.')
        } else if (err.code === 'VISIT_HAS_PENDING_REFUNDS') {
          setError(
            'Không thể đóng bàn: Còn đơn đã thanh toán bị hủy nhưng chưa hoàn tất thủ tục hoàn tiền.'
          )
        } else if (err.code === 'VERSION_CONFLICT') {
          setError('Xung đột phiên bản: Trạng thái phiên đã thay đổi. Đang tải lại.')
          await onReloadVisit(visitDetail.visit.id)
        } else {
          setError(err.message)
        }
      } else {
        setError(err instanceof Error ? err.message : 'Lỗi khi đóng phiên bàn')
      }
    } finally {
      setIsClosingVisit(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
              <Armchair className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-slate-900">
                  {table.name} ({table.code})
                </h2>
                {visitDetail && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-mono bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                    v{visitDetail.visit.version}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Chi tiết phiên phục vụ & thanh toán toàn bộ (Dine-in)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {isLoadingVisit && !visitDetail && (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs">Đang tải thông tin phiên bàn...</p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {visitDetail && (
            <>
              {/* Summary KPIs */}
              <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">Trạng thái</span>
                  <span className="text-xs font-bold text-slate-900 uppercase mt-0.5 inline-flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>{visitDetail.visit.status === 'active' ? 'Đang phục vụ' : 'Đã kết thúc'}</span>
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Đơn chưa trả</span>
                  <span
                    className={`text-sm font-bold font-mono mt-0.5 block ${
                      visitDetail.unpaid_summary.unpaid_orders_count > 0
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {visitDetail.unpaid_summary.unpaid_orders_count} đơn
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Tổng cần thu</span>
                  <span className="text-base font-bold font-mono text-blue-600 mt-0.5 block">
                    {visitDetail.unpaid_summary.unpaid_total_vnd.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              {/* Orders List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Các đợt gọi món ({visitDetail.orders.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Đang chế biến/phục vụ: {visitDetail.unpaid_summary.active_orders_count} đơn
                  </span>
                </div>

                <div className="space-y-2">
                  {visitDetail.orders.length === 0 ? (
                    <div className="p-6 bg-slate-50 rounded-xl border border-slate-200/80 text-slate-500 text-xs text-center">
                      Chưa có đợt gọi món nào trong phiên này.
                    </div>
                  ) : (
                    visitDetail.orders.map((order) => (
                      <div
                        key={order.id}
                        className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-blue-600">{order.code}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase bg-slate-100 text-slate-600">
                              {order.status}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                order.payment_status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : order.payment_status === 'refunded'
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                              }`}
                            >
                              {order.payment_status === 'paid'
                                ? 'ĐÃ TRẢ'
                                : order.payment_status === 'refunded'
                                ? 'HOÀN TIỀN'
                                : 'CHƯA TRẢ'}
                            </span>
                          </div>
                          <span className="font-mono font-bold text-slate-900 text-sm">
                            {order.total_vnd.toLocaleString('vi-VN')}đ
                          </span>
                        </div>

                        {/* Items list */}
                        <div className="text-[11px] text-slate-500 divide-y divide-slate-100 pt-1">
                          {(order.items_summary || []).map((it, idx) => (
                            <div key={idx} className="flex justify-between py-1">
                              <span>
                                {it.name} <strong className="text-slate-800">× {it.quantity}</strong>
                              </span>
                              <span className="font-mono text-slate-700">
                                {it.line_total_vnd.toLocaleString('vi-VN')}đ
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Settlement Section */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                {visitDetail.unpaid_summary.unpaid_orders_count > 0 ? (
                  <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      Thanh toán toàn bộ phiên (Settle Visit)
                    </h4>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Dine-in thanh toán toàn bộ các đơn chưa thanh toán trong phiên cùng một lúc
                      theo quy tắc bảo toàn giao dịch.
                    </p>

                    <div>
                      <span className="text-xs text-slate-700 block font-medium mb-1.5">
                        Hình thức thanh toán:
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <label
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-xl border cursor-pointer transition ${
                            settleMethod === 'cash'
                              ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settleMethod"
                            value="cash"
                            checked={settleMethod === 'cash'}
                            onChange={() => setSettleMethod('cash')}
                            className="sr-only"
                          />
                          <Banknote className="w-4 h-4 text-blue-600" />
                          <span>Tiền mặt (Cash)</span>
                        </label>
                        <label
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-semibold rounded-xl border cursor-pointer transition ${
                            settleMethod === 'bank_transfer'
                              ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="settleMethod"
                            value="bank_transfer"
                            checked={settleMethod === 'bank_transfer'}
                            onChange={() => setSettleMethod('bank_transfer')}
                            className="sr-only"
                          />
                          <CreditCard className="w-4 h-4 text-blue-600" />
                          <span>Chuyển khoản (Bank)</span>
                        </label>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSettleVisit}
                      disabled={isSettling}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl transition shadow-2xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSettling ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            Xác nhận thanh toán ({visitDetail.unpaid_summary.unpaid_total_vnd.toLocaleString('vi-VN')}đ)
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-800 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Tất cả đơn hàng trong phiên đã được thanh toán đầy đủ.</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleCloseVisit}
                      disabled={isClosingVisit}
                      className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl transition shadow-2xs disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isClosingVisit ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>Đóng phiên bàn (Kết thúc phục vụ)</span>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 transition shadow-2xs"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
