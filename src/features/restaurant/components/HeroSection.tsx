import type { FC } from 'react';
import { HeroFoodCarousel } from './HeroFoodCarousel';
import './HomeHero.css';
import { ArrowRight } from 'lucide-react';
import { BotanicalBranch, StarDustDots, HandDrawnArrow } from '@/shared/ui/BotanicalDecorations';

function AccentMarks({ className }: { className: string }) {
  return <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
    <path d="M20 13 17 3M12 17 5 10M9 24 2 23M28 12 30 5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="m6 33 6-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}

function SeedAccents({ className }: { className: string }) {
  return <svg viewBox="0 0 40 80" className={className} fill="currentColor" aria-hidden="true">
    <ellipse cx="24" cy="8" rx="4" ry="7" transform="rotate(-50 24 8)" />
    <ellipse cx="20" cy="27" rx="3.5" ry="7" transform="rotate(25 20 27)" opacity=".8" />
    <ellipse cx="8" cy="43" rx="3.5" ry="6" transform="rotate(45 8 43)" />
    <ellipse cx="31" cy="46" rx="3" ry="6" transform="rotate(25 31 46)" opacity=".75" />
    <ellipse cx="20" cy="63" rx="3.5" ry="7" transform="rotate(20 20 63)" />
  </svg>;
}

interface HeroSectionProps {
  onExploreMenu: () => void;
}

