import { useEffect, useLayoutEffect, useRef, type PointerEvent, type ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

interface SwipeCartRowProps {
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onRemove: () => void
  children: ReactNode
}

/** Reveal-only swipe: deletion always requires an explicit button press. */
export function SwipeCartRow({ name, open, onOpenChange, onRemove, children }: SwipeCartRowProps) {
  const gesture = useRef<{ id: number; x: number; y: number; width: number; start: number; offset: number; axis?: 'x' | 'y' } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const paint = (progress: number, dragging = false) => {
    if (!root.current) return
    root.current.style.setProperty('--swipe-progress', String(progress))
    root.current.style.setProperty('--swipe-duration', dragging ? '0ms' : '150ms')
  }
  useEffect(() => {
    if (!open) return
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open, onOpenChange])
  useLayoutEffect(() => {
    if (!gesture.current) paint(open ? 1 : 0)
  }, [open])
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    const nextOpen = cancelled ? open : current.axis === 'x' ? current.offset < -current.width / 8 : current.axis === 'y' ? open : false
    gesture.current = null
    paint(nextOpen ? 1 : 0)
    if (!cancelled && current.axis !== 'y') onOpenChange(nextOpen)
  }

  return (
    <div ref={root} role="group" aria-label={`Món ${name}`} tabIndex={0}
      onDragStart={event => event.preventDefault()}
      className="relative select-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4f6958]"
      style={{ touchAction: 'pan-y pinch-zoom' }}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'ArrowLeft' || event.key === 'Delete') { event.preventDefault(); onOpenChange(true) }
        if (event.key === 'ArrowRight' || event.key === 'Escape') { event.preventDefault(); onOpenChange(false) }
      }}
      onPointerDown={event => {
        if (gesture.current || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest('button')) return
        const width = event.currentTarget.getBoundingClientRect().width
        const start = open ? -width / 4 : 0
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width, start, offset: start }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const current = gesture.current
        if (!current || current.id !== event.pointerId) return
        const dx = event.clientX - current.x
        const dy = event.clientY - current.y
        if (!current.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
          current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        }
        if (current.axis === 'x') {
          event.preventDefault()
          current.offset = Math.max(-current.width / 4, Math.min(0, current.start + dx))
          paint(-current.offset / (current.width / 4), true)
        }
      }}
      onPointerUp={event => finish(event)}
      onPointerCancel={event => finish(event, true)}
      onLostPointerCapture={event => {
        if (event.target === event.currentTarget) finish(event, true)
      }}
    >
      <button type="button" aria-label={`Xóa món khỏi giỏ: ${name}`} tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        className="absolute top-1/2 right-0 z-10 flex h-12 w-1/4 items-center justify-center gap-1.5 rounded-xl bg-[#b7473e] text-xs font-semibold text-white transition-[transform,opacity] motion-reduce:transition-none hover:bg-[#a53b33] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
        style={{ transform: 'translateY(-50%) translateX(calc((1 - var(--swipe-progress, 0)) * 100%))', opacity: 'var(--swipe-progress, 0)', transitionDuration: 'var(--swipe-duration, 150ms)', pointerEvents: open ? 'auto' : 'none' }}
        onClick={() => { onRemove(); onOpenChange(false) }}>
        <Trash2 size={16} aria-hidden="true" />Xóa
      </button>
      <div className="relative flex items-center gap-2 py-4 sm:gap-3">
        {children}
      </div>
    </div>
  )
}
