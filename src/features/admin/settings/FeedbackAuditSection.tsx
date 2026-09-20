import { useState, type FC, type FormEvent } from 'react'
import { adminApi } from '../../../lib/api/client'
import type { AdminConciergeFeedback, AdminAuditLog } from '../types'

interface FeedbackAuditSectionProps {
  feedbackList: AdminConciergeFeedback[]
  auditLogs: AdminAuditLog[]
  onReload: () => Promise<void>
  onNotify: (text: string, type: 'success' | 'error') => void
}

const RATING_LABELS: Record<string, { label: string; color: string }> = {
  perfect: { label: '🌟 Rất vừa vặn & Hài lòng', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-800' },
  too_much: { label: '🍲 Hơi nhiều món / No quá', color: 'text-blue-400 bg-blue-950/60 border-blue-800' },
  too_little: { label: '🥣 Hơi ít món / Chưa đủ no', color: 'text-amber-400 bg-amber-950/60 border-amber-800' },
  too_expensive: { label: '💰 Giá hơi cao so với ngân sách', color: 'text-purple-400 bg-purple-950/60 border-purple-800' },
  dislike: { label: '👎 Không hợp khẩu vị', color: 'text-rose-400 bg-rose-950/60 border-rose-800' },
}

export const FeedbackAuditSection: FC<FeedbackAuditSectionProps> = ({
  feedbackList,
  auditLogs,
  onReload,
  onNotify,
}) => {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL')
  const [updatingFeedbackId, setUpdatingFeedbackId] = useState<string | null>(null)
  const [editingFeedback, setEditingFeedback] = useState<AdminConciergeFeedback | null>(null)
  const [adminNoteInput, setAdminNoteInput] = useState<string>('')
  const [newStatusInput, setNewStatusInput] = useState<'NEW' | 'REVIEWED' | 'DISMISSED'>('REVIEWED')

  // Audit Logs Filter
  const [logFilter, setLogFilter] = useState<string>('ALL')

  const filteredFeedback = feedbackList.filter((f) => {
    if (selectedStatusFilter !== 'ALL' && f.status !== selectedStatusFilter) return false
    return true
  })

  const filteredLogs = auditLogs.filter((log) => {
    if (logFilter !== 'ALL' && log.entity_type !== logFilter) return false
    return true
  })

  const handleOpenReviewModal = (item: AdminConciergeFeedback) => {
    setEditingFeedback(item)
    setAdminNoteInput(item.admin_notes || '')
    setNewStatusInput(item.status === 'NEW' ? 'REVIEWED' : item.status)
  }

  const handleSaveFeedbackReview = async (e: FormEvent) => {
    e.preventDefault()
    if (!editingFeedback) return

    setUpdatingFeedbackId(editingFeedback.id)
    try {
      await adminApi.patch(`/feedback/concierge/${editingFeedback.id}`, {
        status: newStatusInput,
        admin_notes: adminNoteInput.trim() || null,
      })
      setEditingFeedback(null)
      onNotify('Đã cập nhật trạng thái phản hồi trợ lý!', 'success')
      await onReload()
    } catch (err: unknown) {
      onNotify(err instanceof Error ? err.message : 'Lỗi cập nhật phản hồi', 'error')
    } finally {
      setUpdatingFeedbackId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Concierge Feedback Review Section */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>🤖 Phản Hồi Từ Khách Cho Trợ Lý Concierge</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Đánh giá gợi ý mâm tiệc, điều chỉnh khẩu vị và ghi chú huấn luyện
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Tất cả trạng thái ({feedbackList.length})</option>
              <option value="NEW">Mới gửi (NEW)</option>
              <option value="REVIEWED">Đã xem xét (REVIEWED)</option>
              <option value="DISMISSED">Bỏ qua (DISMISSED)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          {filteredFeedback.length === 0 ? (
            <div className="p-8 text-center text-stone-500 text-xs bg-stone-950 rounded-xl border border-stone-800/80">
              Chưa có phản hồi nào phù hợp với bộ lọc
            </div>
          ) : (
            filteredFeedback.map((fb) => {
              const ratingInfo = RATING_LABELS[fb.rating] || {
                label: fb.rating,
                color: 'text-stone-300 bg-stone-800 border-stone-700',
              }

              return (
                <div
                  key={fb.id}
                  className="bg-stone-950 border border-stone-800/80 rounded-xl p-4 text-xs space-y-2 hover:border-stone-700 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${ratingInfo.color}`}>
                        {ratingInfo.label}
                      </span>
                      <span className="font-mono text-[11px] text-stone-500">
                        Proposal #{fb.proposal_id.slice(0, 8)} (v{fb.proposal_version})
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-stone-500 text-[11px]">
                        {new Date(fb.created_at).toLocaleString('vi-VN')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                          fb.status === 'NEW'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : fb.status === 'REVIEWED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-stone-800 text-stone-400'
                        }`}
                      >
                        {fb.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenReviewModal(fb)}
                        className="px-2.5 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 font-semibold rounded-lg transition"
                      >
                        Xem xét
                      </button>
                    </div>
                  </div>

                  {fb.feedback_text ? (
                    <p className="text-stone-200 font-medium italic bg-stone-900/50 p-2.5 rounded-lg border border-stone-800/50">
                      "{fb.feedback_text}"
                    </p>
                  ) : (
                    <p className="text-stone-500 italic">Không có góp ý bằng chữ</p>
                  )}

                  {fb.admin_notes && (
                    <div className="text-[11px] text-amber-300/90 bg-amber-950/20 border border-amber-900/30 p-2 rounded-lg">
                      <span className="font-bold">Ghi chú bếp / quản lý:</span> {fb.admin_notes}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Audit Log Timeline Section */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h2 className="text-sm font-bold text-stone-200 uppercase tracking-wider flex items-center gap-2">
              <span>📜 Nhật Ký Hoạt Động Hệ Thống (Audit Logs)</span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Ghi nhận thao tác thay đổi cấu hình, xoay QR, đơn hàng và bảo mật
            </p>
          </div>

          <div>
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">-- Tất cả đối tượng ({auditLogs.length}) --</option>
              <option value="menu_item">Món ăn (menu_item)</option>
              <option value="category">Danh mục (category)</option>
              <option value="table">Bàn ăn (table)</option>
              <option value="settings">Cấu hình quán (settings)</option>
              <option value="order">Đơn hàng (order)</option>
              <option value="reservation">Đặt bàn (reservation)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 bg-stone-950/80 border-b border-stone-800">
              <tr>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3">Người thực hiện</th>
                <th className="py-2.5 px-3">Hành động</th>
                <th className="py-2.5 px-3">Đối tượng</th>
                <th className="py-2.5 px-3">Chi tiết thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">
                    Chưa có nhật ký hoạt động nào
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-800/30 font-mono text-[11px]">
                    <td className="py-2.5 px-3 text-stone-400 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-stone-200">
                      {log.admin_name || log.actor_kind}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-stone-950 text-amber-400 border border-stone-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-stone-300 font-sans">
                      <span className="font-semibold text-stone-200">{log.entity_type}</span>
                      {log.entity_id && (
                        <span className="text-stone-500 ml-1 text-[10px]">({log.entity_id.slice(0, 8)})</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-stone-400 max-w-xs truncate font-mono text-[10px]">
                      {JSON.stringify(log.metadata)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Feedback Modal */}
      {editingFeedback && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-bold text-stone-100">Xử Lý Phản Hồi Trợ Lý</h3>
              <button
                type="button"
                onClick={() => setEditingFeedback(null)}
                className="text-stone-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveFeedbackReview} className="space-y-4 text-xs">
              <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1.5">
                <div className="font-bold text-amber-400">
                  {RATING_LABELS[editingFeedback.rating]?.label || editingFeedback.rating}
                </div>
                {editingFeedback.feedback_text && (
                  <p className="text-stone-300 italic font-medium">"{editingFeedback.feedback_text}"</p>
                )}
              </div>

              <div>
                <label className="block font-medium text-stone-300 mb-1">Cập nhật trạng thái</label>
                <select
                  value={newStatusInput}
                  onChange={(e) =>
                    setNewStatusInput(e.target.value as 'NEW' | 'REVIEWED' | 'DISMISSED')
                  }
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="REVIEWED">REVIEWED (Đã tiếp thu & điều chỉnh)</option>
                  <option value="DISMISSED">DISMISSED (Bỏ qua / Không cần can thiệp)</option>
                  <option value="NEW">NEW (Để xem xét sau)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-stone-300 mb-1">Ghi chú của quản trị viên</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú nguyên nhân hoặc điều chỉnh món ăn/công thức..."
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditingFeedback(null)}
                  className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updatingFeedbackId !== null}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  {updatingFeedbackId !== null && (
                    <span className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>Lưu Xem Xét</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
