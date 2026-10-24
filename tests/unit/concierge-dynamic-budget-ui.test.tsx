import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConciergeChatView } from '@/features/concierge/components/ConciergeChatView'
import type { UseConciergeReturn } from '@/features/concierge/useConcierge'
import type { ConciergeCard } from '@/features/concierge/types'
import type { ConciergeV2MenuCandidate } from '@contracts/concierge-v2'

// Offline presentation tests only: every reply/card is a fresh synthetic fixture.
// No real provider, browser account, cart, HTTP request, or database is used.
const fixture = vi.hoisted(() => ({ session: {} as UseConciergeReturn }))
vi.mock('@/features/concierge/ConciergeProvider', () => ({ useConciergeSession: () => fixture.session }))
vi.mock('@/features/cart', () => ({ useCart: () => ({ context: { mode: 'delivery' }, setCartOpen: vi.fn() }) }))

beforeEach(() => {
  fixture.session = {
    draft: null, retryText: '', messages: [], isLoading: false, activity: null, streamingText: '',
    error: null, warnings: [], suggestedActions: [], viewedMenuItemId: null, hasPendingAction: false,
    stopResponse: vi.fn(), retryPendingAction: vi.fn(), sendMessage: vi.fn(), sendAction: vi.fn(),
    resetConversation: vi.fn(), dismissError: vi.fn(), mutateDraft: vi.fn(),
  } as unknown as UseConciergeReturn
})
afterEach(cleanup)

function menuItem(index: number, overrides: Partial<ConciergeV2MenuCandidate> = {}): ConciergeV2MenuCandidate {
  return {
    id: `10000000-0000-0001-0000-${String(index).padStart(12, '0')}`,
    name: `Món thử ${index}`, price_vnd: 100_000, pricing_mode: 'fixed',
    is_signature: false, is_available: true, safety_state: 'allergen_unknown',
    provenance: 'catalog:synthetic-ui-fixture', tags: [], ...overrides,
  }
}

function mealPlan(items: ConciergeV2MenuCandidate[], overrides: Partial<Extract<ConciergeCard, { type: 'meal_plan' }>> = {}): Extract<ConciergeCard, { type: 'meal_plan' }> {
  const totalMin = items.reduce((sum, item) => sum + (item.price_min ?? item.price_vnd), 0)
  const totalMax = items.reduce((sum, item) => sum + (item.price_max ?? item.price_vnd), 0)
  return {
    type: 'meal_plan', plan_id: '20000000-0000-4000-8000-000000000001',
    lines: items.map((item, index) => ({ item, quantity: 1, suggestion_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })),
    subtotal_vnd: totalMax, subtotal_min_vnd: totalMin, subtotal_max_vnd: totalMax,
    total_min_vnd: totalMin, total_max_vnd: totalMax,
    validation_status: 'WARNING', budget_status: 'conditional',
    orderable_exact: items.every(item => item.pricing_mode === 'fixed'), warnings: [], ...overrides,
  }
}

function showCards(cards: ConciergeCard[]) {
  fixture.session.messages = [{ id: 'synthetic-reply', sender: 'concierge', text: '', timestamp: '', cards }]
  return render(<ConciergeChatView />)
}

