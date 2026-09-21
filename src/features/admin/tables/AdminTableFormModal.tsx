import { useState, type FC, type FormEvent } from 'react'
import { X, Armchair, Plus, Check } from 'lucide-react'
import type { AdminTableItem, AdminSeatingArea } from '../types'

interface AdminTableFormModalProps {
  table?: AdminTableItem | null // null for Create, AdminTableItem for Edit
  seatingAreas: AdminSeatingArea[]
  isSubmitting: boolean
  onClose: () => void
  onSubmit: (formData: {
    code: string
    name: string
    seatingAreaId: string
    active?: boolean
  }) => Promise<void>
}

export const AdminTableFormModal: FC<AdminTableFormModalProps> = ({
  table,
  seatingAreas,
  isSubmitting,
  onClose,
  onSubmit,
}) => {
  const isEditing = Boolean(table)
  const [code, setCode] = useState<string>(table?.code || '')
  const [name, setName] = useState<string>(table?.name || '')
  const [seatingAreaId, setSeatingAreaId] = useState<string>(table?.seating_area_id || '')
  const [active, setActive] = useState<boolean>(table?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim()) {
      setError('Vui lòng nhập đầy đủ mã bàn và tên bàn')
      return
    }

    try {
      setError(null)
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        seatingAreaId,
        active,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lỗi khi lưu thông tin bàn')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
              <Armchair className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {isEditing ? `Chỉnh sửa bàn: ${table?.name}` : 'Thêm Bàn Mới'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mã bàn (Code) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: T01, VIP1, SAN_VUON_2"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 uppercase font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tên hiển thị <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="VD: Bàn 01, Bàn VIP Sông Đà"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Khu vực chỗ ngồi
            </label>
            <select
              value={seatingAreaId}
              onChange={(e) => setSeatingAreaId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">-- Không phân khu (Khu chung) --</option>
              {seatingAreas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name} ({area.code})
                </option>
              ))}
            </select>
          </div>

          {isEditing && (
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="tableActive"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <label htmlFor="tableActive" className="text-xs text-slate-700 font-medium">
                Bàn đang hoạt động (cho phép khách ngồi & phục vụ)
              </label>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-2xs flex items-center space-x-1.5"
            >
              {isSubmitting ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isEditing ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{isEditing ? 'Lưu thay đổi' : 'Tạo bàn & Sinh mã QR'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
