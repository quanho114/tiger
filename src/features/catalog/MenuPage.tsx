/**
 * Importers/Callers: src/routes.tsx, router configuration
 * Affected API: CatalogContext consumption in MenuPage
 * Data schemas: Category, MenuItem, OrderMode
 * User verbatim instruction: "Không thể tải danh mục món ăn - Lỗi hệ thống (502)" / "ủa sao tên món lạ z ko giống tui đưa á"
 */
import { useState, useMemo, useRef, useEffect, useContext } from 'react';
import type { FC } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Utensils,
  Bike,
  Search,
  Plus,
  Heart,
  Clock,
  Check,
  ChevronLeft,
  ChevronRight,
  Wine,
  Calendar,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  AlertCircle,
  RefreshCw,
  MapPin,
  Loader2,
  ArrowRight,
  Phone,
  Sparkles,
  Info
} from 'lucide-react';
import { toLegacyMenuItem, type MenuItem } from '@/features/catalog/legacyMenuItem';
import { DishImage } from '@/features/catalog/components/DishImage';
import { normalizeVietnamese } from '@/shared/lib/normalizeVietnamese';
import { useCatalog, CatalogContext } from '@/features/catalog';
import { useCart } from '@/features/cart';
import { useTableSession, type TableSession } from '@/features/table-session';
import { Dialog } from '@/shared/ui/Dialog';
import { Field } from '@/shared/ui/Field';
import { useAuth } from '@/features/auth';
import { useConciergeSession } from '@/features/concierge/ConciergeProvider';
import { FALLBACK_DELIVERY_ZONES } from '@/features/ordering/delivery/zones';
import {
  fetchCustomerFavorites,
  addCustomerFavorite,
  removeCustomerFavorite,
} from '@/features/account/api';

type OrderMode = 'dine-in' | 'delivery' | 'takeaway';

const orderModeOptions = [
  { value: 'dine-in', label: 'Tại quán', icon: Utensils },
  { value: 'delivery', label: 'Giao tận nơi', icon: Bike },
  { value: 'takeaway', label: 'Mang đi', icon: ShoppingBag },
] as const;

function extractQrToken(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/\/table\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}

