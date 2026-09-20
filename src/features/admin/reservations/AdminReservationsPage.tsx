import { useState, useEffect, useCallback, type FC, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar,
  Clock,
  Users,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PhoneCall,
  Edit3,
  UserCheck,
  RefreshCw,
  X,
} from 'lucide-react'
import { useAdmin } from '../layout/AdminContext'
import {
  getAdminReservations,
  getAdminReservation,
  transitionReservation,
  updateReservationContact,
  updateReservationNote,
  type AdminReservationItem,
  type ReservationStatus,
} from '@/features/reservations'
import { getVietnamNow } from '@/lib/validation'

export const AdminReservationsPage: FC = () => {
  const { refreshKey, triggerRefresh } = useAdmin()
  const [searchParams, setSearchParams] = useSearchParams()

  const dateParam = searchParams.get('date') || getVietnamNow().isoDate
  const statusParam = (searchParams.get('status') as ReservationStatus | 'all') || 'all'
  const searchParam = searchParams.get('search') || ''

  const [date, setDate] = useState<string>(dateParam)
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | 'all'>(statusParam)
  const [searchTerm, setSearchTerm] = useState<string>(searchParam)

  const [reservations, setReservations] = useState<AdminReservationItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Selected reservation for modal
  const selectedId = searchParams.get('id')
  const [selectedResv, setSelectedResv] = useState<AdminReservationItem | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState<boolean>(false)
  const [detailActionError, setDetailActionError] = useState<string | null>(null)
  const [detailActionSuccess, setDetailActionSuccess] = useState<string | null>(null)

  // Mutation states in modal
  const [contactOutcomeInput, setContactOutcomeInput] = useState<string>('')
  const [internalNoteInput, setInternalNoteInput] = useState<string>('')
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [showRejectInput, setShowRejectInput] = useState<boolean>(false)
  const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false)

  const loadReservations = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await getAdminReservations({
        date: date || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchTerm.trim() || undefined,
        limit: 100,
      })
      setReservations(data.items)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách đặt bàn')
    } finally {
      setIsLoading(false)
    }
  }, [date, statusFilter, searchTerm])

  useEffect(() => {
    void loadReservations()
  }, [loadReservations, refreshKey])

  // Load single reservation detail when modal opens
  const loadDetail = useCallback(async (id: string) => {
    try {
      setIsDetailLoading(true)
      setDetailActionError(null)
      setDetailActionSuccess(null)
      const item = await getAdminReservation(id)
      setSelectedResv(item)
      setContactOutcomeInput(item.contact_outcome || '')
      setInternalNoteInput(item.internal_note || '')
      setShowRejectInput(false)
      setRejectionReason('')
    } catch (err: unknown) {
      setDetailActionError(err instanceof Error ? err.message : 'Không thể tải chi tiết đặt bàn')
    } finally {
      setIsDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) {
      void loadDetail(selectedId)
    } else {
      setSelectedResv(null)
    }
  }, [selectedId, loadDetail])

  const openDetail = (id: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('id', id)
    setSearchParams(next)
  }

  const closeDetail = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('id')
    setSearchParams(next)
    setSelectedResv(null)
  }

  const handleDateChange = (newDate: string) => {
    setDate(newDate)
    const next = new URLSearchParams(searchParams)
    if (newDate) next.set('date', newDate)
    else next.delete('date')
    setSearchParams(next)
  }

  const handleStatusFilterChange = (newStatus: ReservationStatus | 'all') => {
    setStatusFilter(newStatus)
    const next = new URLSearchParams(searchParams)
    if (newStatus !== 'all') next.set('status', newStatus)
    else next.delete('status')
    setSearchParams(next)
  }

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (searchTerm.trim()) next.set('search', searchTerm.trim())
    else next.delete('search')
    setSearchParams(next)
  }

  // State transitions
  const handleTransition = async (targetStatus: ReservationStatus, reason?: string) => {
    if (!selectedResv) return
    setIsSubmittingAction(true)
    setDetailActionError(null)
    setDetailActionSuccess(null)

    try {
      const updated = await transitionReservation(selectedResv.id, {
        expected_version: selectedResv.version,
        target_status: targetStatus,
        reason,
      })
      setSelectedResv(updated)
      setDetailActionSuccess(`Đã chuyển trạng thái sang "${getStatusLabel(targetStatus)}"`)
      setShowRejectInput(false)
      setRejectionReason('')
      triggerRefresh()
    } catch (err: unknown) {
      setDetailActionError(err instanceof Error ? err.message : 'Không thể chuyển trạng thái đặt bàn')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  // Contact outcome update
  const handleSaveContact = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedResv || !contactOutcomeInput.trim()) return
    setIsSubmittingAction(true)
    setDetailActionError(null)
    setDetailActionSuccess(null)

    try {
      const updated = await updateReservationContact(selectedResv.id, {
        expected_version: selectedResv.version,
        outcome: contactOutcomeInput.trim(),
      })
      setSelectedResv(updated)
      setDetailActionSuccess('Đã cập nhật kết quả liên hệ')
      triggerRefresh()
    } catch (err: unknown) {
      setDetailActionError(err instanceof Error ? err.message : 'Lỗi cập nhật liên hệ')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  // Internal note update
  const handleSaveNote = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedResv) return
    setIsSubmittingAction(true)
    setDetailActionError(null)
    setDetailActionSuccess(null)

    try {
      const updated = await updateReservationNote(selectedResv.id, {
        expected_version: selectedResv.version,
        internal_note: internalNoteInput.trim(),
      })
      setSelectedResv(updated)
      setDetailActionSuccess('Đã cập nhật ghi chú nội bộ')
      triggerRefresh()
    } catch (err: unknown) {
      setDetailActionError(err instanceof Error ? err.message : 'Lỗi cập nhật ghi chú')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  const getStatusLabel = (status: ReservationStatus): string => {
    switch (status) {
      case 'pending':
        return 'Chờ duyệt'
      case 'confirmed':
        return 'Đã xác nhận'
      case 'seated':
        return 'Đã vào bàn'
      case 'completed':
        return 'Hoàn tất'
      case 'rejected':
        return 'Từ chối'
      case 'cancelled':
        return 'Đã hủy'
      case 'no_show':
        return 'Vắng mặt'
    }
  }

  const getStatusBadge = (status: ReservationStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-950/80 text-amber-300 border border-amber-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            <Clock size={12} /> Chờ duyệt
          </span>
        )
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            <CheckCircle2 size={12} /> Đã xác nhận
          </span>
        )
      case 'seated':
        return (
          <span className="inline-flex items-center gap-1 bg-sky-950/80 text-sky-300 border border-sky-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            <UserCheck size={12} /> Đã vào bàn
          </span>
        )
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 bg-teal-950/80 text-teal-300 border border-teal-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            Hoàn tất
          </span>
        )
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-950/80 text-rose-300 border border-rose-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            <XCircle size={12} /> Từ chối
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 bg-stone-900 text-stone-400 border border-stone-800 px-2.5 py-0.5 rounded-full font-medium text-xs">
            Đã hủy
          </span>
        )
      case 'no_show':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-950/80 text-purple-300 border border-purple-800/80 px-2.5 py-0.5 rounded-full font-medium text-xs">
            <AlertCircle size={12} /> Vắng mặt
          </span>
        )
    }
  }

  const formatVnDateTime = (isoString: string): string => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Title & Quick Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 flex items-center gap-2.5">
            <Calendar className="text-amber-500" size={24} />
            <span>Quản lý Đặt bàn (Reservations)</span>
          </h1>
          <p className="text-stone-400 text-xs mt-1">
            Theo dõi yêu cầu đặt bàn, xếp chỗ, liên hệ xác nhận & kiểm soát trạng thái theo lượt
          </p>
        </div>

        <button
          onClick={triggerRefresh}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 text-xs font-medium transition-colors cursor-pointer"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-stone-900/90 border border-stone-800/90 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2">
            <Calendar size={15} className="text-amber-500" />
            <label htmlFor="resv-date" className="text-xs text-stone-400 font-medium">
              Ngày:
            </label>
            <input
              id="resv-date"
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-transparent text-xs text-stone-100 focus:outline-none"
            />
          </div>

          {/* Quick Date Shortcuts */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleDateChange(getVietnamNow().isoDate)}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
            >
              Hôm nay
            </button>
            <button
              onClick={() => {
                const tm = new Date(Date.now() + 86400000)
                handleDateChange(tm.toISOString().slice(0, 10))
              }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 transition-colors"
            >
              Ngày mai
            </button>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[240px] flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                type="text"
                placeholder="Tìm theo mã đặt bàn hoặc tên khách..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-2 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl transition-colors"
            >
              Tìm
            </button>
          </form>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {(
            [
              { id: 'all', label: 'Tất cả' },
              { id: 'pending', label: 'Chờ duyệt' },
              { id: 'confirmed', label: 'Đã xác nhận' },
              { id: 'seated', label: 'Đã vào bàn' },
              { id: 'completed', label: 'Hoàn tất' },
              { id: 'no_show', label: 'Vắng mặt' },
              { id: 'cancelled', label: 'Đã hủy' },
              { id: 'rejected', label: 'Từ chối' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleStatusFilterChange(tab.id)}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-amber-500 text-stone-950 font-semibold shadow-xs'
                  : 'bg-stone-950 text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table of Reservations */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-950/80 text-stone-400 uppercase tracking-wider font-semibold border-b border-stone-800">
              <tr>
                <th className="px-4 py-3">Mã đặt bàn</th>
                <th className="px-4 py-3">Khách hàng</th>
                <th className="px-4 py-3">Giờ hẹn</th>
                <th className="px-4 py-3">Số khách</th>
                <th className="px-4 py-3">Khu vực</th>
                <th className="px-4 py-3">Liên hệ</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                    <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                    Đang tải danh sách đặt bàn...
                  </td>
                </tr>
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                    Không có đặt bàn nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                reservations.map((resv) => (
                  <tr
                    key={resv.id}
                    className="hover:bg-stone-800/40 transition-colors cursor-pointer"
                    onClick={() => openDetail(resv.id)}
                  >
                    <td className="px-4 py-3 font-mono font-bold text-amber-400">
                      {resv.code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-stone-100">{resv.customer_name}</div>
                      <div className="text-stone-400 font-mono text-[11px]">{resv.customer_phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-stone-100">
                        {formatVnDateTime(resv.starts_at)}
                      </span>
                      <span className="text-stone-400 block text-[11px]">
                        kết thúc ~{formatVnDateTime(resv.ends_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-semibold text-stone-200">
                        <Users size={12} className="text-amber-500/80" />
                        {resv.guest_count}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-300">
                      {resv.area_name_snapshot || 'Tùy chọn quán'}
                    </td>
                    <td className="px-4 py-3">
                      {resv.contact_outcome ? (
                        <span className="text-emerald-400 text-[11px] block max-w-[140px] truncate" title={resv.contact_outcome}>
                          ✓ {resv.contact_outcome}
                        </span>
                      ) : (
                        <span className="text-stone-500 text-[11px] italic">Chưa ghi nhận</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(resv.status)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openDetail(resv.id)
                        }}
                        className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
                      >
                        Chi tiết
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reservation Detail Modal */}
      {selectedId && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-stone-800">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-stone-100 font-mono">
                    {selectedResv?.code || 'Đang tải...'}
                  </h3>
                  {selectedResv && getStatusBadge(selectedResv.status)}
                </div>
                <p className="text-xs text-stone-400 mt-1">
                  Phiên bản: v{selectedResv?.version} · Tạo lúc:{' '}
                  {selectedResv?.created_at ? new Date(selectedResv.created_at).toLocaleString('vi-VN') : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="w-8 h-8 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-400 flex items-center justify-center transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {isDetailLoading ? (
              <div className="py-12 text-center text-stone-500 text-sm">
                <RefreshCw className="animate-spin inline-block mr-2" size={16} />
                Đang tải thông tin chi tiết...
              </div>
            ) : selectedResv ? (
              <div className="space-y-6">
                {/* Feedback Alerts */}
                {detailActionError && (
                  <div className="p-3.5 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{detailActionError}</span>
                  </div>
                )}
                {detailActionSuccess && (
                  <div className="p-3.5 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>{detailActionSuccess}</span>
                  </div>
                )}

                {/* Main Information Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-stone-950 rounded-2xl border border-stone-800/80 text-xs">
                  <div>
                    <span className="text-stone-500 block mb-0.5">Khách hàng</span>
                    <strong className="text-stone-100 text-sm font-semibold block">
                      {selectedResv.customer_name}
                    </strong>
                    <a
                      href={`tel:${selectedResv.customer_phone}`}
                      className="text-amber-500 hover:underline font-mono"
                    >
                      {selectedResv.customer_phone}
                    </a>
                  </div>

                  <div>
                    <span className="text-stone-500 block mb-0.5">Thời gian dùng bữa</span>
                    <strong className="text-stone-100 font-semibold block">
                      {formatVnDateTime(selectedResv.starts_at)}
                    </strong>
                    <span className="text-stone-400 text-[11px]">
                      {new Date(selectedResv.starts_at).toLocaleDateString('vi-VN')}
                    </span>
                  </div>

                  <div>
                    <span className="text-stone-500 block mb-0.5">Số lượng khách</span>
                    <strong className="text-stone-100 text-sm font-semibold flex items-center gap-1">
                      <Users size={13} className="text-amber-500" />
                      {selectedResv.guest_count} người
                    </strong>
                  </div>

                  <div>
                    <span className="text-stone-500 block mb-0.5">Khu vực ưu tiên</span>
                    <strong className="text-stone-100 font-semibold">
                      {selectedResv.area_name_snapshot || 'Mặc định'}
                    </strong>
                  </div>
                </div>

                {/* Customer Request Note */}
                {selectedResv.note && (
                  <div className="p-3.5 bg-stone-950/60 border border-stone-800/60 rounded-xl text-xs space-y-1">
                    <span className="font-semibold text-stone-400">Ghi chú từ khách:</span>
                    <p className="text-stone-200">{selectedResv.note}</p>
                  </div>
                )}

                {/* State Transition Actions */}
                <div className="p-4 bg-stone-950 border border-stone-800/80 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                    Thao tác chuyển trạng thái
                  </h4>

                  {selectedResv.status === 'pending' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('confirmed')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Xác nhận đặt bàn</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => setShowRejectInput(!showRejectInput)}
                        className="px-4 py-2 rounded-xl bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 font-semibold text-xs border border-rose-800/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <XCircle size={14} />
                        <span>Từ chối</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('cancelled', 'Quán hủy theo yêu cầu')}
                        className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-xs transition-colors cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  )}

                  {showRejectInput && selectedResv.status === 'pending' && (
                    <div className="pt-2 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Nhập lý do từ chối (hết bàn, sự cố...)"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="flex-1 bg-stone-900 border border-rose-800/80 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={isSubmittingAction || !rejectionReason.trim()}
                        onClick={() => handleTransition('rejected', rejectionReason)}
                        className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        Xác nhận từ chối
                      </button>
                    </div>
                  )}

                  {selectedResv.status === 'confirmed' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('seated')}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserCheck size={14} />
                        <span>Khách đã đến (Vào bàn)</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('no_show', 'Quá giờ ân hạn không đến')}
                        className="px-4 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 font-semibold text-xs border border-purple-800/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <AlertCircle size={14} />
                        <span>Báo vắng mặt (No-show)</span>
                      </button>

                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('cancelled', 'Khách báo hủy bàn')}
                        className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 font-medium text-xs transition-colors cursor-pointer"
                      >
                        Hủy bàn
                      </button>
                    </div>
                  )}

                  {selectedResv.status === 'seated' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingAction}
                        onClick={() => handleTransition('completed')}
                        className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Hoàn tất bữa ăn</span>
                      </button>
                    </div>
                  )}

                  {['completed', 'rejected', 'cancelled', 'no_show'].includes(selectedResv.status) && (
                    <p className="text-xs text-stone-500 italic">
                      Đặt bàn này đã ở trạng thái kết thúc ({getStatusLabel(selectedResv.status)}), không thể chuyển tiếp.
                    </p>
                  )}
                </div>

                {/* Contact Outcome Tracker */}
                <form
                  onSubmit={handleSaveContact}
                  className="p-4 bg-stone-950 border border-stone-800/80 rounded-2xl space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                      <PhoneCall size={13} className="text-amber-500" />
                      <span>Ghi nhận liên hệ khách hàng</span>
                    </label>
                    {selectedResv.contacted_at && (
                      <span className="text-[11px] text-stone-500">
                        Lần gọi gần nhất: {new Date(selectedResv.contacted_at).toLocaleTimeString('vi-VN')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ví dụ: Đã gọi xác nhận 6 người lớn, chuẩn bị hoa..."
                      value={contactOutcomeInput}
                      onChange={(e) => setContactOutcomeInput(e.target.value)}
                      className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingAction || !contactOutcomeInput.trim()}
                      className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Lưu liên hệ
                    </button>
                  </div>
                </form>

                {/* Internal Note */}
                <form
                  onSubmit={handleSaveNote}
                  className="p-4 bg-stone-950 border border-stone-800/80 rounded-2xl space-y-2.5"
                >
                  <label className="text-xs font-bold text-stone-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Edit3 size={13} className="text-amber-500" />
                    <span>Ghi chú nội bộ quán (Bàn xếp, yêu cầu nhân viên)</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Ví dụ: Xếp bàn số 4 khu sảnh trệt gần hồ cá..."
                      value={internalNoteInput}
                      onChange={(e) => setInternalNoteInput(e.target.value)}
                      className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingAction}
                      className="px-3.5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Lưu ghi chú
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
