import type { FC } from 'react'
import { X } from 'lucide-react'

export type AssistantStatus = 'idle' | 'online' | 'thinking' | 'offline'

export interface FloatingAssistantButtonProps {
  open: boolean
  status?: AssistantStatus
  unreadCount?: number
  onClick: () => void
  className?: string
}

export const FloatingAssistantButton: FC<FloatingAssistantButtonProps> = ({
  open, status = 'idle', unreadCount = 0, onClick, className = '',
}) => (
  <div className={`group relative inline-flex ${className}`}>
    <span id="concierge-button-label"
      className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#173866] px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:block">
      {open ? 'Đóng hội thoại' : 'Tiger Concierge'}
    </span>
    <button type="button" onClick={onClick} aria-describedby="concierge-button-label"
      aria-label={open ? 'Đóng Tiger Concierge' : 'Mở Tiger Concierge'} aria-expanded={open}
      className={`relative flex h-16 w-16 items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed7328] ${open ? 'rounded-full bg-[#173866] text-white shadow-md shadow-[#173866]/20' : 'border-0 bg-transparent'}`}>
      {open ? <X size={22} aria-hidden="true" /> : (
        <span className="relative block h-full w-full" aria-hidden="true">
          <img src="/brand/tiger345/concierge/tiger-bot-original.png" alt="" draggable={false} className="h-full w-full object-contain" />
          <span className="pointer-events-none absolute -top-8 right-0 whitespace-nowrap rounded-xl border border-[#ed7328]/20 bg-[#fff9ef] px-2.5 py-1 text-[10px] font-semibold leading-4 tracking-wide text-[#1f2d4d] shadow-[0_2px_8px_rgba(84,54,27,0.08)]">
            Hỏi Tiger
            <span className="absolute -bottom-1 right-3 h-2 w-2 rotate-45 rounded-br-[2px] border-b border-r border-[#ed7328]/20 bg-[#fff9ef]" />
          </span>
        </span>
      )}
      {status === 'thinking' && !open && <span aria-hidden="true" className="absolute -bottom-0.5 h-1.5 w-6 rounded-full bg-[#ed7328] motion-safe:animate-pulse" />}
      {unreadCount > 0 && !open && <span aria-label={`${unreadCount} tin nhắn chưa đọc`}
        className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#ed7328] px-1 text-[10px] font-bold text-white">
        {unreadCount}
      </span>}
    </button>
  </div>
)
