import { useState, useMemo, useRef } from 'react';
import type { FC } from 'react';
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
  ShieldCheck
} from 'lucide-react';
import { MENU_ITEMS, type MenuItem } from '../data/restaurantData';
import { BotanicalBranch, WavySectionDividerTop, WavySectionDividerBottom } from './BotanicalDecorations';

interface MenuSectionProps {
  onAddToCart: (item: MenuItem) => void;
  onBookTableForDish?: (dishName: string) => void;
  addedItemId?: string | null;
}

export const MenuSection: FC<MenuSectionProps> = ({
  onAddToCart,
  onBookTableForDish,
  addedItemId,
}) => {
  // Mode state: 'dine-in' | 'delivery'
  const [activeMode, setActiveMode] = useState<'dine-in' | 'delivery'>('dine-in');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [selectedDishDetail, setSelectedDishDetail] = useState<MenuItem | null>(null);

  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Categories list with icons (Image B)
  const categoriesList = [
    { id: 'all', name: 'Tất cả món', icon: '✦' },
    { id: 'signature', name: 'Món signature', icon: '🍴' },
    { id: 'mon-nuong', name: 'Món nướng', icon: '🥩' },
    { id: 'mon-chinh', name: 'Món chính', icon: '🍲' },
    { id: 'khai-vi', name: 'Món kèm', icon: '🍟' },
    { id: 'salad', name: 'Salad & Rau', icon: '🥗' },
    { id: 'do-uong', name: 'Đồ uống', icon: '🥤' },
    { id: 'trang-mieng', name: 'Tráng miệng', icon: '🍰' },
  ];

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      categoryScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Filtered dishes
  const filteredDishes = useMemo(() => {
    return MENU_ITEMS.filter((item) => {
      // Mode match
      const matchesMode = item.modes.includes(activeMode);
      if (!matchesMode) return false;

      // Category match
      if (selectedCategory === 'signature') {
        if (!item.isSignature) return false;
      } else if (selectedCategory === 'salad') {
        if (item.category !== 'khai-vi') return false;
      } else if (selectedCategory !== 'all') {
        if (item.category !== selectedCategory) return false;
      }

      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDesc = item.description.toLowerCase().includes(q);
        if (!matchesName && !matchesDesc) return false;
      }

      return true;
    });
  }, [activeMode, selectedCategory, searchQuery]);

  return (
    <section id="menu" className="relative scroll-mt-12 bg-[#fbf9f6]">
      
      {/* ========================================================================= */}
      {/* PART 1: WAVY DEEP INDIGO EXPERIENCE DUAL-CARD SHELL (From Image C!) */}
      {/* ========================================================================= */}
      <div className="relative pt-10">
        <WavySectionDividerTop fill="#234386" className="relative z-10" />

        <div className="bg-[#234386] text-white py-14 md:py-20 relative overflow-hidden -mt-1">
          {/* Subtle botanical line art watermark on left */}
          <div className="absolute -left-12 top-0 w-72 h-72 opacity-20 pointer-events-none">
            <BotanicalBranch className="w-full h-full rotate-12" color="#ffffff" />
          </div>

          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              
              {/* Left Column: Heading and Editorial Narrative (Image C) */}
              <div className="lg:col-span-4 space-y-4">
                <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ffc400]">
                  THỰC ĐƠN
                </span>
                <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-white">
                  Thưởng thức theo cách của bạn
                </h2>
                <p className="font-['Be_Vietnam_Pro',sans-serif] text-xs sm:text-sm text-white/85 leading-relaxed font-normal">
                  Cùng một chất lượng, hai trải nghiệm trọn vẹn. Dù là bữa ăn ấm cúng tại nhà hàng hay bữa ngon 
                  ngay tại nhà, TIGER luôn sẵn sàng phục vụ bạn.
                </p>
              </div>

              {/* Right Column: Two White Experience Cards (Image C) */}
              <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                
                {/* Card 1: Thực đơn tại quán */}
                <div 
                  onClick={() => {
                    setActiveMode('dine-in');
                    const el = document.getElementById('menu-browser');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`bg-white rounded-[24px] p-5 text-[#000000] shadow-lg flex flex-col justify-between border cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
                    activeMode === 'dine-in' ? 'ring-4 ring-[#ffc400] border-transparent' : 'border-[#d2b68c]/30'
                  }`}
                >
                  <div className="aspect-[16/10] rounded-[16px] overflow-hidden mb-4 bg-black/5 relative">
                    <img
                      src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80"
                      alt="Không gian thưởng thức tại quán TIGER"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    {activeMode === 'dine-in' && (
                      <span className="absolute top-2.5 right-2.5 bg-[#234386] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs">
                        Đang chọn
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center">
                        <Utensils size={13} />
                      </div>
                      <h3 className="font-['Noto_Serif',serif] text-base font-bold text-[#234386]">
                        Thực đơn tại quán
                      </h3>
                    </div>
                    <p className="text-xs text-[#000000]/65 mb-4 line-clamp-1">
                      Trọn vẹn hương vị trong không gian đầy cảm hứng
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full py-2.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold transition-all shadow-xs"
                  >
                    Xem thực đơn tại quán →
                  </button>
                </div>

                {/* Card 2: Thực đơn giao tận nơi */}
                <div 
                  onClick={() => {
                    setActiveMode('delivery');
                    const el = document.getElementById('menu-browser');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className={`bg-white rounded-[24px] p-5 text-[#000000] shadow-lg flex flex-col justify-between border cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
                    activeMode === 'delivery' ? 'ring-4 ring-[#ed7328] border-transparent' : 'border-[#d2b68c]/30'
                  }`}
                >
                  <div className="aspect-[16/10] rounded-[16px] overflow-hidden mb-4 bg-black/5 relative">
                    <img
                      src="https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=600&q=80"
                      alt="Hộp giao món giữ nhiệt TIGER"
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    {activeMode === 'delivery' && (
                      <span className="absolute top-2.5 right-2.5 bg-[#ed7328] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full shadow-xs">
                        Đang chọn
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center">
                        <Bike size={13} />
                      </div>
                      <h3 className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
                        Thực đơn giao tận nơi
                      </h3>
                    </div>
                    <p className="text-xs text-[#000000]/65 mb-4 line-clamp-1">
                      Món ngon nóng hổi, giao nhanh đến bạn
                    </p>
                  </div>
                  <button
                    type="button"
                    className="w-full py-2.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs font-semibold transition-all shadow-xs"
                  >
                    Xem thực đơn giao hàng →
                  </button>
                </div>

              </div>

            </div>
          </div>
        </div>

        <WavySectionDividerBottom fill="#234386" className="relative z-10 -mt-1" />
      </div>

      {/* ========================================================================= */}
      {/* PART 2: INTERACTIVE MENU BROWSER (Matching Image B!) */}
      {/* ========================================================================= */}
      <div id="menu-browser" className="pt-8 pb-24 scroll-mt-20">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          
          {/* Header of Browser Area */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328] block mb-2">
                THỰC ĐƠN
              </span>
              <h2 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl font-bold text-[#234386] tracking-tight">
                Khám phá món ngon của TIGER
              </h2>
              <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm mt-1.5 font-normal">
                Tinh hoa ẩm thực, phục vụ theo cách bạn thích.
              </p>
            </div>

            {/* Mode Switcher Buttons (Image B: Tại quán vs Giao tận nơi) */}
            <div className="flex items-center gap-2 p-1.5 rounded-full bg-white border border-[#d2b68c]/40 shadow-xs self-start md:self-end">
              <button
                type="button"
                onClick={() => setActiveMode('dine-in')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  activeMode === 'dine-in'
                    ? 'bg-[#234386] text-white shadow-xs'
                    : 'text-[#000000]/70 hover:text-[#234386]'
                }`}
              >
                <Utensils size={14} />
                <span>Tại quán</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveMode('delivery')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  activeMode === 'delivery'
                    ? 'bg-[#ed7328] text-white shadow-xs'
                    : 'text-[#000000]/70 hover:text-[#ed7328]'
                }`}
              >
                <Bike size={14} />
                <span>Giao tận nơi</span>
              </button>
            </div>
          </div>

          {/* Contextual Mode Highlighting Banner */}
          <div className="mb-8">
            {activeMode === 'dine-in' ? (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#234386]/10 via-[#6aa8dc]/10 to-white border border-[#234386]/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#234386] text-[#ffc400] flex items-center justify-center shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-[#234386] block sm:inline">Ưu đãi dùng bữa tại quán:</span>{' '}
                    <span className="text-[#000000]/75">
                      Tặng kèm món tráng miệng đặc sản của Bếp trưởng cho bàn đặt trước 17:00 các ngày trong tuần.
                    </span>
                  </div>
                </div>
                <a
                  href="#reservation"
                  className="hidden sm:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#234386] text-white text-xs font-semibold shrink-0 hover:bg-[#1a3468]"
                >
                  <Calendar size={13} />
                  <span>Đặt bàn ngay</span>
                </a>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-[#ed7328]/10 via-[#ffc400]/15 to-white border border-[#ed7328]/25 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#ed7328] text-white flex items-center justify-center shrink-0">
                    <Bike size={16} />
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-[#ed7328] block sm:inline">Chính sách giao hàng:</span>{' '}
                    <span className="text-[#000000]/75">
                      Freeship cho đơn hàng từ 300.000đ trong bán kính 5km. Đóng gói hộp giấy giữ nhiệt sinh thái chuẩn vị.
                    </span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#ed7328] bg-white px-3 py-1 rounded-full border border-[#ed7328]/30 shrink-0">
                  <ShieldCheck size={14} />
                  <span>Cam kết nóng sốt 30p</span>
                </div>
              </div>
            )}
          </div>

          {/* Category Chips Bar with Arrow Buttons (Image B exact layout) */}
          <div className="flex items-center justify-between gap-4 mb-8 pb-3 border-b border-[#d2b68c]/30">
            <div 
              ref={categoryScrollRef}
              className="flex items-center gap-2.5 overflow-x-auto scrollbar-none py-1 scroll-smooth"
            >
              {categoriesList.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                      isActive
                        ? 'bg-[#ed7328] text-white border-[#ed7328] shadow-xs'
                        : 'bg-white text-[#000000]/75 border-[#d2b68c]/35 hover:border-[#ed7328] hover:text-[#ed7328]'
                    }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Category horizontal scrolling controls */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0 pl-2">
              <button
                type="button"
                onClick={() => scrollCategories('left')}
                className="w-8 h-8 rounded-full bg-white border border-[#d2b68c]/40 text-[#234386] hover:bg-[#234386] hover:text-white flex items-center justify-center transition-colors"
                aria-label="Cuộn sang trái"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollCategories('right')}
                className="w-8 h-8 rounded-full bg-white border border-[#d2b68c]/40 text-[#234386] hover:bg-[#234386] hover:text-white flex items-center justify-center transition-colors"
                aria-label="Cuộn sang phải"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Quick Search bar */}
          <div className="mb-8 max-w-sm">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#000000]/40" />
              <input
                type="text"
                placeholder="Tìm món ngon theo tên hoặc nguyên liệu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-full bg-white border border-[#d2b68c]/35 text-xs text-[#000000] focus:outline-none focus:border-[#234386]"
              />
            </div>
          </div>

          {/* Menu Cards Grid (Pure White Cards with rounded corners from Image B) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredDishes.map((dish) => {
              const isJustAdded = addedItemId === dish.id;
              const isFav = !!favorites[dish.id];

              return (
                <div
                  key={dish.id}
                  className="group flex flex-col bg-white rounded-[22px] border border-[#d2b68c]/30 p-3 shadow-xs hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                >
                  {/* Dish Image Container */}
                  <div className="relative aspect-[4/3] rounded-[16px] overflow-hidden bg-[#234386]/5">
                    <img
                      src={dish.image}
                      alt={dish.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />

                    {/* Badge: Đặc biệt / Signature */}
                    <div className="absolute top-2.5 left-2.5">
                      <span className="inline-block bg-[#ed7328] text-white text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                        {dish.isSignature ? '★ Signature' : 'Đặc biệt'}
                      </span>
                    </div>

                    {/* Favorite Heart Icon (Image B) */}
                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(dish.id, e)}
                      className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white/80 backdrop-blur-xs text-[#000000]/60 hover:text-red-500 flex items-center justify-center transition-colors shadow-2xs"
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
                      <h3 className="font-['Noto_Serif',serif] text-base font-bold text-[#000000] group-hover:text-[#234386] transition-colors line-clamp-1 mb-1">
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
                          onClick={() => onAddToCart(dish)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
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
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedDishDetail(dish)}
                            className="text-xs font-semibold text-[#000000]/60 hover:text-[#234386] px-2 py-1"
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => onBookTableForDish && onBookTableForDish(dish.name)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#234386] hover:text-[#ed7328] px-2.5 py-1 rounded-full bg-[#fbf9f6] border border-[#d2b68c]/40 hover:border-[#ed7328]"
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

        </div>
      </div>

      {/* Modal Detail for Dish */}
      {selectedDishDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[28px] max-w-md w-full overflow-hidden shadow-2xl border border-[#d2b68c]/40 animate-in fade-in zoom-in-95 duration-200">
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
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386]">
                  {selectedDishDetail.name}
                </h3>
                <span className="font-['Noto_Serif',serif] text-lg font-bold text-[#ed7328]">
                  {selectedDishDetail.price.toLocaleString('vi-VN')} đ
                </span>
              </div>
              <p className="text-xs text-[#000000]/70 leading-relaxed">
                {selectedDishDetail.description}
              </p>

              {selectedDishDetail.pairingNote && (
                <div className="p-2.5 rounded-xl bg-[#ffc400]/15 text-xs text-[#234386] flex items-center gap-2">
                  <Wine size={14} className="text-[#ed7328] shrink-0" />
                  <span className="italic">{selectedDishDetail.pairingNote}</span>
                </div>
              )}

              <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDishDetail(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#000000]/60"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const dish = selectedDishDetail;
                    setSelectedDishDetail(null);
                    if (onBookTableForDish) onBookTableForDish(dish.name);
                  }}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs hover:bg-[#1a3468]"
                >
                  <Calendar size={13} />
                  <span>Đặt bàn thưởng thức món này</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
