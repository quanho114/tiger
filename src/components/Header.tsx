import { useState, useEffect } from 'react';
import type { FC } from 'react';
import { UtensilsCrossed, Calendar, ShoppingBag, Menu, X, Phone, Clock, MapPin, Search } from 'lucide-react';
import { BotanicalSprig } from './BotanicalDecorations';

interface HeaderProps {
  cartCount: number;
  onOpenCart: () => void;
  activeSection: string;
}

export const Header: FC<HeaderProps> = ({ cartCount, onOpenCart, activeSection }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Trang chủ', href: '#home', id: 'home' },
    { name: 'Thực đơn', href: '#menu', id: 'menu' },
    { name: 'Đặt bàn', href: '#reservation', id: 'reservation' },
    { name: 'Địa chỉ', href: '#location', id: 'location' },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled
            ? 'bg-[#fbf9f6]/95 backdrop-blur-md shadow-xs py-3 border-b border-[#d2b68c]/25'
            : 'bg-transparent py-4 md:py-6'
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between">
            
            {/* Brand Logo (Matching Image A, B, C) */}
            <a
              href="#home"
              className="flex items-center gap-3 group focus:outline-none"
            >
              <div className="w-10 h-10 rounded-full bg-[#234386] flex items-center justify-center text-[#ffc400] shadow-sm group-hover:scale-105 transition-transform duration-200">
                <UtensilsCrossed size={19} className="stroke-[2.2]" />
              </div>
              <div className="flex flex-col">
                <span className="font-['Fraunces',serif] font-bold text-xl sm:text-2xl tracking-tight text-[#234386] leading-none">
                  TIGER<span className="text-[#ed7328]">.</span>
                </span>
                <span className="text-[9px] sm:text-[10px] tracking-[0.22em] font-semibold uppercase text-[#ed7328] mt-0.5">
                  Ẩm Thực Đương Đại
                </span>
              </div>
            </a>

            {/* Desktop Navigation Links - Be Vietnam Pro 14px / 600 */}
            <nav className="hidden md:flex items-center gap-8 lg:gap-10">
              {navLinks.map((link) => {
                const isActive = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={link.href}
                    className={`relative py-1 font-['Be_Vietnam_Pro',sans-serif] text-[14px] font-semibold transition-colors duration-200 ${
                      isActive
                        ? 'text-[#234386]'
                        : 'text-[#000000]/75 hover:text-[#ed7328]'
                    }`}
                  >
                    {link.name}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#234386] rounded-full animate-in fade-in duration-200" />
                    )}
                  </a>
                );
              })}
            </nav>

            {/* Right Action Controls (Matching Image A & B) */}
            <div className="flex items-center gap-3 sm:gap-4">
              
              {/* Optional Search / Discovery Icon */}
              <a
                href="#menu"
                className="hidden lg:flex items-center justify-center p-2 text-[#234386]/80 hover:text-[#234386] hover:bg-black/5 rounded-full transition-colors"
                title="Tìm món ăn"
                aria-label="Tìm kiếm món ăn trong thực đơn"
              >
                <Search size={18} />
              </a>

              {/* Delivery Cart Trigger */}
              <button
                type="button"
                onClick={onOpenCart}
                className="relative p-2.5 rounded-full bg-white border border-[#d2b68c]/40 text-[#234386] hover:border-[#ed7328] transition-all shadow-2xs group"
                aria-label="Xem giỏ hàng giao tận nơi"
              >
                <ShoppingBag size={18} className="group-hover:scale-105 transition-transform" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#ed7328] text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                    {cartCount}
                  </span>
                )}
              </button>

              {/* Primary Booking Button - Be Vietnam Pro 14px / 600 (Image A) */}
              <a
                href="#reservation"
                className="font-['Be_Vietnam_Pro',sans-serif] inline-flex items-center gap-2 bg-[#234386] hover:bg-[#1a3468] text-[#ffffff] px-5 sm:px-6 py-2.5 rounded-full text-[14px] font-semibold shadow-xs hover:shadow-sm transition-all duration-200 hover:-translate-y-0.5"
              >
                <Calendar size={15} />
                <span>Đặt bàn ngay</span>
              </a>

              {/* Top Right Corner Handwritten Accent (Dancing Script 500-600) */}
              <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-[#d2b68c]/35">
                <BotanicalSprig className="w-5 h-5 -rotate-12" color="#4a6741" />
                <span className="font-['Dancing_Script',cursive] text-[18px] text-[#4a6741] font-semibold tracking-tight whitespace-nowrap">
                  Good Food, Brighter Days
                </span>
              </div>

              {/* Mobile Menu Hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-full text-[#234386] md:hidden hover:bg-black/5"
                aria-label="Mở menu"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>

            </div>

          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-[300px] bg-[#fbf9f6] h-full p-6 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-[#d2b68c]/30">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#234386] flex items-center justify-center text-[#ffc400]">
                    <UtensilsCrossed size={16} />
                  </div>
                  <span className="font-['Fraunces',serif] font-bold text-xl text-[#234386]">
                    TIGER<span className="text-[#ed7328]">.</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-full text-[#000000]/60"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile nav links */}
              <nav className="flex flex-col gap-2 mt-6">
                {navLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                      activeSection === link.id
                        ? 'bg-[#234386] text-white'
                        : 'text-[#000000]/80 hover:bg-[#d2b68c]/20'
                    }`}
                  >
                    {link.name}
                  </a>
                ))}
              </nav>

              <div className="mt-6 pt-6 border-t border-[#d2b68c]/30 flex flex-col gap-3">
                <a
                  href="#reservation"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 bg-[#234386] text-white py-3 rounded-full font-semibold text-xs shadow-xs"
                >
                  <Calendar size={16} />
                  <span>Đặt bàn trực tuyến</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCart();
                  }}
                  className="flex items-center justify-center gap-2 bg-white border border-[#d2b68c] text-[#234386] py-3 rounded-full font-semibold text-xs shadow-xs"
                >
                  <ShoppingBag size={16} />
                  <span>Giỏ món giao ({cartCount})</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-[#000000]/60 space-y-1.5 pt-4 border-t border-[#d2b68c]/25">
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-[#ed7328]" />
                <span>Hotline: 0908 123 456</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-[#ed7328]" />
                <span>10:30 – 22:30</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-[#ed7328]" />
                <span>48 Tràng Tiền, Hoàn Kiếm, Hà Nội</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
