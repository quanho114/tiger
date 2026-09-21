import type { FC } from 'react'
import { X, AlertTriangle, RefreshCw } from 'lucide-react'
import type { AdminTableItem } from '../types'

interface AdminTableRotateQrModalProps {
  table: AdminTableItem
  isRotating: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}

export const AdminTableRotateQrModal: FC<AdminTableRotateQrModalProps> = ({
  table,
  isRotating,
  onClose,
  onConfirm,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              Đổi mã QR ({table.name})
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

        <div className="text-xs text-slate-600 space-y-2.5 leading-relaxed">
          <p>
            Thao tác này sẽ sinh ra một <strong className="text-slate-900 font-semibold">mã QR bảo mật mới</strong> cho bàn{' '}
            <strong className="text-blue-600 font-semibold">{table.name} ({table.code})</strong>.
          </p>

          <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-900 text-[11px] space-y-1">
            <p className="font-bold text-amber-900">Quy tắc Invariant V07 (QR Lifecycle):</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800">
              <li>Mọi thẻ bàn in mã QR cũ sẽ bị vô hiệu hóa ngay lập tức.</li>
              <li>Nếu bàn đang có khách ngồi, capability epoch sẽ nâng lên, yêu cầu khách quét mã mới.</li>
              <li>Token mới chỉ hiển thị duy nhất một lần tại màn hình tiếp theo.</li>
            </ul>
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isRotating}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRotating}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-2xs flex items-center space-x-1.5"
          >
            {isRotating ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : null}
            <span>Xác nhận Đổi & In mã mới</span>
          </button>
        </div>
      </div>
    </div>
  )
}
