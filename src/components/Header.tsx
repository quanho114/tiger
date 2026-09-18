import { useState, useEffect, useRef, useCallback } from 'react';
import type { FC } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, ShoppingBag, Menu, X, Phone, Clock, MapPin } from 'lucide-react';
import { BotanicalSprig } from './BotanicalDecorations';
import { useCart } from '../store/cart';

const NAV_LINKS = [
  { name: 'Trang chủ', to: '/', id: 'home' },
  { name: 'Thực đơn', to: '/menu', id: 'menu' },
  { name: 'Đặt bàn', to: '/reservation', id: 'reservation' },
  { name: 'Địa chỉ', to: '/location', id: 'location' },
];

const ROUTE_BY_PATH: Record<string, string> = {
  '/': 'home',
  '/menu': 'menu',
  '/reservation': 'reservation',
  '/location': 'location',
};

export const Header: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { totalCount, setCartOpen } = useCart();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(location.pathname + location.search);

  // Close drawer when route changes during render
  if (prevPath !== location.pathname + location.search) {
    setPrevPath(location.pathname + location.search);
    setMobileMenuOpen(false);
  }

  const activeSection = ROUTE_BY_PATH[location.pathname] ?? 'home';
  // Cart is contextual on mobile: only on /menu in delivery mode (prevents crowding at 360px)
  const showMobileCart =
    location.pathname === '/menu' && searchParams.get('mode') === 'delivery';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Escape closes the drawer where a keyboard is available
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scroll while the drawer is open
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileMenuOpen]);

  const navRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [hasMounted, setHasMounted] = useState(false);

  const handleLogoClick = () => {
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
    }
  };

  const handleNavLinkClick = (to: string) => {
    if (location.pathname === to) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const updateIndicator = useCallback(() => {
    const activeEl = itemsRef.current[activeSection];
    const container = navRef.current;
    if (activeEl && container) {
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      const left = activeRect.left - containerRect.left;
      const width = activeRect.width;
      setIndicatorStyle({
        left,
        width,
        opacity: 1,
      });
    }
  }, [activeSection]);

  useEffect(() => {
    updateIndicator();

    const container = navRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      updateIndicator();
    });
    resizeObserver.observe(container);

    if (document.fonts) {
      document.fonts.ready.then(updateIndicator);
    }

    const rafId = requestAnimationFrame(() => {
      setHasMounted(true);
    });

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [updateIndicator]);

  return (
    <>
      <header
        style={{ paddingRight: 'var(--scrollbar-compensation, 0px)' }}
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${isScrolled
            ? 'bg-[#fbf9f6]/95 backdrop-blur-md shadow-xs py-2.5 md:py-3'
            : 'bg-transparent py-3 md:py-6'
          }`}
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center justify-between gap-2">

            {/* Brand Logo — compact on mobile */}
            <button
              type="button"
              onClick={handleLogoClick}
              className="flex items-center gap-2 sm:gap-3 group focus:outline-none shrink-0 min-w-0 cursor-pointer"
              aria-label="Tiger 345 — Trang chủ"
            >
              <img
                src="/tiger.svg"
                alt="Logo Tiger 345"
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-contain shadow-xs group-hover:scale-105 transition-transform duration-200 shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-['Fraunces',serif] font-bold text-lg sm:text-xl md:text-2xl tracking-tight text-[#234386] leading-none whitespace-nowrap">
                  Tiger 345<span className="text-[#ed7328]">.</span>
                </span>
                <span className="text-[8px] sm:text-[9px] md:text-[10px] tracking-[0.16em] sm:tracking-[0.22em] font-semibold uppercase text-[#ed7328] mt-0.5 whitespace-nowrap">
                  Ẩm Thực Đương Đại
                </span>
              </div>
            </button>

            {/* Desktop Navigation Links - Be Vietnam Pro 14px / 600 with single shared sliding underline */}
            <nav ref={navRef} className="relative hidden md:flex items-center gap-8 lg:gap-10 py-1">
              {NAV_LINKS.map((link) => {
                const isActive = activeSection === link.id;
                return (
                  <NavLink
                    key={link.id}
                    ref={(el) => {
                      itemsRef.current[link.id] = el;
                    }}
                    to={link.to}
                    onClick={() => handleNavLinkClick(link.to)}
                    className={`relative py-1 font-['Be_Vietnam_Pro',sans-serif] text-[14px] font-semibold transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-[#234386]/40 focus-visible:rounded-sm ${isActive
                        ? 'text-[#234386]'
                        : 'text-[#000000]/70 hover:text-[#234386]'
                      }`}
                  >
                    {link.name}
                  </NavLink>
                );
              })}

              {/* Single Shared Sliding Active Indicator */}
              <span
                aria-hidden="true"
                className={`absolute bottom-0 left-0 h-[2px] bg-[#234386] rounded-full pointer-events-none motion-reduce:transition-none ${hasMounted
                    ? 'transition-[transform,width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
                    : ''
                  }`}
                style={{
                  transform: `translateX(${indicatorStyle.left}px)`,
                  width: `${indicatorStyle.width}px`,
                  opacity: indicatorStyle.opacity,
                }}
              />
            </nav>

            {/* Right Action Controls */}
            <div className="flex items-center gap-1 sm:gap-2 md:gap-3.5 shrink-0">

              {/* Delivery Cart Trigger — desktop always; mobile only on /menu delivery mode */}
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className={`${showMobileCart ? 'flex' : 'hidden'} md:flex relative items-center justify-center w-9 h-9 text-[#234386]/80 hover:text-[#ed7328] hover:bg-[#234386]/8 rounded-full transition-colors`}
                  aria-label="Xem giỏ hàng giao tận nơi"
                  title="Giỏ hàng giao tận nơi"
                >
                  <ShoppingBag size={18} />
                  {totalCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 bg-[#ed7328] text-white text-[10px] font-semibold rounded-full flex items-center justify-center shadow-xs leading-none animate-in zoom-in-75 duration-150">
                      {totalCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Mobile Compact Booking Pill */}
              <button
                type="button"
                onClick={() => navigate('/reservation')}
                className="inline-flex md:hidden items-center gap-1 px-3 py-2 rounded-full bg-[#234386] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all whitespace-nowrap"
              >
                <Calendar size={13} />
                <span>Đặt bàn</span>
              </button>

              {/* Desktop Primary Booking Button - Be Vietnam Pro 14px / 600 (Image A) */}
              <button
                type="button"
                onClick={() => navigate('/reservation')}
                className="hidden md:inline-flex font-['Be_Vietnam_Pro',sans-serif] items-center gap-2 bg-[#234386] hover:bg-[#1a3468] text-[#ffffff] px-5 sm:px-6 py-2.5 rounded-full text-[14px] font-semibold shadow-xs hover:shadow-sm transition-all duration-200 hover:-translate-y-0.5"
              >
                <Calendar size={15} />
                <span>Đặt bàn ngay</span>
              </button>

              {/* Top Right Corner Handwritten Accent (Dancing Script 500-600) — desktop xl only */}
              <div className="hidden xl:flex items-center gap-1.5 pl-2 border-l border-[#d2b68c]/35">
                <BotanicalSprig className="w-5 h-5 -rotate-12" color="#4a6741" />
                <span className="font-['Dancing_Script',cursive] text-[18px] text-[#4a6741] font-semibold tracking-tight whitespace-nowrap">
                  Good Food, Brighter Days
                </span>
              </div>

              {/* Mobile Menu Hamburger */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex items-center justify-center w-9 h-9 rounded-full text-[#234386] md:hidden hover:bg-black/5 active:scale-95 transition-all"
                aria-label="Mở menu"
                aria-expanded={mobileMenuOpen}
              >
                <Menu size={22} />
              </button>

            </div>

          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
            className="w-[85%] max-w-[320px] bg-[#fbf9f6] h-full h-[100dvh] p-5 flex flex-col justify-between shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="flex items-center justify-between pb-5 border-b border-[#d2b68c]/30">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogoClick();
                  }}
                  className="flex items-center gap-2.5 focus:outline-none cursor-pointer"
                  aria-label="Tiger 345 — Trang chủ"
                >
                  <img
                    src="/tiger.svg"
                    alt="Logo Tiger 345"
                    className="w-8 h-8 rounded-full object-contain shadow-xs"
                  />
                  <span className="font-['Fraunces',serif] font-bold text-xl text-[#234386]">
                    Tiger 345<span className="text-[#ed7328]">.</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center w-9 h-9 rounded-full text-[#000000]/60 hover:bg-black/5 active:scale-95 transition-all"
                  aria-label="Đóng menu"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Mobile nav links — routes with active state */}
              <nav className="flex flex-col gap-2 mt-6">
                {NAV_LINKS.map((link) => (
                  <NavLink
                    key={link.id}
                    to={link.to}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleNavLinkClick(link.to);
                    }}
                    className={({ isActive }) =>
                      `px-4 py-3.5 rounded-xl text-[15px] font-semibold transition-colors ${isActive
                        ? 'bg-[#234386] text-white'
                        : 'text-[#000000]/80 hover:bg-[#d2b68c]/20'
                      }`
                    }
                  >
                    {link.name}
                  </NavLink>
                ))}
              </nav>

              <div className="mt-6 pt-6 border-t border-[#d2b68c]/30 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/reservation')}
                  className="flex items-center justify-center gap-2 bg-[#234386] text-white py-3.5 rounded-full font-semibold text-sm shadow-xs active:scale-[0.99] transition-transform"
                >
                  <Calendar size={16} />
                  <span>Đặt bàn trực tuyến</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="flex items-center justify-center gap-2 bg-white border border-[#d2b68c] text-[#234386] py-3.5 rounded-full font-semibold text-sm shadow-xs active:scale-[0.99] transition-transform"
                >
                  <ShoppingBag size={16} />
                  <span>Giỏ món giao ({totalCount})</span>
                </button>
              </div>
            </div>

            <div className="text-xs text-[#000000]/60 space-y-2 pt-4 mt-6 border-t border-[#d2b68c]/25">
              <a href="tel:0902809929" className="flex items-center gap-2">
                <Phone size={13} className="text-[#ed7328] shrink-0" />
                <span>Hotline: 090 280 99 29</span>
              </a>
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-[#ed7328] shrink-0" />
                <span>10:00 – 22:30 · Thứ 2 – Chủ Nhật</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-[#ed7328] shrink-0" />
                <span>17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
