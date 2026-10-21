import { useLayoutEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useProgressiveMenu } from '../useProgressiveMenu';

afterEach(() => vi.unstubAllGlobals());

it('limits initial work, appends batches, and resets immediately for a different result set', () => {
  const items = Array.from({ length: 98 }, (_, i) => i);
  const { result, rerender } = renderHook(({ data }) => useProgressiveMenu(data), { initialProps: { data: items } });
  expect(result.current.visibleItems).toEqual(items.slice(0, 12));
  act(() => result.current.loadMore());
  expect(result.current.visibleItems).toHaveLength(24);
  rerender({ data: items.slice(80) });
  expect(result.current.visibleItems).toEqual(items.slice(80, 92));
  act(() => result.current.loadMore());
  expect(result.current.visibleItems).toEqual(items.slice(80));
  expect(result.current.hasMore).toBe(false);
});

it('loads near the sentinel and disconnects on unmount', () => {
  let onIntersect: IntersectionObserverCallback;
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { onIntersect = callback; }
    observe = vi.fn();
    disconnect = disconnect;
  });
  const items = Array.from({ length: 30 }, (_, i) => i);
  const target = document.createElement('button');
  const { result, unmount } = renderHook(() => {
    const menu = useProgressiveMenu(items);
    useLayoutEffect(() => { menu.sentinelRef.current = target; }, [menu.sentinelRef]);
    return menu;
  });
  act(() => onIntersect([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver));
  expect(result.current.visibleItems).toHaveLength(24);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});
