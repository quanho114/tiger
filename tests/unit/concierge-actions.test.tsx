import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConciergeChatView } from '@/features/concierge/components/ConciergeChatView'
import type { ConciergeCard, ConciergeResponseEnvelope } from '@/features/concierge/types'

const api = vi.hoisted(() => ({ chat: vi.fn(), action: vi.fn() }))
vi.mock('@/features/concierge/api', () => ({ sendConciergeChat: api.chat, sendConciergeAction: api.action, sendConciergeFeedback: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } }))
vi.mock('@/store/cart', () => ({ useCart: () => ({ add: vi.fn(), setCartOpen: vi.fn() }) }))
const quote: ConciergeCard = { type: 'order_quote', quote_token: 'secret', quote_version: 1, expires_at: new Date(Date.now() + 600000).toISOString(), order_type: 'delivery', items: [], subtotal_vnd: 100, shipping_fee_vnd: 0, total_vnd: 100 }
const reservation: ConciergeCard = { type: 'reservation_summary', customer_name: 'Anh Nam', phone: '0901234567', guest_count: 4, starts_at_iso: '2026-09-20T12:00:00Z', starts_at_formatted: '19:00 20/09', disclaimer: 'Vui lòng kiểm tra', hold_token: 'hold' }
const envelope = (cards: ConciergeCard[]): ConciergeResponseEnvelope => ({ conversation_id: 'c', session_token: 's', state_version: 2, intent: 'order', current_step: 'ORDERING_QUOTED', message: 'Kiểm tra thông tin', cards, suggested_actions: [], warnings: [], references: [] })
async function open(cards: ConciergeCard[]) {
  api.chat.mockResolvedValue(envelope(cards))
  render(<ConciergeChatView />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Tư vấn mâm 2 người lớn' })[0])
  await screen.findByText('Kiểm tra thông tin')
}
beforeEach(() => { vi.clearAllMocks(); Element.prototype.scrollIntoView = vi.fn() })
describe('Concierge explicit actions', () => {
  it('adds only the selected proposal with the exact cart action and retires it after the reply', async () => {
    const proposal: Extract<ConciergeCard, { type: 'meal_recommendation' }>['proposal'] = {
      id: 'proposal-1', version: 1, title: 'Mâm ăn', description: '', concept_tag: 'balanced_harmony',
      items: [], subtotal_vnd: 100, serving_summary: '4 người', created_at: '', expires_at: '',
      validation: { status: 'PASS', checks: [], subtotal_vnd: 100, assumptions: [], warnings: [], validated_at: '', version: 1,
        coverage: { target_equivalent_adults: 4, protein_coverage_ratio: 1, carb_coverage_ratio: 1, vegetable_coverage_ratio: 1, soup_coverage_ratio: 1, overall_fit_score: 1, is_sufficient: true, gaps: [] } },
    }
    api.action.mockResolvedValue({ ...envelope([]), message: 'Đã thêm vào giỏ' })
    await open([{ type: 'meal_recommendation', proposal }])
    expect(api.action).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Thêm mâm này vào giỏ/ }))
    await screen.findByText('Đã thêm vào giỏ')
    expect(api.action).toHaveBeenCalledWith({ conversation_id: 'c', session_token: 's', state_version: 2, action: { type: 'add_proposal_to_cart', proposal_id: 'proposal-1', accept_price_change: false } })
    expect(screen.getByRole('button', { name: /Thêm mâm này vào giỏ/ })).toBeDisabled()
  })
  it('retires a confirmed quote even when the successful response has no replacement card', async () => {
    let resolve!: (value: ConciergeResponseEnvelope) => void
    api.action.mockReturnValue(new Promise((yes) => { resolve = yes }))
    await open([quote])
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đặt đơn' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Đang gửi xác nhận...' })).toBeDisabled()
    await act(async () => resolve({ ...envelope([]), message: 'Đã nhận yêu cầu' }))
    expect(screen.getByRole('button', { name: 'Xác nhận đặt đơn' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it.each([['quote', quote, 'Xác nhận đặt đơn'], ['reservation', reservation, 'Xác nhận thông tin đặt bàn']] as const)('keeps %s confirmation pending and exposes failure without claiming success', async (_, card, label) => {
    let reject!: (error: Error) => void
    api.action.mockReturnValue(new Promise((_, no) => { reject = no }))
    await open([card])
    expect(api.action).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: label }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Đang gửi xác nhận...' })).toBeDisabled()
    await act(async () => reject(new Error('Mất kết nối')))
    expect(screen.getByRole('button', { name: label })).toBeEnabled()
    expect(screen.getByRole('alert')).toHaveTextContent('Chưa thể xác nhận')
    expect(api.action.mock.calls[0][0].action).toEqual(card.type === 'order_quote' ? { type: 'confirm_quote', quote_token: 'secret' } : { type: 'confirm_reservation', hold_token: 'hold', reservation_details: { customer_name: 'Anh Nam', phone: '0901234567', guest_count: 4, starts_at_iso: '2026-09-20T12:00:00Z', note: undefined } })
  })
  it('disables historical quote, reservation and clarification after a newer reply', async () => {
    await open([quote, reservation, { type: 'clarification_choices', question: 'Số khách?', choices: [{ label: 'Bốn người', field: 'headcount', value: '4' }] }])
    api.chat.mockResolvedValue({ ...envelope([]), message: 'Thông tin mới' })
    fireEvent.change(screen.getByPlaceholderText(/Hỏi món/), { target: { value: 'Đổi yêu cầu' } })
    fireEvent.submit(screen.getByPlaceholderText(/Hỏi món/).closest('form')!)
    await screen.findByText('Thông tin mới')
    for (const name of ['Xác nhận đặt đơn', 'Xác nhận thông tin đặt bàn', 'Bốn người']) expect(screen.getByRole('button', { name })).toBeDisabled()
    expect(api.action).not.toHaveBeenCalled()
  })
  it('uses exact typed clarification fields, not the displayed label', async () => {
    api.action.mockResolvedValue(envelope([]))
    await open([{ type: 'clarification_choices', question: 'Số khách?', choices: [{ label: 'confirm_quote', field: 'headcount', value: '4' }] }])
    fireEvent.click(screen.getByRole('button', { name: 'confirm_quote' }))
    await waitFor(() => expect(api.action).toHaveBeenCalledWith({ conversation_id: 'c', session_token: 's', state_version: 2, action: { type: 'answer_clarification', choice_field: 'headcount', choice_value: '4' } }))
  })
  it('shows customer review details without security jargon', async () => {
    await open([quote, reservation])
    expect(screen.getByText('Anh Nam')).toBeVisible()
    expect(screen.queryByText(/HMAC|Token:/)).not.toBeInTheDocument()
  })
})
