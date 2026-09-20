import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarCheck,
  Clock,
  AlertCircle,
  Loader2,
  XCircle,
  Calendar,
  X,
  Phone,
} from 'lucide-react'
import { fetchCustomerReservations, cancelCustomerReservation } from './api'
import type { CustomerReservationSummary } from './types'

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

function getReservationBadge(status: string) {
  switch (status) {
    case 'pending':
      return { label: 'Chờ xác nhận', bg: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'confirmed':
      return { label: 'Đã xác nhận', bg: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'seated':
      return { label: 'Đang dùng bữa', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
    case 'completed':
      return { label: 'Hoàn tất', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'cancelled':
      return { label: 'Đã hủy', bg: 'bg-red-50 text-red-700 border-red-200' }
    case 'no_show':
      return { label: 'Vắng mặt', bg: 'bg-slate-100 text-slate-600 border-slate-300' }
    default:
      return { label: status, bg: 'bg-slate-50 text-slate-700 border-slate-200' }
  }
}

/** Invariant V16: Cancel allowed only if starts_at is >= 60 minutes away */
function canCancelReservation(startsAtStr: string, status: string): boolean {
  if (status !== 'pending' && status !== 'confirmed') return false
  const startsAt = new Date(startsAtStr).getTime()
  const now = Date.now()
  const diffMinutes = (startsAt - now) / (1000 * 60)
  return diffMinutes >= 60
}

export function AccountReservationsPage() {
  const [reservations, setReservations] = useState<CustomerReservationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Cancel Modal State
  const [cancellingRes, setCancellingRes] = useState<CustomerReservationSummary | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function load() {
    try {
      setIsLoading(true)
      setError(null)
      const data = await fetchCustomerReservations()
      setReservations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải lịch đặt bàn')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleConfirmCancel = async () => {
    if (!cancellingRes) return

    try {
      setIsSubmittingCancel(true)
      setCancelError(null)

      await cancelCustomerReservation(cancellingRes.id, {
        expected_version: cancellingRes.version,
        reason: cancelReason.trim() || undefined,
      })

      setCancellingRes(null)
      setCancelReason('')
      await load()
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Không thể hủy đặt bàn')
    } finally {
      setIsSubmittingCancel(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 border border-amber-100 shadow-xs space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-amber-600" />
            <span>Lịch đặt bàn của bạn</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi, cập nhật thông tin và quản lý các lượt đặt bàn tại Quán nhậu Tiger 345
          </p>
        </div>

        <Link
          to="/reservation"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Calendar className="w-4 h-4" />
          <span>Đặt bàn mới</span>
        </Link>
      </div>

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
          <p className="text-sm font-medium">Đang tải lịch đặt bàn...</p>
        </div>
      ) : error ? (
        <div className="py-10 text-center text-red-600">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : reservations.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="text-base font-bold text-slate-700">Chưa có lịch đặt bàn nào</p>
          <p className="text-xs text-slate-400 mt-1">
            Đặt bàn trước để được giữ chỗ đẹp và chuẩn bị món chu đáo nhất
          </p>
          <Link
            to="/reservation"
            className="inline-block mt-4 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
          >
            Đặt bàn ngay
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {reservations.map((res) => {
            const badge = getReservationBadge(res.status)
            const canCancel = canCancelReservation(res.starts_at, res.status)

            return (
              <div
                key={res.id}
                className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md text-xs border border-amber-200/80">
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
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Thời gian: {formatDate(res.starts_at)}</span>
                  </p>

                  {res.note && (
                    <p className="text-xs text-slate-500 italic">
                      Ghi chú: &ldquo;{res.note}&rdquo;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        setCancellingRes(res)
                        setCancelReason('')
                        setCancelError(null)
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Hủy bàn</span>
                    </button>
                  )}

                  {!canCancel && (res.status === 'pending' || res.status === 'confirmed') && (
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">
                        Cần hủy trước 60 phút
                      </span>
                      <a
                        href="tel:0902809929"
                        className="text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        <span>Gọi 090 280 99 29</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="text-base font-bold text-slate-900">
                  Xác nhận hủy đặt bàn #{cancellingRes.code}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCancellingRes(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Bạn có chắc chắn muốn hủy lịch đặt bàn cho{' '}
              <strong className="text-slate-800">{cancellingRes.guest_count} khách</strong> vào lúc{' '}
              <strong className="text-slate-800">{formatDate(cancellingRes.starts_at)}</strong> không?
            </p>

            {cancelError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {cancelError}
              </div>
            )}

            <div className="mb-4">
              <label
                htmlFor="cancel-reason"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Lý do hủy (tùy chọn)
              </label>
              <textarea
                id="cancel-reason"
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="VD: Thay đổi kế hoạch cá nhân..."
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancellingRes(null)}
                disabled={isSubmittingCancel}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200"
              >
                Giữ lại bàn
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isSubmittingCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSubmittingCancel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Đồng ý hủy</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
