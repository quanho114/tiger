import type { FC } from 'react'
import { Calendar, Users, Phone, MapPin, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { ReservationSummaryCardData } from '../types'

interface ReservationSummaryCardProps {
  reservation: ReservationSummaryCardData
  onConfirmReservation?: () => void
  disabled?: boolean
}

export const ReservationSummaryCard: FC<ReservationSummaryCardProps> = ({
  reservation,
  onConfirmReservation,
  disabled = false,
}) => {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden text-xs">
      <div className="p-3.5 bg-gradient-to-r from-emerald-500/10 via-emerald-400/5 to-transparent border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-700" />
          <span className="font-bold text-emerald-950 uppercase tracking-wider">
            Thông tin đặt bàn dự kiến
          </span>
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        <div className="grid grid-cols-2 gap-2 text-stone-700">
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-stone-600" />
            <span>Số khách: <strong className="text-stone-900">{reservation.guest_count} người</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <ClockIcon className="w-3.5 h-3.5 text-stone-600" />
            <span>Thời gian: <strong className="text-stone-900">{reservation.starts_at_formatted}</strong></span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-stone-600" />
            <span>SĐT: <strong className="text-stone-900">{reservation.phone}</strong></span>
          </div>
          {reservation.seating_area_name && (
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-stone-600" />
              <span>Khu vực: <strong className="text-stone-900">{reservation.seating_area_name}</strong></span>
            </div>
          )}
        </div>

        {reservation.note && (
          <p className="text-stone-600 text-[11px] bg-stone-50 p-2 rounded border border-stone-100 italic">
            Ghi chú: {reservation.note}
          </p>
        )}

        <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200/80 text-amber-900 flex items-start gap-2 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
          <span>{reservation.disclaimer}</span>
        </div>
      </div>

      {onConfirmReservation && (
        <div className="p-3 bg-stone-50 border-t border-stone-100 flex justify-end">
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirmReservation}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 active:scale-95 shadow-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Xác nhận thông tin đặt bàn</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
