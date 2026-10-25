import { useEffect, useRef, useState } from 'react';

const BATCH_SIZE = 12;

/** Keep route entry small while retaining the complete catalog for filtering. */
export function useProgressiveMenu<T>(items: T[]) {
  const [page, setPage] = useState({ items, limit: BATCH_SIZE });
  const sentinelRef = useRef<HTMLButtonElement>(null);
  // Reset during render so a new filter never briefly shows the previous limit.
  if (page.items !== items) setPage({ items, limit: BATCH_SIZE });
  const limit = page.items === items ? page.limit : BATCH_SIZE;
  const hasMore = limit < items.length;
  const loadMore = () => setPage(current => ({
    items,
    limit: Math.min((current.items === items ? current.limit : BATCH_SIZE) + BATCH_SIZE, items.length),
  }));

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setPage(current => ({
          items,
          limit: Math.min((current.items === items ? current.limit : BATCH_SIZE) + BATCH_SIZE, items.length),
        }));
      }
    }, { rootMargin: '400px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [items, hasMore, limit]);

  return { visibleItems: items.slice(0, limit), hasMore, loadMore, sentinelRef };
}
