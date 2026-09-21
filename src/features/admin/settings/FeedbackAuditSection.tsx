import { useState, type FC, type FormEvent } from 'react'
import { Bot, ScrollText, X, Check, Filter } from 'lucide-react'
import { adminApi } from '../../../lib/api/client'
import type { AdminConciergeFeedback, AdminAuditLog } from '../types'

interface FeedbackAuditSectionProps {
  feedbackList: AdminConciergeFeedback[]
  auditLogs: AdminAuditLog[]
  onReload: () => Promise<void>
  onNotify: (text: string, type: 'success' | 'error') => void
}

const RATING_LABELS: Record<string, { label: string; badgeClass: string }> = {
  perfect: { label: 'Rất vừa vặn & Hài lòng', badgeClass: 'text-emerald-700 bg-emerald-50 border-emerald-200/80' },
  too_much: { label: 'Hơi nhiều món / No quá', badgeClass: 'text-blue-700 bg-blue-50 border-blue-200/80' },
  too_little: { label: 'Hơi ít món / Chưa đủ no', badgeClass: 'text-amber-700 bg-amber-50 border-amber-200/80' },
  too_expensive: { label: 'Giá hơi cao so với ngân sách', badgeClass: 'text-purple-700 bg-purple-50 border-purple-200/80' },
  dislike: { label: 'Không hợp khẩu vị', badgeClass: 'text-rose-700 bg-rose-50 border-rose-200/80' },
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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
                <Bot className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Phản Hồi Từ Khách Cho Trợ Lý Concierge
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Đánh giá gợi ý mâm tiệc, điều chỉnh khẩu vị và ghi chú huấn luyện
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
              Chưa có phản hồi nào phù hợp với bộ lọc
            </div>
          ) : (
            filteredFeedback.map((fb) => {
              const ratingInfo = RATING_LABELS[fb.rating] || {
                label: fb.rating,
                badgeClass: 'text-slate-700 bg-slate-100 border-slate-200',
              }

              return (
                <div
                  key={fb.id}
                  className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 text-xs space-y-2 hover:border-slate-300 transition shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ratingInfo.badgeClass}`}>
                        {ratingInfo.label}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Proposal #{fb.proposal_id.slice(0, 8)} (v{fb.proposal_version})
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-slate-400 text-[11px]">
                        {new Date(fb.created_at).toLocaleString('vi-VN')}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${
                          fb.status === 'NEW'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : fb.status === 'REVIEWED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {fb.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenReviewModal(fb)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 font-semibold rounded-lg transition shadow-2xs cursor-pointer"
                      >
                        Xem xét
                      </button>
                    </div>
                  </div>

                  {fb.feedback_text ? (
                    <p className="text-slate-800 font-medium italic bg-white p-2.5 rounded-lg border border-slate-200/80">
                      "{fb.feedback_text}"
                    </p>
                  ) : (
                    <p className="text-slate-400 italic">Không có góp ý bằng chữ</p>
                  )}

                  {fb.admin_notes && (
                    <div className="text-[11px] text-blue-800 bg-blue-50/80 border border-blue-200/60 p-2.5 rounded-lg">
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
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
                <ScrollText className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-900">
                Nhật Ký Hoạt Động Hệ Thống (Audit Logs)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ghi nhận thao tác thay đổi cấu hình, xoay QR, đơn hàng và bảo mật
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500 bg-slate-50 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Thời gian</th>
                <th className="py-2.5 px-3">Người thực hiện</th>
                <th className="py-2.5 px-3">Hành động</th>
                <th className="py-2.5 px-3">Đối tượng</th>
                <th className="py-2.5 px-3">Chi tiết thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Chưa có nhật ký hoạt động nào
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 font-mono text-[11px] transition">
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-900 font-medium">
                      {log.admin_name || log.actor_kind}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60 font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-800 font-sans">
                      <span className="font-semibold text-slate-900">{log.entity_type}</span>
                      {log.entity_id && (
                        <span className="text-slate-400 ml-1 text-[10px]">({log.entity_id.slice(0, 8)})</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate font-mono text-[10px]">
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Xử Lý Phản Hồi Trợ Lý</h3>
              <button
                type="button"
                onClick={() => setEditingFeedback(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFeedbackReview} className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-semibold text-blue-700">
                  {RATING_LABELS[editingFeedback.rating]?.label || editingFeedback.rating}
                </div>
                {editingFeedback.feedback_text && (
                  <p className="text-slate-700 italic font-medium">"{editingFeedback.feedback_text}"</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cập nhật trạng thái</label>
                <select
                  value={newStatusInput}
                  onChange={(e) =>
                    setNewStatusInput(e.target.value as 'NEW' | 'REVIEWED' | 'DISMISSED')
                  }
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="REVIEWED">REVIEWED (Đã tiếp thu & điều chỉnh)</option>
                  <option value="DISMISSED">DISMISSED (Bỏ qua / Không cần can thiệp)</option>
                  <option value="NEW">NEW (Để xem xét sau)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi chú của quản trị viên</label>
                <textarea
                  rows={3}
                  placeholder="Ghi chú nguyên nhân hoặc điều chỉnh món ăn/công thức..."
                  value={adminNoteInput}
                  onChange={(e) => setAdminNoteInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingFeedback(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={updatingFeedbackId !== null}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center gap-1.5 shadow-2xs"
                >
                  {updatingFeedbackId !== null ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
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
