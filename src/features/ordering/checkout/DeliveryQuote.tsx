import { AlertCircle, RotateCcw, MapPin, Clock } from 'lucide-react'
import type { CheckoutState } from './useCheckout'

type DeliveryQuoteProps = Pick<
  CheckoutState,
  'deliveryForm' | 'deliveryOrderError' | 'resetDeliveryQuote' | 'selectedZone'
> & { deliveryQuote: NonNullable<CheckoutState['deliveryQuote']> }

export function DeliveryQuote({
  deliveryForm,
  deliveryQuote,
  deliveryOrderError,
  resetDeliveryQuote,
  selectedZone,
}: DeliveryQuoteProps) {
  return (
    /* Delivery Quoted Order Confirmation Review */
    <div className="space-y-4">
      <div className="p-3.5 rounded-2xl bg-[#234386]/10 border border-[#234386]/20 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm text-[#234386]">Bảng Giá Giao Hàng Xác Nhận</h4>
          <p className="text-xs text-black/60 flex items-center gap-1 mt-0.5">
            <Clock size={12} />
            <span>Hiệu lực trong 5 phút</span>
          </p>
        </div>
        <button
          type="button"
          onClick={resetDeliveryQuote}
          className="text-xs font-semibold text-[#ed7328] hover:underline flex items-center gap-1"
        >
          <RotateCcw size={12} />
          <span>Sửa thông tin</span>
        </button>
      </div>

      {deliveryOrderError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{deliveryOrderError}</span>
        </div>
      )}

      {/* Quoted Items List */}
      <div className="divide-y divide-[#d2b68c]/25 border-y border-[#d2b68c]/25 py-2">
        {deliveryQuote.items.map((item) => (
          <div key={item.menu_item_id} className="py-2.5 flex justify-between items-center text-xs">
            <div>
              <span className="font-semibold text-black">{item.quantity}x </span>
              <span className="text-black/80">{item.item_name || 'Món ăn'}</span>
              {item.note && (
                <div className="text-[11px] text-black/50 italic">Ghi chú: {item.note}</div>
              )}
            </div>
            <span className="font-semibold text-[#ed7328]">
              {item.line_total_vnd.toLocaleString('vi-VN')} đ
            </span>
          </div>
        ))}
      </div>

      {/* Delivery Info Snapshot */}
      <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 text-xs space-y-1.5">
        <h5 className="font-semibold text-[#234386] pb-1 border-b border-[#d2b68c]/20 flex items-center gap-1.5">
          <MapPin size={13} className="text-[#ed7328]" />
          <span>Thông tin nhận món</span>
        </h5>
        <div className="text-black/80">
          <span className="font-semibold text-black">Người nhận:</span> {deliveryForm.customerName}{' '}
          - {deliveryForm.customerPhone}
        </div>
        <div className="text-black/80">
          <span className="font-semibold text-black">Địa chỉ:</span> {deliveryForm.address}
        </div>
        {selectedZone && (
          <div className="text-black/80">
            <span className="font-semibold text-black">Khu vực:</span> {selectedZone.name}
          </div>
        )}
        {deliveryForm.orderNote && (
          <div className="text-black/80">
            <span className="font-semibold text-black">Ghi chú:</span> {deliveryForm.orderNote}
          </div>
        )}
      </div>

      {/* Quoted Totals Breakdown */}
      <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 space-y-1.5 text-xs">
        <div className="flex justify-between text-black/80">
          <span>Tiền món:</span>
          <span className="font-semibold">
            {deliveryQuote.subtotal_vnd.toLocaleString('vi-VN')} đ
          </span>
        </div>
        <div className="flex justify-between text-black/80">
          <span>Phí vận chuyển:</span>
          <span className="font-semibold">
            {deliveryQuote.shipping_fee_vnd === 0 ? (
              <span className="text-green-600 font-semibold">Miễn phí</span>
            ) : (
              `${deliveryQuote.shipping_fee_vnd.toLocaleString('vi-VN')} đ`
            )}
          </span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-[#000000] pt-1.5 border-t border-[#d2b68c]/20">
          <span>Tổng thanh toán:</span>
          <span className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
            {deliveryQuote.total_vnd.toLocaleString('vi-VN')} đ
          </span>
        </div>
        <p className="text-[11px] text-black/50 pt-1">
          Hình thức thanh toán: Tiền mặt khi nhận món (COD).
        </p>
      </div>
    </div>
  )
}
