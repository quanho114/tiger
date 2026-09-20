import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDineInOrder } from '@/features/ordering/dine-in/useDineInOrder'
import * as api from '@/features/ordering/dine-in/api'
import { ApiError } from '@/lib/api/types'
import type { DineInOrderReceipt, DineInQuoteResponse } from '@/features/ordering/dine-in/types'

vi.mock('@/features/ordering/dine-in/api', () => ({
  requestDineInQuote: vi.fn(),
  submitDineInOrder: vi.fn(),
}))

describe('Dine-In Order Workflow & Idempotency (Invariant V24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('performs two-step quote generation and assigns an idempotency key', async () => {
    const mockQuoteRes: DineInQuoteResponse = {
      quote_token: 'signed-quote-token-xyz',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 0,
      total_vnd: 240000,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      items: [
        {
          menu_item_id: 'dish-1',
          item_name: 'Gà Hấp Nước Mắm Nhĩ',
          quantity: 1,
          unit_price_vnd: 240000,
          line_total_vnd: 240000,
        },
      ],
    }

    vi.mocked(api.requestDineInQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDineInOrder())

    let quoteRes
    await act(async () => {
      quoteRes = await result.current.getQuote(
        [{ menu_item_id: 'dish-1', quantity: 1 }],
        'valid-visit-capability-token'
      )
    })

    expect(quoteRes).toEqual(mockQuoteRes)
    expect(result.current.quote).toEqual(mockQuoteRes)
    expect(result.current.idempotencyKey).toMatch(/^idemp-dinein-/)
    expect(api.requestDineInQuote).toHaveBeenCalledWith({
      order_type: 'dine_in',
      visit_capability: 'valid-visit-capability-token',
      items: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })
  })

  it('retains the EXACT same idempotency key across order submission failures (retries)', async () => {
    const mockQuoteRes: DineInQuoteResponse = {
      quote_token: 'signed-quote-token-xyz',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 0,
      total_vnd: 240000,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      items: [
        {
          menu_item_id: 'dish-1',
          item_name: 'Món 1',
          quantity: 1,
          unit_price_vnd: 240000,
          line_total_vnd: 240000,
        },
      ],
    }
    vi.mocked(api.requestDineInQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDineInOrder())

    // 1. Get quote
    await act(async () => {
      await result.current.getQuote([{ menu_item_id: 'dish-1', quantity: 1 }], 'cap-token')
    })
    const assignedKey = result.current.idempotencyKey
    expect(assignedKey).toBeDefined()

    // 2. Submit order fails (e.g. network timeout)
    vi.mocked(api.submitDineInOrder).mockRejectedValueOnce(new Error('Network timeout'))

    await act(async () => {
      const receipt = await result.current.submitOrder('Ghi chú món')
      expect(receipt).toBeNull()
    })

    expect(result.current.orderError).toContain('Lỗi kết nối mạng')
    // Key MUST be retained for retry
    expect(result.current.idempotencyKey).toBe(assignedKey)
    expect(api.submitDineInOrder).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.submitDineInOrder).mock.calls[0][1]).toBe(assignedKey)

    // 3. Retry submission -> success
    const mockReceipt: DineInOrderReceipt = {
      id: 'order-12345',
      code: 'TG-12345678',
      order_type: 'dine_in',
      status: 'pending',
      payment_status: 'unpaid',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 0,
      total_vnd: 240000,
      created_at: new Date().toISOString(),
      table_name: 'Bàn 01',
    }
    vi.mocked(api.submitDineInOrder).mockResolvedValueOnce(mockReceipt)

    let finalReceipt
    await act(async () => {
      finalReceipt = await result.current.submitOrder('Ghi chú món')
    })

    expect(finalReceipt).toEqual(mockReceipt)
    expect(result.current.receipt).toEqual(mockReceipt)
    // Retry MUST have used the exact same idempotency key!
    expect(api.submitDineInOrder).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.submitDineInOrder).mock.calls[1][1]).toBe(assignedKey)

    // Quote cleared, receipt retained
    expect(result.current.quote).toBeNull()
  })

  it('handles expired quote error gracefully and clears invalid quote', async () => {
    const mockQuoteRes: DineInQuoteResponse = {
      quote_token: 'signed-quote-token-expired',
      subtotal_vnd: 100000,
      shipping_fee_vnd: 0,
      total_vnd: 100000,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      items: [
        {
          menu_item_id: 'dish-1',
          item_name: 'Món 1',
          quantity: 1,
          unit_price_vnd: 100000,
          line_total_vnd: 100000,
        },
      ],
    }
    vi.mocked(api.requestDineInQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDineInOrder())

    await act(async () => {
      await result.current.getQuote([{ menu_item_id: 'dish-1', quantity: 1 }], 'cap-token')
    })

    // Fail with QUOTE_EXPIRED ApiError
    vi.mocked(api.submitDineInOrder).mockRejectedValueOnce(
      new ApiError('QUOTE_EXPIRED', 'Bảng giá đã hết hạn', 400, 'req-123')
    )

    await act(async () => {
      await result.current.submitOrder()
    })

    expect(result.current.orderError).toContain('Bảng giá đã hết hạn')
    expect(result.current.quote).toBeNull()
  })
})
