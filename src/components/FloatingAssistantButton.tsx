import type { FC } from 'react';
import { X } from 'lucide-react';

export type AssistantStatus = 'online' | 'thinking' | 'offline';

export interface FloatingAssistantButtonProps {
  open: boolean;
  status?: AssistantStatus;
  unreadCount?: number;
  onClick: () => void;
  className?: string;
}

/**
 * Bespoke 4-point AI Diamond Spark Glyph
 * Clean, balanced, modern intelligence identity mark
 */
const AISparkGlyph: FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Primary 4-point intelligence star */}
    <path
      d="M12 2.5C12 7.8 7.8 12 2.5 12C7.8 12 12 16.2 12 21.5C12 16.2 16.2 12 21.5 12C16.2 12 12 7.8 12 2.5Z"
      fill="currentColor"
    />
    {/* Subtle companion spark in upper right corner */}
    <path
      d="M19 2.5C19 4.2 17.7 5.5 16 5.5C17.7 5.5 19 6.8 19 8.5C19 6.8 20.3 5.5 22 5.5C20.3 5.5 19 4.2 19 2.5Z"
      fill="currentColor"
      opacity="0.9"
    />
  </svg>
);

export const FloatingAssistantButton: FC<FloatingAssistantButtonProps> = ({
  open,
  status = 'online',
  unreadCount = 0,
  onClick,
  className = '',
}) => {
  const isThinking = status === 'thinking';
  const isOnline = status === 'online';

  return (
    <div className={`relative inline-flex items-center justify-center group ${className}`}>
      {/* ------------------------------------------------------------- */}
      {/* 1. DESKTOP TOOLTIP (Reveals on hover/focus, hidden on mobile) */}
      {/* ------------------------------------------------------------- */}
      <div
        role="tooltip"
        id="ai-assistant-tooltip"
        className="hidden md:flex absolute right-full mr-3 top-1/2 -translate-y-1/2 items-center gap-2 px-2.5 py-1 rounded-full bg-[#161938]/90 text-white backdrop-blur-md border border-white/15 shadow-xl shadow-indigo-950/20 pointer-events-none opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0 transition-all duration-200 ease-out z-20 whitespace-nowrap"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
        <span className="font-['Be_Vietnam_Pro',sans-serif] text-xs font-semibold tracking-wide text-white">
          {open ? 'Đóng hội thoại' : 'Trợ lý ẩm thực AI'}
        </span>
        <span className="text-[10px] text-white/50 font-normal border-l border-white/20 pl-1.5">
          {open ? 'Esc' : 'Tiger 345'}
        </span>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. MAIN BUTTON CONTAINER & SURFACE (Refined 52px / 48px size) */}
      {/* ------------------------------------------------------------- */}
      <button
        type="button"
        onClick={onClick}
        aria-describedby="ai-assistant-tooltip"
        aria-label={open ? 'Đóng trợ lý AI Tiger 345' : 'Mở trợ lý ẩm thực AI Tiger 345'}
        aria-expanded={open}
        className="ai-fab-entrance relative flex items-center justify-center w-12 h-12 md:w-[52px] md:h-[52px] rounded-full cursor-pointer select-none outline-none focus-visible:ring-4 focus-visible:ring-indigo-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf9f6] transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97]"
        style={{
          // Multi-layer blue → indigo → violet dimensional surface
          background: open
            ? 'linear-gradient(135deg, #2563EB 0%, #3730A3 55%, #581C87 100%)'
            : 'linear-gradient(135deg, #3B82F6 0%, #4F46E5 52%, #7C3AED 100%)',
          // Ambient shadow + colored low-opacity glow + 1px crisp inner rim
          boxShadow: open
            ? '0 8px 20px -4px rgba(67, 56, 202, 0.4), 0 2px 6px -1px rgba(37, 99, 235, 0.22), inset 0 1px 1px 0 rgba(255, 255, 255, 0.35), inset 0 -1.5px 2px 0 rgba(15, 23, 42, 0.4)'
            : '0 10px 24px -5px rgba(79, 70, 229, 0.42), 0 4px 10px -2px rgba(59, 130, 246, 0.25), 0 2px 4px 0 rgba(15, 23, 42, 0.1), inset 0 1px 1.5px 0 rgba(255, 255, 255, 0.42), inset 0 -1.5px 2px 0 rgba(91, 33, 182, 0.45)',
        }}
      >
        {/* Subtle upper-left radial luminosity highlight */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none opacity-85 group-hover:opacity-100 transition-opacity duration-200"
          style={{
            background:
              'radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.32) 0%, rgba(147, 197, 253, 0.18) 32%, transparent 70%)',
          }}
        />

        {/* Crisp translucent 1px rim highlight */}
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full pointer-events-none border border-white/25 group-hover:border-white/35 transition-colors duration-200"
        />

        {/* Thinking state: Subtle rotating luminous gradient ring around perimeter */}
        {isThinking && (
          <span
            aria-hidden="true"
            className="absolute -inset-1 rounded-full pointer-events-none ai-thinking-orbit opacity-75"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, #60A5FA 90deg, #A78BFA 180deg, transparent 270deg)',
              maskImage: 'radial-gradient(circle, transparent 65%, black 67%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 65%, black 67%)',
            }}
          />
        )}

        {/* ------------------------------------------------------------- */}
        {/* 3. CENTER ICON (Polished transition between AI & Close X)     */}
        {/* ------------------------------------------------------------- */}
        <div className="relative w-5 h-5 flex items-center justify-center text-white drop-shadow-sm pointer-events-none">
          {/* AI Sparkle Icon */}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
              open
                ? 'opacity-0 scale-75 -rotate-45 pointer-events-none'
                : 'opacity-100 scale-100 rotate-0'
            }`}
          >
            <AISparkGlyph className="w-5 h-5 text-white" />
          </span>

          {/* Close Icon (X) */}
          <span
            className={`absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out ${
              open
                ? 'opacity-100 scale-100 rotate-0'
                : 'opacity-0 scale-75 rotate-45 pointer-events-none'
            }`}
          >
            <X size={19} strokeWidth={2.5} className="text-white" />
          </span>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* 4. ONLINE STATUS INDICATOR (Upper right edge)                */}
        {/* ------------------------------------------------------------- */}
        {isOnline && !open && (
          <span
            className="absolute top-0 right-0 translate-x-[1px] -translate-y-[1px] flex items-center justify-center pointer-events-none"
            aria-hidden="true"
          >
            {/* Subtle status pulse ring */}
            <span className="absolute w-3.5 h-3.5 rounded-full bg-[#22C55E] opacity-75 ai-status-pulse" />

            {/* Solid green center dot with white/surface border separation ring */}
            <span className="relative w-3 h-3 rounded-full bg-[#22C55E] border-[1.5px] border-[#fbf9f6] shadow-xs flex items-center justify-center">
              {/* Inner specular dot */}
              <span className="w-0.5 h-0.5 rounded-full bg-white/75" />
            </span>
          </span>
        )}

        {/* ------------------------------------------------------------- */}
        {/* 5. UNREAD NOTIFICATION BADGE (When unread count > 0)           */}
        {/* ------------------------------------------------------------- */}
        {unreadCount > 0 && !open && (
          <span
            className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-[#ed7328] text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs border border-[#fbf9f6] animate-in zoom-in duration-150"
            aria-label={`${unreadCount} tin nhắn chưa đọc`}
          >
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};
