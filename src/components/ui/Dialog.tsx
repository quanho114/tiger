import { useEffect, useRef, useId, type ReactNode } from 'react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  closeOnOverlayClick?: boolean;
}

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
].join(',');

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  className = '',
  closeOnOverlayClick = true,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Handle opening, closing, body scroll lock, and restoring focus
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element or the dialog itself
    const timer = setTimeout(() => {
      if (!dialogRef.current) return;
      const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      } else {
        dialogRef.current.focus();
      }
    }, 10);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen]);

  // Handle Escape key and focus trapping (Tab / Shift+Tab)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => {
          if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
          if (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0) return true;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, cycle to last
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, cycle to first
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={closeOnOverlayClick ? onClose : undefined}
      data-testid="dialog-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`bg-white rounded-[24px] max-w-lg w-full overflow-hidden shadow-2xl border border-[#d2b68c]/40 outline-none animate-in zoom-in-95 duration-200 ${className}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="dialog-content"
      >
        {title && (
          <div id={titleId} className="sr-only">
            {title}
          </div>
        )}
        {description && (
          <div id={descriptionId} className="sr-only">
            {description}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
