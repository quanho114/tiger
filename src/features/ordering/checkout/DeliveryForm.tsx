import { AlertCircle, MapPin, Info } from 'lucide-react'
import { Field } from '@/shared/ui/Field'
import { CheckoutAuthPrompt } from '@/features/auth'
import type { CheckoutState } from './useCheckout'

type DeliveryFormProps = Pick<
  CheckoutState,
  | 'deliveryForm'
  | 'deliveryFieldErrors'
  | 'deliveryQuoteError'
  | 'deliveryOrderError'
  | 'setDeliveryFormField'
  | 'savedAddresses'
  | 'deliveryZones'
  | 'minDeliveryOrder'
  | 'subtotal'
  | 'handleRequestDeliveryQuote'
>

export function DeliveryForm({
  deliveryForm,
  deliveryFieldErrors,
  deliveryQuoteError,
  deliveryOrderError,
  setDeliveryFormField,
  savedAddresses,
  deliveryZones,
  minDeliveryOrder,
  subtotal,
  handleRequestDeliveryQuote,
}: DeliveryFormProps) {
  return (
    <form
      id="delivery-form"
      onSubmit={handleRequestDeliveryQuote}
      className="pt-4 border-t border-[#d2b68c]/30 space-y-3"
    >
      <CheckoutAuthPrompt />

      <h5 className="text-xs font-semibold uppercase tracking-wider text-[#234386] flex items-center gap-1.5">
        <MapPin size={14} className="text-[#ed7328]" />
        <span>Thông tin nhận hàng</span>
      </h5>

      {savedAddresses.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-1.5">
          <label className="block text-xs font-bold text-amber-900 flex items-center justify-between">
            <span>Chọn từ sổ địa chỉ đã lưu</span>
            <span className="text-[10px] text-amber-700 font-normal">Tự động điền</span>
          </label>
          <select
            onChange={(e) => {
              const addr = savedAddresses.find((a) => a.id === e.target.value)
              if (addr) {
                setDeliveryFormField('customerName', addr.recipient_name)
                setDeliveryFormField('customerPhone', addr.phone)
                setDeliveryFormField(
                  'address',
                  `${addr.address_line}${addr.ward ? `, ${addr.ward}` : ''}${addr.district ? `, ${addr.district}` : ''}`
                )
                if (addr.delivery_note) {
                  setDeliveryFormField('orderNote', addr.delivery_note)
                }
              }
            }}
            className="w-full text-xs px-3 py-2 rounded-lg border border-amber-300 bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          >
            <option value="">-- Chọn địa chỉ nhận hàng --</option>
            {savedAddresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.is_default ? '⭐ ' : ''}[{a.label}] {a.recipient_name} - {a.address_line}
              </option>
            ))}
          </select>
        </div>
      )}

      {(deliveryQuoteError || deliveryOrderError) && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{deliveryQuoteError || deliveryOrderError}</span>
        </div>
      )}

      {subtotal < minDeliveryOrder && (
        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5 text-amber-600" />
          <span>
            Đơn giao hàng tối thiểu từ {minDeliveryOrder.toLocaleString('vi-VN')} đ (hiện còn thiếu{' '}
            {(minDeliveryOrder - subtotal).toLocaleString('vi-VN')} đ).
          </span>
        </div>
      )}

      <Field label="Họ và tên của bạn" required error={deliveryFieldErrors.customerName}>
        <input
          type="text"
          required
          placeholder="Ví dụ: Nguyễn Văn A"
          value={deliveryForm.customerName}
          onChange={(e) => setDeliveryFormField('customerName', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      <Field
        label="Số điện thoại nhận hàng"
        required
        hint="Số di động 10 chữ số tại Việt Nam"
        error={deliveryFieldErrors.customerPhone}
      >
        <input
          type="tel"
          required
          placeholder="Ví dụ: 090 280 99 29"
          value={deliveryForm.customerPhone}
          onChange={(e) => setDeliveryFormField('customerPhone', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      <Field
        label="Khu vực giao hàng"
        required
        hint="Phí vận chuyển và chính sách freeship áp dụng theo khu vực"
        error={deliveryFieldErrors.deliveryZoneId}
      >
        <select
          value={deliveryForm.deliveryZoneId}
          onChange={(e) => setDeliveryFormField('deliveryZoneId', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        >
          <option value="">-- Chọn khu vực giao hàng --</option>
          {deliveryZones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} ({z.fee_vnd === 0 ? 'Miễn phí' : `${z.fee_vnd.toLocaleString('vi-VN')} đ`}
              {z.free_threshold_vnd
                ? ` - Freeship từ ${z.free_threshold_vnd.toLocaleString('vi-VN')} đ`
                : ''}
              )
            </option>
          ))}
        </select>
      </Field>

      <Field label="Địa chỉ giao hàng chi tiết" required error={deliveryFieldErrors.address}>
        <input
          type="text"
          required
          placeholder="Số nhà, tên đường, khu phố..."
          value={deliveryForm.address}
          onChange={(e) => setDeliveryFormField('address', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      <Field label="Ghi chú cho bếp / tài xế (không bắt buộc)">
        <input
          type="text"
          placeholder="Ví dụ: Ít cay, lấy thêm nước chấm, gọi trước khi đến..."
          value={deliveryForm.orderNote}
          onChange={(e) => setDeliveryFormField('orderNote', e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>
    </form>
  )
}
