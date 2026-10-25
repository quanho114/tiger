import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CartItem } from '@/features/cart'
import {
  X,
  ChevronLeft,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Bike,
  AlertCircle,
  Utensils,
  Loader2,
  RotateCcw,
  MapPin,
} from 'lucide-react'
import { SwipeCartRow } from './SwipeCartRow'
import { Field } from '@/shared/ui/Field'
import { useDrawerFocus } from '@/shared/hooks/useDrawerFocus'
import { useCheckout } from './useCheckout'
import type { CartDrawerProps } from './types'
export type { CartItem } from '@/features/cart'
import { DeliveryQuote } from './DeliveryQuote'
import { DineInQuote } from './DineInQuote'
import { DeliveryForm } from './DeliveryForm'
import { TakeawayForm } from './TakeawayForm'
import { DeliveryReceipt } from './DeliveryReceipt'
import { DineInReceipt } from './DineInReceipt'

export function CartDrawer(props: CartDrawerProps & { presentation?: 'drawer' | 'page' }) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [removedItems, setRemovedItems] = useState<CartItem[]>([])
  useEffect(() => { if (!props.isOpen) setRemovedItems([]) }, [props.isOpen])
  const removeWithUndo = (item: CartItem) => {
    if (props.onRestoreItem) setRemovedItems(previous => [...previous, item])
    if (item.note === undefined) props.onRemoveItem(item.dish.id)
    else props.onRemoveItem(item.dish.id, item.note)
  }
  const isPage = props.presentation === 'page'
  const { isOpen, onClose, cartItems, onUpdateQuantity } = props
  const {
    hasActiveTable,
    dineInQuote,
    isDineInRequestingQuote,
    dineInQuoteError,
    isDineInSubmittingOrder,
    dineInOrderError,
    dineInReceipt,
    resetDineInQuote,
    deliveryForm,
    deliveryFieldErrors,
    deliveryQuote,
    isDeliveryRequestingQuote,
    deliveryQuoteError,
    isDeliverySubmittingOrder,
    deliveryOrderError,
    deliveryReceipt,
    setDeliveryFormField,
    resetDeliveryQuote,
    isDineIn,
    isTakeaway,
    dineInNote,
    setDineInNote,
    navigate,
    user,
    savedAddresses,
    isClaiming,
    claimSuccess,
    claimError,
    handleClaimOrder,
    deliveryZones,
    selectedZone,
    minDeliveryOrder,
    subtotal,
    estimatedShippingFee,
    estimatedTotal,
    takeawayForm,
    takeawayFieldErrors,
    takeawayOrderError,
    setTakeawayFormField,
    isTakeawayPlacingOrder,
    takeawayReceipt,
    handleRequestDineInQuote,
    handleSubmitDineInOrder,
    handleCloseDineInReceipt,
    handleRequestDeliveryQuote,
    handleSubmitDeliveryOrder,
    handleCloseDeliveryReceipt,
    handlePlaceTakeawayOrder,
    handleCloseTakeawayReceipt,
    activeTableName,
  } = useCheckout(props)
  useEffect(() => { setRemovedItems([]) }, [isDineIn, isTakeaway, activeTableName])
  useEffect(() => {
    if (dineInReceipt || deliveryReceipt || takeawayReceipt) setRemovedItems([])
  }, [dineInReceipt, deliveryReceipt, takeawayReceipt])
  const emptyStateRef = useRef<HTMLDivElement>(null)
  const previousItemCount = useRef(cartItems.length)
  useLayoutEffect(() => {
    const becameEmpty = previousItemCount.current > 0 && cartItems.length === 0
    previousItemCount.current = cartItems.length
    const element = emptyStateRef.current
    if (!isOpen || !becameEmpty || !element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = element.animate?.(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    )
    return () => animation?.cancel()
  }, [cartItems.length, isOpen])
  const drawerRef = useDrawerFocus(isOpen && !isPage, onClose)
  if (!isOpen) return null

  return (
    <div
      onClick={isPage ? undefined : onClose}
      className={isPage ? "h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-8rem)] md:mt-28 md:mb-4 md:mx-auto md:max-w-3xl" : "fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center md:items-stretch md:justify-end transition-opacity duration-300 ease-in-out"}
      data-testid={isPage ? "cart-page" : "cart-drawer-backdrop"}
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role={isPage ? "region" : "dialog"}
        aria-modal={isPage ? undefined : true}
        aria-label={
          isDineIn
            ? 'Giỏ hàng gọi món tại bàn'
            : isTakeaway
              ? 'Giỏ hàng món mang đi'
              : 'Giỏ hàng giao tận nơi'
        }
        className={isPage ? "h-full w-full bg-[#fffdf9] flex flex-col justify-between outline-none md:rounded-2xl md:border md:border-[#d2b68c]/30" : "w-full md:max-w-md bg-[#ffffff] h-[92dvh] md:h-full flex flex-col justify-between shadow-2xl rounded-t-[24px] md:rounded-none outline-none animate-in fade-in slide-in-from-bottom md:slide-in-from-right duration-300"}
      >
        {/* Mobile grab handle */}
        <div aria-hidden="true" className={`${isPage ? 'hidden' : 'md:hidden'} pt-2.5 pb-1 flex justify-center shrink-0`}>
          <span className="w-10 h-1 rounded-full bg-[#000000]/15" />
        </div>

        {/* Header */}
        <div className="px-5 py-4 shrink-0 border-b border-[#234386]/10 flex justify-between items-center bg-[#fffdf9]">
          <div className="flex items-center gap-2.5">
            <div className={`${isPage ? 'hidden md:block' : ''} p-2 rounded-xl bg-[#ed7328]/10 text-[#ed7328]`}>
              {isDineIn ? <Utensils size={20} /> : isTakeaway ? <ShoppingBag size={20} /> : <Bike size={20} />}
            </div>
            <div>
              <h3 className="font-body font-semibold text-xl tracking-tight text-[#234386]">
                {isPage ? 'Giỏ hàng' : isDineIn ? 'Món Gọi Tại Bàn' : isTakeaway ? 'Món Mang Đi' : 'Món Giao Tận Nơi'}
              </h3>
              <p className="text-xs text-[#000000]/60">
                {isDineIn
                  ? hasActiveTable
                    ? `Đang phục vụ tại ${activeTableName}`
                    : 'Chưa gắn bàn phục vụ'
                  : isTakeaway
                    ? 'Đặt trước, đến nhận tại nhà hàng'
                    : 'Giao nhanh tại Vĩnh An & lân cận'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isPage ? "Tiếp tục chọn món" : "Đóng giỏ hàng"}
            className={`${isPage ? 'hidden md:block' : ''} p-1.5 rounded-full hover:bg-black/5 text-[#000000]/60 transition-colors`}
          >
            {isPage ? <ChevronLeft size={20} /> : <X size={20} />}
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 min-h-0 flex-grow overflow-y-auto space-y-4">
          {/* Fulfillment summary strip — tap "Đổi" returns to MenuPage to switch mode */}
          {!dineInReceipt && !deliveryReceipt && !takeawayReceipt && cartItems.length > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#fbf9f6] border border-[#d2b68c]/40 text-xs">
              <div className="flex items-center gap-2 min-w-0 text-black/70">
                {isDineIn ? (
                  <Utensils size={14} className="text-[#ed7328] shrink-0" />
                ) : isTakeaway ? (
                  <MapPin size={14} className="text-[#ed7328] shrink-0" />
                ) : (
                  <Bike size={14} className="text-[#ed7328] shrink-0" />
                )}
                <span className="truncate">
                  {isDineIn
                    ? hasActiveTable
                      ? `Đang phục vụ tại ${activeTableName}`
                      : 'Chưa gắn bàn phục vụ'
                    : isTakeaway
                      ? `Nhận tại Tiger 345 – Vĩnh An${takeawayForm.pickupTime ? ` • ${takeawayForm.pickupTime}` : ''}`
                      : 'Giao tận nơi – Vĩnh An & lân cận'}
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-[#234386] font-semibold hover:underline"
              >
                Đổi
              </button>
            </div>
          )}
          {removedItems.length > 0 && !dineInReceipt && !deliveryReceipt && !takeawayReceipt && !dineInQuote && !deliveryQuote && (
            <div className="my-3 flex items-center gap-3 rounded-xl border border-[#4f6958]/15 bg-[#eef3ec] px-3 py-2">
              <div role="status" className="min-w-0 flex-1 text-xs leading-5 text-[#354b3d]">
                {removedItems.length === 1 ? <>Đã bỏ <span className="font-semibold">{removedItems[0].dish.name}</span></> : <>Đã bỏ <span className="font-semibold">{removedItems.length} món</span> khỏi giỏ</>}
              </div>
              <button type="button" className="min-h-11 shrink-0 text-xs font-semibold text-[#354b3d] underline underline-offset-4 focus-visible:outline-2" onClick={() => {
                removedItems.forEach(item => props.onRestoreItem?.(item))
                setRemovedItems([])
              }}>{removedItems.length > 1 ? 'Hoàn tác tất cả' : 'Hoàn tác'}</button>
              <button type="button" aria-label="Ẩn thông báo bỏ món" className="flex min-h-11 w-6 shrink-0 items-center justify-center text-[#4f6958]" onClick={() => setRemovedItems([])}><X size={14} /></button>
            </div>
          )}
          {dineInReceipt ? (
            <DineInReceipt
              dineInReceipt={dineInReceipt}
              navigate={navigate}
              user={user}
              isClaiming={isClaiming}
              claimSuccess={claimSuccess}
              claimError={claimError}
              handleClaimOrder={handleClaimOrder}
              handleCloseDineInReceipt={handleCloseDineInReceipt}
              activeTableName={activeTableName}
              onClose={onClose}
            />
          ) : deliveryReceipt ? (
            <DeliveryReceipt
              deliveryReceipt={deliveryReceipt}
              navigate={navigate}
              user={user}
              isClaiming={isClaiming}
              claimSuccess={claimSuccess}
              claimError={claimError}
              handleClaimOrder={handleClaimOrder}
              handleCloseDeliveryReceipt={handleCloseDeliveryReceipt}
              onClose={onClose}
            />
          ) : takeawayReceipt ? (
            <DeliveryReceipt
              deliveryReceipt={takeawayReceipt}
              navigate={navigate}
              user={user}
              isClaiming={isClaiming}
              claimSuccess={claimSuccess}
              claimError={claimError}
              handleClaimOrder={handleClaimOrder}
              handleCloseDeliveryReceipt={handleCloseTakeawayReceipt}
              onClose={onClose}
            />
          ) : dineInQuote ? (
            <DineInQuote
              dineInQuote={dineInQuote}
              dineInOrderError={dineInOrderError}
              resetDineInQuote={resetDineInQuote}
              dineInNote={dineInNote}
              setDineInNote={setDineInNote}
            />
          ) : deliveryQuote ? (
            <DeliveryQuote
              deliveryForm={deliveryForm}
              deliveryQuote={deliveryQuote}
              deliveryOrderError={deliveryOrderError}
              resetDeliveryQuote={resetDeliveryQuote}
              selectedZone={selectedZone}
            />
          ) : cartItems.length === 0 ? (
            <div ref={emptyStateRef} className="py-8 sm:py-10 text-center space-y-3">
              <div className="relative mx-auto mb-5 h-60 w-72 max-w-full sm:h-[260px] sm:w-80" aria-hidden="true">
                <img
                  src="/images/cart/empty-cart-garnish.svg"
                  alt=""
                  width={320}
                  height={260}
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <img
                  src="/images/cart/tiger-empty-cart.webp"
                  alt=""
                  width={640}
                  height={640}
                  className="relative mx-auto h-auto w-52 pt-2 sm:w-60"
                />
              </div>
              <p className="text-base font-semibold text-[#000000]/80">
                Giỏ hàng của bạn đang trống
              </p>
              <p className="text-sm leading-6 text-[#6b625b] max-w-xs mx-auto">
                Khám phá thực đơn và chọn món bạn thích.
              </p>
              <button
                type="button"
                onClick={() => { onClose(); navigate('/menu') }}
                className="mt-4 inline-flex min-h-12 w-56 max-w-full items-center justify-center gap-3 rounded-full bg-[#4f6958] px-6 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-[#425b4b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4f6958] active:bg-[#354b3d] motion-reduce:transition-none"
              >
                Chọn món ngon
                <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-[11px] text-[#6b625b]">Vuốt món sang trái để xóa</p>
              {/* Items List */}
              <div className="divide-y divide-[#234386]/10">
                {cartItems.map((item) => (
                  <SwipeCartRow
                    key={`${item.dish.id}:${item.note ?? ''}`}
                    name={item.dish.name}
                    open={openRow === `${item.dish.id}:${item.note ?? ''}`}
                    onOpenChange={open => setOpenRow(open ? `${item.dish.id}:${item.note ?? ''}` : null)}
                    onRemove={() => removeWithUndo(item)}
                  >
                    <div className="flex flex-1 items-center gap-2 min-w-0 sm:gap-3">
                      <img
                        src={item.dish.image}
                        draggable={false}
                        alt={item.dish.name}
                        className="size-12 sm:size-16 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="font-semibold text-sm text-[#234386] line-clamp-2">
                          {item.dish.name}
                        </h4>
                        <p className="text-xs text-[#ed7328] font-bold mt-0.5">
                          {item.dish.price.toLocaleString('vi-VN')} đ
                        </p>
                      </div>
                    </div>

                    <div inert={openRow === `${item.dish.id}:${item.note ?? ''}`} className="flex items-center gap-0 shrink-0 transition-opacity motion-reduce:transition-none" style={{ opacity: 'calc(1 - var(--swipe-progress, 0))', transitionDuration: 'var(--swipe-duration, 150ms)' }}>
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => item.quantity === 1 ? removeWithUndo(item) : item.note === undefined ? onUpdateQuantity(item.dish.id, -1) : onUpdateQuantity(item.dish.id, -1, item.note)}
                          aria-label="Giảm số lượng"
                          className="h-11 w-8 flex items-center justify-center rounded-lg text-[#234386] hover:bg-[#234386]/5 transition-colors"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="text-sm font-semibold min-w-5 text-center tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => item.note === undefined ? onUpdateQuantity(item.dish.id, 1) : onUpdateQuantity(item.dish.id, 1, item.note)}
                          aria-label="Tăng số lượng"
                          className="h-11 w-8 flex items-center justify-center rounded-lg text-[#234386] hover:bg-[#234386]/5 transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                    </div>
                  </SwipeCartRow>
                ))}
              </div>

              {/* Contextual form fields */}
              {isDineIn ? (
                /* Dine-In: Only Kitchen Note */
                <div className="pt-3 border-t border-[#d2b68c]/30 space-y-3">
                  {dineInQuoteError && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
                    >
                      <AlertCircle size={14} className="shrink-0" />
                      <span>{dineInQuoteError}</span>
                    </div>
                  )}

                  <Field label="Ghi chú cho bếp (không bắt buộc)">
                    <input
                      type="text"
                      placeholder="Ví dụ: Ít cay, lấy thêm chén chấm..."
                      value={dineInNote}
                      onChange={(e) => setDineInNote(e.target.value)}
                      className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                    />
                  </Field>
                </div>
              ) : isTakeaway ? (
                /* Takeaway: Contact, pickup time, kitchen note */
                <TakeawayForm
                  takeawayForm={takeawayForm}
                  takeawayFieldErrors={takeawayFieldErrors}
                  takeawayOrderError={takeawayOrderError}
                  setTakeawayFormField={setTakeawayFormField}
                  handlePlaceTakeawayOrder={handlePlaceTakeawayOrder}
                />
              ) : (
                /* Delivery: Address, Zone, and Phone Fields */
                <DeliveryForm
                  deliveryForm={deliveryForm}
                  deliveryFieldErrors={deliveryFieldErrors}
                  deliveryQuoteError={deliveryQuoteError}
                  deliveryOrderError={deliveryOrderError}
                  setDeliveryFormField={setDeliveryFormField}
                  savedAddresses={savedAddresses}
                  deliveryZones={deliveryZones}
                  minDeliveryOrder={minDeliveryOrder}
                  subtotal={subtotal}
                  handleRequestDeliveryQuote={handleRequestDeliveryQuote}
                />
              )}
            </>
          )}
        </div>

        {/* Footer Summary & Submit */}
        {!dineInReceipt && !deliveryReceipt && !takeawayReceipt && cartItems.length > 0 && (
          <div className="p-5 shrink-0 border-t border-[#234386]/10 bg-white space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="space-y-1.5 text-xs text-[#000000]/80">
              <div className="flex justify-between">
                <span>Tiền món ({cartItems.length}):</span>
                <span className="font-semibold">{subtotal.toLocaleString('vi-VN')} đ</span>
              </div>
              {!isDineIn && !isTakeaway && (
                <div className="flex justify-between">
                  <span>Phí giao hàng:</span>
                  <span className="font-semibold">
                    {deliveryQuote ? (
                      deliveryQuote.shipping_fee_vnd === 0 ? (
                        <span className="text-green-600 font-semibold">Miễn phí</span>
                      ) : (
                        `${deliveryQuote.shipping_fee_vnd.toLocaleString('vi-VN')} đ`
                      )
                    ) : selectedZone ? (
                      estimatedShippingFee === 0 ? (
                        <span className="text-green-600 font-semibold">Miễn phí</span>
                      ) : (
                        `${estimatedShippingFee.toLocaleString('vi-VN')} đ`
                      )
                    ) : (
                      <span className="text-black/50 italic">Chọn khu vực để tính</span>
                    )}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-[#000000] pt-1.5 border-t border-[#d2b68c]/30">
                <span>{deliveryQuote || dineInQuote ? 'Tổng thanh toán:' : 'Tổng tạm tính:'}</span>
                <span className="font-['Noto_Serif',serif] text-lg font-bold text-[#ed7328]">
                  {estimatedTotal.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            {/* Action buttons based on mode & quote state */}
            {isDineIn ? (
              dineInQuote ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetDineInQuote}
                    disabled={isDineInSubmittingOrder}
                    className="py-3 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw size={14} />
                    <span>Sửa món</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSubmitDineInOrder}
                    disabled={isDineInSubmittingOrder}
                    className="flex-grow py-3.5 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isDineInSubmittingOrder ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>Đang gửi vào bếp...</span>
                      </>
                    ) : (
                      <>
                        <span>Xác nhận gửi đơn vào bếp</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              ) : hasActiveTable ? (
                <button
                  type="button"
                  onClick={handleRequestDineInQuote}
                  disabled={isDineInRequestingQuote}
                  className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDineInRequestingQuote ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang tính bảng giá từ bếp...</span>
                    </>
                  ) : (
                    <>
                      <span>Xem bảng giá & Gọi món {activeTableName}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full py-3.5 rounded-full bg-black/15 text-black/40 font-semibold text-sm cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <span>Quét mã QR bàn để gửi đơn vào bếp</span>
                </button>
              )
              ) : isTakeaway ? (
                /* Takeaway Mode: Single-step submit (quote happens behind the scenes) */
                <button
                  type="submit"
                  form="takeaway-form"
                  disabled={isTakeawayPlacingOrder}
                  className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isTakeawayPlacingOrder ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang xác nhận đơn mang đi...</span>
                    </>
                  ) : (
                    <>
                      <span>Xác nhận đặt mang đi</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              ) : deliveryQuote ? (
              /* Delivery Mode: Quoted State -> Confirm Order */
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetDeliveryQuote}
                  disabled={isDeliverySubmittingOrder}
                  className="py-3 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  <span>Sửa thông tin</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitDeliveryOrder}
                  disabled={isDeliverySubmittingOrder}
                  className="flex-grow py-3.5 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeliverySubmittingOrder ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang gửi đơn giao...</span>
                    </>
                  ) : (
                    <>
                      <span>Xác nhận đặt giao ngay</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Delivery Mode: Form State -> Request Quote */
              <button
                type="submit"
                form="delivery-form"
                onClick={handleRequestDeliveryQuote}
                disabled={isDeliveryRequestingQuote || subtotal < minDeliveryOrder}
                className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isDeliveryRequestingQuote ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang tính bảng giá & phí giao...</span>
                  </>
                ) : (
                  <>
                    <span>Xem bảng giá & Phí giao hàng</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
