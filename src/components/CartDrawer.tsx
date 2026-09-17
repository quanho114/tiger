import { useState } from 'react';
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

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#ffffff] h-full flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300">
        
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
                Bếp TIGER đã nhận đơn của bạn. Món ăn đang được nấu nóng hổi và sẽ giao tới{' '}
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
                    <div className="flex items-center gap-1.5 bg-[#fbf9f6] border border-[#d2b68c]/40 rounded-full px-2 py-1">
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.dish.id, -1)}
                        className="p-0.5 hover:text-[#ed7328] transition-colors"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="text-xs font-semibold w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQuantity(item.dish.id, 1)}
                        className="p-0.5 hover:text-[#ed7328] transition-colors"
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.dish.id)}
                      className="text-black/30 hover:text-red-500 transition-colors p-1"
                      title="Xóa món"
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
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    required
                    placeholder="Số điện thoại nhận hàng *"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    required
                    placeholder="Địa chỉ giao hàng chi tiết (Số nhà, đường, phường/quận) *"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Ghi chú cho bếp (Ít cay, lấy thêm nước chấm, v.v.)"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
                  />
                </div>
              </form>
            </>
          )}
        </div>

        {/* Footer Summary & Submit */}
        {!isOrderPlaced && cartItems.length > 0 && (
          <div className="p-5 border-t border-[#d2b68c]/30 bg-[#fbf9f6] space-y-3">
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
