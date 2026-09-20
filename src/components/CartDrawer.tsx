import { useState, useEffect, useRef, useMemo, useContext } from 'react';
import type { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  Bike,
  AlertCircle,
  Utensils,
  CheckCircle2,
  Loader2,
  RotateCcw,
  MapPin,
  Clock,
  Info,
  BookmarkCheck,
} from 'lucide-react';
import type { MenuItem } from '../data/restaurantData';
import { Field } from './ui/Field';
import { useCart } from '@/store/cart';
import { useTableSession } from '@/features/table-session';
import { useDineInOrder } from '@/features/ordering/dine-in';
import { useDeliveryOrder, type DeliveryZoneOption } from '@/features/ordering/delivery';
import { CatalogContext } from '@/features/catalog';
import { CheckoutAuthPrompt, useAuth } from '@/features/auth';
import { fetchCustomerAddresses } from '@/features/account/api';
import type { CustomerAddress } from '@/features/account/types';
import {
  getStoredClaimSecret,
  claimGuestOrder,
} from '@/features/ordering/claims/claimStorage';

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

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contentEditable=true]',
].join(',');

const FALLBACK_DELIVERY_ZONES: DeliveryZoneOption[] = [
  {
    id: '40000000-0000-0000-0000-000000000001',
    name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
    description: 'Giao nhanh 20-30 phút trong thị trấn',
    fee_vnd: 15000,
    free_threshold_vnd: 200000,
  },
  {
    id: '40000000-0000-0000-0000-000000000002',
    name: 'Khu vực lân cận Vĩnh Tân / Trị An (3 - 7km)',
    description: 'Giao 30-45 phút lân cận',
    fee_vnd: 30000,
    free_threshold_vnd: 400000,
  },
  {
    id: '40000000-0000-0000-0000-000000000003',
    name: 'Bán kính mở rộng (7 - 12km)',
    description: 'Giao 45-60 phút vùng xa',
    fee_vnd: 50000,
    free_threshold_vnd: null,
  },
];

