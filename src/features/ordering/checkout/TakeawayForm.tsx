import { useEffect, useState } from 'react'
import { AlertCircle, MapPin, Clock, ShoppingBag } from 'lucide-react'
import { Field } from '@/shared/ui/Field'
import { CheckoutAuthPrompt } from '@/features/auth'
import type { CheckoutState } from './useCheckout'

type TakeawayFormProps = Pick<
  CheckoutState,
  | 'takeawayForm'
  | 'takeawayFieldErrors'
  | 'takeawayOrderError'
  | 'setTakeawayFormField'
  | 'handlePlaceTakeawayOrder'
>

function generatePickupSlots(): string[] {
  const now = new Date()
  const start = new Date(now.getTime() + 30 * 60_000)
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0)
  const slots: string[] = []
  for (let i = 0; i < 16; i++) {
    const slot = new Date(start.getTime() + i * 15 * 60_000)
    slots.push(
      `${String(slot.getHours()).padStart(2, '0')}:${String(slot.getMinutes()).padStart(2, '0')}`
    )
  }
  return slots
}

export function TakeawayForm({
  takeawayForm,
  takeawayFieldErrors,
  takeawayOrderError,
  setTakeawayFormField,
  handlePlaceTakeawayOrder,
}: TakeawayFormProps) {
  const [pickupSlots, setPickupSlots] = useState<string[]>([])

  useEffect(() => {
    setPickupSlots(generatePickupSlots())
  }, [])

  return (
    <form
      id="takeaway-form"
      onSubmit={(e) => {
        e.preventDefault()
        void handlePlaceTakeawayOrder()
      }}
      className="pt-4 border-t border-[#d2b68c]/30 space-y-3"
    >
      <CheckoutAuthPrompt />

      <h5 className="text-xs font-semibold uppercase tracking-wider text-[#234386] flex items-center gap-1.5">
        <ShoppingBag size={14} className="text-[#ed7328]" />
        <span>Thông tin nhận món</span>
      </h5>

      <div className="p-3 rounded-xl bg-[#fbf9f6] border border-[#d2b68c]/40 space-y-1.5 text-xs text-black/80">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-[#ed7328] shrink-0" />
          <span>Nhận tại Tiger 345 – Vĩnh An, Vĩnh Cửu</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-[#ed7328] shrink-0" />
          <span>Dự kiến sẵn sàng: 20–30 phút</span>
        </div>
      </div>

      {takeawayOrderError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{takeawayOrderError}</span>
        </div>
      )}

      <Field label="Họ và tên của bạn" required error={takeawayFieldErrors.customerName}>
        <input
          type="text"
          required
          placeholder="Ví dụ: Nguyễn Văn A"
          value={takeawayForm.customerName}
          onChange={(e) => setTakeawayFormField('customerName', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      <Field
        label="Số điện thoại liên hệ"
        required
        hint="Số di động 10 chữ số tại Việt Nam"
        error={takeawayFieldErrors.customerPhone}
      >
        <input
          type="tel"
          required
          placeholder="Ví dụ: 090 280 99 29"
          value={takeawayForm.customerPhone}
          onChange={(e) => setTakeawayFormField('customerPhone', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      <Field
        label="Chọn giờ lấy"
        hint="Để trống nếu bạn muốn nhận càng sớm càng tốt"
        error={takeawayFieldErrors.pickupTime}
      >
        <select
          value={takeawayForm.pickupTime ?? ''}
          onChange={(e) => setTakeawayFormField('pickupTime', e.target.value || null)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        >
          <option value="">Càng sớm càng tốt</option>
          {pickupSlots.map((slot) => (
            <option key={slot} value={slot}>
              {slot}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ghi chú cho bếp (không bắt buộc)">
        <input
          type="text"
          placeholder="Ví dụ: Ít cay, lấy thêm chén chấm..."
          value={takeawayForm.orderNote}
          onChange={(e) => setTakeawayFormField('orderNote', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>
    </form>
  )
}
