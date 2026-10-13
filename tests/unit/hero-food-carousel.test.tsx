import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeroFoodCarousel } from '@/features/restaurant/components/HeroFoodCarousel';

describe('hero food carousel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const tick = () => act(() => vi.advanceTimersByTime(3000));
  const active = (dish: number) => expect(screen.getByLabelText(`Show dish ${dish}`)).toHaveAttribute('aria-current', 'true');

  it('rotates all three dishes and removes its timer on unmount', () => {
    const { unmount } = render(<HeroFoodCarousel />);
    active(1); tick(); active(2); tick(); active(3); tick(); active(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('supports pagination and keyboard wrapping', () => {
    render(<HeroFoodCarousel />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowLeft' }); active(3);
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowRight' }); active(1);
    fireEvent.click(screen.getByLabelText('Show dish 2')); active(2);
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowRight' }); active(3);
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowLeft' }); active(2);
  });

  it('pauses on hover, focus and hidden tabs', () => {
    render(<HeroFoodCarousel />);
    const region = screen.getByRole('region');
    fireEvent.pointerEnter(region, { pointerType: 'mouse' }); tick(); active(1);
    fireEvent.pointerLeave(region); tick(); active(2);
    fireEvent.focus(screen.getByLabelText('Show dish 2')); tick(); active(2);
    fireEvent.blur(screen.getByLabelText('Show dish 2')); tick(); active(3);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange')); tick(); active(3);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange')); tick(); active(1);
    hidden.mockRestore();
  });

  it.each(['mouse', 'touch'])('supports %s dragging without treating scrolling or clicks as swipes', pointerType => {
    const { container } = render(<HeroFoodCarousel />);
    const stage = container.querySelector('.hero-food-stage')!;
    stage.setPointerCapture = vi.fn();
    stage.hasPointerCapture = vi.fn(() => true);
    stage.releasePointerCapture = vi.fn();
    const pointer = { pointerId: 1, pointerType, isPrimary: true, button: 0 };
    const down = (x: number, y: number) => fireEvent.pointerDown(stage, { ...pointer, clientX: x, clientY: y });
    const up = (x: number, y: number) => fireEvent.pointerUp(stage, { ...pointer, clientX: x, clientY: y });
    down(250, 100); tick(); active(1);
    up(100, 110); active(2);
    down(100, 100); up(110, 250); active(2);
    down(100, 100); up(250, 110); active(1);
    down(100, 100); up(102, 100); active(1);
    down(250, 100); fireEvent.pointerCancel(stage, pointer); up(100, 100); active(1);
    tick(); active(2);
    expect(stage.setPointerCapture).toHaveBeenCalledWith(1);
  });
});
