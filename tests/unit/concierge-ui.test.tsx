import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MealRecommendationCard } from '@/features/concierge/components/MealRecommendationCard'
import { MenuItemCard } from '@/features/concierge/components/MenuItemCard'
import { OrderQuoteCard } from '@/features/concierge/components/OrderQuoteCard'
import { ReservationSummaryCard } from '@/features/concierge/components/ReservationSummaryCard'
import { OrderStatusCard } from '@/features/concierge/components/OrderStatusCard'
import { ClarificationChoices } from '@/features/concierge/components/ClarificationChoices'
import type {
  MealRecommendationCardData,
  OrderQuoteCardData,
  ReservationSummaryCardData,
  OrderStatusCardData,
  ClarificationChoicesCardData,
} from '@/features/concierge/types'

describe('Concierge UI Cards', () => {
  describe('MealRecommendationCard', () => {
    const mockProposal: MealRecommendationCardData['proposal'] = {
      id: 'prop-123',
      version: 1,
      title: 'Mâm tiệc bạn bè no ấm',
      description: 'Kết hợp hài hòa gà hấp mắm nhĩ và lẩu cá kèo',
      concept_tag: 'balanced_harmony',
      subtotal_vnd: 520000,
      serving_summary: '4 người lớn',
      validation: {
        status: 'PASS',
        checks: [
          { name: 'availability', status: 'PASS', message: 'Tất cả món đều sẵn sàng' },
          { name: 'budget', status: 'PASS', message: 'Trong ngân sách' },
        ],
        subtotal_vnd: 520000,
        coverage: {
          target_equivalent_adults: 4,
          protein_coverage_ratio: 1.0,
          carb_coverage_ratio: 0.8,
          vegetable_coverage_ratio: 0.7,
          soup_coverage_ratio: 0.5,
          overall_fit_score: 0.85,
          is_sufficient: true,
          gaps: [],
        },
        assumptions: [],
        warnings: [],
        validated_at: new Date().toISOString(),
        version: 1,
      },
      items: [
        {
          menu_item_id: 'item-1',
          item_name: 'Gà Hấp Mắm Nhĩ',
          quantity: 1,
          unit_price_vnd: 240000,
          meal_role: 'Món chính đậm vị',
          serving_size: '1 con',
        },
        {
          menu_item_id: 'item-2',
          item_name: 'Lẩu Cá Kèo Lá Giang',
          quantity: 1,
          unit_price_vnd: 280000,
          meal_role: 'Lẩu canh chua',
          serving_size: 'Nồi vừa',
        },
      ],
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }

    it('renders proposal details, subtotal and enables cart button on PASS', () => {
      const handleAddToCart = vi.fn()
      render(
        <MealRecommendationCard
          proposal={mockProposal}
          onAddToCart={handleAddToCart}
        />
      )

      expect(screen.getByText('Mâm tiệc bạn bè no ấm')).toBeDefined()
      expect(screen.getByText(/520\.000/)).toBeDefined()
      expect(screen.getByText(/Gà Hấp Mắm Nhĩ/)).toBeDefined()
      expect(screen.getByText(/Lẩu Cá Kèo Lá Giang/)).toBeDefined()

      const addButton = screen.getByRole('button', { name: /Thêm mâm này vào giỏ/i })
      expect(addButton).toBeDefined()
      expect((addButton as HTMLButtonElement).disabled).toBe(false)

      fireEvent.click(addButton)
      expect(handleAddToCart).toHaveBeenCalledWith(mockProposal)
    })

    it('disables Add to Cart button when validation status is BLOCKED (allergen or budget hard cap)', () => {
      const blockedProposal: MealRecommendationCardData['proposal'] = {
        ...mockProposal,
        validation: {
          ...mockProposal.validation,
          status: 'BLOCKED',
          warnings: ['Món Gà có chứa đậu phộng theo cảnh báo dị ứng'],
          checks: [
            { name: 'allergen', status: 'BLOCKED', message: 'Chứa đậu phộng gây dị ứng' },
          ],
        },
      }

      render(
        <MealRecommendationCard
          proposal={blockedProposal}
          onAddToCart={vi.fn()}
        />
      )

      const blockedButton = screen.getByRole('button', { name: /Không thể đặt mâm này/i })
      expect((blockedButton as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText(/Món Gà có chứa đậu phộng theo cảnh báo dị ứng/)).toBeDefined()
    })

    it('triggers feedback submission when rating buttons are clicked', async () => {
      const handleFeedback = vi.fn().mockResolvedValue(undefined)
      render(
        <MealRecommendationCard
          proposal={mockProposal}
          onAddToCart={vi.fn()}
          onFeedback={handleFeedback}
        />
      )

      expect(screen.getByText('Đánh giá độ phù hợp của gợi ý:')).toBeDefined()
      const perfectBtn = screen.getByRole('button', { name: /Phù hợp/i })
      expect(perfectBtn).toBeDefined()

      fireEvent.click(perfectBtn)
      expect(handleFeedback).toHaveBeenCalledWith('perfect')
    })
  })

  describe('MenuItemCard', () => {
    it('displays dish name, price and availability', () => {
      render(
        <MenuItemCard
          item={{
            type: 'menu_item',
            id: 'item-10',
            name: 'Heo Rừng Xào Lăn',
            price_vnd: 185000,
            description: 'Thịt heo rừng xào sả ớt nước cốt dừa béo ngậy',
            is_signature: true,
            is_available: true,
            tags: ['heo-rung', 'dac-san'],
          }}
        />
      )

      expect(screen.getByText('Heo Rừng Xào Lăn')).toBeDefined()
      expect(screen.getByText(/185\.000/)).toBeDefined()
      expect(screen.getByText(/Signature/)).toBeDefined()
    })
  })

  describe('OrderQuoteCard', () => {
    const mockQuote: OrderQuoteCardData = {
      type: 'order_quote',
      quote_token: 'valid.hmac.signature.token',
      quote_version: 1,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      order_type: 'delivery',
      subtotal_vnd: 350000,
      shipping_fee_vnd: 25000,
      total_vnd: 375000,
      items: [
        {
          menu_item_id: 'm-1',
          item_name: 'Cơm Chiên Hải Sản',
          quantity: 2,
          unit_price_vnd: 175000,
          line_total_vnd: 350000,
        },
      ],
    }

    it('renders recalculated quote amounts and handles quote confirmation', () => {
      const handleConfirm = vi.fn()
      render(
        <OrderQuoteCard
          quote={mockQuote}
          onConfirmQuote={handleConfirm}
        />
      )

      expect(screen.getByText(/Cơm Chiên Hải Sản/)).toBeDefined()
      expect(screen.getByText(/375\.000/)).toBeDefined()
      expect(screen.getByText(/25\.000/)).toBeDefined()

      const confirmBtn = screen.getByRole('button', { name: /Xác nhận đặt đơn/i })
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(confirmBtn)
      expect(handleConfirm).toHaveBeenCalledWith('valid.hmac.signature.token')
    })
  })

  describe('ReservationSummaryCard', () => {
    const mockRes: ReservationSummaryCardData = {
      type: 'reservation_summary',
      customer_name: 'Anh Nam',
      guest_count: 6,
      starts_at_iso: '2026-09-20T19:00:00+07:00',
      starts_at_formatted: '19:00 - Chủ Nhật, 20/09/2026',
      phone: '0901234567',
      seating_area_name: 'Khu ngoài trời sân vườn',
      disclaimer: 'Bàn được giữ tối đa 15 phút sau giờ hẹn',
    }

    it('renders reservation details and disclaimer', () => {
      const handleConfirm = vi.fn()
      render(
        <ReservationSummaryCard
          reservation={mockRes}
          onConfirmReservation={handleConfirm}
        />
      )

      expect(screen.getByText(/6 người/)).toBeDefined()
      expect(screen.getByText('19:00 - Chủ Nhật, 20/09/2026')).toBeDefined()
      expect(screen.getByText('0901234567')).toBeDefined()
      expect(screen.getByText('Khu ngoài trời sân vườn')).toBeDefined()
      expect(screen.getByText(/Bàn được giữ tối đa 15 phút/)).toBeDefined()

      const confirmBtn = screen.getByRole('button', { name: /Xác nhận thông tin đặt bàn/i })
      fireEvent.click(confirmBtn)
      expect(handleConfirm).toHaveBeenCalled()
    })
  })

  describe('OrderStatusCard', () => {
    const mockStatus: OrderStatusCardData = {
      type: 'order_status',
      order_code: 'TG-2609-0888',
      status: 'CONFIRMED',
      item_count: 3,
      total_vnd: 450000,
      created_at: new Date().toISOString(),
      estimated_delivery_time: '35 - 45 phút',
    }

    it('renders order code, item count and estimated delivery time', () => {
      render(<OrderStatusCard orderStatus={mockStatus} />)

      expect(screen.getByText(/TG-2609-0888/)).toBeDefined()
      expect(screen.getByText('CONFIRMED')).toBeDefined()
      expect(screen.getByText(/3 món/)).toBeDefined()
      expect(screen.getByText(/450\.000/)).toBeDefined()
      expect(screen.getByText('35 - 45 phút')).toBeDefined()
    })
  })

  describe('ClarificationChoices', () => {
    const mockCard: ClarificationChoicesCardData = {
      type: 'clarification_choices',
      question: 'Bạn đang dự định đi bao nhiêu người?',
      choices: [
        { label: '2 người (Cặp đôi)', value: '2', field: 'headcount' },
        { label: '4 người (Gia đình)', value: '4', field: 'headcount' },
        { label: '6+ người (Nhóm đông)', value: '6', field: 'headcount' },
      ],
    }

    it('renders prompt and triggers onSelectChoice with field and value', () => {
      const handleSelect = vi.fn()
      render(
        <ClarificationChoices
          card={mockCard}
          onSelectChoice={handleSelect}
        />
      )

      expect(screen.getByText('Bạn đang dự định đi bao nhiêu người?')).toBeDefined()
      const choiceBtn = screen.getByRole('button', { name: '4 người (Gia đình)' })
      fireEvent.click(choiceBtn)
      expect(handleSelect).toHaveBeenCalledWith('headcount', '4')
    })
  })
})