export const CartDrawer: FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}) => {
  const { context: cartContext } = useCart();
  const { session: tableSession, hasActiveTable } = useTableSession();

  const catalogContext = useContext(CatalogContext);
  const settings = catalogContext?.settings;

  const {
    quote: dineInQuote,
    isRequestingQuote: isDineInRequestingQuote,
    quoteError: dineInQuoteError,
    isSubmittingOrder: isDineInSubmittingOrder,
    orderError: dineInOrderError,
    receipt: dineInReceipt,
    getQuote: getDineInQuote,
    submitOrder: submitDineInOrder,
    resetQuote: resetDineInQuote,
    resetReceipt: resetDineInReceipt,
  } = useDineInOrder();

  const {
    formState: deliveryForm,
    fieldErrors: deliveryFieldErrors,
    quote: deliveryQuote,
    isRequestingQuote: isDeliveryRequestingQuote,
    quoteError: deliveryQuoteError,
    isSubmittingOrder: isDeliverySubmittingOrder,
    orderError: deliveryOrderError,
    receipt: deliveryReceipt,
    setFormField: setDeliveryFormField,
    validateForm: validateDeliveryForm,
    getQuote: getDeliveryQuote,
    submitOrder: submitDeliveryOrder,
    resetQuote: resetDeliveryQuote,
    resetReceipt: resetDeliveryReceipt,
    resetForm: resetDeliveryForm,
  } = useDeliveryOrder();

  const isDineIn = cartContext.mode === 'dine-in' || (Boolean(tableSession) && cartContext.mode !== 'delivery');
  const [dineInNote, setDineInNote] = useState('');

  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const handleClaimOrder = async (orderId: string) => {
    const secret = getStoredClaimSecret(orderId);
    if (!secret) {
      setClaimError('Không tìm thấy mã bí mật nhận đơn trên thiết bị này.');
      return;
    }
    setIsClaiming(true);
    setClaimError(null);
    try {
      const result = await claimGuestOrder(orderId, secret);
      if (result.claimed) {
        setClaimSuccess('Đã liên kết đơn hàng thành công vào tài khoản của bạn!');
      }
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Không thể liên kết đơn hàng.');
    } finally {
      setIsClaiming(false);
    }
  };

  useEffect(() => {
    if (role === 'customer' && isOpen && !isDineIn) {
      let isMounted = true;
      fetchCustomerAddresses()
        .then((addrs) => {
          if (!isMounted) return;
          setSavedAddresses(addrs);
          const defaultAddr = addrs.find((a) => a.is_default);
          if (defaultAddr && !deliveryForm.address) {
            setDeliveryFormField('customerName', defaultAddr.recipient_name);
            setDeliveryFormField('customerPhone', defaultAddr.phone);
            setDeliveryFormField(
              'address',
              `${defaultAddr.address_line}${defaultAddr.ward ? `, ${defaultAddr.ward}` : ''}${defaultAddr.district ? `, ${defaultAddr.district}` : ''}`
            );
            if (defaultAddr.delivery_note) {
              setDeliveryFormField('orderNote', defaultAddr.delivery_note);
            }
          }
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [role, isOpen, isDineIn]);

  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const deliveryZones: DeliveryZoneOption[] = useMemo(() => {
    if (settings?.delivery_zones && settings.delivery_zones.length > 0) {
      return settings.delivery_zones;
    }
    return FALLBACK_DELIVERY_ZONES;
  }, [settings?.delivery_zones]);

  const selectedZone = useMemo(() => {
    return deliveryZones.find((z) => z.id === deliveryForm.deliveryZoneId) || null;
  }, [deliveryZones, deliveryForm.deliveryZoneId]);

  // Invalidate active quotes whenever cart items, quantities, or delivery zone change
  const cartItemsFingerprint = useMemo(
    () => cartItems.map((item) => `${item.dish.id}:${item.quantity}`).join(','),
    [cartItems]
  );
  const prevFingerprintRef = useRef(cartItemsFingerprint);
  const prevZoneIdRef = useRef(deliveryForm.deliveryZoneId);

  useEffect(() => {
    if (
      prevFingerprintRef.current !== cartItemsFingerprint ||
      prevZoneIdRef.current !== deliveryForm.deliveryZoneId
    ) {
      prevFingerprintRef.current = cartItemsFingerprint;
      prevZoneIdRef.current = deliveryForm.deliveryZoneId;
      if (deliveryQuote) {
        resetDeliveryQuote();
      }
      if (dineInQuote) {
        resetDineInQuote();
      }
    }
  }, [cartItemsFingerprint, deliveryForm.deliveryZoneId, deliveryQuote, dineInQuote, resetDeliveryQuote, resetDineInQuote]);

  const minDeliveryOrder = settings?.min_delivery_order_vnd ?? 100000;

  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0),
    [cartItems]
  );

  const estimatedShippingFee = useMemo(() => {
    if (isDineIn) return 0;
    if (deliveryQuote) return deliveryQuote.shipping_fee_vnd;
    if (!selectedZone) return 0;
    if (selectedZone.free_threshold_vnd !== null && subtotal >= selectedZone.free_threshold_vnd) {
      return 0;
    }
    return selectedZone.fee_vnd;
  }, [isDineIn, deliveryQuote, selectedZone, subtotal]);

  const estimatedTotal = useMemo(() => {
    if (deliveryQuote) return deliveryQuote.total_vnd;
    if (dineInQuote) return dineInQuote.total_vnd;
    return subtotal + estimatedShippingFee;
  }, [deliveryQuote, dineInQuote, subtotal, estimatedShippingFee]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.documentElement.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`);
    }

    const timer = setTimeout(() => {
      if (!drawerRef.current) return;
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        drawerRef.current.focus();
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => {
          if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
          if (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0) return true;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !drawerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !drawerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      document.documentElement.style.removeProperty('--scrollbar-compensation');
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  // Dine-in actions
  const handleRequestDineInQuote = async () => {
    if (!tableSession?.visitCapability) return;
    const items = cartItems.map((item) => ({
      menu_item_id: item.dish.id,
      quantity: item.quantity,
    }));
    await getDineInQuote(items, tableSession.visitCapability);
  };

  const handleSubmitDineInOrder = async () => {
    const createdReceipt = await submitDineInOrder(dineInNote);
    if (createdReceipt) {
      onClearCart();
    }
  };

  const handleCloseDineInReceipt = () => {
    resetDineInReceipt();
    setClaimSuccess(null);
    setClaimError(null);
    onClose();
  };

  // Delivery actions
  const handleRequestDeliveryQuote = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const isValid = validateDeliveryForm();
    if (!isValid) return;

    const items = cartItems.map((item) => ({
      menu_item_id: item.dish.id,
      quantity: item.quantity,
      note: deliveryForm.orderNote ? deliveryForm.orderNote : undefined,
    }));

    await getDeliveryQuote(items, deliveryForm.deliveryZoneId);
  };

  const handleSubmitDeliveryOrder = async () => {
    const createdReceipt = await submitDeliveryOrder();
    if (createdReceipt) {
      onClearCart();
      resetDeliveryForm();
    }
  };

  const handleCloseDeliveryReceipt = () => {
    resetDeliveryReceipt();
    setClaimSuccess(null);
    setClaimError(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  const activeTableName =
    (cartContext.mode === 'dine-in' ? cartContext.tableName : null) ||
    tableSession?.tableName ||
    'Bàn';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center md:items-stretch md:justify-end transition-opacity duration-300 ease-in-out"
      data-testid="cart-drawer-backdrop"
    >
      <div
        ref={drawerRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isDineIn ? 'Giỏ hàng gọi món tại bàn' : 'Giỏ hàng giao tận nơi'}
        className="w-full md:max-w-md bg-[#ffffff] h-[92dvh] md:h-full flex flex-col justify-between shadow-2xl rounded-t-[24px] md:rounded-none outline-none animate-in fade-in slide-in-from-bottom md:slide-in-from-right duration-300"
      >
        {/* Mobile grab handle */}
        <div aria-hidden="true" className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-[#000000]/15" />
        </div>

        {/* Header */}
        <div className="p-5 border-b border-[#d2b68c]/30 flex justify-between items-center bg-[#fbf9f6]/80 backdrop-blur-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#ed7328]/10 text-[#ed7328]">
              {isDineIn ? <Utensils size={20} /> : <Bike size={20} />}
            </div>
            <div>
              <h3 className="font-['Noto_Serif',serif] font-bold text-lg text-[#234386]">
                {isDineIn ? 'Món Gọi Tại Bàn' : 'Món Giao Tận Nơi'}
              </h3>
              <p className="text-xs text-[#000000]/60">
                {isDineIn
                  ? hasActiveTable
                    ? `Đang phục vụ tại ${activeTableName}`
                    : 'Chưa gắn bàn phục vụ'
                  : 'Giao nhanh tại Vĩnh An & lân cận'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng giỏ hàng"
            className="p-1.5 rounded-full hover:bg-black/5 text-[#000000]/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 flex-grow overflow-y-auto space-y-4">
          {dineInReceipt ? (
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
                  <span className="font-semibold text-black">{dineInReceipt.table_name || activeTableName || 'Bàn ăn'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-black/60">Trạng thái:</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px]">
                    Đã tiếp nhận vào bếp
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-black/60">Thời gian tạo:</span>
                  <span className="text-black/80">{new Date(dineInReceipt.created_at).toLocaleTimeString('vi-VN')}</span>
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
                      <h5 className="font-semibold text-sm text-[#234386]">
                        Lưu đơn hàng vào tài khoản?
                      </h5>
                      <p className="text-xs text-black/70 mt-0.5 leading-relaxed">
                        Đăng nhập để theo dõi tiến độ và lưu lịch sử gọi món. Mã bí mật nhận đơn an toàn đã được lưu tạm trên thiết bị này.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/login?returnTo=' + encodeURIComponent(window.location.pathname));
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
                      <h5 className="font-semibold text-sm text-[#234386]">
                        Liên kết đơn vào tài khoản
                      </h5>
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
          ) : deliveryReceipt ? (
            /* Delivery Server Receipt Snapshot View */
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} />
              </div>
              <h4 className="font-['Noto_Serif',serif] text-2xl font-bold text-[#234386]">
                Đã Tiếp Nhận Đơn Giao Hàng!
              </h4>
              <p className="text-sm text-black/70 max-w-xs mx-auto leading-relaxed">
                Đơn hàng đã được lưu trên hệ thống. Nhân viên Tiger 345 sẽ liên hệ qua số điện thoại để xác nhận đơn và điều phối giao món.
              </p>

              {/* Delivery Receipt Snapshot Details */}
              <div className="p-4 rounded-2xl bg-[#fbf9f6] border border-[#d2b68c]/30 text-xs text-left space-y-2">
                <div className="flex justify-between items-center pb-2 border-b border-[#d2b68c]/20">
                  <span className="text-black/60">Mã đơn giao:</span>
                  <span className="font-mono font-bold text-[#234386] text-sm">{deliveryReceipt.code}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-black/60">Trạng thái:</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold text-[11px]">
                    Chờ nhà hàng xác nhận
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-black/60">Người nhận:</span>
                  <span className="font-semibold text-black">
                    {deliveryReceipt.customer_name} ({deliveryReceipt.customer_phone})
                  </span>
                </div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-black/60 shrink-0">Địa chỉ giao:</span>
                  <span className="font-medium text-black text-right">{deliveryReceipt.address}</span>
                </div>
                {deliveryReceipt.zone_name && (
                  <div className="flex justify-between items-center">
                    <span className="text-black/60">Khu vực:</span>
                    <span className="text-black font-medium">{deliveryReceipt.zone_name}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-black/60">Thời gian tạo:</span>
                  <span className="text-black/80">
                    {new Date(deliveryReceipt.created_at).toLocaleTimeString('vi-VN')}
                  </span>
                </div>
                {deliveryReceipt.note && (
                  <div className="pt-1 text-black/80">
                    <span className="font-semibold text-black">Ghi chú:</span> {deliveryReceipt.note}
                  </div>
                )}
                <div className="pt-2 border-t border-[#d2b68c]/20 space-y-1">
                  <div className="flex justify-between text-black/70">
                    <span>Tiền món:</span>
                    <span>{deliveryReceipt.subtotal_vnd.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between text-black/70">
                    <span>Phí vận chuyển:</span>
                    <span>
                      {deliveryReceipt.shipping_fee_vnd === 0 ? (
                        <span className="text-green-600 font-semibold">Miễn phí</span>
                      ) : (
                        `${deliveryReceipt.shipping_fee_vnd.toLocaleString('vi-VN')} đ`
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-bold text-sm text-[#ed7328] pt-1">
                    <span>Tổng thanh toán (COD):</span>
                    <span>{deliveryReceipt.total_vnd.toLocaleString('vi-VN')} đ</span>
                  </div>
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
                      <h5 className="font-semibold text-sm text-[#234386]">
                        Lưu đơn hàng vào tài khoản?
                      </h5>
                      <p className="text-xs text-black/70 mt-0.5 leading-relaxed">
                        Đăng nhập để theo dõi trạng thái giao hàng và lưu lịch sử đặt món. Mã bí mật nhận đơn an toàn đã được lưu tạm trên thiết bị này.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate('/login?returnTo=' + encodeURIComponent(window.location.pathname));
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3266] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>Đăng nhập để nhận đơn</span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              ) : getStoredClaimSecret(deliveryReceipt.id) ? (
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-left space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 shrink-0 mt-0.5">
                      <BookmarkCheck size={18} />
                    </div>
                    <div>
                      <h5 className="font-semibold text-sm text-[#234386]">
                        Liên kết đơn vào tài khoản
                      </h5>
                      <p className="text-xs text-black/70 mt-0.5 leading-relaxed">
                        Bạn đang đăng nhập. Nhấn nút bên dưới để liên kết đơn này vào danh sách đơn của bạn.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isClaiming}
                    onClick={() => handleClaimOrder(deliveryReceipt.id)}
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
                  onClick={handleCloseDeliveryReceipt}
                  className="w-full py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <span>Hoàn tất & Tiếp tục xem thực đơn</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : dineInQuote ? (
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
                <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
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
                      {item.note && <div className="text-[11px] text-black/50 italic">Ghi chú: {item.note}</div>}
                    </div>
                    <span className="font-semibold text-[#ed7328]">{item.line_total_vnd.toLocaleString('vi-VN')} đ</span>
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
                  <span className="font-semibold">{dineInQuote.subtotal_vnd.toLocaleString('vi-VN')} đ</span>
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
          ) : deliveryQuote ? (
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
                <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
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
                      {item.note && <div className="text-[11px] text-black/50 italic">Ghi chú: {item.note}</div>}
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
                  <span className="font-semibold text-black">Người nhận:</span> {deliveryForm.customerName} - {deliveryForm.customerPhone}
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
                  <span className="font-semibold">{deliveryQuote.subtotal_vnd.toLocaleString('vi-VN')} đ</span>
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
          ) : cartItems.length === 0 ? (
            <div className="py-20 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-[#fbf9f6] border border-[#d2b68c]/40 flex items-center justify-center mx-auto text-[#000000]/40">
                <ShoppingBag size={28} />
              </div>
              <p className="text-base font-semibold text-[#000000]/80">
                Giỏ hàng của bạn đang trống
              </p>
              <p className="text-xs text-[#000000]/50 max-w-xs mx-auto">
                Khám phá các món đặc sản đồng quê thơm ngon tại thực đơn Tiger 345!
              </p>
            </div>
          ) : (
            <>
              {/* Items List */}
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div
                    key={item.dish.id}
                    className="p-3 rounded-2xl border border-[#d2b68c]/40 bg-[#ffffff] flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.dish.image}
                        alt={item.dish.name}
                        className="w-14 h-14 rounded-xl object-cover shrink-0 border border-[#d2b68c]/20"
                      />
                      <div className="min-w-0">
                        <h4 className="font-semibold text-xs text-[#000000] truncate">
                          {item.dish.name}
                        </h4>
                        <p className="text-xs text-[#ed7328] font-bold mt-0.5">
                          {item.dish.price.toLocaleString('vi-VN')} đ
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center border border-[#d2b68c]/40 rounded-full bg-[#fbf9f6]">
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.dish.id, -1)}
                          aria-label="Giảm số lượng"
                          className="p-1.5 text-[#000000]/70 hover:text-[#000000] transition-colors"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="text-xs font-semibold px-2 min-w-[20px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateQuantity(item.dish.id, 1)}
                          aria-label="Tăng số lượng"
                          className="p-1.5 text-[#000000]/70 hover:text-[#000000] transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.dish.id)}
                        aria-label="Xóa món khỏi giỏ"
                        className="p-1.5 text-red-500/70 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Contextual form fields */}
              {isDineIn ? (
                /* Dine-In: Only Kitchen Note */
                <div className="pt-3 border-t border-[#d2b68c]/30 space-y-3">
                  {dineInQuoteError && (
                    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
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
              ) : (
                /* Delivery: Address, Zone, and Phone Fields */
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
                          const addr = savedAddresses.find((a) => a.id === e.target.value);
                          if (addr) {
                            setDeliveryFormField('customerName', addr.recipient_name);
                            setDeliveryFormField('customerPhone', addr.phone);
                            setDeliveryFormField(
                              'address',
                              `${addr.address_line}${addr.ward ? `, ${addr.ward}` : ''}${addr.district ? `, ${addr.district}` : ''}`
                            );
                            if (addr.delivery_note) {
                              setDeliveryFormField('orderNote', addr.delivery_note);
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
                    <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2">
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
                          {z.free_threshold_vnd ? ` - Freeship từ ${z.free_threshold_vnd.toLocaleString('vi-VN')} đ` : ''})
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
              )}
            </>
          )}
        </div>

        {/* Footer Summary & Submit */}
        {!dineInReceipt && !deliveryReceipt && cartItems.length > 0 && (
          <div className="p-5 border-t border-[#d2b68c]/30 bg-[#fbf9f6] space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="space-y-1.5 text-xs text-[#000000]/80">
              <div className="flex justify-between">
                <span>Tiền món ({cartItems.length}):</span>
                <span className="font-semibold">{subtotal.toLocaleString('vi-VN')} đ</span>
              </div>
              {!isDineIn && (
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
  );
};
