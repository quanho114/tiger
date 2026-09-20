/**
 * Fact-Forcing Metadata:
 * - Importers/Callers: src/features/concierge/components/ConciergeChatView.tsx
 * - Affected API: ReservationStatusCard component
 * - Data Schemas: ReservationStatusCardData
 * - Verbatim Instruction: "Submit qua C02, trạng thái pending; status lookup auth; không cam kết giữ bàn khi chưa được quán xác nhận."
 */

import type { FC } from 'react'
import { CalendarCheck, Clock, Users, User, AlertCircle } from 'lucide-react'
import type { ReservationStatusCardData } from '../types'

interface ReservationStatusCardProps {
  reservationStatus: ReservationStatusCardData
}

export const ReservationStatusCard: FC<ReservationStatusCardProps> = ({ reservationStatus }) => {
  const isPending = reservationStatus.status === 'pending'
  const isConfirmed = reservationStatus.status === 'confirmed'

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm p-4 text-xs space-y-2.5">
      <div className="flex items-center justify-between border-b border-stone-100 pb-2">
        <div className="flex items-center gap-1.5 font-bold text-stone-900">
          <CalendarCheck className="w-4 h-4 text-emerald-700" />
          <span>Phiếu đặt bàn: #{reservationStatus.reservation_code}</span>
        </div>
        <span
          className={`px-2 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
            isPending
              ? 'bg-amber-100 text-amber-800'
              : isConfirmed
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-stone-100 text-stone-700'
          }`}
        >
          {isPending
            ? 'Chờ nhà hàng xác nhận'
            : isConfirmed
            ? 'Đã xác nhận bàn'
            : reservationStatus.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-stone-700">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-stone-500" />
          <span>Khách: <strong className="text-stone-900">{reservationStatus.customer_name}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-stone-500" />
          <span>Số lượng: <strong className="text-stone-900">{reservationStatus.guest_count} người</strong></span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-stone-700 bg-stone-50 p-2 rounded border border-stone-100">
        <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
        <span>Thời gian đến: <strong>{reservationStatus.starts_at_formatted}</strong></span>
      </div>

      <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50/70 p-2 rounded border border-amber-200/60">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
        <span>
          {isPending
            ? 'Yêu cầu đặt bàn đã được tiếp nhận (chưa cam kết giữ bàn trước khi quán xác nhận). Nhân viên Tiger 345 sẽ liên hệ qua điện thoại trong vòng 15 phút để hoàn tất giữ chỗ.'
            : 'Bàn đã được xác nhận giữ chỗ trên hệ thống Tiger 345.'}
        </span>
      </div>
    </div>
  )
}
