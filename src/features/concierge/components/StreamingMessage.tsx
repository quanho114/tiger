import { useEffect, useRef, useState } from 'react'
import { segmentText } from '../presentation'

export function StreamingMessage({ text, animate, complete, onAdvance }: {
  text: string; animate: boolean; complete: boolean; onAdvance?: () => void;
}) {
  const [visible, setVisible] = useState(animate ? '' : text)
  const visibleRef = useRef(visible)
  useEffect(() => {
    const target = segmentText(text)
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reveal = () => {
      const current = visibleRef.current
      const count = text.startsWith(current) ? segmentText(current).length : 0
      const remaining = target.length - count
      const immediate = !animate || query?.matches || document.visibilityState === 'hidden' || target.length <= 60
      const next = immediate ? text : target.slice(0, count + Math.max(4, Math.ceil(remaining / 8))).join('')
      visibleRef.current = next
      setVisible(next)
      onAdvance?.()
      if (next === text) clearInterval(timer)
    }
    const timer = window.setInterval(reveal, 40)
    query?.addEventListener?.('change', reveal)
    document.addEventListener('visibilitychange', reveal)
    return () => {
      clearInterval(timer)
      query?.removeEventListener?.('change', reveal)
      document.removeEventListener('visibilitychange', reveal)
    }
  }, [text, animate, onAdvance])
  return <>
    <span aria-hidden="true">{visible}</span>
    {animate && visible !== text && <span aria-hidden="true" className="ml-0.5 inline-block h-3 w-1.5 bg-[#234386] motion-safe:animate-pulse" />}
    <span className="sr-only" aria-live="polite" aria-atomic="true">{complete ? text : ''}</span>
  </>
}
