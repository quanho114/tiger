import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConciergeChatView } from '@/features/concierge/components/ConciergeChatView'
import type { UseConciergeReturn } from '@/features/concierge/useConcierge'

const fixture = vi.hoisted(() => ({ session: {} as UseConciergeReturn }))
vi.mock('@/features/concierge/ConciergeProvider', () => ({ useConciergeSession: () => fixture.session }))
vi.mock('@/features/cart', () => ({ useCart: () => ({ context: { mode: 'delivery' } }) }))
beforeEach(() => {
  fixture.session = { draft: null, retryText: '', messages: [], isLoading: false, activity: null, streamingText: '',
    error: null, warnings: [], suggestedActions: [], viewedMenuItemId: null, hasPendingAction: false,
    stopResponse: vi.fn(), retryPendingAction: vi.fn(), sendMessage: vi.fn(), sendAction: vi.fn(),
    resetConversation: vi.fn(), dismissError: vi.fn(), mutateDraft: vi.fn() } as unknown as UseConciergeReturn
})
afterEach(() => vi.useRealTimers())

it('keeps the same assistant bubble through pending and completed presentation', () => {
  vi.useFakeTimers()
  fixture.session.isLoading = true
  fixture.session.messages = [{ id: 'reply', sender: 'concierge', text: '', delivery: 'pending', timestamp: '' }]
  const { container, rerender } = render(<ConciergeChatView />)
  const bubble = container.querySelector('[data-message-id="reply"]')
  fireEvent.click(screen.getByRole('button', { name: 'Dừng phản hồi' }))
  expect(fixture.session.stopResponse).toHaveBeenCalledOnce()
  fixture.session.isLoading = false
  fixture.session.messages = [{ id: 'reply', sender: 'concierge', text: 'Chào bạn nhé!', delivery: 'complete', timestamp: '' }]
  rerender(<ConciergeChatView />)
  act(() => { vi.advanceTimersByTime(40) })
  expect(container.querySelector('[data-message-id="reply"]')).toBe(bubble)
  expect(container.querySelectorAll('[data-message-id="reply"]')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Dừng phản hồi' })).not.toBeInTheDocument()
  expect(bubble).toHaveTextContent('Chào bạn nhé!')
})

it('does not pull readers away from older messages and offers explicit follow', () => {
  const { rerender } = render(<ConciergeChatView />)
  const log = screen.getByRole('log')
  Object.defineProperties(log, { scrollHeight: { configurable: true, value: 1500 }, clientHeight: { configurable: true, value: 300 } })
  log.scrollTop = 100
  fireEvent.scroll(log)
  fixture.session.messages = [{ id: 'reply', sender: 'concierge', text: 'Mời bạn xem thông tin.', timestamp: '' }]
  rerender(<ConciergeChatView />)
  expect(log.scrollTop).toBe(100)
  fireEvent.click(screen.getByRole('button', { name: 'Có phản hồi mới' }))
  expect(log.scrollTop).toBe(1500)
  expect(screen.queryByRole('button', { name: 'Có phản hồi mới' })).not.toBeInTheDocument()
})

it('never activates uncompleted card previews and retries only through explicit controls', () => {
  fixture.session.messages = [{ id: 'reply', sender: 'concierge', text: '', delivery: 'pending', timestamp: '',
    cards: [{ type: 'service_link', destination: 'cart' }] }]
  fixture.session.retryText = 'Xem món ăn'
  fixture.session.hasPendingAction = true
  render(<ConciergeChatView />)
  expect(screen.queryByRole('link', { name: /giỏ hàng/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại yêu cầu trước' }))
  expect(fixture.session.sendMessage).toHaveBeenCalledWith('Xem món ăn')
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại thao tác trước' }))
  expect(fixture.session.retryPendingAction).toHaveBeenCalledOnce()
})
