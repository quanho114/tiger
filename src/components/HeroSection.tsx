import type { FC } from 'react';
import { ArrowRight, Play } from 'lucide-react';
import { BotanicalBranch, StarDustDots, HandDrawnArrow } from './BotanicalDecorations';

interface HeroSectionProps {
  onExploreMenu: () => void;
  onBookTable: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({ onExploreMenu, onBookTable }) => {
  return (
    <section id="home" className="relative pt-20 pb-12 sm:pt-24 sm:pb-16 md:pt-36 md:pb-24 overflow-hidden bg-[#fbf9f6]">
      
      {/* Top Left Botanical Branch (Image A exact motif) */}
      <div className="absolute -top-6 -left-6 w-24 h-24 sm:w-36 sm:h-36 md:w-52 md:h-52 opacity-35 sm:opacity-60 md:opacity-85 pointer-events-none z-0">
        <BotanicalBranch className="w-full h-full rotate-45" color="#3d5a45" />
      </div>

      {/* Bottom Left Soft Watercolor Wash (Image A detail) */}
      <div 
        aria-hidden="true" 
        className="absolute -bottom-16 -left-16 w-64 h-64 bg-[#d2b68c]/25 rounded-full blur-2xl pointer-events-none -z-0" 
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* Left Column: Expressive Typography & CTAs (Exact Image A layout) */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            
            {/* Eyebrow: Be Vietnam Pro 12px / 600 uppercase letter-spacing: 0.18em */}
            <div className="flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] sm:text-[12px] font-semibold tracking-[0.16em] sm:tracking-[0.18em] uppercase text-[#000000]/65">
                ẨM THỰC ĐƯƠNG ĐẠI
              </span>
              <span className="w-8 sm:w-12 h-[1.5px] bg-[#d2b68c]" />
            </div>

            {/* Main Headline: Noto Serif 72px desktop 700–800 line-height: 0.96 letter-spacing: -0.025em Deep Indigo #234386 */}
            <h1 className="font-['Noto_Serif',serif] text-[#234386] text-[42px] leading-[0.98] sm:text-5xl lg:text-[72px] font-bold lg:font-extrabold sm:leading-[1.0] lg:leading-[0.96] tracking-[-0.025em] uppercase mb-3 sm:mb-4">
              MÓN VIỆT.<br />
              ĐẬM VỊ.<br />
              ĐẦY CẢM HỨNG.
            </h1>

            {/* Script Accent: Dancing Script 30px 600 line-height: 1.15 Burnt Orange #ed7328 */}
            <div className="font-['Dancing_Script',cursive] text-[22px] sm:text-2xl md:text-[30px] text-[#ed7328] font-semibold leading-[1.15] -rotate-1 mb-4 sm:mb-6">
              Một bữa ăn ngon là một ngày tươi đẹp hơn.
            </div>

            {/* Body: Be Vietnam Pro 16px 400 line-height: 1.7 max-width around 560px */}
            <p className="font-['Be_Vietnam_Pro',sans-serif] text-[15px] sm:text-[16px] text-[#000000]/75 font-normal leading-[1.65] sm:leading-[1.7] max-w-[560px] mb-6 sm:mb-8">
              Tại Tiger 345, chúng tôi gìn giữ hương vị Việt qua những nguyên liệu tươi sạch và cách chế biến sáng tạo,
              <span className="hidden sm:inline"> để mỗi bữa ăn là một trải nghiệm trọn vẹn, gần gũi mà đầy bất ngờ.</span>
            </p>

            {/* Dual CTAs: Primary button Be Vietnam Pro 14px 600 */}
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={onExploreMenu}
                className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2.5 bg-[#234386] hover:bg-[#1a3468] text-white px-7 py-3.5 rounded-full font-semibold text-[14px] shadow-md hover:shadow-lg active:scale-95 transition-all duration-200 group"
              >
                <span>Xem thực đơn</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                type="button"
                onClick={onBookTable}
                className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2.5 text-[#000000] hover:text-[#ed7328] text-[14px] font-semibold py-2 sm:py-0 transition-colors group"
              >
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#ffc400]/25 border border-[#ffc400] text-[#ed7328] flex items-center justify-center group-hover:scale-105 group-hover:bg-[#ffc400] group-hover:text-[#234386] transition-all shrink-0">
                  <Play size={11} fill="currentColor" className="ml-0.5" />
                </div>
                <span className="border-b border-transparent group-hover:border-[#ed7328] pb-0.5">
                  Đặt bàn ngay
                </span>
              </button>
            </div>

          </div>

          {/* Right Column: Hero Food Cutout Plate with Organic Blobs (Image A & C) */}
          <div className="lg:col-span-6 relative flex justify-center items-center py-4 sm:py-6 lg:py-0">
            
            {/* Background Organic Paint Blobs (Sky Blue + Honey Gold) */}
            <div 
              aria-hidden="true"
              className="absolute -left-4 sm:-left-6 top-4 sm:top-8 w-[240px] xs:w-[280px] sm:w-[380px] h-[280px] sm:h-[430px] bg-[#6aa8dc]/25 sm:bg-[#6aa8dc]/30 -z-10"
              style={{
                borderRadius: '65% 35% 58% 42% / 45% 62% 38% 55%'
              }}
            />
            
            <div 
              aria-hidden="true"
              className="absolute -right-2 sm:-right-4 top-1 sm:top-2 w-[220px] xs:w-[260px] sm:w-[360px] h-[260px] sm:h-[410px] bg-[#ffc400]/30 sm:bg-[#ffc400]/35 -z-10"
              style={{
                borderRadius: '42% 58% 35% 65% / 55% 40% 60% 45%'
              }}
            />

            {/* Botanical Branches Sprouting From Plate — desktop only (reduce mobile noise) */}
            <div className="hidden sm:block absolute -top-12 left-10 w-32 h-32 pointer-events-none -z-10">
              <BotanicalBranch className="w-full h-full -rotate-15" color="#3d5a45" />
            </div>
            
            <div className="hidden sm:block absolute -bottom-10 right-8 w-36 h-36 pointer-events-none -z-10">
              <BotanicalBranch className="w-full h-full rotate-70" color="#3d5a45" />
            </div>

            {/* StarDust Golden Dots */}
            <StarDustDots className="absolute top-4 right-16 w-16 h-16 pointer-events-none -z-10" />
            <StarDustDots className="hidden sm:block absolute bottom-8 left-6 w-14 h-14 pointer-events-none -z-10" />

            {/* Floating Handwritten Notes with Curved Directional Arrows (Dancing Script 500-600) */}
            <div className="hidden sm:flex absolute -top-3 right-4 sm:right-10 z-20 flex-col items-end pointer-events-none">
              <span className="font-['Dancing_Script',cursive] text-xl sm:text-2xl text-[#ed7328] font-semibold leading-tight rotate-3 drop-shadow-xs">
                Hương vị<br />kết nối con người
              </span>
              <HandDrawnArrow className="w-9 h-7 mr-4 mt-0.5" color="#ed7328" />
            </div>

            <div className="hidden sm:flex absolute -bottom-5 left-4 sm:left-10 z-20 flex-col items-start pointer-events-none">
              <HandDrawnArrow className="w-8 h-6 ml-3 mb-0.5 -rotate-90" color="#3d5a45" flip />
              <span className="font-['Dancing_Script',cursive] text-xl sm:text-2xl text-[#3d5a45] font-semibold leading-tight -rotate-3 drop-shadow-xs">
                Việt Nam<br />thật ngon!
              </span>
            </div>

            {/* Main Round Food Plate Cutout (Image A central visual) */}
            <div className="relative w-[260px] xs:w-[300px] sm:w-[380px] md:w-[490px] aspect-square rounded-full overflow-hidden shadow-2xl border-[5px] sm:border-[6px] border-[#fbf9f6] bg-[#234386]/5 group">
              <img
                src="https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1000&q=85"
                alt="Sườn nướng mật ong và ẩm thực tinh tế tại Tiger 345"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                loading="eager"
              />
            </div>

            {/* Vertical Right Label Strip (Be Vietnam Pro) */}
            <div className="hidden xl:flex flex-col gap-10 absolute -right-12 top-1/2 -translate-y-1/2 font-['Be_Vietnam_Pro',sans-serif] text-[10px] font-semibold tracking-[0.18em] text-[#000000]/45 uppercase [writing-mode:vertical-rl] rotate-180">
              <span>NGUYÊN LIỆU TƯƠI SẠCH</span>
              <span>MÓN ĂN SÁNG TẠO</span>
              <span>TRẢI NGHIỆM ĐÁNG NHỚ</span>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
