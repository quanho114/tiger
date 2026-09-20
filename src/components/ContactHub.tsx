import { useState, useEffect, useRef } from 'react';
import type { FC } from 'react';
import {
  Phone,
  X,
  ArrowUpRight,
  ChevronRight
} from 'lucide-react';
import { useCart } from '../store/cart';
import { FloatingAssistantButton } from './FloatingAssistantButton';
import { getSiteInfo } from '../data/site';
import { useCatalog } from '@/features/catalog';
import { ConciergeChatView } from '@/features/concierge/components/ConciergeChatView';

/**
 * Elegant Concierge Chat Icon
 * Minimal speech bubble with an internal 4-point gold spark identity mark
 */
const ConciergeChatIcon: FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M21 11.5C21 16.1944 16.9706 20 12 20C10.5186 20 9.12001 19.6789 7.89242 19.1084L3.5 20.5L4.89158 16.6076C3.70565 15.3056 3 13.7258 3 11.5C3 6.80558 7.02944 3 12 3C16.9706 3 21 6.80558 21 11.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 7C12 9 10.8 10.2 9 10.2C10.8 10.2 12 11.4 12 13.4C12 11.4 13.2 10.2 15 10.2C13.2 10.2 12 9 12 7Z"
      fill="#ffc400"
    />
  </svg>
);

/**
 * Unified Zalo Brand Mark
 */
const ZaloMark: FC = () => (
  <span className="font-extrabold text-[12.5px] tracking-tight text-[#0068FF] select-none font-sans leading-none">
    Zalo
  </span>
);

/**
 * Reusable Concierge Card Content Component
 * Shared identically between desktop floating popover and mobile sheet
 */
interface ConciergeCardContentProps {
  site: ReturnType<typeof getSiteInfo>;
  onClose: () => void;
  onOpenChat: () => void;
}