export const MenuPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    items: catalogItems,
    categories: catalogCategories,
    isLoading,
    isError,
    error,
    menuError,
    refreshMenu,
  } = useCatalog();
  const {
    add,
    addedId,
    setCartOpen,
    cartItems,
    clear: clearCart,
    setContext: setCartContext,
    context: cartContext,
  } = useCart();
  const { session, resolveToken } = useTableSession();
  const { role } = useAuth();
  const { setViewedMenuItemId } = useConciergeSession();
  const catalogContext = useContext(CatalogContext);

  // Mode from URL query: ?mode=dine-in, ?mode=delivery or ?mode=takeaway
  const modeParam = searchParams.get('mode');
  const activeMode: OrderMode =
    modeParam === 'delivery'
      ? 'delivery'
      : modeParam === 'takeaway'
        ? 'takeaway'
        : 'dine-in';

  const [pendingModeChange, setPendingModeChange] = useState<OrderMode | null>(null);

  // Auto-sync table session to cart context if in dine-in mode and table details are missing
  useEffect(() => {
    if (activeMode === 'dine-in' && session) {
      if (cartContext.mode !== 'dine-in' || cartContext.tableId !== session.tableId) {
        setCartContext({
          mode: 'dine-in',
          tableId: session.tableId,
          tableCode: session.tableCode,
          tableName: session.tableName,
          visitId: session.visitId,
        });
      }
    }
  }, [activeMode, session, cartContext, setCartContext]);

  const handleModeSelect = (targetMode: OrderMode) => {
    if (targetMode === activeMode) return;

    // Check if cart has items from different mode
    const hasCartItems = cartItems.length > 0;
    const isDifferentMode = cartContext.mode !== targetMode;

    if (hasCartItems && isDifferentMode) {
      setPendingModeChange(targetMode);
      return;
    }

    applyModeChange(targetMode);
  };

  const applyModeChange = (targetMode: OrderMode) => {
    if (targetMode === 'delivery') {
      setCartContext({ mode: 'delivery' });
      setSearchParams({ mode: 'delivery' }, { replace: true });
    } else if (targetMode === 'takeaway') {
      setCartContext({ mode: 'takeaway' });
      setSearchParams({ mode: 'takeaway' }, { replace: true });
    } else {
      if (session) {
        setCartContext({
          mode: 'dine-in',
          tableId: session.tableId,
          tableCode: session.tableCode,
          tableName: session.tableName,
          visitId: session.visitId,
        });
      } else {
        setCartContext({
          mode: 'dine-in',
          tableId: '',
          tableCode: '',
          tableName: '',
          visitId: '',
        });
      }
      setSearchParams({}, { replace: true });
    }
  };

  const confirmModeChange = () => {
    if (!pendingModeChange) return;
    clearCart();
    applyModeChange(pendingModeChange);
    setPendingModeChange(null);
  };

  const currentModeLabel =
    cartContext.mode === 'dine-in'
      ? cartContext.tableName
        ? `Bàn ${cartContext.tableName}`
        : 'Tại quán'
      : cartContext.mode === 'takeaway'
        ? 'Mang đi'
        : 'Giao tận nơi';

  // QR table link dialog state
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [isResolvingQr, setIsResolvingQr] = useState(false);
  const [pendingTableSession, setPendingTableSession] = useState<TableSession | null>(null);

  // Delivery address dialog state
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState({
    recipientName: '',
    phone: '',
    address: '',
    zoneId: '',
  });
  const [addressError, setAddressError] = useState<string | null>(null);

  const deliveryZoneOptions =
    catalogContext?.settings?.delivery_zones?.length
      ? catalogContext.settings.delivery_zones
      : FALLBACK_DELIVERY_ZONES;

  const applyResolvedTable = (resolved: TableSession) => {
    setCartContext({
      mode: 'dine-in',
      tableId: resolved.tableId,
      tableCode: resolved.tableCode,
      tableName: resolved.tableName,
      visitId: resolved.visitId,
    });
    setSearchParams({}, { replace: true });
  };

  const handleResolveQr = async () => {
    const token = extractQrToken(qrInput);
    if (!token) {
      setQrError('Vui lòng dán liên kết hoặc mã QR bàn.');
      return;
    }
    setIsResolvingQr(true);
    setQrError(null);
    try {
      const resolved = await resolveToken(token);
      const hasCartItems = cartItems.length > 0;
      const isDifferentTable =
        cartContext.mode === 'dine-in' && cartContext.tableId !== resolved.tableId;
      const isDifferentMode = cartContext.mode !== 'dine-in';
      if (hasCartItems && (isDifferentTable || isDifferentMode)) {
        setPendingTableSession(resolved);
        setIsQrDialogOpen(false);
        setQrInput('');
        return;
      }
      applyResolvedTable(resolved);
      setIsQrDialogOpen(false);
      setQrInput('');
    } catch (err) {
      setQrError(
        err instanceof Error
          ? err.message
          : 'Không thể xác thực mã QR bàn. Vui lòng liên hệ nhân viên.'
      );
    } finally {
      setIsResolvingQr(false);
    }
  };

  const confirmTableReassign = () => {
    if (!pendingTableSession) return;
    clearCart();
    applyResolvedTable(pendingTableSession);
    setPendingTableSession(null);
  };

  const openAddressDialog = () => {
    setAddressDraft({
      recipientName: cartContext.mode === 'delivery' ? (cartContext.recipientName ?? '') : '',
      phone: cartContext.mode === 'delivery' ? (cartContext.phone ?? '') : '',
      address: cartContext.mode === 'delivery' ? (cartContext.address ?? '') : '',
      zoneId: cartContext.mode === 'delivery' ? (cartContext.zoneId ?? '') : '',
    });
    setAddressError(null);
    setIsAddressDialogOpen(true);
  };

  const confirmAddressDraft = () => {
    if (!addressDraft.address.trim()) {
      setAddressError('Vui lòng nhập địa chỉ giao món.');
      return;
    }
    if (!addressDraft.zoneId) {
      setAddressError('Vui lòng chọn khu vực giao hàng.');
      return;
    }
    setCartContext({
      mode: 'delivery',
      recipientName: addressDraft.recipientName.trim() || undefined,
      phone: addressDraft.phone.trim() || undefined,
      address: addressDraft.address.trim(),
      zoneId: addressDraft.zoneId,
    });
    setAddressError(null);
    setIsAddressDialogOpen(false);
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [selectedDishDetail, setSelectedDishDetail] = useState<MenuItem | null>(null);
  useEffect(() => {
    setViewedMenuItemId(selectedDishDetail?.id ?? null);
    return () => setViewedMenuItemId(null);
  }, [selectedDishDetail?.id, setViewedMenuItemId]);

  useEffect(() => {
    if (role === 'customer') {
      let isMounted = true;
      fetchCustomerFavorites()
        .then((favs) => {
          if (!isMounted) return;
          const map: Record<string, boolean> = {};
          favs.forEach((f) => {
            map[f.menu_item_id] = true;
          });
          setFavorites(map);
        })
        .catch(() => {});
      return () => {
        isMounted = false;
      };
    }
  }, [role]);

  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const willBeFav = !favorites[id];
    setFavorites((prev) => ({ ...prev, [id]: willBeFav }));

    if (role === 'customer') {
      try {
        if (willBeFav) {
          await addCustomerFavorite(id);
        } else {
          await removeCustomerFavorite(id);
        }
      } catch {
        setFavorites((prev) => ({ ...prev, [id]: !willBeFav }));
      }
    }
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const displayCategories = useMemo(() => {
    const allCat = { id: 'all', name: 'Tất cả món' };
    const specialtyCat = { id: 'specialty', name: 'Đặc sản Tiger 345', isSpecialty: true };
    if (!catalogCategories || catalogCategories.length === 0) {
      return [allCat, specialtyCat];
    }
    const sorted = [...catalogCategories].sort((a, b) => a.sort_order - b.sort_order);
    return [
      allCat,
      specialtyCat,
      ...sorted.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isSpecialty: false,
      })),
    ];
  }, [catalogCategories]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    catalogCategories?.forEach((cat) => {
      map.set(cat.id, cat.name);
      map.set(cat.slug, cat.name);
    });
    return map;
  }, [catalogCategories]);

  const dishes = useMemo(() => {
    return catalogItems.map(toLegacyMenuItem);
  }, [catalogItems]);

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      // Mode filtering
      if (!dish.modes.includes(activeMode)) {
        return false;
      }
      // Category filtering
      if (selectedCategory === 'specialty') {
        const isSpecialty =
          Boolean(dish.is_featured) ||
          (dish.featured_rank !== null && dish.featured_rank !== undefined && dish.featured_rank > 0) ||
          Boolean(dish.isSignature) ||
          Boolean(dish.is_signature);
        if (!isSpecialty) return false;
      } else if (selectedCategory !== 'all') {
        const currentCat = catalogCategories?.find((c) => c.id === selectedCategory);
        const matchesCat =
          dish.category === selectedCategory ||
          dish.category_id === selectedCategory ||
          (currentCat && dish.category === currentCat.slug);
        if (!matchesCat) return false;
      }
      // Search query filtering (accent-insensitive Vietnamese search)
      if (searchQuery.trim()) {
        const q = normalizeVietnamese(searchQuery);
        const matchesName = normalizeVietnamese(dish.name).includes(q);
        const matchesDesc = normalizeVietnamese(dish.description).includes(q);
        const matchesTags = dish.tags?.some((t) => normalizeVietnamese(t).includes(q));
        return matchesName || matchesDesc || matchesTags;
      }
      return true;
    });
  }, [dishes, activeMode, selectedCategory, searchQuery, catalogCategories]);

  const handleBookTableForDish = (dishName: string) => {
    navigate('/reservation', { state: { dishName } });
  };

  // Close modal on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedDishDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="pt-24 pb-20 md:pt-32 md:pb-28 bg-[#fbf9f6] min-h-screen">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">

        {/* ========================================================================= */}
        {/* PAGE HEADER */}
        {/* ========================================================================= */}
        <div className="mb-4 pb-6 border-b border-warm-sand/30">
          <div>
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
                THỰC ĐƠN TIGER 345
              </span>
              <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
            </div>
            <h1 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#234386] tracking-tight leading-tight">
              Hương vị đương đại, trải nghiệm trọn vẹn
            </h1>
            <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2 font-normal max-w-xl leading-relaxed">
              Thưởng thức món ăn trong không gian ấm cúng tại Vĩnh An, Vĩnh Cửu hoặc đặt món giao tận nơi nóng sốt giữ trọn hương vị.
            </p>
          </div>
        </div>

        <div className="sticky top-16 z-30 -mx-4 mb-6 bg-cream-paper/95 px-4 py-2 backdrop-blur-sm md:static md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
          <fieldset className="m-0 grid min-w-0 grid-cols-3 gap-2 border-0 p-0 font-sans md:w-fit md:gap-3">
            <legend className="sr-only">Chọn hình thức thưởng thức</legend>
            {orderModeOptions.map(({ value, label, icon: Icon }) => (
              <label key={value} className="relative min-w-0 cursor-pointer">
                <input
                  type="radio"
                  name="order-mode"
                  value={value}
                  checked={activeMode === value}
                  onChange={() => handleModeSelect(value)}
                  className="peer sr-only"
                />
                <span className="relative flex h-full min-h-12 flex-col items-center justify-center gap-2 rounded-2xl border border-warm-sand/40 bg-pure-white px-2 py-3 text-center text-sm font-semibold leading-5 text-deep-indigo hover:border-deep-indigo/40 hover:bg-deep-indigo/5 active:bg-deep-indigo/10 peer-checked:border-deep-indigo peer-checked:bg-deep-indigo peer-checked:text-pure-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-deep-indigo md:flex-row md:gap-3 md:px-5">
                  <Icon size={20} className="shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                  <Check size={14} aria-hidden="true" className={`absolute right-2 top-2 shrink-0 md:static ${activeMode === value ? 'visible' : 'invisible'}`} />
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        {/* ========================================================================= */}
        {/* CONTEXTUAL MODE HIGHLIGHT BANNER */}
        {/* ========================================================================= */}
        <div className="mb-8">
          {activeMode === 'dine-in' ? (
            session ? (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#ed7328]/10 via-[#ffc400]/15 to-white border border-[#ed7328]/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#ed7328] text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Utensils size={18} />
                  </div>
                  <div className="text-xs sm:text-sm">
                    <span className="font-semibold text-[#ed7328] block sm:inline">
                      Đang dùng bữa tại {session.tableName}:
                    </span>{' '}
                    <span className="text-[#000000]/75">
                      Món ăn bạn chọn sẽ được gửi trực tiếp đến Bếp Tiger 345 và phục vụ tận bàn.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shrink-0 shadow-xs active:scale-95 transition-all"
                >
                  <ShoppingBag size={13} />
                  <span>Xem thực đơn đã chọn ({cartItems.length})</span>
                </button>
              </div>
            ) : (
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#234386]/10 via-[#6aa8dc]/10 to-white border border-[#234386]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#234386] text-[#ffc400] flex items-center justify-center shrink-0">
                    <QrCode size={18} />
                  </div>
                  <div className="text-xs sm:text-sm">
                    <span className="font-semibold text-[#234386] block sm:inline">Đang dùng thực đơn tại quán:</span>{' '}
                    <span className="text-[#000000]/75">
                      Quét mã QR trên bàn để gọi món hoặc nhập số bàn nếu bạn đang có mặt tại nhà hàng.
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setQrError(null);
                      setIsQrDialogOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                  >
                    <QrCode size={13} />
                    <span>Nhập số bàn</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/reservation')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-[#234386]/30 text-[#234386] hover:border-[#234386] text-xs font-semibold shadow-xs active:scale-95 transition-all"
                  >
                    <Calendar size={13} />
                    <span>Đặt bàn trực tuyến</span>
                  </button>
                </div>
              </div>
            )
          ) : activeMode === 'delivery' ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#ed7328]/10 via-[#ffc400]/15 to-white border border-[#ed7328]/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#ed7328] text-white flex items-center justify-center shrink-0">
                  <Bike size={18} />
                </div>
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-[#ed7328] block sm:inline">Chính sách giao hàng nóng sốt:</span>{' '}
                  <span className="text-[#000000]/75">
                    Freeship cho đơn từ 300.000đ trong bán kính 5km. Đóng gói hộp giấy giữ nhiệt sinh thái bảo toàn độ ngon.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ed7328] bg-white px-3 py-1.5 rounded-full border border-[#ed7328]/30">
                  <ShieldCheck size={14} />
                  <span>Cam kết nóng sốt 30–40p</span>
                </div>
                <button
                  type="button"
                  onClick={openAddressDialog}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[#ed7328]/40 text-[#ed7328] hover:border-[#ed7328] text-xs font-semibold shadow-xs active:scale-95 transition-all"
                >
                  <MapPin size={13} />
                  <span>Nhập địa chỉ giao</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                >
                  <ShoppingBag size={13} />
                  <span>Xem giỏ hàng</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#ed7328]/10 via-[#ffc400]/15 to-white border border-[#ed7328]/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#ed7328] text-white flex items-center justify-center shrink-0">
                  <ShoppingBag size={18} />
                </div>
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-[#ed7328] block sm:inline">Đặt trước, đến nhận:</span>{' '}
                  <span className="text-[#000000]/75">
                    Chọn món trước và ghé Tiger 345 nhận món khi đã sẵn sàng. Nhận tại Tiger 345 – Vĩnh An, Vĩnh Cửu.
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ed7328] bg-white px-3 py-1.5 rounded-full border border-[#ed7328]/30">
                  <Clock size={14} />
                  <span>Dự kiến sẵn sàng 20–30 phút</span>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                >
                  <ShoppingBag size={13} />
                  <span>Xem giỏ hàng</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* CATEGORY FILTER CHIPS & SEARCH */}
        {/* ========================================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#d2b68c]/30">
          {/* Scrollable Categories */}
          <div className="flex items-center gap-2 overflow-hidden flex-grow">
            <div
              ref={categoryScrollRef}
              className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto scrollbar-none py-1 scroll-smooth touch-pan-x"
            >
              {displayCategories.map((cat) => {
                const isActive = selectedCategory === cat.id;
                const isSpecialty = cat.id === 'specialty';
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border active:scale-95 cursor-pointer ${
                      isActive
                        ? 'bg-[#ed7328] text-white border-[#ed7328] shadow-xs'
                        : isSpecialty
                        ? 'bg-[#ffc400]/15 text-[#234386] border-[#ffc400]/50 hover:bg-[#ffc400]/30 hover:border-[#ed7328]'
                        : 'bg-white text-[#000000]/75 border-[#d2b68c]/35 hover:border-[#ed7328] hover:text-[#ed7328]'
                    }`}
                  >
                    {isSpecialty && (
                      <Sparkles size={12} className={isActive ? 'text-white' : 'text-[#ed7328]'} />
                    )}
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Scroll buttons on desktop */}
            <div className="hidden lg:flex items-center gap-1 shrink-0 pl-2">
              <button
                type="button"
                onClick={() => scrollCategories('left')}
                className="w-7 h-7 rounded-full bg-white border border-[#d2b68c]/40 text-[#234386] hover:bg-[#234386] hover:text-white flex items-center justify-center transition-colors"
                aria-label="Cuộn danh mục sang trái"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => scrollCategories('right')}
                className="w-7 h-7 rounded-full bg-white border border-[#d2b68c]/40 text-[#234386] hover:bg-[#234386] hover:text-white flex items-center justify-center transition-colors"
                aria-label="Cuộn danh mục sang phải"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div className="w-full md:w-72 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#000000]/45" />
              <input
                type="text"
                placeholder="Tìm món ngon theo tên, nguyên liệu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-full bg-white border border-[#d2b68c]/35 text-xs sm:text-sm text-[#000000] focus:outline-none focus:border-[#234386] placeholder:text-[#000000]/40"
              />
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* DISH CARDS GRID */}
        {/* ========================================================================= */}
        {isLoading && catalogItems.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`menu-skeleton-${idx}`}
                className="animate-pulse flex flex-col bg-white rounded-[22px] border border-[#d2b68c]/30 p-3.5 shadow-xs"
              >
                <div className="aspect-[4/3] rounded-[16px] bg-[#234386]/10 mb-3" />
                <div className="space-y-2.5 p-2">
                  <div className="h-4 bg-[#234386]/10 rounded-sm w-3/4" />
                  <div className="h-3 bg-[#234386]/10 rounded-sm w-full" />
                  <div className="h-3 bg-[#234386]/10 rounded-sm w-2/3" />
                  <div className="pt-3 border-t border-[#d2b68c]/20 flex justify-between items-center">
                    <div className="h-4 bg-[#ed7328]/20 rounded-sm w-1/3" />
                    <div className="h-7 bg-[#234386]/10 rounded-full w-20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : catalogItems.length === 0 && (menuError || isError) ? (
          <div role="alert" className="py-16 text-center space-y-4 bg-white rounded-3xl border border-red-200 p-8 shadow-xs max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]">
              Không thể tải danh mục món ăn
            </h3>
            <p className="text-xs text-[#000000]/65 max-w-sm mx-auto">
              {menuError || error?.message || 'Đã có lỗi kết nối tới máy chủ. Vui lòng kiểm tra đường truyền và thử lại.'}
            </p>
            <button
              type="button"
              onClick={() => refreshMenu()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
            >
              <RefreshCw size={13} />
              <span>Thử tải lại</span>
            </button>
          </div>
        ) : filteredDishes.length === 0 ? (
          <div className="py-20 text-center space-y-3 bg-white rounded-3xl border border-[#d2b68c]/30 p-8">
            <div className="w-14 h-14 rounded-full bg-[#fbf9f6] text-[#000000]/40 flex items-center justify-center mx-auto">
              <Search size={24} />
            </div>
            <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]/80">
              Không tìm thấy món ăn phù hợp
            </h3>
            <p className="text-xs text-[#000000]/60 max-w-sm mx-auto">
              Vui lòng thử tìm kiếm với từ khóa khác hoặc chọn lại danh mục món ăn nhé.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className="mt-2 px-5 py-2 rounded-full bg-[#234386] text-white text-xs font-semibold"
            >
              Xem tất cả món
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
            {filteredDishes.map((dish) => {
              const isJustAdded = addedId === dish.id;
              const isFav = !!favorites[dish.id];
              const isAvailable = dish.available !== false;

              return (
                <article
                  key={dish.id}
                  data-dish-id={dish.id}
                  className={`group flex flex-col bg-white rounded-[22px] border border-[#d2b68c]/30 p-3.5 shadow-xs transition-all duration-300 ${
                    isAvailable
                      ? 'hover:shadow-xl hover:-translate-y-1'
                      : 'opacity-75 bg-[#fbf9f6]'
                  }`}
                >
                  {/* Dish Image */}
                  <div
                    onClick={() => setSelectedDishDetail(dish)}
                    className="relative aspect-[4/3] rounded-[16px] overflow-hidden bg-[#234386]/5 cursor-pointer"
                  >
                    <DishImage
                      dish={dish}
                      categoryName={categoryMap.get(dish.category) || categoryMap.get(dish.category_id || '')}
                      isAvailable={isAvailable}
                    />

                    {/* Badge: Đặc sản / Signature / Bán chạy / Mới */}
                    <div className="absolute top-2.5 left-2.5">
                      {dish.featured_rank ? (
                        <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                          ★ Đặc sản #{dish.featured_rank}
                        </span>
                      ) : dish.isSignature ? (
                        <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                          ★ Đặc sản
                        </span>
                      ) : dish.isBestseller ? (
                        <span className="inline-block bg-[#234386] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                          Bán chạy
                        </span>
                      ) : dish.isNew ? (
                        <span className="inline-block bg-[#3d5a45] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                          Món mới
                        </span>
                      ) : null}
                    </div>

                    {/* Badge: Tạm hết (khi available = false) */}
                    {!isAvailable && (
                      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] flex items-center justify-center">
                        <span className="bg-black/80 text-white font-medium text-xs px-3 py-1 rounded-full border border-white/20">
                          Tạm hết
                        </span>
                      </div>
                    )}

                    {/* Favorite Heart Icon */}
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(dish.id, e)}
                      className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-white/80 backdrop-blur-xs text-[#000000]/60 hover:text-red-500 flex items-center justify-center transition-colors shadow-2xs active:scale-95"
                      aria-label="Yêu thích món"
                    >
                      <Heart
                        size={14}
                        className={isFav ? 'fill-red-500 text-red-500' : ''}
                      />
                    </button>

                    {/* Mode-specific Badge */}
                    {activeMode === 'delivery' && dish.deliveryETA && (
                      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[9px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Clock size={10} />
                        <span>{dish.deliveryETA}</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-2.5 pt-3.5 flex flex-col flex-grow justify-between">
                    <div>
                      <h3
                        onClick={() => setSelectedDishDetail(dish)}
                        className="font-['Noto_Serif',serif] text-base font-bold text-[#000000] group-hover:text-[#234386] transition-colors line-clamp-1 mb-1 cursor-pointer"
                      >
                        {dish.name}
                      </h3>
                      <p className="font-['Be_Vietnam_Pro',sans-serif] text-[12px] text-[#000000]/70 line-clamp-2 leading-relaxed mb-3 font-normal">
                        {dish.description}
                      </p>

                      {/* Dine-in pairing note chip */}
                      {activeMode === 'dine-in' && dish.pairingNote && (
                        <div className="p-1.5 rounded-lg bg-[#ffc400]/15 text-[10px] text-[#234386] mb-3 flex items-center gap-1.5 line-clamp-1">
                          <Wine size={12} className="text-[#ed7328] shrink-0" />
                          <span className="italic truncate">{dish.pairingNote}</span>
                        </div>
                      )}
                    </div>

                    {/* Price & Action Row */}
                    <div className="pt-2.5 border-t border-[#d2b68c]/20 flex items-center justify-between mt-auto gap-2">
                      <div className="min-w-0 flex-1">
                        {dish.pricing_mode === 'market' ? (
                          <span className="font-['Noto_Serif',serif] text-xs sm:text-sm font-bold text-[#ed7328] block truncate">
                            Theo thời giá
                          </span>
                        ) : dish.pricing_mode === 'unknown' ? (
                          <span className="font-['Noto_Serif',serif] text-xs sm:text-sm font-bold text-[#ed7328] block truncate">
                            Liên hệ
                          </span>
                        ) : dish.pricing_mode === 'range' ? (
                          <span
                            className="font-['Noto_Serif',serif] text-[11px] sm:text-xs font-bold text-[#ed7328] block truncate"
                            title={`${(dish.price_min ?? dish.price).toLocaleString('vi-VN')} – ${(dish.price_max ?? dish.price).toLocaleString('vi-VN')} đ`}
                          >
                            {(dish.price_min ?? dish.price).toLocaleString('vi-VN')} – {(dish.price_max ?? dish.price).toLocaleString('vi-VN')} đ
                          </span>
                        ) : (
                          <span className="font-['Noto_Serif',serif] text-sm sm:text-base font-bold text-[#ed7328] block truncate">
                            {dish.price.toLocaleString('vi-VN')} đ
                          </span>
                        )}
                      </div>

                      {dish.pricing_mode === 'range' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedDishDetail(dish)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#ed7328]/10 text-[#ed7328] hover:bg-[#ed7328] hover:text-white transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                        >
                          <span>Tùy phần</span>
                          <ArrowRight size={12} />
                        </button>
                      ) : dish.pricing_mode === 'market' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedDishDetail(dish)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#234386]/10 text-[#234386] hover:bg-[#234386] hover:text-white transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                        >
                          <span>Hỏi giá</span>
                          <ArrowRight size={12} />
                        </button>
                      ) : dish.pricing_mode === 'unknown' ? (
                        <button
                          type="button"
                          onClick={() => setSelectedDishDetail(dish)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#000000]/5 text-[#000000]/70 hover:bg-[#234386] hover:text-white transition-all shadow-2xs active:scale-95 cursor-pointer shrink-0"
                        >
                          <span>Liên hệ</span>
                          <ArrowRight size={12} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => isAvailable && add(dish)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                            !isAvailable
                              ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                              : isJustAdded
                              ? 'bg-[#3d5a45] text-white active:scale-95'
                              : activeMode === 'delivery'
                              ? 'bg-[#234386] hover:bg-[#ed7328] text-white shadow-2xs active:scale-95'
                              : 'bg-[#ed7328] hover:bg-[#d86218] text-white shadow-2xs active:scale-95'
                          }`}
                        >
                          {!isAvailable ? (
                            <span>Tạm hết</span>
                          ) : isJustAdded ? (
                            <>
                              <Check size={13} className="stroke-[3]" />
                              <span>Đã thêm</span>
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              <span>Thêm món</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                  </div>
                </article>
              );
            })}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* DISH DETAIL MODAL */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(selectedDishDetail)}
        onClose={() => setSelectedDishDetail(null)}
        title={selectedDishDetail?.name}
        description={selectedDishDetail?.description}
        className="rounded-[24px] sm:rounded-[28px]"
      >
        {selectedDishDetail && (
          <div>
            <div className="relative aspect-video overflow-hidden rounded-t-[24px] sm:rounded-t-[28px] bg-[#234386]/5">
              <DishImage
                dish={selectedDishDetail}
                categoryName={categoryMap.get(selectedDishDetail.category) || categoryMap.get(selectedDishDetail.category_id || '')}
                isAvailable={selectedDishDetail.available !== false}
              />
              <button
                type="button"
                onClick={() => setSelectedDishDetail(null)}
                aria-label="Đóng chi tiết món ăn"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-xs cursor-pointer z-20"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386]">
                    {selectedDishDetail.name}
                  </h3>
                  {selectedDishDetail.servingSize && (
                    <span className="text-xs text-[#000000]/60">Khẩu phần: {selectedDishDetail.servingSize}</span>
                  )}
                </div>
                {selectedDishDetail.pricing_mode === 'market' ? (
                  <span className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#ed7328] shrink-0">
                    Theo thời giá
                  </span>
                ) : selectedDishDetail.pricing_mode === 'unknown' ? (
                  <span className="font-['Noto_Serif',serif] text-lg sm:text-xl font-bold text-[#ed7328] shrink-0">
                    Liên hệ
                  </span>
                ) : selectedDishDetail.pricing_mode === 'range' ? (
                  <span className="font-['Noto_Serif',serif] text-base sm:text-xl font-bold text-[#ed7328] shrink-0 text-right">
                    {(selectedDishDetail.price_min ?? selectedDishDetail.price).toLocaleString('vi-VN')} – {(selectedDishDetail.price_max ?? selectedDishDetail.price).toLocaleString('vi-VN')} đ
                  </span>
                ) : (
                  <span className="font-['Noto_Serif',serif] text-xl font-bold text-[#ed7328] shrink-0">
                    {selectedDishDetail.price.toLocaleString('vi-VN')} đ
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-[#000000]/75 leading-relaxed font-normal">
                {selectedDishDetail.description}
              </p>

              {/* Pricing Mode Explanatory Notice */}
              {selectedDishDetail.pricing_mode === 'range' && (
                <div className="p-3 rounded-xl bg-[#ed7328]/10 text-xs text-[#ed7328] flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5 text-[#ed7328]" />
                  <div>
                    <span className="font-semibold block text-[#ed7328]">Món ăn tùy chọn phần / trọng lượng</span>
                    <span className="text-[#000000]/75 leading-relaxed">
                      Giá thực tế sẽ dao động theo kích cỡ hoặc số lượng khách. Quý khách vui lòng ghi chú hoặc trao đổi cùng nhân viên phục vụ khi đặt món.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pricing_mode === 'market' && (
                <div className="p-3 rounded-xl bg-[#234386]/10 text-xs text-[#234386] flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5 text-[#234386]" />
                  <div>
                    <span className="font-semibold block text-[#234386]">Thực phẩm tươi sống tính theo thời giá</span>
                    <span className="text-[#000000]/75 leading-relaxed">
                      Nguyên liệu nhập mới trong ngày. Nhân viên Tiger 345 sẽ báo giá chuẩn xác theo thời điểm quý khách thưởng thức.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pricing_mode === 'unknown' && (
                <div className="p-3 rounded-xl bg-[#000000]/5 text-xs text-[#000000]/80 flex items-start gap-2.5">
                  <Info size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">Món phục vụ theo liên hệ</span>
                    <span className="text-[#000000]/70 leading-relaxed">
                      Vui lòng liên hệ nhân viên hoặc hotline quán để được tư vấn và báo giá chi tiết.
                    </span>
                  </div>
                </div>
              )}

              {selectedDishDetail.pairingNote && (
                <div className="p-3 rounded-xl bg-[#ffc400]/15 text-xs text-[#234386] flex items-center gap-2">
                  <Wine size={15} className="text-[#ed7328] shrink-0" />
                  <span className="italic">{selectedDishDetail.pairingNote}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#d2b68c]/25 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDishDetail(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-[#000000]/60 hover:text-[#000000] text-center cursor-pointer"
                >
                  Đóng
                </button>

                {/* Fixed pricing mode allows adding to cart */}
                {(!selectedDishDetail.pricing_mode || selectedDishDetail.pricing_mode === 'fixed') ? (
                  activeMode !== 'dine-in' || session ? (
                    <button
                      type="button"
                      disabled={selectedDishDetail.available === false}
                      onClick={() => {
                        if (selectedDishDetail.available === false) return;
                        add(selectedDishDetail);
                        setSelectedDishDetail(null);
                      }}
                      className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold shadow-xs transition-all ${
                        selectedDishDetail.available === false
                          ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                          : 'bg-[#ed7328] hover:bg-[#d86218] text-white active:scale-95 cursor-pointer'
                      }`}
                    >
                      {selectedDishDetail.available === false ? (
                        <span>Món này hiện đang tạm hết</span>
                      ) : (
                        <>
                          <Plus size={14} />
                          <span>
                            {session
                              ? `Thêm vào bàn (${session.tableName})`
                              : activeMode === 'takeaway'
                                ? 'Thêm vào giỏ mang đi'
                                : 'Thêm vào giỏ giao hàng'}
                          </span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const dish = selectedDishDetail;
                        setSelectedDishDetail(null);
                        handleBookTableForDish(dish.name);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs hover:bg-[#1a3468] active:scale-95 transition-all cursor-pointer"
                    >
                      <Calendar size={14} />
                      <span>Đặt bàn thưởng thức món này</span>
                    </button>
                  )
                ) : (
                  /* Non-fixed pricing modes: Guide customer appropriately */
                  <a
                    href="tel:0962345345"
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <Phone size={14} />
                    <span>Gọi hotline 0962.345.345 tư vấn giá</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* MODE CHANGE CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(pendingModeChange)}
        onClose={() => setPendingModeChange(null)}
        title="Thay Đổi Hình Thức Phục Vụ?"
        description="Xác nhận đổi chế độ phục vụ"
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center mx-auto">
            <Utensils size={28} />
          </div>
          <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#234386]">
            Thay Đổi Hình Thức Phục Vụ?
          </h3>
          <p className="text-sm text-black/70 leading-relaxed">
            Bạn đang có <strong className="text-[#ed7328]">{cartItems.length} món</strong> trong giỏ hàng
            thuộc hình thức <strong>{currentModeLabel}</strong>.
            <br />
            Bạn có muốn chuyển sang hình thức <strong>{pendingModeChange === 'delivery' ? 'Giao tận nơi' : pendingModeChange === 'takeaway' ? 'Mang đi' : 'Tại quán'}</strong> và làm mới giỏ hàng không?
          </p>
          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={confirmModeChange}
              className="w-full py-3 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              Đồng ý chuyển & làm mới giỏ hàng
            </button>
            <button
              type="button"
              onClick={() => setPendingModeChange(null)}
              className="w-full py-2.5 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-xs transition-colors cursor-pointer"
            >
              Giữ giỏ hàng hiện tại
            </button>
          </div>
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* QR / TABLE LINK DIALOG — paste link or QR code to connect to a table */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={isQrDialogOpen}
        onClose={() => {
          setIsQrDialogOpen(false);
          setQrError(null);
        }}
        title="Nhập số bàn"
        description="Kết nối giỏ hàng với bàn của bạn tại nhà hàng"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleResolveQr();
          }}
          className="p-6 space-y-4"
        >
          <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-[#234386]/5 border border-[#234386]/15">
            <div className="p-2 rounded-xl bg-[#234386] text-[#ffc400] shrink-0">
              <QrCode size={20} />
            </div>
            <div className="text-xs text-black/75 leading-relaxed space-y-1">
              <p className="font-semibold text-[#234386]">Quét QR</p>
              <p>
                Quét mã QR trên bàn để gọi món hoặc nhập số bàn nếu bạn đang có mặt tại nhà hàng.
                Mở camera điện thoại, quét mã trên bàn, rồi dán liên kết hoặc mã QR vào ô bên dưới.
              </p>
            </div>
          </div>

          {qrError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>{qrError}</span>
            </div>
          )}

          <Field label="Liên kết hoặc mã QR bàn" required>
            <input
              type="text"
              required
              placeholder="Dán liên kết /table/... hoặc mã QR"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <button
            type="submit"
            disabled={isResolvingQr}
            className="w-full py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          >
            {isResolvingQr ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Đang xác thực bàn ăn...</span>
              </>
            ) : (
              <>
                <span>Kết nối tới bàn</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </Dialog>

      {/* ========================================================================= */}
      {/* TABLE REASSIGN CONFIRMATION DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={Boolean(pendingTableSession)}
        onClose={() => setPendingTableSession(null)}
        title="Thay Đổi Bàn Phục Vụ?"
        description="Xác nhận đổi bàn phục vụ"
      >
        <div className="p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center mx-auto">
            <Utensils size={28} />
          </div>
          <p className="text-sm text-black/70 leading-relaxed">
            Bạn đang có <strong className="text-[#ed7328]">{cartItems.length} món</strong> trong giỏ hàng
            thuộc hình thức <strong>{currentModeLabel}</strong>.
            <br />
            Bạn có muốn chuyển sang gọi món tại <strong>{pendingTableSession?.tableName}</strong> và làm mới giỏ hàng không?
          </p>
          <div className="pt-2 space-y-2.5">
            <button
              type="button"
              onClick={confirmTableReassign}
              className="w-full py-3 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              Đổi sang {pendingTableSession?.tableName} (Làm mới giỏ)
            </button>
            <button
              type="button"
              onClick={() => setPendingTableSession(null)}
              className="w-full py-2.5 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-xs transition-colors cursor-pointer"
            >
              Giữ giỏ hàng hiện tại
            </button>
          </div>
        </div>
      </Dialog>

      {/* ========================================================================= */}
      {/* DELIVERY ADDRESS DIALOG */}
      {/* ========================================================================= */}
      <Dialog
        isOpen={isAddressDialogOpen}
        onClose={() => {
          setIsAddressDialogOpen(false);
          setAddressError(null);
        }}
        title="Nhập địa chỉ giao"
        description="Lưu địa chỉ và khu vực để ước tính phí giao hàng"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirmAddressDraft();
          }}
          className="p-6 space-y-3"
        >
          {addressError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-600 flex items-center gap-2"
            >
              <AlertCircle size={14} className="shrink-0" />
              <span>{addressError}</span>
            </div>
          )}

          <Field label="Họ và tên người nhận">
            <input
              type="text"
              placeholder="Ví dụ: Nguyễn Văn A"
              value={addressDraft.recipientName}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, recipientName: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Số điện thoại liên hệ">
            <input
              type="tel"
              placeholder="Ví dụ: 090 280 99 29"
              value={addressDraft.phone}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, phone: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Địa chỉ giao" required>
            <input
              type="text"
              required
              placeholder="Số nhà, đường, khu dân cư..."
              value={addressDraft.address}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            />
          </Field>

          <Field label="Khu vực" required>
            <select
              required
              value={addressDraft.zoneId}
              onChange={(e) => setAddressDraft((prev) => ({ ...prev, zoneId: e.target.value }))}
              className="w-full text-sm sm:text-xs px-3.5 py-2.5 rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] bg-[#fbf9f6]"
            >
              <option value="" disabled>
                Chọn khu vực giao hàng
              </option>
              {deliveryZoneOptions.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name} — {zone.fee_vnd.toLocaleString('vi-VN')} đ
                </option>
              ))}
            </select>
          </Field>

          <button
            type="submit"
            className="w-full py-3 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            <MapPin size={16} />
            <span>Lưu địa chỉ giao</span>
          </button>
        </form>
      </Dialog>

    </div>
  );
};
