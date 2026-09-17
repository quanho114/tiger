import { useState } from 'react';
import type { FC } from 'react';
import { ArrowRight, Heart, Plus, Check } from 'lucide-react';
import { FEATURED_DISHES, type MenuItem } from '../data/restaurantData';
import { HandDrawnArrow } from './BotanicalDecorations';

interface FeaturedDishesSectionProps {
  onAddToCart: (item: MenuItem) => void;
  onNavigateToMenu: () => void;
  addedItemId?: string | null;
}

export const FeaturedDishesSection: FC<FeaturedDishesSectionProps> = ({
  onAddToCart,
  onNavigateToMenu,
  addedItemId,
}) => {
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section className="py-12 md:py-24 bg-[#fbf9f6] relative overflow-hidden">
      
      {/* Background Soft Blob Accent */}
      <div 
        aria-hidden="true" 
        className="absolute -top-20 right-[-10%] w-[500px] h-[500px] bg-[#warm-sand]/15 rounded-full blur-3xl pointer-events-none" 
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* Section Header (Matching Image A & C) */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-6 mb-8 md:mb-12">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[12px] font-semibold tracking-[0.18em] uppercase text-[#000000]/60">
                MÓN NGON NỔI BẬT
              </span>
              <span className="w-10 h-[1.5px] bg-[#d2b68c]" />
            </div>
            <h2 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl lg:text-[44px] font-bold text-[#234386] tracking-tight leading-tight">
              Tinh hoa ẩm thực Việt trong từng món ăn
            </h2>
            <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2.5 font-normal leading-relaxed">
              Những món ăn được yêu thích nhất tại Tiger 345 – sự hòa quyện giữa hương vị truyền thống và cảm hứng đương đại.
            </p>
          </div>

          <button
            type="button"
            onClick={onNavigateToMenu}
            className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center gap-2 text-[#234386] hover:text-[#ed7328] font-semibold text-[13px] tracking-wide uppercase transition-colors group self-start md:self-end pb-1 border-b border-[#234386]/30 hover:border-[#ed7328]"
          >
            <span>Xem tất cả</span>
            <ArrowRight size={15} className="group-hover:translate-x-1.5 transition-transform" />
          </button>
        </div>

        {/* Floating Handwritten Notes with HandDrawn Arrows (Dancing Script 500-600) */}
        <div className="hidden lg:grid grid-cols-4 gap-6 mb-3 px-4 text-center pointer-events-none">
          <div className="flex flex-col items-center">
            <span className="font-['Dancing_Script',cursive] text-xl text-[#ed7328] font-semibold -rotate-2">
              Đậm đà bản sắc Việt
            </span>
            <HandDrawnArrow className="w-8 h-5" color="#ed7328" />
          </div>
          <div className="flex flex-col items-center">
            <span className="font-['Dancing_Script',cursive] text-xl text-[#234386] font-semibold rotate-1">
              Tinh tế mỗi chi tiết
            </span>
            <HandDrawnArrow className="w-8 h-5" color="#234386" />
          </div>
          <div className="flex flex-col items-center">
            <span className="font-['Dancing_Script',cursive] text-xl text-[#3d5a45] font-semibold -rotate-1">
              Tươi ngon tự nhiên
            </span>
            <HandDrawnArrow className="w-8 h-5" color="#3d5a45" />
          </div>
          <div className="flex flex-col items-center">
            <span className="font-['Dancing_Script',cursive] text-xl text-[#ed7328] font-semibold rotate-2">
              Hương vị khó quên
            </span>
            <HandDrawnArrow className="w-8 h-5" color="#ed7328" />
          </div>
        </div>

        {/* Featured Dish Cards Grid (Matching Image B & C) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {FEATURED_DISHES.map((dish) => {
            const isJustAdded = addedItemId === dish.id;
            const isFav = !!favorites[dish.id];

            return (
              <div
                key={dish.id}
                className="group flex flex-col bg-[#ffffff] rounded-[20px] sm:rounded-[24px] border border-[#d2b68c]/35 p-3 sm:p-3.5 shadow-xs hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                {/* Image Container with Soft Rounded Frame */}
                <div className="relative aspect-[4/3] rounded-[18px] overflow-hidden bg-[#234386]/5">
                  <img
                    src={dish.image}
                    alt={dish.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  
                  {/* Badge: Đặc biệt / Signature (Orange pill from Image B/C) */}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="font-['Be_Vietnam_Pro',sans-serif] inline-block bg-[#ed7328] text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-xs">
                      {dish.isSignature ? '★ Món Signature' : 'Đặc biệt'}
                    </span>
                  </div>

                  {/* Favorite Heart Button (Top right from Image B) */}
                  <button
                    type="button"
                    onClick={(e) => toggleFavorite(dish.id, e)}
                    className="absolute top-2.5 right-2.5 w-9 h-9 sm:w-8 sm:h-8 rounded-full bg-white/85 backdrop-blur-xs text-[#000000]/60 hover:text-red-500 flex items-center justify-center transition-colors shadow-2xs active:scale-95"
                    aria-label="Yêu thích món ăn"
                  >
                    <Heart
                      size={15}
                      className={isFav ? 'fill-red-500 text-red-500' : ''}
                    />
                  </button>
                </div>

                {/* Content */}
                <div className="p-3 pt-4 flex flex-col flex-grow justify-between">
                  <div>
                    <h3 className="font-['Noto_Serif',serif] text-base sm:text-lg font-bold text-[#000000] group-hover:text-[#234386] transition-colors line-clamp-1 mb-1.5">
                      {dish.name}
                    </h3>
                    <p className="font-['Be_Vietnam_Pro',sans-serif] text-[13px] text-[#000000]/70 line-clamp-2 leading-relaxed mb-4">
                      {dish.description}
                    </p>
                  </div>

                  {/* Price & Action Button */}
                  <div className="pt-3 border-t border-[#d2b68c]/25 flex items-center justify-between mt-auto">
                    <span className="font-['Noto_Serif',serif] text-base font-bold text-[#ed7328]">
                      {dish.price.toLocaleString('vi-VN')} đ
                    </span>

                    <button
                      type="button"
                      onClick={() => onAddToCart(dish)}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 ${
                        isJustAdded
                          ? 'bg-[#3d5a45] text-white'
                          : 'bg-[#fbf9f6] border border-[#d2b68c]/50 text-[#234386] hover:bg-[#234386] hover:text-white group-hover:border-[#234386]'
                      }`}
                      title="Thêm vào giỏ giao tận nơi"
                    >
                      {isJustAdded ? (
                        <Check size={14} className="stroke-[3]" />
                      ) : (
                        <Plus size={14} className="stroke-[2.5]" />
                      )}
                    </button>
                  </div>

                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
