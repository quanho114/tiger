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
      className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-[#173866] text-white shadow-md shadow-[#173866]/20 transition-transform hover:-translate-y-0.5 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ed7328]">
      {open ? <X size={22} aria-hidden="true" /> : <img src="/tiger.svg" alt="" className="h-9 w-9 rounded-full bg-white object-contain" />}
      {status === 'thinking' && !open && <span aria-hidden="true" className="absolute -bottom-0.5 h-1.5 w-6 rounded-full bg-[#ed7328] motion-safe:animate-pulse" />}
      {unreadCount > 0 && !open && <span aria-label={`${unreadCount} tin nhắn chưa đọc`}
        className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-[#ed7328] px-1 text-[10px] font-bold text-white">
        {unreadCount}
      </span>}
    </button>
  </div>
)