const ConciergeCardContent: FC<ConciergeCardContentProps> = ({ site, onClose, onOpenChat }) => {
  return (
    <div>
      {/* ------------------------------------------------------------- */}
      {/* 1. RESTAURANT IDENTITY HEADER                                */}
      {/* ------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src="/tiger.svg"
            alt="Logo Tiger 345"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-contain shrink-0 ring-1 ring-[#786246]/15 shadow-2xs"
          />
          <div className="flex flex-col min-w-0">
            <h3 className="font-['Fraunces',serif] font-bold text-xl sm:text-[22px] tracking-tight text-[#173866] leading-none">
              Tiger 345<span className="text-[#ed7328]">.</span>
            </h3>
            <p className="text-[12.5px] text-[#758096] font-normal leading-tight mt-1 truncate">
              Đặc sản Tây Bắc · Contemporary Bistro
            </p>
            {/* Restrained open status + hours */}
            <div className="flex items-center gap-2 mt-1.5 text-[11.5px]">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#3C8A56]/10 text-[#2E6B43] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#3C8A56]" />
                <span>Đang mở</span>
              </span>
              <span className="text-[#758096]/40">|</span>
              <span className="text-[#758096] font-medium tracking-wide">10:00 – 22:30</span>
            </div>
          </div>
        </div>

        {/* Minimal Understated X Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full text-[#758096] hover:text-[#173866] hover:bg-[#173866]/6 flex items-center justify-center transition-colors cursor-pointer shrink-0 -mt-1 -mr-1 outline-none focus-visible:ring-2 focus-visible:ring-[#173866]/30"
          aria-label="Đóng bảng liên hệ"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. SUBTLE HAIRLINE DIVIDER                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="h-px bg-[#786246]/10 my-4" />

      {/* ------------------------------------------------------------- */}
      {/* 3. SECTION INTRO                                              */}
      {/* ------------------------------------------------------------- */}
      <div className="mb-3.5">
        <h4 className="text-[16px] sm:text-[17px] font-semibold text-[#173866] tracking-tight leading-snug">
          Chọn cách liên hệ phù hợp
        </h4>
        <p className="text-[12.5px] text-[#758096] font-normal mt-0.5">
          Chúng tôi luôn sẵn sàng hỗ trợ bạn.
        </p>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. CONTACT ACTIONS LIST (Hierarchical Order)                   */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-2.5">
        {/* Action 1 (Primary, Dominant): Nhắn với Tiger */}
        <button
          type="button"
          onClick={onOpenChat}
          className="w-full text-left flex items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-2xl text-white cursor-pointer select-none group transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#173866]/20 active:translate-y-0 active:scale-[0.99] border border-white/10 outline-none focus-visible:ring-3 focus-visible:ring-[#173866]/30"
          style={{
            background: 'linear-gradient(135deg, #173866 0%, #21477D 55%, #234386 100%)',
            boxShadow:
              '0 8px 20px -4px rgba(23, 56, 102, 0.28), inset 0 1px 1px 0 rgba(255, 255, 255, 0.22)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Unified 42px Icon Box */}
            <div className="w-[42px] h-[42px] rounded-xl bg-white/12 border border-white/15 text-[#ffc400] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200 shadow-2xs">
              <ConciergeChatIcon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-[15px] text-[#FFFDF8] block leading-tight tracking-tight">
                Nhắn với Tiger
              </span>
              <span className="text-[12px] text-[#FFFDF8]/75 font-normal mt-0.5 block truncate">
                Hỏi món • đặt bàn • giữ chỗ
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-[#FFFDF8]/80 group-hover:text-white group-hover:bg-white/20 transition-all duration-200">
            <ChevronRight size={16} strokeWidth={2.4} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </button>

        {/* Action 2 (Secondary): Zalo */}
        <a
          href={site.zalo}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onClose}
          className="flex items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white border border-[#183B70]/10 hover:border-[#0068FF]/30 hover:bg-[#FFFDF9] cursor-pointer group transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 outline-none focus-visible:ring-3 focus-visible:ring-[#173866]/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Unified 42px Icon Box */}
            <div className="w-[42px] h-[42px] rounded-xl bg-[#0068FF]/10 text-[#0068FF] border border-[#0068FF]/15 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
              <ZaloMark />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[14.5px] text-[#173866] group-hover:text-[#0068FF] transition-colors leading-tight">
                  Zalo
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[#0068FF]/8 text-[#0068FF] font-medium">
                  OA
                </span>
              </div>
              <span className="text-[12px] text-[#758096] font-normal mt-0.5 block truncate">
                Nhắn tin qua Zalo OA
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[#758096]/60 group-hover:text-[#0068FF] transition-all duration-200">
            <ArrowUpRight size={16} strokeWidth={2} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200" />
          </div>
        </a>

        {/* Action 3 (Secondary): Hotline */}
        <a
          href={site.phoneHref}
          onClick={onClose}
          className="flex items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white border border-[#183B70]/10 hover:border-[#173866]/30 hover:bg-[#FFFDF9] cursor-pointer group transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 outline-none focus-visible:ring-3 focus-visible:ring-[#173866]/20"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Unified 42px Icon Box */}
            <div className="w-[42px] h-[42px] rounded-xl bg-[#173866]/6 text-[#173866] border border-[#173866]/10 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
              <Phone size={17} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-[14.5px] text-[#173866] group-hover:text-[#234386] transition-colors leading-tight block">
                Gọi hotline
              </span>
              <span className="text-[12px] text-[#758096] font-medium mt-0.5 block truncate">
                {site.phoneDisplay}
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[#758096]/60 group-hover:text-[#173866] transition-all duration-200">
            <ChevronRight size={16} strokeWidth={2.2} className="group-hover:translate-x-0.5 transition-transform duration-200" />
          </div>
        </a>
      </div>
    </div>
  );
};

export const ContactHub: FC = () => {
  const { totalCount, isCartOpen } = useCart();
  const { settings } = useCatalog();
  const site = getSiteInfo(settings);
  const [isOpen, setIsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const hubRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsChatOpen(false);
      }
    };
    if (isOpen || isChatOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen, isChatOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setIsChatOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenChat = () => {
    setIsOpen(false);
    setIsChatOpen(true);
  };

  // Adjust bottom offset dynamically if StickyCartBar is currently active on mobile
  const isCartActiveOnMobile = totalCount > 0 && !isCartOpen;
  const bottomPositionClass = isCartActiveOnMobile
    ? 'bottom-[76px] md:bottom-6'
    : 'bottom-5 md:bottom-6';

  return (
    <aside
      ref={hubRef}
      aria-label="Trung tâm liên hệ hỗ trợ"
      className={`fixed z-40 right-4 sm:right-6 ${bottomPositionClass} transition-all duration-200`}
    >
      {/* ------------------------------------------------------------- */}
      {/* 1. DESKTOP & TABLET CONCIERGE CARD POPOVER (md:block)         */}
      {/* ------------------------------------------------------------- */}
      {isOpen && !isChatOpen && (
        <div
          role="dialog"
          aria-label="Bảng liên hệ nhà hàng Tiger 345"
          className="hidden md:block relative w-[370px] sm:w-[380px] bg-[#FFFDF9] rounded-[22px] border border-[#786246]/15 p-5 sm:p-6 concierge-card-enter overflow-hidden"
          style={{
            boxShadow:
              '0 20px 48px rgba(24, 42, 74, 0.10), 0 4px 14px rgba(24, 42, 74, 0.04)',
          }}
        >
          <ConciergeCardContent
            site={site}
            onClose={() => setIsOpen(false)}
            onOpenChat={handleOpenChat}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. MOBILE COMPACT CONCIERGE MODAL (< md)                      */}
      {/* ------------------------------------------------------------- */}
      {isOpen && !isChatOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/35 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Bảng liên hệ nhà hàng Tiger 345"
            className="w-full max-w-[390px] bg-[#FFFDF9] rounded-3xl sm:rounded-[22px] p-5 border border-[#786246]/15 shadow-2xl concierge-card-enter"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
              boxShadow:
                '0 20px 48px rgba(24, 42, 74, 0.16), 0 4px 14px rgba(24, 42, 74, 0.06)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle for Touch Ergonomics */}
            <div className="w-10 h-1 bg-[#786246]/20 rounded-full mx-auto mb-3.5 sm:hidden" />
            <ConciergeCardContent
              site={site}
              onClose={() => setIsOpen(false)}
              onOpenChat={handleOpenChat}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. TIGER CONCIERGE CHAT DIALOG                                */}
      {/* ------------------------------------------------------------- */}
      {isChatOpen && (
        <div
          role="dialog"
          aria-label="Trò chuyện với Tiger Concierge"
          className="fixed inset-x-3 bottom-3 sm:bottom-6 sm:right-6 sm:left-auto sm:w-[380px] md:w-[420px] h-[580px] max-h-[85vh] bg-[#FFFDF9] rounded-3xl sm:rounded-2xl border border-[#786246]/20 shadow-2xl flex flex-col overflow-hidden z-50 concierge-card-enter"
          style={{
            boxShadow:
              '0 20px 48px rgba(24, 42, 74, 0.14), 0 4px 14px rgba(24, 42, 74, 0.06)',
          }}
        >
          <ConciergeChatView
            onClose={() => {
              setIsChatOpen(false);
              setIsOpen(true);
            }}
          />
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. AI-NATIVE FLOATING ACTION BUTTON TRIGGER (Shown when closed) */}
      {/* ------------------------------------------------------------- */}
      {!isOpen && !isChatOpen && (
        <FloatingAssistantButton
          open={false}
          status="online"
          onClick={() => setIsOpen(true)}
        />
      )}
    </aside>
  );
};
