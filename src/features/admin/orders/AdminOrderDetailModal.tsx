import { useState, useEffect, useCallback, type FC } from 'react'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import type { AdminOrderDetail, OrderStatus, PaymentMethod } from '../types'

interface AdminOrderDetailModalProps {
  orderId: string
  onClose: () => void
  onOrderUpdated: () => void
}

export const AdminOrderDetailModal: FC<AdminOrderDetailModalProps> = ({
  orderId,
  onClose,
  onOrderUpdated,
}) => {
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Internal Note state
  const [internalNote, setInternalNote] = useState<string>('')
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false)

  // Transition reason dialog
  const [reasonModal, setReasonModal] = useState<{
    targetStatus: OrderStatus
    title: string
  } | null>(null)
  const [transitionReason, setTransitionReason] = useState<string>('')

  // Payment action state
  const [paymentModal, setPaymentModal] = useState<{
    event: 'paid' | 'refunded' | 'corrected'
    title: string
  } | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReason, setPaymentReason] = useState<string>('')
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false)

  const loadOrderDetail = useCallback(async () => {
    try {
      setIsLoading(true)
      setErrorMessage(null)
      const res = await adminApi.get<AdminOrderDetail>(`/orders/${orderId}`)
      setDetail(res.data)
      setInternalNote(res.data.order.internal_note || '')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể tải chi tiết đơn hàng')
    } finally {
      setIsLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    void loadOrderDetail()
  }, [loadOrderDetail])

  const handleSaveInternalNote = async () => {
    if (!detail) return
    setIsSavingNote(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await adminApi.patch<{ order: { internal_note: string; version: number } }>(
        `/orders/${detail.order.id}/internal-note`,
        {
          internal_note: internalNote,
          expected_version: detail.order.version,
        }
      )

      setDetail({
        ...detail,
        order: {
          ...detail.order,
          internal_note: res.data.order.internal_note,
          version: res.data.order.version,
        },
      })
      setSuccessMessage('Đã lưu ghi chú nội bộ thành công.')
      onOrderUpdated()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        setErrorMessage('⚠️ Xung đột phiên bản: Đơn hàng đã được chỉnh sửa từ phiên làm việc khác. Đang tải lại dữ liệu...')
        await loadOrderDetail()
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Lỗi lưu ghi chú nội bộ')
      }
    } finally {
      setIsSavingNote(false)
    }
  }

  const handleExecutePayment = async () => {
    if (!detail || !paymentModal) return
    if (
      (paymentModal.event === 'refunded' || paymentModal.event === 'corrected') &&
      !paymentReason.trim()
    ) {
      setErrorMessage('Lý do là bắt buộc khi hoàn tiền hoặc điều chỉnh thanh toán.')
      return
    }

    setIsProcessingPayment(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const idempotencyKey = crypto.randomUUID()
      await adminApi.post(
        `/orders/${detail.order.id}/payment`,
        {
          expected_version: detail.order.version,
          event: paymentModal.event,
          method: paymentModal.event === 'paid' ? paymentMethod : undefined,
          reason: paymentReason.trim() || undefined,
        },
        {
          headers: {
            'Idempotency-Key': idempotencyKey,
          },
        }
      )

      setSuccessMessage(
        paymentModal.event === 'paid'
          ? 'Ghi nhận thanh toán thành công.'
          : paymentModal.event === 'refunded'
          ? 'Ghi nhận hoàn tiền thành công.'
          : 'Đã điều chỉnh trạng thái về chưa thanh toán.'
      )
      setPaymentModal(null)
      setPaymentReason('')
      await loadOrderDetail()
      onOrderUpdated()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'VERSION_CONFLICT') {
          setErrorMessage('⚠️ Xung đột phiên bản: Đơn hàng đã được cập nhật từ phiên làm việc khác. Đang tải lại...')
          await loadOrderDetail()
        } else {
          setErrorMessage(err.message)
        }
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Lỗi xử lý thanh toán')
      }
    } finally {
      setIsProcessingPayment(false)
    }
  }

  const handleExecuteTransition = async (targetStatus: OrderStatus, reason?: string) => {
    if (!detail) return

    if (
      (targetStatus === 'cancelled' || targetStatus === 'rejected') &&
      detail.order.payment_status === 'paid'
    ) {
      setErrorMessage(
        '❌ Không thể hủy/từ chối đơn đã thanh toán: Cần thực hiện "Hoàn tiền (Refund)" trước khi hủy đơn (theo Invariant V18).'
      )
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      await adminApi.post(`/orders/${detail.order.id}/transition`, {
        target_status: targetStatus,
        expected_version: detail.order.version,
        reason: reason || undefined,
      })

      setSuccessMessage(`Đã chuyển trạng thái đơn sang "${targetStatus}" thành công.`)
      setReasonModal(null)
      setTransitionReason('')
      await loadOrderDetail()
      onOrderUpdated()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'VERSION_CONFLICT') {
          setErrorMessage('⚠️ Xung đột phiên bản (Concurrency Conflict): Đơn này vừa được cập nhật bởi một người khác. Vui lòng kiểm tra lại trạng thái mới nhất.')
          await loadOrderDetail()
        } else if (err.code === 'PAYMENT_REQUIRED') {
          setErrorMessage('❌ Không thể hoàn thành đơn: Đơn hàng chưa thanh toán (Payment Status phải là "paid").')
        } else if (err.code === 'PAID_ORDER_NOT_REFUNDED') {
          setErrorMessage('❌ Đơn đã thanh toán: Cần ghi nhận Hoàn tiền (Refund) trước khi hủy hoặc từ chối.')
        } else if (err.code === 'INVALID_STATE_TRANSITION') {
          setErrorMessage(`❌ Chuyển trạng thái không hợp lệ: Không thể chuyển từ "${detail.order.status}" sang "${targetStatus}".`)
        } else {
          setErrorMessage(err.message)
        }
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderTransitionButtons = () => {
    if (!detail) return null
    const { status, order_type, payment_status } = detail.order

    if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
      return (
        <div className="p-3 bg-stone-950/60 rounded-lg border border-stone-800 text-stone-400 text-xs text-center font-medium">
          Đơn hàng đã ở trạng thái kết thúc ({status}). Không thể thay đổi thêm.
        </div>
      )
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {status === 'pending' && (
          <>
            <button
              type="button"
              onClick={() => handleExecuteTransition('confirmed')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
            >
              ✓ Tiếp nhận đơn (Confirm)
            </button>
            <button
              type="button"
              onClick={() =>
                setReasonModal({
                  targetStatus: 'rejected',
                  title: 'Từ chối đơn hàng',
                })
              }
              disabled={isSubmitting}
              className="px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white font-semibold text-xs rounded-lg transition disabled:opacity-50"
            >
              ✕ Từ chối đơn
            </button>
          </>
        )}

        {status === 'confirmed' && (
          <>
            <button
              type="button"
              onClick={() => handleExecuteTransition('preparing')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
            >
              🍳 Chuyển bếp chế biến
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setReasonModal({
                    targetStatus: 'cancelled',
                    title: 'Hủy đơn hàng',
                  })
                }
                disabled={isSubmitting || payment_status === 'paid'}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-rose-300 border border-stone-700 font-semibold text-xs rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={payment_status === 'paid' ? 'Đơn đã thanh toán, phải hoàn tiền trước khi hủy/từ chối' : undefined}
              >
                Hủy đơn
              </button>
              {payment_status === 'paid' && (
                <span className="text-[11px] text-rose-400 font-medium">
                  Đơn đã thanh toán, phải hoàn tiền trước khi hủy/từ chối
                </span>
              )}
            </div>
          </>
        )}

        {status === 'preparing' && (
          <>
            {order_type === 'dine_in' ? (
              <button
                type="button"
                onClick={() => handleExecuteTransition('served')}
                disabled={isSubmitting}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
              >
                🍽️ Đã phục vụ ra bàn
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleExecuteTransition('delivering')}
                disabled={isSubmitting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50"
              >
                🛵 Bắt đầu giao hàng (Shipper)
              </button>
            )}
          </>
        )}

        {(status === 'served' || status === 'delivering') && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {payment_status !== 'paid' ? (
              <div className="flex items-center space-x-2 text-xs text-amber-400 bg-amber-950/50 border border-amber-800/80 px-3 py-1.5 rounded-lg">
                <span>⚠️ Chưa thanh toán: Phải thanh toán đơn trước khi Hoàn thành.</span>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => handleExecuteTransition('completed')}
              disabled={isSubmitting || payment_status !== 'paid'}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              title={payment_status !== 'paid' ? 'Chưa thanh toán' : 'Hoàn thành đơn hàng'}
            >
              ★ Hoàn thành đơn hàng
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderPaymentButtons = () => {
    if (!detail) return null
    const { status, payment_status } = detail.order

    return (
      <div className="flex flex-wrap items-center gap-2">
        {payment_status === 'unpaid' && !['cancelled', 'rejected'].includes(status) && (
          <button
            type="button"
            onClick={() =>
              setPaymentModal({
                event: 'paid',
                title: `Ghi nhận thanh toán đơn ${detail.order.code}`,
              })
            }
            disabled={isSubmitting || isProcessingPayment}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>💰 Ghi nhận thanh toán</span>
          </button>
        )}

        {payment_status === 'paid' && (
          <>
            <button
              type="button"
              onClick={() =>
                setPaymentModal({
                  event: 'refunded',
                  title: `Ghi nhận hoàn tiền đơn ${detail.order.code}`,
                })
              }
              disabled={isSubmitting || isProcessingPayment}
              className="px-4 py-2 bg-rose-900/80 hover:bg-rose-800 text-rose-100 border border-rose-700 font-bold text-xs rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>↩️ Hoàn tiền (Refund)</span>
            </button>

            {!['completed', 'cancelled', 'rejected'].includes(status) && (
              <button
                type="button"
                onClick={() =>
                  setPaymentModal({
                    event: 'corrected',
                    title: `Điều chỉnh về chưa thanh toán đơn ${detail.order.code}`,
                  })
                }
                disabled={isSubmitting || isProcessingPayment}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 font-semibold text-xs rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                title="Sửa nhầm lẫn khi lỡ bấm thanh toán"
              >
                <span>✏️ Điều chỉnh nhầm (về Unpaid)</span>
              </button>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-mono font-black text-amber-400">
              {`Chi tiết đơn hàng ${detail ? detail.order.code : 'Đang tải...'}`}
            </h2>
            {detail && (
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-stone-800 text-stone-300 border border-stone-700">
                v{detail.order.version}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && !detail && (
            <div className="py-20 flex flex-col items-center justify-center">
              <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-stone-400">Đang tải chi tiết đơn hàng...</p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-200">
              {successMessage}
            </div>
          )}

          {detail && (
            <>
              {/* Order State & Summary Banner */}
              <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-stone-400 block font-medium">Trạng thái đơn</span>
                  <span className="text-sm font-bold text-stone-100 uppercase mt-0.5 block">
                    {detail.order.status}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block font-medium">Thanh toán</span>
                  <span
                    className={`inline-block text-xs font-bold px-2 py-0.5 rounded mt-0.5 ${
                      detail.order.payment_status === 'paid'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : detail.order.payment_status === 'refunded'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {detail.order.payment_status === 'paid'
                      ? 'ĐÃ THANH TOÁN'
                      : detail.order.payment_status === 'refunded'
                      ? 'ĐÃ HOÀN TIỀN'
                      : 'CHƯA THANH TOÁN'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block font-medium">Loại đơn</span>
                  <span className="text-sm font-bold text-stone-200 mt-0.5 block">
                    {detail.order.order_type === 'dine_in' ? 'Tại bàn (Dine-in)' : 'Giao hàng (Delivery)'}
                  </span>
                </div>
                <div>
                  <span className="text-stone-400 block font-medium">Tổng thanh toán</span>
                  <span className="text-base font-black font-mono text-amber-400 mt-0.5 block">
                    {detail.order.total_vnd.toLocaleString('vi-VN')}đ
                  </span>
                </div>
              </div>

              {/* Action Bar */}
              <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider mb-2.5">
                    Thao tác trạng thái
                  </h4>
                  {renderTransitionButtons()}
                </div>

                <div className="pt-3 border-t border-stone-800/80">
                  <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider mb-2.5">
                    Thao tác thanh toán
                  </h4>
                  {renderPaymentButtons()}
                </div>
              </div>

              {/* Customer / Dine-in Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-stone-950/70 p-4 rounded-xl border border-stone-800 space-y-2">
                  <h4 className="font-semibold text-stone-300 uppercase tracking-wider">
                    Thông tin phục vụ
                  </h4>
                  {detail.order.order_type === 'dine_in' ? (
                    <div>
                      <p className="text-stone-400">
                        Bàn phục vụ:{' '}
                        <strong className="text-stone-200">
                          {detail.order.table_name_snapshot || 'Bàn không tên'}
                        </strong>
                      </p>
                      <p className="text-stone-400 mt-1 font-mono text-[11px]">
                        Mã phiên (visit): {detail.order.table_visit_id || 'N/A'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-stone-400">
                        Người nhận:{' '}
                        <strong className="text-stone-200">
                          {detail.order.customer_name || 'Khách vãng lai'}
                        </strong>
                      </p>
                      <p className="text-stone-400 mt-1">
                        SĐT liên hệ:{' '}
                        <strong className="text-stone-200 font-mono">
                          {detail.order.customer_phone || 'Chưa cung cấp'}
                        </strong>
                      </p>
                      <p className="text-stone-400 mt-1">
                        Địa chỉ nhận món:{' '}
                        <span className="text-stone-200">
                          {detail.order.address_snapshot || 'Không có địa chỉ'}
                        </span>
                      </p>
                    </div>
                  )}

                  {detail.order.note && (
                    <div className="mt-3 pt-3 border-t border-stone-800">
                      <span className="text-amber-400 font-semibold block">Ghi chú từ khách:</span>
                      <p className="text-stone-300 italic mt-0.5">{detail.order.note}</p>
                    </div>
                  )}
                </div>

                {/* Internal Staff Note */}
                <div className="bg-stone-950/70 p-4 rounded-xl border border-stone-800 space-y-2 flex flex-col justify-between">
                  <div>
                    <h4 className="font-semibold text-stone-300 uppercase tracking-wider">
                      Ghi chú nội bộ (Bếp & Quản lý)
                    </h4>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      Khách không nhìn thấy ghi chú này. Có kiểm tra phiên bản concurrency.
                    </p>
                    <textarea
                      rows={3}
                      value={internalNote}
                      onChange={(e) => setInternalNote(e.target.value)}
                      placeholder="VD: Khách dặn làm ít cay, đã xin lỗi vì bàn chờ lâu..."
                      className="mt-2 w-full p-2.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveInternalNote}
                      disabled={isSavingNote}
                      className="px-3.5 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium rounded-lg text-xs border border-stone-700 transition disabled:opacity-50"
                    >
                      {isSavingNote ? 'Đang lưu...' : 'Lưu ghi chú'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="bg-stone-950/70 rounded-xl border border-stone-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-800 flex justify-between items-center">
                  <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
                    Danh sách món gọi ({detail.items?.length || 0})
                  </h4>
                  <span className="text-xs text-stone-400">
                    Tạm tính: {detail.order.subtotal_vnd.toLocaleString('vi-VN')}đ
                  </span>
                </div>
                <div className="divide-y divide-stone-800">
                  {(detail.items || []).map((item) => {
                    const itemName = (item as unknown as { item_name?: string; item_name_snapshot?: string }).item_name || (item as unknown as { item_name?: string; item_name_snapshot?: string }).item_name_snapshot || item.name_snapshot
                    const unitPrice = (item as unknown as { unit_price_vnd?: number }).unit_price_vnd ?? item.price_vnd ?? 0
                    const lineTotal = (item as unknown as { line_total_vnd?: number }).line_total_vnd ?? item.subtotal_vnd ?? (unitPrice * item.quantity)
                    const itemNote = (item as unknown as { customer_note?: string }).customer_note || item.note

                    return (
                      <div key={item.id} className="p-3.5 flex items-center justify-between text-xs">
                        <div className="space-y-0.5">
                          <span className="font-bold text-stone-200 text-sm">
                            {itemName}
                          </span>
                          {itemNote && (
                            <p className="text-[11px] text-amber-400/90 italic">
                              Yêu cầu: {itemNote}
                            </p>
                          )}
                          <p className="text-stone-400 text-[11px] font-mono">
                            {unitPrice.toLocaleString('vi-VN')}đ x {item.quantity}
                          </p>
                        </div>
                        <div className="text-right font-mono font-bold text-stone-100">
                          {lineTotal.toLocaleString('vi-VN')}đ
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Status History Timeline */}
              <div className="bg-stone-950/70 p-4 rounded-xl border border-stone-800 space-y-3">
                <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
                  Lịch sử thay đổi trạng thái (Audit Timeline)
                </h4>
                <div className="space-y-2">
                  {(detail.status_history || (detail as unknown as { timeline?: typeof detail.status_history }).timeline || []).map((hist) => (
                    <div
                      key={hist.id}
                      className="text-xs flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded bg-stone-900/60 border border-stone-800/80 gap-1"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="font-mono text-stone-400">
                          {hist.from_status ? `${hist.from_status} → ` : 'Khởi tạo → '}
                          <strong className="text-stone-200">{hist.to_status}</strong>
                        </span>
                        {hist.reason && (
                          <span className="text-rose-400 italic">({hist.reason})</span>
                        )}
                      </div>
                      <div className="text-stone-400 font-mono text-[11px] flex items-center space-x-2">
                        <span>bởi {hist.actor_name || 'Hệ thống'}</span>
                        <span>•</span>
                        <span>{new Date(hist.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Events Audit Timeline */}
              {detail.payment_events && detail.payment_events.length > 0 && (
                <div className="bg-stone-950/70 p-4 rounded-xl border border-stone-800 space-y-3">
                  <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
                    Lịch sử thanh toán & sự kiện tiền tệ
                  </h4>
                  <div className="space-y-2">
                    {detail.payment_events.map((evt) => (
                      <div
                        key={evt.id}
                        className="text-xs flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded bg-stone-900/60 border border-stone-800/80 gap-1.5"
                      >
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              evt.event === 'paid'
                                ? 'bg-emerald-400'
                                : evt.event === 'refunded'
                                ? 'bg-rose-400'
                                : 'bg-amber-400'
                            }`}
                          />
                          <span className="font-mono font-bold text-stone-200">
                            {evt.event === 'paid'
                              ? evt.method === 'cash'
                                ? `Thu tiền mặt: +${evt.amount_vnd.toLocaleString('vi-VN')} đ`
                                : `Chuyển khoản: +${evt.amount_vnd.toLocaleString('vi-VN')} đ`
                              : evt.event === 'refunded'
                              ? `Hoàn tiền: -${evt.amount_vnd.toLocaleString('vi-VN')} đ`
                              : `Điều chỉnh: ${evt.amount_vnd.toLocaleString('vi-VN')} đ`}
                          </span>
                          {evt.reason && (
                            <span className="text-amber-300/90 italic">({evt.reason})</span>
                          )}
                        </div>
                        <div className="text-stone-400 font-mono text-[11px] flex items-center space-x-2">
                          <span>bởi {evt.actor_admin_name || 'Admin'}</span>
                          <span>•</span>
                          <span>{new Date(evt.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-stone-900 border-t border-stone-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs rounded-lg border border-stone-700 transition"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Payment Dialog Modal */}
      {paymentModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-stone-100 uppercase">{paymentModal.title}</h3>

            {paymentModal.event === 'paid' && (
              <div>
                <label className="text-xs text-stone-300 block font-medium mb-1.5">
                  Phương thức thanh toán:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition ${
                      paymentMethod === 'cash'
                        ? 'bg-amber-500 text-stone-950 border-amber-400'
                        : 'bg-stone-950 text-stone-300 border-stone-700 hover:border-stone-600'
                    }`}
                  >
                    💵 Tiền mặt (Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('bank_transfer')}
                    className={`py-2 px-3 text-xs font-bold rounded-lg border text-center transition ${
                      paymentMethod === 'bank_transfer'
                        ? 'bg-amber-500 text-stone-950 border-amber-400'
                        : 'bg-stone-950 text-stone-300 border-stone-700 hover:border-stone-600'
                    }`}
                  >
                    🏦 Chuyển khoản (Bank)
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-stone-300 block font-medium mb-1">
                {paymentModal.event === 'paid'
                  ? 'Ghi chú thanh toán (tùy chọn):'
                  : 'Lý do bắt buộc (Kiểm toán Invariant V18):'}
              </label>
              <input
                type="text"
                autoFocus
                value={paymentReason}
                onChange={(e) => setPaymentReason(e.target.value)}
                placeholder={
                  paymentModal.event === 'paid'
                    ? 'Ghi chú thanh toán...'
                    : paymentModal.event === 'refunded'
                    ? 'Lý do hoàn tiền (VD: Khách hủy đơn hoàn tiền)'
                    : 'Lý do điều chỉnh (VD: Bấm nhầm thanh toán)'
                }
                className="w-full p-2.5 bg-stone-950 border border-stone-700 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => {
                  setPaymentModal(null)
                  setPaymentReason('')
                }}
                disabled={isProcessingPayment}
                className="px-3 py-1.5 text-xs text-stone-400 hover:text-white transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecutePayment}
                disabled={isProcessingPayment}
                className={`px-4 py-1.5 text-white font-bold text-xs rounded-lg transition disabled:opacity-50 ${
                  paymentModal.event === 'paid'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : paymentModal.event === 'refunded'
                    ? 'bg-rose-700 hover:bg-rose-600'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {isProcessingPayment
                  ? 'Đang xử lý...'
                  : paymentModal.event === 'refunded'
                  ? 'Xác nhận hoàn tiền'
                  : paymentModal.event === 'paid'
                  ? 'Xác nhận thanh toán'
                  : 'Xác nhận điều chỉnh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reason Dialog Modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 w-full max-w-md shadow-2xl">
            <h3 className="text-sm font-bold text-stone-100 uppercase">{reasonModal.title}</h3>
            <p className="text-xs text-stone-400 mt-1">
              Vui lòng nhập lý do để lưu vào lịch sử kiểm toán của quán:
            </p>
            <input
              type="text"
              autoFocus
              value={transitionReason}
              onChange={(e) => setTransitionReason(e.target.value)}
              placeholder="VD: Hết món, Khách đổi ý, Quá tải bếp..."
              className="mt-3 w-full p-2.5 bg-stone-950 border border-stone-700 rounded-lg text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
            <div className="mt-4 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setReasonModal(null)}
                className="px-3 py-1.5 text-xs text-stone-400 hover:text-white transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransition(reasonModal.targetStatus, transitionReason)}
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
