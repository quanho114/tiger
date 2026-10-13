import { ArrowRight, AlertCircle, CheckCircle2, Loader2, BookmarkCheck } from 'lucide-react'
import { getStoredClaimSecret } from '@/features/ordering/claims/claimStorage'
import type { CheckoutState } from './useCheckout'
import type { CartDrawerProps } from './types'

type DineInReceiptProps = Pick<
  CheckoutState,
  | 'navigate'
  | 'user'
  | 'isClaiming'
  | 'claimSuccess'
  | 'claimError'
  | 'handleClaimOrder'
  | 'handleCloseDineInReceipt'
  | 'activeTableName'
> &
  Pick<CartDrawerProps, 'onClose'> & { dineInReceipt: NonNullable<CheckoutState['dineInReceipt']> }

export function DineInReceipt({
  dineInReceipt,
  navigate,
  user,
  isClaiming,
  claimSuccess,
  claimError,
  handleClaimOrder,
  handleCloseDineInReceipt,
  activeTableName,
  onClose,
}: DineInReceiptProps) {
  return (
    /* Dine-In Server Receipt Snapshot View */
    <div className="py-6 text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
        <CheckCircle2 size={36} />
      </div>
      <h4 className="font-['Noto_Serif',serif] text-2xl font-bold text-[#234386]">
        Đã Gửi Đơn Vào Bếp!
      </h4>
      <p className="text-sm text-black/70 max-w-xs mx-auto leading-relaxed">
        Bếp Tiger 345 đã nhận được yêu cầu gọi món của bạn và đang chuẩn bị chế biến ngay.
      </p>

      {/* Receipt Snapshot Details */}
      <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 text-xs text-left space-y-2">
        <div className="flex justify-between items-center pb-2 border-b border-[#d2b68c]/20">
          <span className="text-black/60">Mã đơn gọi món:</span>
          <span className="font-mono font-bold text-[#234386] text-sm">{dineInReceipt.code}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60">Bàn phục vụ:</span>
          <span className="font-semibold text-black">
            {dineInReceipt.table_name || activeTableName || 'Bàn ăn'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60">Trạng thái:</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px]">
            Đã tiếp nhận vào bếp
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-black/60">Thời gian tạo:</span>
          <span className="text-black/80">
            {new Date(dineInReceipt.created_at).toLocaleTimeString('vi-VN')}
          </span>
        </div>
        {dineInReceipt.note && (
          <div className="pt-1 text-black/80">
            <span className="font-semibold text-black">Ghi chú bếp:</span> {dineInReceipt.note}
          </div>
        )}
        <div className="pt-2 border-t border-[#d2b68c]/20 flex justify-between items-center font-semibold text-sm text-[#ed7328]">
          <span>Tổng tiền món:</span>
          <span>{dineInReceipt.total_vnd.toLocaleString('vi-VN')} đ</span>
        </div>
      </div>

      {/* Guest Order Claim Section (Invariant V22) */}
      {claimSuccess ? (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{claimSuccess}</span>
        </div>
      ) : claimError ? (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{claimError}</span>
        </div>
      ) : !user ? (
        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-left space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700 shrink-0 mt-0.5">
              <BookmarkCheck size={18} />
            </div>
            <div>
              <h5 className="font-semibold text-sm text-[#234386]">Lưu đơn hàng vào tài khoản?</h5>
              <p className="text-xs text-black/70 mt-0.5 leading-relaxed">
                Đăng nhập để theo dõi tiến độ và lưu lịch sử gọi món. Mã bí mật nhận đơn an toàn đã
                được lưu tạm trên thiết bị này.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose()
              navigate('/login?returnTo=' + encodeURIComponent(window.location.pathname))
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3266] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <span>Đăng nhập để nhận đơn</span>
            <ArrowRight size={14} />
          </button>
        </div>
      ) : getStoredClaimSecret(dineInReceipt.id) ? (
        <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-left space-y-2.5">
          <div className="flex items-start gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 shrink-0 mt-0.5">
              <BookmarkCheck size={18} />
            </div>
            <div>
              <h5 className="font-semibold text-sm text-[#234386]">Liên kết đơn vào tài khoản</h5>
              <p className="text-xs text-black/70 mt-0.5 leading-relaxed">
                Bạn đang đăng nhập. Nhấn nút bên dưới để liên kết đơn này vào danh sách đơn của bạn.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isClaiming}
            onClick={() => handleClaimOrder(dineInReceipt.id)}
            className="w-full py-2.5 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3266] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          >
            {isClaiming ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Đang liên kết đơn...</span>
              </>
            ) : (
              <>
                <span>Liên kết đơn vào tài khoản ngay</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      ) : null}

      <div className="space-y-2 pt-2">
        <button
          type="button"
          onClick={handleCloseDineInReceipt}
          className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <span>Tiếp tục xem thực đơn & gọi thêm món</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