export const HeroSection: FC<HeroSectionProps> = ({ onExploreMenu }) => {
  return (
    <section id="home" className="home-hero relative pt-20 pb-12 sm:pt-24 sm:pb-16 md:pt-36 md:pb-24 overflow-hidden bg-[#fbf9f6]">
      
      <span aria-hidden="true" className="home-hero-botanical home-hero-corner-leaves" />
      {/* Top Left Botanical Branch (Image A exact motif) */}
      <div className="absolute -top-6 -left-6 w-24 h-24 sm:w-36 sm:h-36 md:w-52 md:h-52 opacity-35 sm:opacity-60 md:opacity-85 pointer-events-none z-0">
        <BotanicalBranch className="w-full h-full rotate-45" color="#3d5a45" />
      </div>

      {/* Bottom Left Soft Watercolor Wash (Image A detail) */}
      <div 
        aria-hidden="true" 
        className="absolute -bottom-16 -left-16 w-64 h-64 bg-[#d2b68c]/25 rounded-full blur-2xl pointer-events-none -z-0" 
      />

      <div className="home-hero-container max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
        <div className="home-hero-grid grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-10 lg:gap-8 items-center">
          
          {/* Left Column: Expressive Typography & CTAs (Exact Image A layout) */}
          <div className="home-hero-copy lg:col-span-7 flex flex-col items-start text-left">

            {/* Eyebrow: Be Vietnam Pro 12px / 600 uppercase letter-spacing: 0.18em */}
            <div className="home-hero-eyebrow flex items-center gap-2.5 sm:gap-3 mb-3 sm:mb-4">
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] sm:text-[12px] font-semibold tracking-[0.16em] sm:tracking-[0.18em] uppercase text-[#000000]/65">
                ẨM THỰC ĐƯƠNG ĐẠI
              </span>
              <span className="w-8 sm:w-12 h-[1.5px] bg-[#d2b68c]" />
            </div>

            {/* Main Headline: Noto Serif bold editorial serif with calibrated line-height preventing Vietnamese diacritic collisions */}
            <h1 className="home-hero-title font-['Noto_Serif',serif] text-[#234386] text-[30px] xs:text-[32px] sm:text-[50px] lg:text-[60px] xl:text-[66px] font-bold lg:font-extrabold leading-[1.26] sm:leading-[1.26] lg:leading-[1.26] tracking-[-0.025em] uppercase mb-3 sm:mb-4">
              MÓN VIỆT.<br />
              ĐẬM VỊ.<br />
              <span className="home-hero-title-final">ĐẦY CẢM HỨNG.</span>
            </h1>

            {/* Script Accent: Dancing Script 30px 600 line-height: 1.15 Burnt Orange #ed7328 */}
            <div className="home-hero-tagline font-['Dancing_Script',cursive] text-[20px] sm:text-2xl md:text-[30px] text-[#ed7328] font-semibold leading-[1.15] -rotate-1 mb-4 sm:mb-6">
              Một bữa ăn ngon là một ngày tươi đẹp hơn.
            </div>

            {/* Body: Be Vietnam Pro 16px 400 line-height: 1.7 max-width around 560px */}
            <p className="home-hero-description font-['Be_Vietnam_Pro',sans-serif] text-[13px] sm:text-[16px] text-[#000000]/75 font-normal leading-[1.65] sm:leading-[1.7] max-w-[560px] mb-4 sm:mb-8">
              Tại Tiger 345, chúng tôi gìn giữ hương vị Việt qua những nguyên liệu tươi sạch và cách chế biến sáng tạo<span className="sm:hidden">.</span><span className="hidden sm:inline">,</span>
              <span className="hidden sm:inline"> để mỗi bữa ăn là một trải nghiệm trọn vẹn, gần gũi mà đầy bất ngờ.</span>
            </p>

            <div className="hidden lg:flex w-full sm:w-auto items-center gap-3 sm:gap-4 group/cta">
              <button
                type="button"
                onClick={onExploreMenu}
                className="w-full sm:w-auto font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2.5 bg-[#234386] hover:bg-[#1a3468] text-white px-7 py-3.5 rounded-full font-semibold text-[14px] shadow-md hover:shadow-lg active:scale-[0.96] transition-all duration-200 group"
              >
                <span>Xem thực đơn</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <img src="/images/pointing-hand-cartoon.png" alt="" aria-hidden="true" className="relative -top-0.5 ml-1 h-14 w-[72px] shrink-0 object-contain pointer-events-none" />
            </div>

          </div>

          {/* Right Column: Hero Food Cutout Plate with Organic Blobs (Image A & C) */}
          <div className="home-hero-art lg:col-span-5 relative flex justify-center items-center py-2 sm:py-6 lg:py-0">
            
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
            <div className="hidden sm:block absolute top-0 lg:-top-12 left-10 w-32 h-32 pointer-events-none -z-10">
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
            <span aria-hidden="true" className="home-hero-fresh">Tươi ngon<br />mỗi ngày</span>
            <HeroFoodCarousel initialIndex={2} />
            <span aria-hidden="true" className="home-hero-botanical home-hero-single-leaf" />
            <span aria-hidden="true" className="home-hero-botanical home-hero-plate-sprig" />
            <SeedAccents className="home-hero-accent home-hero-fresh-accent" />

            {/* Vertical Right Label Strip (Be Vietnam Pro) */}
            <div className="hidden xl:flex flex-row gap-6 absolute -right-8 top-1/2 -translate-y-1/2 font-['Be_Vietnam_Pro',sans-serif] text-[10px] font-semibold tracking-[0.18em] text-[#000000]/45 uppercase whitespace-nowrap [writing-mode:vertical-rl] rotate-180 pointer-events-none">
              <span>NGUYÊN LIỆU TƯƠI SẠCH</span>
              <span>MÓN ĂN SÁNG TẠO</span>
              <span>TRẢI NGHIỆM ĐÁNG NHỚ</span>
            </div>

          </div>

            <div className="home-hero-explore lg:hidden flex w-full sm:w-auto items-center gap-3 sm:gap-4 group/cta">
              <AccentMarks className="home-hero-accent home-hero-explore-accent" />
              <span aria-hidden="true" className="home-hero-botanical home-hero-card-leaf" />
              <div className="home-hero-explore-copy">
                <span className="home-hero-explore-kicker">Khám phá</span>
                <h2>Thực đơn của chúng tôi</h2>
                <p>98 món Việt tươi ngon đang chờ bạn</p>
              </div>
              <svg className="home-hero-bowl" viewBox="0 0 80 65" fill="none" aria-hidden="true">
                <path d="M13 30Q40 15 67 30M13 30Q16 58 40 58Q64 58 67 30Q41 46 13 30Z" stroke="currentColor" strokeWidth="2" />
                <path d="M29 59H51M29 32Q20 26 34 22M42 33Q53 26 43 21M39 14L47 3M54 17L65 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M10 13L4 7M8 23L1 21M18 9L16 1" stroke="#ff7900" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <button
                type="button"
                onClick={onExploreMenu}
                className="w-auto font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2.5 bg-[#234386] hover:bg-[#1a3468] text-white px-6 py-3 rounded-full font-semibold text-[13px] shadow-md hover:shadow-lg active:scale-[0.96] transition-all duration-200 group"
              >
                <span>Xem thực đơn</span>
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>

              <img src="/images/pointing-hand-cartoon.png" alt="" aria-hidden="true" className="relative -top-0.5 ml-1 h-14 w-[72px] shrink-0 object-contain pointer-events-none" />
            </div>

        </div>
      </div>
    </section>
  );
};
