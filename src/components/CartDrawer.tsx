import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, CheckCircle2, Bike } from 'lucide-react';
import type { MenuItem } from '../data/restaurantData';

export interface CartItem {
  dish: MenuItem;
  quantity: number;
}

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQuantity: (dishId: string, delta: number) => void;
  onRemoveItem: (dishId: string) => void;
  onClearCart: () => void;
}

export const CartDrawer: FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [isOrderPlaced, setIsOrderPlaced] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.documentElement.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      document.documentElement.style.removeProperty('--scrollbar-compensation');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const subtotal = cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0);
  const freeshipThreshold = 300000;
  const shippingFee = subtotal >= freeshipThreshold || subtotal === 0 ? 0 : 25000;
  const total = subtotal + shippingFee;

  const handleCheckout = (e: FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !deliveryAddress) {
      alert('Vui lòng điền họ tên, số điện thoại và địa chỉ giao hàng.');
      return;
    }
    setIsOrderPlaced(true);
  };

  const handleReset = () => {
    setIsOrderPlaced(false);
    onClearCart();
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center md:items-stretch md:justify-end transition-opacity duration-400 ease-in-out ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!isOpen}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Giỏ hàng giao tận nơi"
        className={`w-full md:max-w-md bg-[#ffffff] h-[92dvh] md:h-full flex flex-col justify-between shadow-2xl rounded-t-[24px] md:rounded-none transform transition-transform duration-400 ease-out ${
          isOpen ? 'translate-x-0 translate-y-0' : 'max-md:translate-y-full md:translate-x-full'
        }`}
      >
        {/* Mobile grab handle */}
        <div aria-hidden="true" className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-[#000000]/15" />
        </div>
        
        {/* Header */}
        <div className="p-5 border-b border-[#d2b68c]/30 flex items-center justify-between bg-[#fbf9f6]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#ed7328] text-white flex items-center justify-center">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]">
                Giỏ Hàng Giao Tận Nơi
              </h3>
              <span className="text-[11px] text-[#000000]/60">
                {cartItems.length} món ăn đã chọn
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/5 text-[#000000]/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex-grow overflow-y-auto space-y-4">
          {isOrderPlaced ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#a2d3a6]/30 text-[#234386] flex items-center justify-center mx-auto">
                <CheckCircle2 size={40} className="text-[#234386]" />
              </div>
              <h4 className="font-['Noto_Serif',serif] text-2xl font-bold text-[#000000]">
                Đặt Món Thành Công!
              </h4>
              <p className="text-sm text-[#000000]/70 max-w-xs mx-auto">
                Bếp Tiger 345 đã nhận đơn của bạn. Món ăn đang được nấu nóng hổi và sẽ giao tới{' '}
                <span className="font-semibold text-[#000000]">{deliveryAddress}</span> trong vòng 25-35 phút.
              </p>
              <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 text-xs text-left space-y-1">
                <div><span className="font-semibold">Khách hàng:</span> {customerName} - {customerPhone}</div>
                <div><span className="font-semibold">Tổng thanh toán:</span> {total.toLocaleString('vi-VN')} đ (COD khi nhận hàng)</div>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="mt-4 px-6 py-3 rounded-full bg-[#234386] text-white font-semibold text-sm shadow-sm"
              >
                Tiếp tục xem thực đơn
              </button>
            </div>
          ) : cartItems.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#fbf9f6] border border-[#d2b68c]/40 flex items-center justify-center mx-auto text-[#000000]/40">
                <ShoppingBag size={28} />
              </div>
              <p className="text-base font-semibold text-[#000000]/80">
                Giỏ hàng của bạn đang trống
              </p>
              <p className="text-xs text-[#000000]/60 max-w-xs mx-auto">
                Hãy chuyển sang chế độ "Giao tận nơi" trong thực đơn để chọn những món ngon yêu thích nhé!
              </p>
            </div>
          ) : (
            <>
              {/* Freeship Progress */}
              <div className="p-3.5 rounded-2xl bg-[#ffc400]/15 border border-[#ffc400]/40 flex items-center gap-3">
                <Bike size={20} className="text-[#ed7328] shrink-0" />
                <div className="text-xs text-[#234386]">
                  {subtotal >= freeshipThreshold ? (
                    <span className="font-semibold text-[#ed7328]">
                      🎉 Đơn hàng đã đạt điều kiện MIỄN PHÍ GIAO HÀNG!
                    </span>
                  ) : (
                    <span>
                      Mua thêm{' '}
                      <strong className="text-[#ed7328]">
                        {(freeshipThreshold - subtotal).toLocaleString('vi-VN')} đ
                      </strong>{' '}
                      để được freeship 5km.
                    </span>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="divide-y divide-[#d2b68c]/25">
                {cartItems.map((item) => (
                  <div key={item.dish.id} className="py-3 flex items-center justify-between gap-3">
                    <img
                      src={item.dish.image}
                      alt={item.dish.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#d2b68c]/30"
                    />
                    <div className="flex-grow min-w-0">
                      <h4 className="text-xs font-semibold text-[#000000] truncate">
                        {item.dish.name}
                      </h4>
                      <span className="text-xs font-semibold text-[#ed7328]">
                        {(item.dish.price * item.quantity).toLocaleString('vi-VN')} đ
                      </span>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-1 bg-[#fbf9f6] border border-[#d2b68c]/40 rounded-full px-1.5 py-0.5 sm:px-2 sm:py-1">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.dish.id, -1)}
                        className="w-7 h-7 flex items-center justify-center hover:text-[#ed7328] active:scale-90 transition-all text-[#000000]/70"
                        aria-label="Giảm số lượng"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="text-xs font-semibold w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.dish.id, 1)}
                        className="w-7 h-7 flex items-center justify-center hover:text-[#ed7328] active:scale-90 transition-all text-[#000000]/70"
                        aria-label="Tăng số lượng"
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.dish.id)}
                      className="w-8 h-8 flex items-center justify-center text-black/30 hover:text-red-500 transition-colors p-1 active:scale-90"
                      title="Xóa món"
                      aria-label="Xóa món khỏi giỏ"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Quick Delivery Order Form */}
              <form id="delivery-form" onSubmit={handleCheckout} className="pt-4 border-t border-[#d2b68c]/30 space-y-3">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-[#234386]">
                  Thông tin giao món
                </h5>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Họ và tên của bạn *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    required
                    placeholder="Số điện thoại nhận hàng *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Địa chỉ giao hàng chi tiết (Số nhà, đường, phường/quận) *"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Ghi chú cho bếp (Ít cay, lấy thêm nước chấm, v.v.)"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    className="w-full text-sm sm:text-xs px-3.5 py-2 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer Summary & Submit */}
        {!isOrderPlaced && cartItems.length > 0 && (
          <div
            className="p-5 border-t border-[#d2b68c]/30 bg-[#fbf9f6] space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <div className="space-y-1.5 text-xs text-[#000000]/80">
              <div className="flex justify-between">
                <span>Tiền món ({cartItems.length}):</span>
                <span className="font-semibold">{subtotal.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between">
                <span>Phí giao hàng:</span>
                <span className="font-semibold">
                  {shippingFee === 0 ? (
                    <span className="text-green-600 font-semibold">Miễn phí</span>
                  ) : (
                    `${shippingFee.toLocaleString('vi-VN')} đ`
                  )}
                </span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#000000] pt-1.5 border-t border-[#d2b68c]/30">
                <span>Tổng thanh toán:</span>
                <span className="font-['Noto_Serif',serif] text-lg font-bold text-[#ed7328]">
                  {total.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            <button
              type="submit"
              form="delivery-form"
              className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <span>Xác nhận đặt giao ngay</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
