import { useState, useMemo, useRef, useEffect } from 'react';
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
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { toLegacyMenuItem, type MenuItem } from '../data/restaurantData';
import { useCatalog } from '@/features/catalog';
import { useCart } from '../store/cart';
import { useTableSession } from '@/features/table-session';
import { Dialog } from '@/components/ui/Dialog';
import { useAuth } from '@/features/auth';
import {
  fetchCustomerFavorites,
  addCustomerFavorite,
  removeCustomerFavorite,
} from '@/features/account/api';

export const MenuPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    items: catalogItems,
    categories: catalogCategories,
    isLoading,
    isError,
    error,
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
  const { session } = useTableSession();
  const { role } = useAuth();

  // Mode from URL query: ?mode=dine-in or ?mode=delivery
  const modeParam = searchParams.get('mode');
  const activeMode: 'dine-in' | 'delivery' = modeParam === 'delivery' ? 'delivery' : 'dine-in';

  const [pendingModeChange, setPendingModeChange] = useState<'dine-in' | 'delivery' | null>(null);

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

  const handleModeSelect = (targetMode: 'dine-in' | 'delivery') => {
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

  const applyModeChange = (targetMode: 'dine-in' | 'delivery') => {
    if (targetMode === 'delivery') {
      setCartContext({ mode: 'delivery' });
      setSearchParams({ mode: 'delivery' }, { replace: true });
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

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [selectedDishDetail, setSelectedDishDetail] = useState<MenuItem | null>(null);

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
    if (!catalogCategories || catalogCategories.length === 0) {
      return [allCat];
    }
    return [
      allCat,
      ...catalogCategories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
      })),
    ];
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
      if (
        selectedCategory !== 'all' &&
        dish.category !== selectedCategory &&
        dish.category_id !== selectedCategory
      ) {
        return false;
      }
      // Search query filtering
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = dish.name.toLowerCase().includes(q);
        const matchesDesc = dish.description.toLowerCase().includes(q);
        const matchesTags = dish.tags?.some((t) => t.toLowerCase().includes(q));
        return matchesName || matchesDesc || matchesTags;
      }
      return true;
    });
  }, [dishes, activeMode, selectedCategory, searchQuery]);

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
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-6 border-b border-[#d2b68c]/30">
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

          {/* Mode segmented control — compact mode selector, intentionally subordinate to heading + CTA */}
          <div
            role="tablist"
            aria-label="Chọn hình thức thưởng thức"
            className="hidden md:block p-[4px] rounded-full bg-[#fffefb] border border-[#e3d6bd] shadow-[0_1px_2px_rgba(35,67,134,0.08)] w-[264px] h-[50px] shrink-0 self-start md:self-end"
          >
            <div className="relative flex w-full h-full">
              {/* Sliding active pill — glides between segments */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1/2 rounded-full bg-[#234386] transition-transform duration-[170ms] ease-out motion-reduce:transition-none ${
                  activeMode === 'delivery' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'dine-in'}
                onClick={() => handleModeSelect('dine-in')}
                className={`relative flex-1 min-w-0 h-full flex items-center justify-center gap-[6px] px-2 rounded-full text-[14px] font-semibold leading-none whitespace-nowrap transition-colors duration-[170ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#234386] ${
                  activeMode === 'dine-in' ? 'text-white' : 'text-[#000000]/60 hover:text-[#234386]'
                }`}
              >
                <Utensils size={16} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Tại quán</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'delivery'}
                onClick={() => handleModeSelect('delivery')}
                className={`relative flex-1 min-w-0 h-full flex items-center justify-center gap-[6px] px-2 rounded-full text-[14px] font-semibold leading-none whitespace-nowrap transition-colors duration-[170ms] ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#234386] ${
                  activeMode === 'delivery' ? 'text-white' : 'text-[#000000]/60 hover:text-[#234386]'
                }`}
              >
                <Bike size={16} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Giao tận nơi</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile-only sticky mode switch — compact, same hierarchy as desktop */}
        <div className="md:hidden sticky top-[58px] z-30 -mx-4 px-4 py-2 bg-[#fbf9f6]/95 backdrop-blur-sm">
          <div
            role="tablist"
            aria-label="Chọn hình thức thưởng thức"
            className="p-[4px] rounded-full bg-[#fffefb] border border-[#e3d6bd] shadow-[0_1px_2px_rgba(35,67,134,0.08)] w-full max-w-[340px] h-[48px] mx-auto"
          >
            <div className="relative flex w-full h-full">
              {/* Sliding active pill — glides between segments */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 w-1/2 rounded-full bg-[#234386] transition-transform duration-[170ms] ease-out motion-reduce:transition-none ${
                  activeMode === 'delivery' ? 'translate-x-full' : 'translate-x-0'
                }`}
              />
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'dine-in'}
                onClick={() => handleModeSelect('dine-in')}
                className={`relative flex-1 min-w-0 h-full flex items-center justify-center gap-[6px] px-2 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap transition-colors duration-[170ms] ease-out ${
                  activeMode === 'dine-in' ? 'text-white' : 'text-[#000000]/60'
                }`}
              >
                <Utensils size={16} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Tại quán</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'delivery'}
                onClick={() => handleModeSelect('delivery')}
                className={`relative flex-1 min-w-0 h-full flex items-center justify-center gap-[6px] px-2 rounded-full text-[13px] font-semibold leading-none whitespace-nowrap transition-colors duration-[170ms] ease-out ${
                  activeMode === 'delivery' ? 'text-white' : 'text-[#000000]/60'
                }`}
              >
                <Bike size={16} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">Giao tận nơi</span>
              </button>
            </div>
          </div>
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
                    <Sparkles size={18} />
                  </div>
                  <div className="text-xs sm:text-sm">
                    <span className="font-semibold text-[#234386] block sm:inline">Thực đơn tại nhà hàng:</span>{' '}
                    <span className="text-[#000000]/75">
                      Quét mã QR đặt trên bàn ăn của bạn để gọi món ngay trên điện thoại hoặc đặt bàn trước để giữ chỗ.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/reservation')}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shrink-0 shadow-xs active:scale-95 transition-all"
                >
                  <Calendar size={13} />
                  <span>Đặt bàn trực tuyến</span>
                </button>
              </div>
            )
          ) : (
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
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#ed7328] bg-white px-3 py-1.5 rounded-full border border-[#ed7328]/30">
                  <ShieldCheck size={14} />
                  <span>Cam kết nóng sốt 30–40p</span>
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
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border active:scale-95 ${
                      isActive
                        ? 'bg-[#ed7328] text-white border-[#ed7328] shadow-xs'
                        : 'bg-white text-[#000000]/75 border-[#d2b68c]/35 hover:border-[#ed7328] hover:text-[#ed7328]'
                    }`}
                  >
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
        {isLoading ? (
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
        ) : isError ? (
          <div role="alert" className="py-16 text-center space-y-4 bg-white rounded-3xl border border-red-200 p-8 shadow-xs max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertCircle size={24} />
            </div>
            <h3 className="font-['Noto_Serif',serif] text-lg font-bold text-[#000000]">
              Không thể tải danh mục món ăn
            </h3>
            <p className="text-xs text-[#000000]/65 max-w-sm mx-auto">
              {error?.message || 'Đã có lỗi kết nối tới máy chủ. Vui lòng kiểm tra đường truyền và thử lại.'}
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
                    <img
                      src={dish.image}
                      alt={dish.name}
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        isAvailable ? 'group-hover:scale-105' : 'grayscale-[40%]'
                      }`}
                      loading="lazy"
                    />

                    {/* Badge: Đặc biệt / Signature */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                        {dish.isSignature ? '★ Signature' : 'Bếp trưởng chọn'}
                      </span>
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
                    <div className="pt-2.5 border-t border-[#d2b68c]/20 flex items-center justify-between mt-auto">
                      <span className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
                        {dish.price.toLocaleString('vi-VN')} đ
                      </span>

                      {activeMode === 'delivery' ? (
                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => isAvailable && add(dish)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            !isAvailable
                              ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                              : isJustAdded
                              ? 'bg-[#3d5a45] text-white active:scale-95'
                              : 'bg-[#234386] hover:bg-[#ed7328] text-white shadow-2xs active:scale-95'
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
                              <span>Thêm vào giỏ</span>
                              <span className="sr-only">Đặt giao</span>
                            </>
                          )}
                        </button>
                      ) : session ? (
                        <button
                          type="button"
                          disabled={!isAvailable}
                          onClick={() => isAvailable && add(dish)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                            !isAvailable
                              ? 'bg-[#000000]/15 text-[#000000]/40 cursor-not-allowed'
                              : isJustAdded
                              ? 'bg-[#3d5a45] text-white active:scale-95'
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
                              <span>Gọi món</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDishDetail(dish)}
                            className="text-xs font-semibold text-[#000000]/60 hover:text-[#234386] px-2 py-1 transition-colors"
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBookTableForDish(dish.name)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#234386] hover:text-[#ed7328] px-2.5 py-1 rounded-full bg-[#fbf9f6] border border-[#d2b68c]/40 hover:border-[#ed7328] active:scale-95 transition-all"
                          >
                            <Calendar size={12} />
                            <span>Đặt bàn</span>
                          </button>
                        </div>
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
            <div className="relative aspect-video">
              <img
                src={selectedDishDetail.image}
                alt={selectedDishDetail.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedDishDetail(null)}
                aria-label="Đóng chi tiết món ăn"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386]">
                    {selectedDishDetail.name}
                  </h3>
                  {selectedDishDetail.servingSize && (
                    <span className="text-xs text-[#000000]/60">Khẩu phần: {selectedDishDetail.servingSize}</span>
                  )}
                </div>
                <span className="font-['Noto_Serif',serif] text-xl font-bold text-[#ed7328]">
                  {selectedDishDetail.price.toLocaleString('vi-VN')} đ
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#000000]/75 leading-relaxed font-normal">
                {selectedDishDetail.description}
              </p>

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

                {activeMode === 'delivery' || session ? (
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
            thuộc hình thức <strong>{cartContext.mode === 'dine-in' ? (cartContext.tableName ? `Bàn ${cartContext.tableName}` : 'Tại quán') : 'Giao tận nơi'}</strong>.
            <br />
            Bạn có muốn chuyển sang hình thức <strong>{pendingModeChange === 'delivery' ? 'Giao tận nơi' : 'Tại quán'}</strong> và làm mới giỏ hàng không?
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

    </div>
  );
};
