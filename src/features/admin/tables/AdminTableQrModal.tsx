import type { FC } from 'react'
import { X, Printer, Download, ExternalLink, QrCode, ShieldCheck } from 'lucide-react'

export interface QrTentCardModalState {
  tableName: string
  tableCode: string
  areaName?: string | null
  qrToken: string
  qrUrl: string
  qrDataUrl: string
  isOneTimeToken: boolean
}

interface AdminTableQrModalProps {
  data: QrTentCardModalState
  onClose: () => void
}

export const AdminTableQrModal: FC<AdminTableQrModalProps> = ({ data, onClose }) => {
  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPng = () => {
    if (!data.qrDataUrl) return
    const link = document.createElement('a')
    link.download = `QR-Ban-${data.tableCode}.png`
    link.href = data.qrDataUrl
    link.click()
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-lg shadow-xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Thẻ Đặt Bàn Mã QR ({data.tableName})
              </h3>
              <p className="text-[11px] text-slate-500">
                In thẻ bàn hoặc tải mã QR để khách quét gọi món
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Tent Card Preview Card */}
        <div
          id="printable-tent-card"
          className="bg-slate-50/80 rounded-2xl p-6 border border-slate-200/80 flex flex-col items-center text-center space-y-3.5 shadow-2xs"
        >
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase tracking-widest font-extrabold text-blue-600">
              TIGER 345
            </span>
            <h2 className="text-base font-bold tracking-tight text-slate-900">
              BẾP & QUÁN • ẨM THỰC TÂY BẮC
            </h2>
            <div className="inline-block bg-slate-900 text-white font-mono font-bold text-xs px-3 py-1 rounded-full mt-1">
              BÀN: {data.tableName.toUpperCase()} ({data.tableCode})
            </div>
          </div>

          {/* QR Container */}
          <div className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <img
              src={data.qrDataUrl}
              alt={`QR bàn ${data.tableName}`}
              className="w-52 h-52 object-contain rounded-lg"
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-900">
              Quét mã để xem thực đơn & gọi món trực tiếp
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs">
              Không cần tải ứng dụng • Món ăn được gửi trực tiếp đến quầy bếp
            </p>
          </div>

          <div className="pt-2 border-t border-slate-200/80 w-full text-[10px] font-mono text-slate-400">
            tiger345.com • Hotline: 0987.654.321
          </div>
        </div>

        {/* Security Invariant Note */}
        {data.isOneTimeToken && (
          <div className="p-3 bg-blue-50 border border-blue-200/80 rounded-xl text-blue-800 text-[11px] leading-relaxed flex items-start space-x-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <strong>Lưu ý bảo mật (Invariant V07):</strong> Mã liên kết này chỉ hiển thị một lần.
              Hệ thống chỉ lưu SHA-256 hash của token trong cơ sở dữ liệu. Vui lòng in hoặc lưu ảnh ngay lúc này.
            </div>
          </div>
        )}

        {/* Link display */}
        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] font-mono text-slate-600 break-all select-all">
          {data.qrUrl}
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <a
            href={data.qrUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center space-x-1"
          >
            <span>Mở thử trang gọi món</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tải ảnh PNG</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition shadow-2xs flex items-center space-x-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Thẻ Bàn</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
