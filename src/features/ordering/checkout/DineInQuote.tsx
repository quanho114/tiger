import { AlertCircle } from 'lucide-react'
import { Field } from '@/shared/ui/Field'
import type { CheckoutState } from './useCheckout'

type DineInQuoteProps = Pick<
  CheckoutState,
  'dineInOrderError' | 'resetDineInQuote' | 'dineInNote' | 'setDineInNote'
> & { dineInQuote: NonNullable<CheckoutState['dineInQuote']> }

export function DineInQuote({
  dineInQuote,
  dineInOrderError,
  resetDineInQuote,
  dineInNote,
  setDineInNote,
}: DineInQuoteProps) {
  return (
    /* Dine-In Quoted Order Confirmation Review */
    <div className="space-y-4">
      <div className="p-3.5 rounded-2xl bg-[#234386]/10 border border-[#234386]/20 flex items-center justify-between">
        <div>
          <h4 className="font-bold text-sm text-[#234386]">Bảng Giá Đã Xác Nhận Từ Quầy</h4>
          <p className="text-xs text-black/60">Hiệu lực trong 5 phút</p>
        </div>
        <button
          type="button"
          onClick={resetDineInQuote}
          className="text-xs font-semibold text-[#ed7328] hover:underline"
        >
          Sửa món
        </button>
      </div>

      {dineInOrderError && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
        >
          <AlertCircle size={14} className="shrink-0" />
          <span>{dineInOrderError}</span>
        </div>
      )}

      {/* Quoted Items List */}
      <div className="divide-y divide-[#d2b68c]/25 border-y border-[#d2b68c]/25 py-2">
        {dineInQuote.items.map((item) => (
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

      {/* Order Note for Kitchen */}
      <Field label="Ghi chú thêm cho quầy bếp (không bắt buộc)">
        <input
          type="text"
          placeholder="Ví dụ: Ít cay, không hành, làm món nhanh giúp..."
          value={dineInNote}
          onChange={(e) => setDineInNote(e.target.value)}
          className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
        />
      </Field>

      {/* Quoted Totals */}
      <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span>Tổng tiền món:</span>
          <span className="font-semibold">
            {dineInQuote.subtotal_vnd.toLocaleString('vi-VN')} đ
          </span>
        </div>
        <div className="flex justify-between">
          <span>Phí phục vụ tại bàn:</span>
          <span className="font-semibold text-green-600">Miễn phí</span>
        </div>
        <div className="flex justify-between text-sm font-semibold text-[#000000] pt-1.5 border-t border-[#d2b68c]/20">
          <span>Tổng thanh toán:</span>
          <span className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
            {dineInQuote.total_vnd.toLocaleString('vi-VN')} đ
          </span>
        </div>
      </div>
    </div>
  )
}
