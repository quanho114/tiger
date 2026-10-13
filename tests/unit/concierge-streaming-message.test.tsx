import { act, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StreamingMessage } from '@/features/concierge/components/StreamingMessage'
import { segmentText } from '@/features/concierge/presentation'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('segments Vietnamese combining marks and emoji without breaking graphemes', () => {
  expect(segmentText('a\u0301👨‍👩‍👧‍👦')).toEqual(['a\u0301', '👨‍👩‍👧‍👦'])
})

it('progressively presents long verified text while announcing only the complete message', () => {
  vi.useFakeTimers()
  const text = 'Đây là nội dung đã kiểm chứng để trình bày mượt, không phải văn bản chưa được xác nhận từ mô hình.'.repeat(2)
  const { container, rerender } = render(<StreamingMessage text={text} animate complete={false} />)
  act(() => { vi.advanceTimersByTime(80) })
  const visible = container.querySelector('[aria-hidden="true"]')!
  expect(visible.textContent?.length).toBeGreaterThan(0)
  expect(visible.textContent?.length).toBeLessThan(text.length)
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('')
  rerender(<StreamingMessage text={text} animate complete />)
  expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent(text)
  act(() => { vi.advanceTimersByTime(2000) })
  expect(visible.textContent).toBe(text)
  expect(vi.getTimerCount()).toBe(0)
})

it('respects reduced motion and clears timers on unmount', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const text = 'Nội dung đã được xác nhận. '.repeat(8)
  const { unmount, container } = render(<StreamingMessage text={text} animate complete />)
  act(() => { vi.advanceTimersByTime(40) })
  expect(container.querySelector('[aria-hidden="true"]')!.textContent).toBe(text)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
