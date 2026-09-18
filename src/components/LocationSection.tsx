import type { FC } from 'react';
import { MapPin, Phone, Clock, Navigation, ExternalLink } from 'lucide-react';

export const LocationSection: FC = () => {
  return (
    <section id="location" className="py-12 md:py-24 bg-[#fbf9f6] relative scroll-mt-12 overflow-hidden border-t border-[#d2b68c]/30">
      
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          
          {/* Left Column: Address, Phone, Hours (Image C) */}
          <div className="lg:col-span-6 space-y-5 sm:space-y-6">
            
            {/* Eyebrow */}
            <div className="flex items-center gap-3">
              <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
                ĐỊA CHỈ & LIÊN HỆ
              </span>
              <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
            </div>

            {/* Headline (Image C exact text) */}
            <h2 className="font-['Noto_Serif',serif] text-2xl sm:text-3xl lg:text-[42px] font-bold text-[#234386] tracking-tight leading-tight">
              Chúng tôi luôn ở đây,<br />chờ bạn ghé thăm
            </h2>

            <p className="font-['Be_Vietnam_Pro',sans-serif] text-sm text-[#000000]/75 leading-relaxed font-normal max-w-md">
              Tọa lạc tại thị trấn Vĩnh An, huyện Vĩnh Cửu — sẵn sàng phục vụ những bữa ăn ngon lành 
              và những cuộc hẹn đáng nhớ nhất.
            </p>

            {/* Contact Details List (Image C format) */}
            <div className="space-y-4 pt-2 text-xs sm:text-sm text-[#000000]/80">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={15} />
                </div>
                <div>
                  <strong className="block text-[#000000]">17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai</strong>
                  <span className="text-xs text-[#000000]/60">(Có bãi đỗ ô tô và xe máy miễn phí)</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0">
                  <Phone size={15} />
                </div>
                <div>
                  <a href="tel:0902809929" className="font-semibold text-[#234386] hover:text-[#ed7328] transition-colors">
                    090 280 99 29
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#3d5a45]/15 text-[#3d5a45] flex items-center justify-center shrink-0">
                  <Clock size={15} />
                </div>
                <div>
                  <span>Mở cửa: <strong>10:00 – 22:30</strong> (Thứ 2 – Chủ Nhật)</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 sm:pt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              <a
                href="https://maps.google.com/?q=Tiger+345+Duong+So+1+Vinh+An+Vinh+Cuu+Dong+Nai"
                target="_blank"
                rel="noreferrer"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all"
              >
                <Navigation size={14} />
                <span>Chỉ đường Google Maps</span>
                <ExternalLink size={12} className="opacity-70" />
              </a>

              <a
                href="tel:0902809929"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white border border-[#d2b68c]/60 text-[#234386] hover:border-[#ed7328] hover:text-[#ed7328] text-xs font-semibold active:scale-95 transition-all"
              >
                <Phone size={14} />
                <span>Gọi ngay</span>
              </a>
            </div>

          </div>

          {/* Right Column: Architectural Storefront Illustration (Matching Image C!) */}
          <div className="lg:col-span-6 relative flex flex-col items-center">
            
            {/* Floating Handwritten Note (Image C) */}
            <div className="hidden sm:block self-end mr-4 mb-2 font-['Dancing_Script',cursive] text-xl sm:text-2xl text-[#ed7328] font-semibold leading-tight -rotate-3">
              Gặp nhau ở những điều tuyệt vời ♡
            </div>

            {/* Illustrated Storefront Sketch Card */}
            <div className="w-full bg-white rounded-[20px] sm:rounded-[28px] border border-[#d2b68c]/40 p-4 sm:p-8 shadow-sm relative overflow-hidden group">
              
              {/* Detailed Architectural Sketch of Tiger 345 Bistro Storefront */}
              <svg 
                viewBox="0 0 500 280" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="w-full h-auto text-[#000000]/75"
              >
                {/* Ground line */}
                <line x1="20" y1="260" x2="480" y2="260" stroke="#234386" strokeWidth="2" strokeLinecap="round" />

                {/* Building outline */}
                <rect x="70" y="70" width="360" height="190" stroke="#234386" strokeWidth="2" fill="#ffffff" />
                <path d="M50 70 L250 20 L450 70 Z" stroke="#234386" strokeWidth="2" fill="#fbf9f6" />

                {/* Canopy / Awning */}
                <path d="M55 70 Q 250 85, 445 70 L435 95 Q 250 110, 65 95 Z" fill="#234386" opacity="0.9" />
                <path d="M65 95 L65 105 Q 250 120, 435 105 L435 95" stroke="#ffc400" strokeWidth="1.5" />

                {/* Main Sign Board */}
                <rect x="175" y="115" width="150" height="32" rx="4" fill="#fbf9f6" stroke="#ed7328" strokeWidth="1.5" />
                <text x="250" y="136" textAnchor="middle" fill="#234386" fontSize="12" fontWeight="bold" fontFamily="'Noto Serif', serif">TIGER 345 BISTRO</text>

                {/* Large Glass Windows */}
                <rect x="90" y="160" width="100" height="90" rx="3" stroke="#234386" strokeWidth="1.5" fill="#fbf9f6" />
                <line x1="140" y1="160" x2="140" y2="250" stroke="#d2b68c" strokeWidth="1" />
                <line x1="90" y1="205" x2="190" y2="205" stroke="#d2b68c" strokeWidth="1" />

                {/* Double Entrance Glass Doors */}
                <rect x="215" y="155" width="70" height="105" rx="3" stroke="#234386" strokeWidth="2" fill="#ffffff" />
                <line x1="250" y1="155" x2="250" y2="260" stroke="#234386" strokeWidth="1.5" />
                <circle cx="243" cy="205" r="2" fill="#ed7328" />
                <circle cx="257" cy="205" r="2" fill="#ed7328" />

                {/* Right Window */}
                <rect x="310" y="160" width="100" height="90" rx="3" stroke="#234386" strokeWidth="1.5" fill="#fbf9f6" />
                <line x1="360" y1="160" x2="360" y2="250" stroke="#d2b68c" strokeWidth="1" />
                <line x1="310" y1="205" x2="410" y2="205" stroke="#d2b68c" strokeWidth="1" />

                {/* Decorative potted trees on sides */}
                <path d="M40 235 L55 235 L52 260 L43 260 Z" fill="#d2b68c" stroke="#234386" strokeWidth="1" />
                <circle cx="47" cy="225" r="14" fill="#3d5a45" opacity="0.85" />
                <circle cx="50" cy="215" r="10" fill="#3d5a45" opacity="0.75" />

                <path d="M445 235 L460 235 L457 260 L448 260 Z" fill="#d2b68c" stroke="#234386" strokeWidth="1" />
                <circle cx="452" cy="225" r="14" fill="#3d5a45" opacity="0.85" />
                <circle cx="449" cy="215" r="10" fill="#3d5a45" opacity="0.75" />

                {/* Lanterns */}
                <circle cx="205" cy="140" r="3" fill="#ffc400" />
                <circle cx="295" cy="140" r="3" fill="#ffc400" />
              </svg>

              <div className="mt-3 flex items-center justify-between text-[11px] text-[#000000]/60 pt-2 border-t border-[#d2b68c]/20">
                <span>Kiến trúc không gian mở hiện đại</span>
                <span className="font-semibold text-[#234386]">17 Đường Số 1, Vĩnh An, Đồng Nai</span>
              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
