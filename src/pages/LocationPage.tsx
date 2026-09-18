import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Phone, 
  Clock, 
  Navigation, 
  ExternalLink, 
  Car, 
  Calendar,
  Mail,
  Compass
} from 'lucide-react';

export const LocationPage: FC = () => {
  return (
    <div className="pt-24 pb-20 md:pt-32 md:pb-28 bg-[#fbf9f6] min-h-screen">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
        
        {/* ========================================================================= */}
        {/* PAGE HEADER */}
        {/* ========================================================================= */}
        <div className="max-w-2xl mb-10 pb-6 border-b border-[#d2b68c]/30">
          <div className="flex items-center gap-2.5 mb-2.5">
            <span className="font-['Be_Vietnam_Pro',sans-serif] text-[11px] font-semibold tracking-[0.18em] uppercase text-[#ed7328]">
              ĐỊA CHỈ & LIÊN HỆ
            </span>
            <span className="w-8 h-[1.5px] bg-[#d2b68c]" />
          </div>
          <h1 className="font-['Noto_Serif',serif] text-3xl sm:text-4xl lg:text-[44px] font-bold text-[#234386] tracking-tight leading-tight">
            Chúng tôi luôn ở đây, chờ bạn ghé thăm
          </h1>
          <p className="font-['Be_Vietnam_Pro',sans-serif] text-[#000000]/70 text-sm sm:text-base mt-2.5 font-normal leading-relaxed">
            Tọa lạc tại thị trấn Vĩnh An, huyện Vĩnh Cửu, Tiger 345 sẵn sàng chào đón bạn với không gian ấm cúng và những bữa ăn ngon lành.
          </p>
        </div>

        {/* ========================================================================= */}
        {/* MAIN TWO-COLUMN CONTENT */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          
          {/* Left Column: Contact Essentials & Practical Guidance */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Primary Details Card */}
            <div className="p-6 sm:p-8 rounded-[28px] bg-white border border-[#d2b68c]/35 shadow-sm space-y-5">
              <h3 className="font-['Noto_Serif',serif] text-xl font-bold text-[#234386] pb-3 border-b border-[#d2b68c]/25">
                Thông tin nhà hàng
              </h3>

              {/* Address */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#ed7328]/15 text-[#ed7328] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    17, Đường Số 1, Tổ 6, Khu Phố 2, Thị Trấn Vĩnh An, Huyện Vĩnh Cửu, Đồng Nai
                  </strong>
                  <span className="text-xs text-[#000000]/65 mt-0.5 block">
                    Mặt tiền đường lớn, dễ tìm · Có chỗ đỗ xe
                  </span>
                </div>
              </div>

              {/* Opening Hours */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#3d5a45]/15 text-[#3d5a45] flex items-center justify-center shrink-0 mt-0.5">
                  <Clock size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    10:00 – 22:30 (Thứ 2 – Chủ Nhật)
                  </strong>
                  <span className="text-xs text-[#000000]/65 mt-0.5 block">
                    Bếp phục vụ liên tục buổi trưa và tối · Không nghỉ lễ
                  </span>
                </div>
              </div>

              {/* Phone & Hotline */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#234386]/10 text-[#234386] flex items-center justify-center shrink-0 mt-0.5">
                  <Phone size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    Điện thoại liên hệ & Đặt bàn
                  </strong>
                  <a href="tel:0902809929" className="text-base font-bold text-[#234386] hover:text-[#ed7328] transition-colors block mt-0.5">
                    090 280 99 29
                  </a>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-start gap-3.5">
                <div className="w-9 h-9 rounded-full bg-[#ffc400]/25 text-[#234386] flex items-center justify-center shrink-0 mt-0.5">
                  <Mail size={17} />
                </div>
                <div>
                  <strong className="block text-sm sm:text-base text-[#000000]">
                    Email dịch vụ khách hàng
                  </strong>
                  <a href="mailto:contact@tiger345.vn" className="text-xs sm:text-sm text-[#234386] hover:text-[#ed7328] transition-colors">
                    contact@tiger345.vn
                  </a>
                </div>
              </div>
            </div>

            {/* Parking & Directions Box */}
            <div className="p-6 rounded-[24px] bg-[#234386]/5 border border-[#234386]/15 space-y-3 text-xs sm:text-sm text-[#000000]/80">
              <div className="flex items-center gap-2 text-[#234386] font-bold">
                <Car size={18} />
                <span>Bãi đỗ xe ô tô & xe máy miễn phí</span>
              </div>
              <p className="leading-relaxed text-[#000000]/70">
                Nhà hàng có nhân viên hỗ trợ trông giữ xe máy miễn phí ngay mặt tiền và bãi đỗ xe ô tô liên kết cách nhà hàng 30m. Vui lòng hỏi nhân viên đón khách khi đến nơi để được hướng dẫn đỗ xe thuận tiện.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              <a
                href="https://maps.google.com/?q=Tiger+345+Duong+So+1+Vinh+An+Vinh+Cuu+Dong+Nai"
                target="_blank"
                rel="noreferrer"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-[#234386] hover:bg-[#1a3468] text-white text-xs sm:text-sm font-semibold shadow-xs active:scale-95 transition-all"
              >
                <Navigation size={15} />
                <span>Chỉ đường Google Maps</span>
                <ExternalLink size={13} className="opacity-70" />
              </a>

              <a
                href="tel:0902809929"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white border border-[#d2b68c]/60 text-[#234386] hover:border-[#ed7328] hover:text-[#ed7328] text-xs sm:text-sm font-semibold active:scale-95 transition-all"
              >
                <Phone size={15} />
                <span>Gọi ngay 090 280 99 29</span>
              </a>

              <Link
                to="/reservation"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white text-xs sm:text-sm font-semibold shadow-xs active:scale-95 transition-all"
              >
                <Calendar size={15} />
                <span>Đặt bàn trước</span>
              </Link>
            </div>

          </div>

          {/* Right Column: Architectural Storefront Card & Ambience Photo */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Illustrated Storefront Sketch Card */}
            <div className="w-full bg-white rounded-[28px] border border-[#d2b68c]/40 p-6 sm:p-8 shadow-sm relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Compass size={16} className="text-[#ed7328]" />
                  <span className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold uppercase tracking-wider text-[#234386]">
                    Kiến trúc Tiger 345 Vĩnh An
                  </span>
                </div>
                <span className="font-['Dancing_Script',cursive] text-lg text-[#ed7328] font-semibold">
                  Gặp nhau ở những điều tuyệt vời ♡
                </span>
              </div>

              {/* Detailed Architectural Sketch SVG */}
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
                <span>Không gian mở hiện đại & tinh tế</span>
                <span className="font-semibold text-[#234386]">17 Đường Số 1, Vĩnh An, Đồng Nai</span>
              </div>
            </div>

            {/* Photo Card */}
            <div className="relative rounded-[28px] overflow-hidden aspect-[16/9] shadow-md border border-[#d2b68c]/35">
              <img
                src="https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80"
                alt="Không gian đón tiếp tại nhà hàng Tiger 345"
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-6 right-6 text-white text-xs">
                <span className="font-semibold">Vị trí thuận tiện ngay trung tâm thị trấn Vĩnh An</span>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
