import { useState, useEffect, useCallback, type FC } from 'react'
import QRCode from 'qrcode'
import { adminApi } from '../../../lib/api/client'
import { ApiError } from '../../../lib/api/types'
import { useAdmin } from '../layout/AdminContext'
import type { AdminTableItem, AdminSeatingArea, TableVisitDetail, PaymentMethod } from '../types'

interface QrTentCardModalState {
  tableName: string
  tableCode: string
  areaName?: string | null
  qrToken: string
  qrUrl: string
  qrDataUrl: string
  isOneTimeToken: boolean
}

export const AdminTablesPage: FC = () => {
  const { refreshKey, triggerRefresh } = useAdmin()
  const [tables, setTables] = useState<AdminTableItem[]>([])
  const [seatingAreas, setSeatingAreas] = useState<AdminSeatingArea[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Settle Visit Modal
  const [selectedVisitTable, setSelectedVisitTable] = useState<AdminTableItem | null>(null)
  const [visitDetail, setVisitDetail] = useState<TableVisitDetail | null>(null)
  const [isLoadingVisit, setIsLoadingVisit] = useState<boolean>(false)
  const [visitError, setVisitError] = useState<string | null>(null)
  const [visitSuccess, setVisitSuccess] = useState<string | null>(null)
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('cash')
  const [isSettling, setIsSettling] = useState<boolean>(false)
  const [isClosingVisit, setIsClosingVisit] = useState<boolean>(false)

  // QR Tent Card Modal
  const [tentCardModal, setTentCardModal] = useState<QrTentCardModalState | null>(null)

  // Rotate QR confirmation modal
  const [rotateConfirmTable, setRotateConfirmTable] = useState<AdminTableItem | null>(null)
  const [isRotating, setIsRotating] = useState<boolean>(false)

  // Create Table Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false)
  const [newTableCode, setNewTableCode] = useState<string>('')
  const [newTableName, setNewTableName] = useState<string>('')
  const [newTableAreaId, setNewTableAreaId] = useState<string>('')
  const [isSubmittingNewTable, setIsSubmittingNewTable] = useState<boolean>(false)

  // Edit Table Modal
  const [editingTable, setEditingTable] = useState<AdminTableItem | null>(null)
  const [editTableCode, setEditTableCode] = useState<string>('')
  const [editTableName, setEditTableName] = useState<string>('')
  const [editTableAreaId, setEditTableAreaId] = useState<string>('')
  const [editTableActive, setEditTableActive] = useState<boolean>(true)
  const [isSubmittingEditTable, setIsSubmittingEditTable] = useState<boolean>(false)

  const loadTables = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [tablesRes, areasRes] = await Promise.all([
        adminApi.get<{ items: AdminTableItem[] } | AdminTableItem[]>('/tables'),
        adminApi.get<AdminSeatingArea[]>('/seating-areas').catch(() => ({ data: [] })),
      ])

      const items = Array.isArray(tablesRes.data)
        ? tablesRes.data
        : (tablesRes.data as any)?.tables || (tablesRes.data as any)?.items || []
      setTables(items)
      setSeatingAreas(areasRes.data || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách bàn')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTables()
  }, [loadTables, refreshKey])

  const loadVisitDetail = useCallback(async (visitId: string) => {
    try {
      setIsLoadingVisit(true)
      setVisitError(null)
      const res = await adminApi.get<TableVisitDetail>(`/visits/${visitId}`)
      setVisitDetail(res.data)
    } catch (err: unknown) {
      setVisitError(err instanceof Error ? err.message : 'Không thể tải chi tiết phiên bàn')
    } finally {
      setIsLoadingVisit(false)
    }
  }, [])

  const handleOpenSettleVisit = async (table: AdminTableItem) => {
    if (!table.current_visit_id) return
    setSelectedVisitTable(table)
    setVisitDetail(null)
    setVisitError(null)
    setVisitSuccess(null)
    await loadVisitDetail(table.current_visit_id)
  }

  const handleSettleVisit = async () => {
    if (!visitDetail || !selectedVisitTable) return
    const unpaidOrders = visitDetail.orders.filter(
      (o) => o.payment_status === 'unpaid' && !['cancelled', 'rejected'].includes(o.status)
    )

    if (unpaidOrders.length === 0) {
      setVisitError('Không có đơn hàng nào cần thanh toán.')
      return
    }

    setIsSettling(true)
    setVisitError(null)
    setVisitSuccess(null)

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

      setVisitSuccess(`Đã thanh toán toàn bộ ${unpaidOrders.length} đơn hàng thành công!`)
      await loadVisitDetail(visitDetail.visit.id)
      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'ORDER_LIST_MISMATCH') {
          setVisitError(
            '⚠️ Danh sách đơn hàng đã thay đổi (có thể vừa có món gọi thêm hoặc trạng thái đơn bị đổi). Vui lòng kiểm tra lại danh sách trước khi thanh toán.'
          )
          await loadVisitDetail(visitDetail.visit.id)
        } else if (err.code === 'VERSION_CONFLICT') {
          setVisitError('⚠️ Xung đột phiên bản: Phiên phục vụ đã được cập nhật từ phiên khác.')
          await loadVisitDetail(visitDetail.visit.id)
        } else {
          setVisitError(err.message)
        }
      } else {
        setVisitError(err instanceof Error ? err.message : 'Lỗi khi thanh toán phiên')
      }
    } finally {
      setIsSettling(false)
    }
  }

  const handleCloseVisitFromModal = async () => {
    if (!visitDetail || !selectedVisitTable) return
    setIsClosingVisit(true)
    setVisitError(null)
    setVisitSuccess(null)

    try {
      await adminApi.post(`/visits/${visitDetail.visit.id}/close`, {
        expected_version: visitDetail.visit.version,
      })

      setSelectedVisitTable(null)
      setVisitDetail(null)
      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === 'VISIT_HAS_ACTIVE_ORDERS') {
          setVisitError('❌ Không thể đóng bàn: Còn đơn hàng chưa hoàn thành hoặc chưa hủy.')
        } else if (err.code === 'VISIT_HAS_UNPAID_ORDERS') {
          setVisitError('❌ Không thể đóng bàn: Còn đơn hàng chưa thanh toán.')
        } else if (err.code === 'VISIT_HAS_PENDING_REFUNDS') {
          setVisitError(
            '❌ Không thể đóng bàn: Còn đơn đã thanh toán bị hủy nhưng chưa ghi nhận hoàn tiền (refund).'
          )
        } else if (err.code === 'VERSION_CONFLICT') {
          setVisitError('⚠️ Xung đột phiên bản: Trạng thái phiên đã thay đổi. Đang tải lại.')
          await loadVisitDetail(visitDetail.visit.id)
        } else {
          setVisitError(err.message)
        }
      } else {
        setVisitError(err instanceof Error ? err.message : 'Lỗi khi đóng phiên bàn')
      }
    } finally {
      setIsClosingVisit(false)
    }
  }

  const generateQrCard = async (
    table: AdminTableItem,
    qrToken: string,
    qrUrl: string,
    isOneTimeToken: boolean
  ) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#1c1917',
          light: '#ffffff',
        },
      })

      setTentCardModal({
        tableName: table.name,
        tableCode: table.code,
        areaName: table.area_name,
        qrToken,
        qrUrl,
        qrDataUrl,
        isOneTimeToken,
      })
    } catch (err) {
      console.error('Failed to generate QR Data URL:', err)
      alert('Không thể tạo hình ảnh mã QR')
    }
  }

  const handleOpenVisit = async (table: AdminTableItem) => {
    setActionLoadingId(table.id)
    try {
      const res = await adminApi.post<{
        visit_id?: string
        active_qr_token?: string
        qr_url?: string
        id?: string
      }>(`/tables/${table.id}/visits`, {
        expected_table_version: table.version,
      })

      const rawToken = res.data.active_qr_token || ''
      const baseUrl = window.location.origin
      const fullQrUrl = res.data.qr_url || (rawToken ? `${baseUrl}/table/${rawToken}` : `${baseUrl}/table`)

      if (rawToken) {
        await generateQrCard(table, rawToken, fullQrUrl, true)
      }

      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi mở bàn')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleCloseVisit = async (table: AdminTableItem) => {
    if (table.unpaid_orders_count > 0) {
      alert(`Không thể đóng bàn: Còn ${table.unpaid_orders_count} đơn hàng chưa thanh toán (${table.unpaid_total_vnd.toLocaleString('vi-VN')}đ)!`)
      return
    }

    if (!confirm(`Xác nhận đóng bàn "${table.name}" và kết thúc phiên phục vụ hiện tại?`)) {
      return
    }

    setActionLoadingId(table.id)
    try {
      await adminApi.delete(`/tables/${table.id}/visit`, {
        body: { expected_version: table.version },
      })
      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        alert('Xung đột phiên bản: Trạng thái bàn đã thay đổi ở phiên khác. Đang tải lại.')
        await loadTables()
      } else {
        alert(err instanceof Error ? err.message : 'Lỗi khi đóng bàn')
      }
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleConfirmRotateQr = async () => {
    if (!rotateConfirmTable) return
    setIsRotating(true)
    try {
      const res = await adminApi.post<{
        table_id: string
        qr_token: string
        qr_url: string
        epoch_bumped: boolean
      }>(`/tables/${rotateConfirmTable.id}/qr`, {
        expected_version: rotateConfirmTable.version,
      })

      const targetTable = rotateConfirmTable
      setRotateConfirmTable(null)

      await generateQrCard(targetTable, res.data.qr_token, res.data.qr_url, true)
      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        alert('Xung đột phiên bản: Bàn đã thay đổi trạng thái trước đó. Đang tải lại.')
        await loadTables()
      } else {
        alert(err instanceof Error ? err.message : 'Lỗi khi đổi mã QR bàn')
      }
    } finally {
      setIsRotating(false)
    }
  }

  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableCode.trim() || !newTableName.trim()) {
      alert('Vui lòng nhập đầy đủ mã bàn và tên bàn')
      return
    }

    setIsSubmittingNewTable(true)
    try {
      const res = await adminApi.post<{
        table: AdminTableItem
        qr_token: string
        qr_url: string
      }>('/tables', {
        code: newTableCode.trim().toUpperCase(),
        name: newTableName.trim(),
        seating_area_id: newTableAreaId || null,
        active: true,
      })

      setIsCreateModalOpen(false)
      setNewTableCode('')
      setNewTableName('')
      setNewTableAreaId('')

      if (res.data.qr_token && res.data.qr_url) {
        await generateQrCard(res.data.table, res.data.qr_token, res.data.qr_url, true)
      }

      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi tạo bàn mới')
    } finally {
      setIsSubmittingNewTable(false)
    }
  }

  const handleStartEditTable = (table: AdminTableItem) => {
    setEditingTable(table)
    setEditTableCode(table.code)
    setEditTableName(table.name)
    setEditTableAreaId(table.seating_area_id || '')
    setEditTableActive(table.active)
  }

  const handleUpdateTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTable) return
    if (!editTableCode.trim() || !editTableName.trim()) {
      alert('Vui lòng nhập đầy đủ mã bàn và tên bàn')
      return
    }

    setIsSubmittingEditTable(true)
    try {
      await adminApi.patch(`/tables/${editingTable.id}`, {
        code: editTableCode.trim().toUpperCase(),
        name: editTableName.trim(),
        seating_area_id: editTableAreaId || null,
        active: editTableActive,
        expected_version: editingTable.version,
      })

      setEditingTable(null)
      await loadTables()
      triggerRefresh()
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        alert('Xung đột phiên bản: Thông tin bàn đã bị sửa đổi ở nơi khác. Đang tải lại.')
        await loadTables()
      } else {
        alert(err instanceof Error ? err.message : 'Lỗi khi cập nhật bàn')
      }
    } finally {
      setIsSubmittingEditTable(false)
    }
  }

  const handlePrintTentCard = () => {
    window.print()
  }

  const handleDownloadQrPng = () => {
    if (!tentCardModal?.qrDataUrl) return
    const link = document.createElement('a')
    link.download = `QR-Ban-${tentCardModal.tableCode}.png`
    link.href = tentCardModal.qrDataUrl
    link.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 tracking-tight">
            Quản lý Bàn & Mã QR (Tables & QR Tent Cards)
          </h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Quản lý sơ đồ bàn, mở/đóng phiên khách (visit), xoay vòng mã QR bảo mật và in thẻ bàn
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400">
            Tổng số: <strong className="text-amber-400 font-mono">{tables.length}</strong> bàn
          </span>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-xs transition flex items-center gap-1.5"
          >
            <span>+ Thêm Bàn Mới</span>
          </button>
        </div>
      </div>

      {/* Tables Grid */}
      {isLoading && tables.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-xs text-stone-400">Đang tải danh sách bàn...</p>
        </div>
      ) : error ? (
        <div className="py-12 text-center bg-stone-900 border border-stone-800 rounded-xl p-6">
          <p className="text-xs text-rose-300 mb-3">{error}</p>
          <button
            type="button"
            onClick={loadTables}
            className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-xs font-semibold text-stone-200 rounded-lg"
          >
            Tải lại
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((table) => {
            const isOccupied = Boolean(table.current_visit_id)
            const isActing = actionLoadingId === table.id

            return (
              <div
                key={table.id}
                className={`rounded-xl border p-5 flex flex-col justify-between transition ${
                  isOccupied
                    ? 'bg-stone-900 border-amber-500/40 shadow-sm'
                    : 'bg-stone-900/70 border-stone-800 hover:border-stone-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-amber-500 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/60 uppercase">
                          {table.code}
                        </span>
                        {!table.active && (
                          <span className="text-[10px] bg-stone-800 text-stone-400 px-1.5 py-0.5 rounded">
                            Tạm ngưng
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-stone-100 mt-1">
                        {table.name}
                      </h3>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {table.area_name ? `Khu vực: ${table.area_name}` : 'Khu vực chung'}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                          isOccupied
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-stone-800 text-stone-400 border border-stone-700'
                        }`}
                      >
                        {isOccupied ? 'Có khách' : 'Bàn trống'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStartEditTable(table)}
                        className="text-[11px] text-stone-500 hover:text-stone-300 underline"
                      >
                        Sửa bàn
                      </button>
                    </div>
                  </div>

                  {isOccupied && (
                    <div className="mt-4 pt-3 border-t border-stone-800/80 space-y-1.5 text-xs">
                      <div className="flex justify-between text-stone-400">
                        <span>Đơn chưa trả:</span>
                        <span
                          className={`font-bold font-mono ${
                            table.unpaid_orders_count > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {table.unpaid_orders_count > 0
                            ? `${table.unpaid_orders_count} đơn chưa thanh toán`
                            : '0 đơn'}
                        </span>
                      </div>
                      {table.unpaid_total_vnd > 0 && (
                        <div className="flex justify-between text-stone-400">
                          <span>Chưa thanh toán:</span>
                          <span className="font-bold font-mono text-amber-400">
                            {table.unpaid_total_vnd.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                      )}
                      {table.visit_opened_at && (
                        <div className="text-[11px] text-stone-500 font-mono">
                          Mở lúc: {new Date(table.visit_opened_at).toLocaleTimeString('vi-VN')}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-stone-800 space-y-2">
                  {!isOccupied ? (
                    <button
                      type="button"
                      onClick={() => handleOpenVisit(table)}
                      disabled={isActing}
                      className="w-full py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs transition disabled:opacity-50"
                    >
                      {isActing ? 'Đang mở bàn...' : 'Mở bàn (Bắt đầu phiên)'}
                    </button>
                  ) : (
                    <div className="w-full flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenSettleVisit(table)}
                        aria-label={`Chi tiết và thanh toán bàn ${table.name}`}
                        className="w-full py-2 px-3 rounded-lg font-bold text-xs bg-amber-500 hover:bg-amber-400 text-stone-950 transition shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <span>💳 Chi tiết & Thanh toán phiên</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCloseVisit(table)}
                        disabled={isActing || table.unpaid_orders_count > 0}
                        className={`w-full py-1.5 px-3 rounded-lg font-bold text-xs transition ${
                          table.unpaid_orders_count > 0
                            ? 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-800'
                            : 'bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800'
                        }`}
                        title={
                          table.unpaid_orders_count > 0
                            ? 'Phải thanh toán tất cả đơn trước khi đóng bàn'
                            : 'Đóng bàn kết thúc phiên'
                        }
                      >
                        {table.unpaid_orders_count > 0
                          ? 'Chưa thể đóng (còn đơn nợ)'
                          : 'Đóng bàn (Kết thúc phiên)'}
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    {table.active_qr_token && (
                      <button
                        type="button"
                        onClick={() => {
                          const baseUrl = window.location.origin
                          const fullQrUrl = `${baseUrl}/table/${table.active_qr_token}`
                          generateQrCard(table, table.active_qr_token!, fullQrUrl, false)
                        }}
                        className="py-1.5 px-2.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-[11px] font-semibold border border-stone-700 transition text-center"
                        title="Xem mã QR & in thẻ bàn hiện tại"
                      >
                        📱 Xem mã QR
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRotateConfirmTable(table)}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-stone-950 hover:bg-stone-800 text-stone-300 hover:text-amber-300 text-[11px] font-semibold border border-stone-800 transition text-center"
                      title="Tạo mã QR bảo mật mới (vô hiệu hóa mã cũ)"
                    >
                      🔄 Đổi mã QR (Rotate)
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Rotate QR Confirmation Modal */}
      {rotateConfirmTable && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100 flex items-center gap-2">
                <span className="text-amber-500">⚠️</span> Xác nhận Đổi mã QR ({rotateConfirmTable.name})
              </h3>
              <button
                type="button"
                onClick={() => setRotateConfirmTable(null)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-stone-300 space-y-2 leading-relaxed">
              <p>
                Thao tác này sẽ sinh ra một <strong className="text-amber-400">mã QR bảo mật mới</strong> cho bàn{' '}
                <strong>{rotateConfirmTable.name} ({rotateConfirmTable.code})</strong>.
              </p>
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-200/90 text-[11px]">
                <p className="font-semibold text-amber-300 mb-1">Quy tắc Invariant V07 (QR Lifecycle):</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Tất cả thẻ bàn in mã QR cũ sẽ bị vô hiệu hóa ngay lập tức.</li>
                  <li>Nếu bàn đang có khách ngồi, capability epoch sẽ được nâng lên, yêu cầu khách quét mã mới.</li>
                  <li>Token mới chỉ hiển thị duy nhất một lần tại màn hình tiếp theo.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
              <button
                type="button"
                onClick={() => setRotateConfirmTable(null)}
                disabled={isRotating}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold transition"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmRotateQr}
                disabled={isRotating}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold transition flex items-center gap-1.5"
              >
                {isRotating && (
                  <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                )}
                <span>Xác nhận Đổi & In mã mới</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable QR Tent Card Modal */}
      {tentCardModal && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-100">
                  Mã QR / Liên kết gọi món ({tentCardModal.tableName})
                </h3>
                <p className="text-[11px] text-stone-400">
                  Thẻ Đặt Bàn Mã QR (Table Tent Card) - In thẻ bàn để khách quét gọi món
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTentCardModal(null)}
                className="text-stone-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Printable Tent Card View */}
            <div
              id="printable-tent-card"
              className="bg-white text-stone-900 rounded-xl p-6 shadow-md flex flex-col items-center text-center space-y-3 border border-stone-200"
            >
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-widest font-black text-amber-600">
                  TIGER 345
                </span>
                <h2 className="text-lg font-black tracking-tight text-stone-900">
                  ẨM THỰC TÂY BẮC
                </h2>
                <div className="inline-block bg-stone-900 text-amber-400 font-mono font-bold text-sm px-3 py-1 rounded-full mt-1">
                  BÀN: {tentCardModal.tableName.toUpperCase()} ({tentCardModal.tableCode})
                </div>
              </div>

              {/* QR Image */}
              <div className="p-3 bg-white rounded-xl border border-stone-200 shadow-inner">
                <img
                  src={tentCardModal.qrDataUrl}
                  alt={`QR bàn ${tentCardModal.tableName}`}
                  className="w-56 h-56 object-contain"
                />
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-stone-900">
                  Quét mã để xem thực đơn & gọi món trực tiếp
                </p>
                <p className="text-[10px] text-stone-500 max-w-xs">
                  Không cần tải ứng dụng • Chọn món và gửi thẳng đến quầy bếp
                </p>
              </div>

              <div className="pt-2 border-t border-stone-100 w-full text-[9px] font-mono text-stone-400">
                tiger345.com • Hotline: 0987.654.321
              </div>
            </div>

            {tentCardModal.isOneTimeToken && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-[11px] leading-relaxed">
                <strong>Lưu ý bảo mật (Invariant V07):</strong> Mã liên kết này chỉ hiển thị duy nhất một lần. Hệ thống chỉ lưu SHA-256 hash của token trong cơ sở dữ liệu. Vui lòng in hoặc lưu ngay lúc này.
              </div>
            )}

            <div className="bg-stone-950 p-2.5 rounded-lg border border-stone-800 text-[11px] font-mono text-stone-400 break-all select-all">
              {tentCardModal.qrUrl}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-800">
              <a
                href={tentCardModal.qrUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline"
              >
                Mở thử trang gọi món ↗
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadQrPng}
                  className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-semibold rounded-lg transition"
                >
                  Tải ảnh QR (PNG)
                </button>
                <button
                  type="button"
                  onClick={handlePrintTentCard}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1"
                >
                  <span>🖨️ In Thẻ Bàn (Print)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Table Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100">Thêm Bàn Mới</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mã bàn (Code) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: T01, VIP1, SAN_VUON_2"
                  value={newTableCode}
                  onChange={(e) => setNewTableCode(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 uppercase font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Tên hiển thị <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Bàn 01, Bàn VIP Sông Đà"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Khu vực chỗ ngồi
                </label>
                <select
                  value={newTableAreaId}
                  onChange={(e) => setNewTableAreaId(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Chọn khu vực (tùy chọn) --</option>
                  {seatingAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name} ({area.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNewTable}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingNewTable && (
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Tạo bàn & Sinh mã QR</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Table Modal */}
      {editingTable && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100">
                Chỉnh sửa {editingTable.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditingTable(null)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateTable} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Mã bàn (Code) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTableCode}
                  onChange={(e) => setEditTableCode(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 uppercase font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Tên hiển thị <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTableName}
                  onChange={(e) => setEditTableName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1">
                  Khu vực chỗ ngồi
                </label>
                <select
                  value={editTableAreaId}
                  onChange={(e) => setEditTableAreaId(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Không phân khu --</option>
                  {seatingAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name} ({area.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editTableActive"
                  checked={editTableActive}
                  onChange={(e) => setEditTableActive(e.target.checked)}
                  className="rounded border-stone-700 bg-stone-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="editTableActive" className="text-xs text-stone-300">
                  Bàn đang hoạt động (cho phép khách ngồi & phục vụ)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingTable(null)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEditTable}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {isSubmittingEditTable && (
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Lưu thay đổi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Settle Visit & Detail Modal */}
      {selectedVisitTable && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 font-sans">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-900 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <h2 className="text-lg font-bold text-amber-400">
                  {`Phiên phục vụ: ${selectedVisitTable.name} (${selectedVisitTable.code})`}
                </h2>
                {visitDetail && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-stone-800 text-stone-300 border border-stone-700">
                    v{visitDetail.visit.version}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedVisitTable(null)
                  setVisitDetail(null)
                }}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {isLoadingVisit && !visitDetail && (
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-stone-400">Đang tải thông tin phiên bàn...</p>
                </div>
              )}

              {visitError && (
                <div className="p-3.5 bg-rose-950/70 border border-rose-800 rounded-xl text-xs text-rose-200">
                  {visitError}
                </div>
              )}

              {visitSuccess && (
                <div className="p-3.5 bg-emerald-950/70 border border-emerald-800 rounded-xl text-xs text-emerald-200">
                  {visitSuccess}
                </div>
              )}

              {visitDetail && (
                <>
                  {/* Summary Banner */}
                  <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-stone-400 block font-medium">Trạng thái phiên</span>
                      <span className="text-sm font-bold text-stone-100 uppercase mt-0.5 block">
                        {visitDetail.visit.status === 'active' ? 'Đang phục vụ' : 'Đã kết thúc'}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block font-medium">Đơn chưa trả</span>
                      <span
                        className={`text-sm font-bold font-mono mt-0.5 block ${
                          visitDetail.unpaid_summary.unpaid_orders_count > 0
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {visitDetail.unpaid_summary.unpaid_orders_count} đơn
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-400 block font-medium">Tổng nợ cần thu</span>
                      <span className="text-base font-black font-mono text-amber-400 mt-0.5 block">
                        {visitDetail.unpaid_summary.unpaid_total_vnd.toLocaleString('vi-VN')}đ
                      </span>
                    </div>
                  </div>

                  {/* Orders Breakdown */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
                        Các đợt gọi món ({visitDetail.orders.length})
                      </h4>
                      <span className="text-[11px] text-stone-400">
                        {`Đang hoạt động: ${visitDetail.unpaid_summary.active_orders_count} đơn`}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {visitDetail.orders.length === 0 ? (
                        <div className="p-4 bg-stone-950/50 rounded-xl border border-stone-800 text-stone-400 text-xs text-center">
                          Chưa có đơn gọi món nào trong phiên này.
                        </div>
                      ) : (
                        visitDetail.orders.map((order) => (
                          <div
                            key={order.id}
                            className="bg-stone-950/80 border border-stone-800 rounded-xl p-3.5 space-y-2"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-2">
                                <span className="font-mono font-bold text-amber-400">
                                  {order.code}
                                </span>
                                <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase bg-stone-800 text-stone-300">
                                  {order.status}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                    order.payment_status === 'paid'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : order.payment_status === 'refunded'
                                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {order.payment_status === 'paid'
                                    ? 'ĐÃ TRẢ'
                                    : order.payment_status === 'refunded'
                                    ? 'HOÀN TIỀN'
                                    : 'CHƯA TRẢ'}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-stone-100 text-sm">
                                {order.total_vnd.toLocaleString('vi-VN')}đ
                              </span>
                            </div>

                            {/* Items summary */}
                            <div className="text-[11px] text-stone-400 divide-y divide-stone-900 pt-1">
                              {(order.items_summary || []).map((it, idx) => (
                                <div key={idx} className="flex justify-between py-0.5">
                                  <span>
                                    {it.name} x {it.quantity}
                                  </span>
                                  <span className="font-mono">
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

                  {/* Settlement / Close Controls */}
                  <div className="pt-3 border-t border-stone-800 space-y-4">
                    {visitDetail.unpaid_summary.unpaid_orders_count > 0 ? (
                      <div className="p-4 bg-stone-950 border border-amber-800/40 rounded-xl space-y-3">
                        <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                          Thanh toán toàn bộ phiên (Settle Visit - Invariant V18)
                        </h4>
                        <p className="text-[11px] text-stone-400 leading-relaxed">
                          Dine-in thanh toán toàn bộ các đơn chưa thanh toán trong phiên cùng một lúc
                          (không hỗ trợ thanh toán lẻ từng món).
                        </p>

                        <div>
                          <span className="text-xs text-stone-300 block font-medium mb-1.5">
                            Hình thức thanh toán:
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            <label
                              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border cursor-pointer transition ${
                                settleMethod === 'cash'
                                  ? 'bg-amber-500 text-stone-950 border-amber-400'
                                  : 'bg-stone-900 text-stone-300 border-stone-700 hover:border-stone-600'
                              }`}
                            >
                              <input
                                type="radio"
                                name="settleMethod"
                                value="cash"
                                checked={settleMethod === 'cash'}
                                onChange={() => setSettleMethod('cash')}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <span>💵 Tiền mặt (Cash)</span>
                            </label>
                            <label
                              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded-lg border cursor-pointer transition ${
                                settleMethod === 'bank_transfer'
                                  ? 'bg-amber-500 text-stone-950 border-amber-400'
                                  : 'bg-stone-900 text-stone-300 border-stone-700 hover:border-stone-600'
                              }`}
                            >
                              <input
                                type="radio"
                                name="settleMethod"
                                value="bank_transfer"
                                checked={settleMethod === 'bank_transfer'}
                                onChange={() => setSettleMethod('bank_transfer')}
                                className="text-amber-600 focus:ring-amber-500"
                              />
                              <span>🏦 Chuyển khoản (Bank)</span>
                            </label>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleSettleVisit}
                          disabled={isSettling}
                          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {isSettling ? (
                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span>
                              ✓ Xác nhận thanh toán toàn bộ ({visitDetail.unpaid_summary.unpaid_total_vnd.toLocaleString('vi-VN')}đ)
                            </span>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 bg-stone-950 border border-stone-800 rounded-xl space-y-3">
                        <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
                          <span>✓ Tất cả đơn hàng trong phiên đã được thanh toán đầy đủ.</span>
                        </div>

                        <button
                          type="button"
                          onClick={handleCloseVisitFromModal}
                          disabled={isClosingVisit}
                          className="w-full py-2.5 px-4 bg-rose-800 hover:bg-rose-700 text-white font-bold text-xs rounded-xl transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
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

            {/* Modal Footer */}
            <div className="px-6 py-3 bg-stone-900 border-t border-stone-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedVisitTable(null)
                  setVisitDetail(null)
                }}
                className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold text-xs rounded-lg border border-stone-700 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
