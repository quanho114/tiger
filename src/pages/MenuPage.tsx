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
  ShoppingBag
} from 'lucide-react';
import { MENU_ITEMS, CATEGORIES, type MenuItem } from '../data/restaurantData';
import { useCart } from '../store/cart';

export const MenuPage: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { add, addedId, setCartOpen } = useCart();

  // Mode from URL query: ?mode=dine-in or ?mode=delivery
  const modeParam = searchParams.get('mode');
  const activeMode: 'dine-in' | 'delivery' = modeParam === 'delivery' ? 'delivery' : 'dine-in';

  const setActiveMode = (mode: 'dine-in' | 'delivery') => {
    setSearchParams(mode === 'delivery' ? { mode: 'delivery' } : {}, { replace: true });
  };

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [selectedDishDetail, setSelectedDishDetail] = useState<MenuItem | null>(null);

  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return MENU_ITEMS.filter((dish) => {
      // Mode filtering
      if (!dish.modes.includes(activeMode)) {
        return false;
      }
      // Category filtering
      if (selectedCategory !== 'all' && dish.category !== selectedCategory) {
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
  }, [activeMode, selectedCategory, searchQuery]);

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

          {/* Mode Switcher Buttons — desktop (mobile uses the sticky copy below) */}
          <div className="hidden md:flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-full bg-white border border-[#d2b68c]/40 shadow-xs self-start md:self-end w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveMode('dine-in')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                activeMode === 'dine-in'
                  ? 'bg-[#234386] text-white shadow-xs'
                  : 'text-[#000000]/70 hover:text-[#234386]'
              }`}
            >
              <Utensils size={15} />
              <span>Tại quán</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('delivery')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 active:scale-95 ${
                activeMode === 'delivery'
                  ? 'bg-[#ed7328] text-white shadow-xs'
                  : 'text-[#000000]/70 hover:text-[#ed7328]'
              }`}
            >
              <Bike size={15} />
              <span>Giao tận nơi</span>
            </button>
          </div>
        </div>

        {/* Mobile-only sticky mode switch — direct child of the tall container so it can stick */}
        <div className="md:hidden sticky top-[58px] z-30 -mx-4 px-4 py-2 bg-[#fbf9f6]/95 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 p-1 rounded-full bg-white border border-[#d2b68c]/40 shadow-xs w-full">
            <button
              type="button"
              onClick={() => setActiveMode('dine-in')}
              aria-pressed={activeMode === 'dine-in'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 ${
                activeMode === 'dine-in'
                  ? 'bg-[#234386] text-white shadow-xs'
                  : 'text-[#000000]/70'
              }`}
            >
              <Utensils size={15} />
              <span>Tại quán</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('delivery')}
              aria-pressed={activeMode === 'delivery'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 active:scale-95 ${
                activeMode === 'delivery'
                  ? 'bg-[#ed7328] text-white shadow-xs'
                  : 'text-[#000000]/70'
              }`}
            >
              <Bike size={15} />
              <span>Giao tận nơi</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* CONTEXTUAL MODE HIGHLIGHT BANNER */}
        {/* ========================================================================= */}
        <div className="mb-8">
          {activeMode === 'dine-in' ? (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-[#234386]/10 via-[#6aa8dc]/10 to-white border border-[#234386]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#234386] text-[#ffc400] flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </div>
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-[#234386] block sm:inline">Ưu đãi dùng bữa tại quán:</span>{' '}
                  <span className="text-[#000000]/75">
                    Tặng kèm món tráng miệng đặc sản của Bếp trưởng cho bàn đặt trước 17:00 các ngày trong tuần.
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
              {CATEGORIES.map((cat) => {
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
        {filteredDishes.length === 0 ? (
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

              return (
                <div
                  key={dish.id}
                  className="group flex flex-col bg-white rounded-[22px] border border-[#d2b68c]/30 p-3.5 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Dish Image */}
                  <div 
                    onClick={() => setSelectedDishDetail(dish)}
                    className="relative aspect-[4/3] rounded-[16px] overflow-hidden bg-[#234386]/5 cursor-pointer"
                  >
                    <img
                      src={dish.image}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    {/* Badge: Đặc biệt / Signature */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                        {dish.isSignature ? '★ Signature' : 'Bếp trưởng chọn'}
                      </span>
                    </div>

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
                          onClick={() => add(dish)}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                            isJustAdded
                              ? 'bg-[#3d5a45] text-white'
                              : 'bg-[#234386] hover:bg-[#ed7328] text-white shadow-2xs'
                          }`}
                        >
                          {isJustAdded ? (
                            <>
                              <Check size={13} className="stroke-[3]" />
                              <span>Đã thêm</span>
                            </>
                          ) : (
                            <>
                              <Plus size={13} />
                              <span>Đặt giao</span>
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
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ========================================================================= */}
      {/* DISH DETAIL MODAL */}
      {/* ========================================================================= */}
      {selectedDishDetail && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedDishDetail(null)}
        >
          <div 
            className="bg-white rounded-[24px] sm:rounded-[28px] max-w-lg w-full overflow-hidden shadow-2xl border border-[#d2b68c]/40 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative aspect-video">
              <img
                src={selectedDishDetail.image}
                alt={selectedDishDetail.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setSelectedDishDetail(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors text-xs"
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
                  className="px-4 py-2.5 text-xs font-semibold text-[#000000]/60 hover:text-[#000000] text-center"
                >
                  Đóng
                </button>

                {activeMode === 'delivery' ? (
                  <button
                    type="button"
                    onClick={() => {
                      add(selectedDishDetail);
                      setSelectedDishDetail(null);
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
                  >
                    <Plus size={14} />
                    <span>Thêm vào giỏ giao hàng</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const dish = selectedDishDetail;
                      setSelectedDishDetail(null);
                      handleBookTableForDish(dish.name);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-6 py-2.5 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs hover:bg-[#1a3468] active:scale-95 transition-all"
                  >
                    <Calendar size={14} />
                    <span>Đặt bàn thưởng thức món này</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
