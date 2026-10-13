import { render, screen, fireEvent } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { DraftCartReview } from '@/features/concierge/DraftCartReview'
import type { ConciergeV2Draft } from '@contracts/concierge-v2'
const draft: ConciergeV2Draft = { draft_id: 'draft', version: 4, review_state: 'ready_for_review', subtotal_vnd: 200000, exported_version: null,
  blocked_items: [], items: [{ line_id: 'line', menu_item_id: 'beef', quantity: 2, note: 'Ít cay', unit_price_vnd: 100000 }] }
it('focuses review, emits exact quantity edits and hands off only through an explicit button', () => {
  const edit = vi.fn(); const handoff = vi.fn()
  render(<DraftCartReview draft={draft} names={{ beef: 'Bò nướng' }} busy={false} onEdit={edit} onReview={vi.fn()} onAcceptPrices={vi.fn()} onHandoff={handoff} />)
  expect(screen.getByRole('heading', { name: 'Món đã chọn' })).toHaveFocus()
  expect(handoff).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '3' } })
  expect(edit).toHaveBeenCalledWith({ type: 'set_quantity', line_id: 'line', quantity: 3 })
  fireEvent.click(screen.getByRole('button', { name: 'Chuyển vào giỏ hàng' }))
  expect(handoff).toHaveBeenCalledTimes(1)
})
it('keeps blocked item and price confirmation visible without offering handoff', () => {
  const accept = vi.fn()
  render(<DraftCartReview draft={{ ...draft, review_state: 'building', blocked_items: [{ line_id: 'line', menu_item_id: 'beef', reason: 'PRICE_CHANGED', message: 'Giá mới 120.000 đ' }] }}
    names={{ beef: 'Bò nướng' }} busy={false} onEdit={vi.fn()} onReview={vi.fn()} onAcceptPrices={accept} onHandoff={vi.fn()} />)
  expect(screen.getByText('Bò nướng')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Chuyển vào giỏ hàng' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Đồng ý giá mới' }))
  expect(accept).toHaveBeenCalledOnce()
})