describe('dynamic budget recommendation cards — mocked presentation, not runtime acceptance', () => {
  it('shows range line and subtotal bounds, unknown-fee qualification, and prevents accepting an unpriced meal', () => {
    const range = menuItem(1, { name: 'Gà thử giá khoảng', price_vnd: 280_000, pricing_mode: 'range', price_min: 280_000, price_max: 300_000 })
    const card = mealPlan([range], { orderable_exact: false })
    showCards([card])

    const line = screen.getByRole('listitem')
    expect(line).toHaveTextContent('1 × Gà thử giá khoảng · 280.000 đ – 300.000 đ/phần')
    expect(screen.getByText('Tạm tính món: 280.000 đ – 300.000 đ')).toBeVisible()
    expect(screen.getByText('Chưa xác định đầy đủ phí bắt buộc; chưa bảo đảm tổng hóa đơn cuối cùng.')).toBeVisible()
    expect(screen.getByText('Đây là dự toán khoảng giá, chưa phải giá đặt món đã chốt.')).toBeVisible()

    const accept = screen.getByRole('button', { name: 'Chọn cả mâm vào giỏ nháp' })
    expect(accept).toBeDisabled()
    fireEvent.click(accept)
    expect(fixture.session.sendAction).not.toHaveBeenCalled()
    expect(fixture.session.mutateDraft).not.toHaveBeenCalled()
  })

  it('allows explicit acceptance of the latest exact-price plan with all server suggestion IDs', () => {
    const card = mealPlan([menuItem(1), menuItem(2)], { orderable_exact: true })
    showCards([card])

    const accept = screen.getByRole('button', { name: 'Chọn cả mâm vào giỏ nháp' })
    expect(accept).toBeEnabled()
    expect(fixture.session.sendAction).not.toHaveBeenCalled()
    fireEvent.click(accept)
    expect(fixture.session.sendAction).toHaveBeenCalledExactlyOnceWith({
      type: 'accept_meal_plan', plan_id: card.plan_id,
      suggestion_ids: card.lines.map(line => line.suggestion_id),
    })
    expect(fixture.session.mutateDraft).not.toHaveBeenCalled()
  })

  it('renders a dynamic six-dish plan without truncating lines or the acceptance payload', () => {
    const card = mealPlan(Array.from({ length: 6 }, (_, index) => menuItem(index + 1)))
    showCards([card])

    const lines = screen.getAllByRole('listitem')
    expect(lines).toHaveLength(6)
    card.lines.forEach((line, index) => expect(lines[index]).toHaveTextContent(`1 × ${line.item.name}`))
    expect(screen.getByText('Tạm tính món: 600.000 đ')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Chọn cả mâm vào giỏ nháp' }))
    expect(fixture.session.sendAction).toHaveBeenCalledExactlyOnceWith({
      type: 'accept_meal_plan', plan_id: card.plan_id,
      suggestion_ids: card.lines.map(line => line.suggestion_id),
    })
  })

  it('keeps a range draft suggestion informative but disables its add-to-draft action', () => {
    showCards([{ type: 'draft_suggestion', suggestion_id: '30000000-0000-4000-8000-000000000001',
      item: menuItem(1, { pricing_mode: 'range', price_min: 100_000, price_max: 150_000 }) }])

    expect(screen.getByText('100.000 đ – 150.000 đ')).toBeVisible()
    const add = screen.getByRole('button', { name: 'Chọn vào giỏ nháp' })
    expect(add).toBeDisabled()
    fireEvent.click(add)
    expect(fixture.session.mutateDraft).not.toHaveBeenCalled()
  })

  it('shows bestseller badges only for authoritative true flags, not signature or marketing tags', () => {
    const verified = menuItem(1, { name: 'Món có cờ thật', is_bestseller: true })
    const signature = menuItem(2, { name: 'Món đặc trưng', is_signature: true, is_bestseller: false, tags: ['best seller'] })
    const missing = menuItem(3, { name: 'Món chưa xác minh', is_signature: true, tags: ['bán chạy'] })
    showCards([verified, signature, missing].map((item, index) => ({ type: 'draft_suggestion' as const,
      item, suggestion_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` })))

    expect(screen.getAllByText('Món bán chạy theo thực đơn')).toHaveLength(1)
    const verifiedCard = screen.getByText('Món có cờ thật').parentElement!
    const signatureCard = screen.getByText('Món đặc trưng').parentElement!
    const missingCard = screen.getByText('Món chưa xác minh').parentElement!
    expect(within(verifiedCard).getByText('Món bán chạy theo thực đơn')).toBeVisible()
    expect(within(signatureCard).queryByText('Món bán chạy theo thực đơn')).toBeNull()
    expect(within(missingCard).queryByText('Món bán chạy theo thực đơn')).toBeNull()
  })

  it('uses bestseller flags, not signature/tags, for badges on meal-plan lines too', () => {
    showCards([mealPlan([
      menuItem(1, { is_bestseller: true }),
      menuItem(2, { is_bestseller: false, is_signature: true, tags: ['best seller'] }),
      menuItem(3, { is_signature: true, tags: ['bán chạy'] }),
    ])])
    const lines = screen.getAllByRole('listitem')
    expect(lines[0]).toHaveTextContent('· Bán chạy')
    expect(lines[1]).not.toHaveTextContent('Bán chạy')
    expect(lines[2]).not.toHaveTextContent('Bán chạy')
  })
})
