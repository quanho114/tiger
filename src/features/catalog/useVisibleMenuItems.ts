import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const FIRST_SCREEN_SIZE = 8;

/** Reserve every dish's place, but only mount expensive cards near the viewport. */
export function useVisibleMenuItems(items: { id: string }[]) {
  const [page, setPage] = useState(() => ({ items, visible: new Set(items.slice(0, FIRST_SCREEN_SIZE).map(item => item.id)) }));
  const slots = useRef(new Map<string, HTMLDivElement>());
  const focusedSlot = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  if (page.items !== items) {
    setPage({ items, visible: new Set(items.slice(0, FIRST_SCREEN_SIZE).map(item => item.id)) });
  }

  const reveal = useCallback((ids: string[]) => {
    for (const id of ids) {
      const slot = slots.current.get(id);
      if (slot?.contains(document.activeElement)) focusedSlot.current = slot;
    }
    setPage(current => {
      if (current.items !== items || ids.every(id => current.visible.has(id))) return current;
      return { items, visible: new Set([...current.visible, ...ids]) };
    });
  }, [items]);

  // Replacing a focused placeholder must keep keyboard navigation in the dish.
  useLayoutEffect(() => {
    focusedSlot.current?.querySelector<HTMLButtonElement>('article button')?.focus();
    focusedSlot.current = null;
  }, [page.visible]);

  const registerSlot = useCallback((id: string, element: HTMLDivElement | null) => {
    const previous = slots.current.get(id);
    if (previous) observerRef.current?.unobserve(previous);
    if (element) {
      slots.current.set(id, element);
      observerRef.current?.observe(element);
    } else slots.current.delete(id);
  }, []);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    let active = true;
    const observer = new IntersectionObserver(entries => {
      if (!active) return;
      const ids: string[] = [];
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.menuSlotId;
        if (id) ids.push(id);
        observer.unobserve(entry.target);
      }
      if (ids.length) reveal(ids);
    }, { rootMargin: '600px 0px' });
    observerRef.current = observer;
    slots.current.forEach(element => observer.observe(element));
    return () => {
      active = false;
      observer.disconnect();
      observerRef.current = null;
    };
  }, [reveal]);

  return {
    isVisible: (id: string) => typeof IntersectionObserver === 'undefined' || page.visible.has(id),
    registerSlot,
    reveal,
  };
}
