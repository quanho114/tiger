import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contentEditable=true]',
].join(',')

export function useDrawerFocus(isOpen: boolean, onClose: () => void) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
    const originalOverflow = document.body.style.overflow
    const originalPaddingRight = document.body.style.paddingRight

    document.body.style.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`
      document.documentElement.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`)
    }

    const timer = setTimeout(() => {
      if (!drawerRef.current) return
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        drawerRef.current.focus()
      }
    }, 10)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Focus trap
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from(
          drawerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => {
          if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false
          if (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0) return true
          const style = window.getComputedStyle(el)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })

        if (focusables.length === 0) {
          e.preventDefault()
          return
        }

        const firstElement = focusables[0]
        const lastElement = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !drawerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !drawerRef.current.contains(document.activeElement)
          ) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      document.body.style.overflow = originalOverflow
      document.body.style.paddingRight = originalPaddingRight
      document.documentElement.style.removeProperty('--scrollbar-compensation')
      window.removeEventListener('keydown', handleKeyDown)
      if (
        previouslyFocusedRef.current &&
        typeof previouslyFocusedRef.current.focus === 'function'
      ) {
        previouslyFocusedRef.current.focus()
      }
    }
  }, [isOpen, onClose])

  return drawerRef
}
