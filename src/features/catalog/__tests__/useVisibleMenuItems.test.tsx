import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useVisibleMenuItems } from '../useVisibleMenuItems';

afterEach(() => vi.unstubAllGlobals());

it('mounts a small first screen, reveals intersecting dishes, and resets on filtering', () => {
  let intersect!: IntersectionObserverCallback;
  const disconnect = vi.fn();
  const unobserve = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe = vi.fn();
    unobserve = unobserve;
    disconnect = disconnect;
  });
  const items = Array.from({ length: 98 }, (_, i) => ({ id: `dish-${i}` }));
  const { result, rerender, unmount } = renderHook(({ data }) => useVisibleMenuItems(data), { initialProps: { data: items } });
  expect(items.filter(item => result.current.isVisible(item.id))).toHaveLength(8);
  const target = document.createElement('div');
  target.dataset.menuSlotId = 'dish-90';
  const entry: IntersectionObserverEntry = { target, isIntersecting: true, time: 0, intersectionRatio: 1, rootBounds: null, boundingClientRect: target.getBoundingClientRect(), intersectionRect: target.getBoundingClientRect() };
  act(() => intersect([entry], {} as IntersectionObserver));
  expect(result.current.isVisible('dish-90')).toBe(true);
  expect(result.current.isVisible('dish-50')).toBe(false);
  act(() => result.current.reveal(['dish-50']));
  expect(result.current.isVisible('dish-50')).toBe(true);
  act(() => intersect([{ ...entry, isIntersecting: false }], {} as IntersectionObserver));
  expect(result.current.isVisible('dish-90')).toBe(true);
  rerender({ data: items.slice(40, 60) });
  expect(result.current.isVisible('dish-40')).toBe(true);
  expect(result.current.isVisible('dish-90')).toBe(false);
  unmount();
  expect(disconnect).toHaveBeenCalled();
});

it('renders the full catalog when IntersectionObserver is unavailable', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const items = Array.from({ length: 20 }, (_, i) => ({ id: String(i) }));
  const { result } = renderHook(() => useVisibleMenuItems(items));
  expect(items.every(item => result.current.isVisible(item.id))).toBe(true);
});

it('keeps keyboard focus in the dish when a placeholder becomes a card', () => {
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  const items = Array.from({ length: 9 }, (_, i) => ({ id: String(i) }));
  function Cards() {
    const { isVisible, registerSlot, reveal } = useVisibleMenuItems(items);
    return <div ref={element => registerSlot('8', element)}>
      {isVisible('8') ? <article><button>Chi tiết món</button></article>
        : <button onFocus={() => reveal(['8'])}>Xem món</button>}
    </div>;
  }
  render(<Cards />);
  act(() => screen.getByRole('button', { name: 'Xem món' }).focus());
  expect(screen.getByRole('button', { name: 'Chi tiết món' })).toHaveFocus();
});
