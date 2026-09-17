import { useState } from 'react';
import type { FC, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Phone, 
  ArrowUp, 
  Check, 
  Send 
} from 'lucide-react';
import { BotanicalBranch } from './BotanicalDecorations';

export const Footer: FC = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribed, setIsSubscribed] = useState(false);

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail) return;
    setIsSubscribed(true);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="bg-[#234386] text-[#fbf9f6] pt-12 pb-8 sm:pt-16 sm:pb-10 relative overflow-hidden border-t-2 border-[#ffc400]">
      
      {/* Botanical watermark */}
      <div 
        aria-hidden="true" 
        className="hidden sm:block absolute top-0 right-0 w-80 h-80 opacity-15 pointer-events-none" 
      >
        <BotanicalBranch className="w-full h-full rotate-45" color="#ffffff" />
      </div>

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 relative z-10">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 sm:gap-10 pb-8 sm:pb-12 border-b border-white/15">
          
          {/* Brand Col */}
          <div className="lg:col-span-5 space-y-4">
            <Link to="/" className="flex items-center gap-3 inline-block group">
              <img
                src="/tiger.svg"
                alt="Logo Tiger 345"
                className="w-10 h-10 rounded-full object-contain shadow-xs group-hover:scale-105 transition-transform"
              />
              <div className="flex flex-col">
                <span className="font-['Fraunces',serif] font-bold text-2xl tracking-tight text-white leading-none">
                  Tiger 345<span className="text-[#ffc400]">.</span>
                </span>
                <span className="text-[9px] tracking-[0.2em] font-semibold uppercase text-[#ffc400] mt-1">
                  Bếp Ẩm Thực Đương Đại
                </span>
              </div>
            </Link>

            <p className="font-['Be_Vietnam_Pro',sans-serif] text-xs sm:text-sm text-[#fbf9f6]/75 max-w-sm leading-relaxed font-normal">
              Gìn giữ hương vị Việt qua nguồn nguyên liệu tươi sạch và cách chế biến sáng tạo, 
              để mỗi bữa ăn là một trải nghiệm trọn vẹn, gần gũi mà đầy cảm hứng.
            </p>

            <div className="font-['Dancing_Script',cursive] text-xl text-[#ffc400] font-semibold">
              Một bữa ăn ngon là một ngày tươi đẹp hơn.
            </div>
          </div>

          {/* Quick Nav */}
          <div className="lg:col-span-3 space-y-3">
            <h4 className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold text-[#ffc400] tracking-[0.16em] uppercase">
              Khám Phá
            </h4>
            <ul className="grid grid-cols-2 sm:grid-cols-1 gap-x-4 gap-y-2 text-xs sm:text-sm text-[#fbf9f6]/80 font-normal">
              <li>
                <Link to="/" className="hover:text-[#ffc400] transition-colors">
                  Trang chủ
                </Link>
              </li>
              <li>
                <Link to="/menu?mode=dine-in" className="hover:text-[#ffc400] transition-colors">
                  Thực đơn tại quán
                </Link>
              </li>
              <li>
                <Link to="/menu?mode=delivery" className="hover:text-[#ffc400] transition-colors">
                  Thực đơn giao tận nơi
                </Link>
              </li>
              <li>
                <Link to="/reservation" className="hover:text-[#ffc400] transition-colors">
                  Đặt bàn trực tuyến
                </Link>
              </li>
              <li>
                <Link to="/location" className="hover:text-[#ffc400] transition-colors">
                  Địa chỉ & Liên hệ
                </Link>
              </li>
            </ul>
          </div>

          {/* Newsletter — desktop only (mobile footer stays simple) */}
          <div className="hidden md:block lg:col-span-4 space-y-3">
            <h4 className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold text-[#ffc400] tracking-[0.16em] uppercase">
              Nhận Ưu Đãi Món Mới
            </h4>
            <p className="text-xs text-[#fbf9f6]/70 leading-relaxed">
              Đăng ký để nhận voucher ưu đãi 10% cho lần ghé thăm đầu tiên và thông báo các món theo mùa.
            </p>

            {isSubscribed ? (
              <div className="p-3 rounded-xl bg-white/10 border border-white/20 text-xs text-[#a2d3a6] flex items-center gap-2">
                <Check size={14} className="shrink-0" />
                <span>Cảm ơn bạn! Ưu đãi đã được gửi tới email của bạn.</span>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex items-center gap-2">
                <input
                  type="email"
                  required
                  placeholder="Nhập email của bạn..."
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="px-3.5 py-2.5 sm:py-2 rounded-full bg-white/10 border border-white/20 text-sm sm:text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[#ffc400] flex-grow"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 sm:py-2 rounded-full bg-[#ed7328] hover:bg-[#ffc400] hover:text-[#234386] text-white font-semibold text-xs active:scale-95 transition-all flex items-center gap-1 shrink-0"
                >
                  <span>Gửi</span>
                  <Send size={11} />
                </button>
              </form>
            )}

            <div className="pt-2 text-xs text-[#fbf9f6]/60 space-y-1">
              <div className="flex items-center gap-2">
                <Phone size={12} className="text-[#ffc400]" />
                <span>Hotline: 0908 123 456</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={12} className="text-[#ffc400]" />
                <span>48 Tràng Tiền, Quận Hoàn Kiếm, Hà Nội</span>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#fbf9f6]/50">
          <div>
            © 2026 Tiger 345 Contemporary Bistro. Bản quyền được bảo lưu.
          </div>

          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-white transition-colors">Điều khoản</Link>
            <Link to="/" className="hover:text-white transition-colors">Chính sách</Link>
            <button
              type="button"
              onClick={scrollToTop}
              className="inline-flex items-center gap-1 text-white/80 hover:text-white transition-colors py-1.5 px-3 rounded-full hover:bg-white/10"
            >
              <span>Lên đầu trang</span>
              <ArrowUp size={12} />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
};
