import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDeliveryOrder } from '@/features/ordering/delivery/useDeliveryOrder'
import * as api from '@/features/ordering/delivery/api'
import { ApiError } from '@/lib/api/types'
import type { DeliveryOrderReceipt, DeliveryQuoteResponse } from '@/features/ordering/delivery/types'

vi.mock('@/features/ordering/delivery/api', () => ({
  requestDeliveryQuote: vi.fn(),
  submitDeliveryOrder: vi.fn(),
}))

describe('Delivery Order Workflow & Invariants (T11, V10, V13, V14, V24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('validates form fields and rejects submission when inputs are incomplete', async () => {
    const { result } = renderHook(() => useDeliveryOrder())

    let isValid = false
    act(() => {
      isValid = result.current.validateForm()
    })

    expect(isValid).toBe(false)
    expect(result.current.fieldErrors.customerName).toBeDefined()
    expect(result.current.fieldErrors.customerPhone).toBeDefined()
    expect(result.current.fieldErrors.address).toBeDefined()
    expect(result.current.fieldErrors.deliveryZoneId).toBeDefined()
  })

  it('validates Vietnamese phone format strictly (10 digits starting with 0)', () => {
    const { result } = renderHook(() => useDeliveryOrder())

    act(() => {
      result.current.setFormField('customerName', 'Nguyễn Văn A')
      result.current.setFormField('customerPhone', '12345')
      result.current.setFormField('address', '17 Đường Số 1, Vĩnh An')
      result.current.setFormField('deliveryZoneId', '40000000-0000-0000-0000-000000000001')
    })

    let isValid = false
    act(() => {
      isValid = result.current.validateForm()
    })
    expect(isValid).toBe(false)
    expect(result.current.fieldErrors.customerPhone).toContain('Số điện thoại không hợp lệ')

    act(() => {
      result.current.setFormField('customerPhone', '0902809929')
    })
    act(() => {
      isValid = result.current.validateForm()
    })
    expect(isValid).toBe(true)
    expect(result.current.fieldErrors.customerPhone).toBeUndefined()
  })

  it('preserves privacy: never writes customer PII to localStorage (Invariant V13)', () => {
    const { result } = renderHook(() => useDeliveryOrder())

    act(() => {
      result.current.setFormField('customerName', 'Khách VIP')
      result.current.setFormField('customerPhone', '0902809929')
      result.current.setFormField('address', 'Số 50 Đường Đồng Khởi, Vĩnh An')
    })

    expect(localStorage.getItem('customerName')).toBeNull()
    expect(localStorage.getItem('customerPhone')).toBeNull()
    expect(localStorage.getItem('address')).toBeNull()
    expect(localStorage.getItem('tiger_delivery_order')).toBeNull()
  })

  it('performs two-step quote generation and assigns an idempotency key (Invariant V10, V24)', async () => {
    const mockQuoteRes: DeliveryQuoteResponse = {
      quote_token: 'signed-delivery-quote-token-xyz',
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

    vi.mocked(api.requestDeliveryQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDeliveryOrder())

    let quoteRes
    await act(async () => {
      quoteRes = await result.current.getQuote(
        [{ menu_item_id: 'dish-1', quantity: 1 }],
        '40000000-0000-0000-0000-000000000001'
      )
    })

    expect(quoteRes).toEqual(mockQuoteRes)
    expect(result.current.quote).toEqual(mockQuoteRes)
    expect(result.current.idempotencyKey).toMatch(/^idemp-deliv-/)
    expect(api.requestDeliveryQuote).toHaveBeenCalledWith({
      order_type: 'delivery',
      delivery_zone_id: '40000000-0000-0000-0000-000000000001',
      items: [{ menu_item_id: 'dish-1', quantity: 1 }],
    })
  })

  it('retains the EXACT same idempotency key across order submission failures (retries) (Invariant V24)', async () => {
    const mockQuoteRes: DeliveryQuoteResponse = {
      quote_token: 'signed-delivery-quote-token-xyz',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 15000,
      total_vnd: 255000,
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

    vi.mocked(api.requestDeliveryQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDeliveryOrder())

    // 1. Fill form
    act(() => {
      result.current.setFormField('customerName', 'Nguyễn Văn A')
      result.current.setFormField('customerPhone', '0902809929')
      result.current.setFormField('address', '17 Đường Số 1, Vĩnh An')
      result.current.setFormField('deliveryZoneId', '40000000-0000-0000-0000-000000000001')
      result.current.setFormField('orderNote', 'Giao tận cửa giúp em')
    })

    // 2. Get quote
    await act(async () => {
      await result.current.getQuote(
        [{ menu_item_id: 'dish-1', quantity: 1 }],
        '40000000-0000-0000-0000-000000000001'
      )
    })
    const assignedKey = result.current.idempotencyKey
    expect(assignedKey).toBeDefined()

    // 3. First submission attempt fails
    vi.mocked(api.submitDeliveryOrder).mockRejectedValueOnce(new Error('Network drop'))

    await act(async () => {
      const receipt = await result.current.submitOrder()
      expect(receipt).toBeNull()
    })

    expect(result.current.orderError).toContain('Lỗi kết nối mạng')
    // Invariant V24: Key MUST be retained across failure!
    expect(result.current.idempotencyKey).toBe(assignedKey)
    expect(api.submitDeliveryOrder).toHaveBeenCalledTimes(1)
    expect(vi.mocked(api.submitDeliveryOrder).mock.calls[0][1]).toBe(assignedKey)

    // 4. Retry submission succeeds
    const mockReceipt: DeliveryOrderReceipt = {
      id: 'deliv-order-999',
      code: 'TG-DELIV-999',
      order_type: 'delivery',
      status: 'pending',
      payment_status: 'unpaid',
      customer_name: 'Nguyễn Văn A',
      customer_phone: '0902809929',
      address: '17 Đường Số 1, Vĩnh An',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 15000,
      total_vnd: 255000,
      created_at: new Date().toISOString(),
      zone_name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
      note: 'Giao tận cửa giúp em',
    }

    vi.mocked(api.submitDeliveryOrder).mockResolvedValueOnce(mockReceipt)

    let finalReceipt
    await act(async () => {
      finalReceipt = await result.current.submitOrder()
    })

    expect(finalReceipt).toEqual(mockReceipt)
    expect(result.current.receipt).toEqual(mockReceipt)
    expect(api.submitDeliveryOrder).toHaveBeenCalledTimes(2)
    // Retry used the EXACT SAME key!
    expect(vi.mocked(api.submitDeliveryOrder).mock.calls[1][1]).toBe(assignedKey)

    // Succeeded: quote cleared, receipt kept
    expect(result.current.quote).toBeNull()
  })

  it('handles quote expiration (409 QUOTE_EXPIRED) and prompts recalculation (Invariant V10)', async () => {
    const mockQuoteRes: DeliveryQuoteResponse = {
      quote_token: 'expired-token',
      subtotal_vnd: 240000,
      shipping_fee_vnd: 15000,
      total_vnd: 255000,
      expires_at: new Date(Date.now() - 1000).toISOString(),
      items: [
        {
          menu_item_id: 'dish-1',
          quantity: 1,
          unit_price_vnd: 240000,
          line_total_vnd: 240000,
        },
      ],
    }
    vi.mocked(api.requestDeliveryQuote).mockResolvedValueOnce(mockQuoteRes)

    const { result } = renderHook(() => useDeliveryOrder())

    act(() => {
      result.current.setFormField('customerName', 'Nguyễn Văn A')
      result.current.setFormField('customerPhone', '0902809929')
      result.current.setFormField('address', '17 Đường Số 1, Vĩnh An')
      result.current.setFormField('deliveryZoneId', '40000000-0000-0000-0000-000000000001')
    })

    await act(async () => {
      await result.current.getQuote(
        [{ menu_item_id: 'dish-1', quantity: 1 }],
        '40000000-0000-0000-0000-000000000001'
      )
    })

    vi.mocked(api.submitDeliveryOrder).mockRejectedValueOnce(
      new ApiError('QUOTE_EXPIRED', 'Bảng giá đã hết hạn', 409, 'req-test')
    )

    await act(async () => {
      const receipt = await result.current.submitOrder()
      expect(receipt).toBeNull()
    })

    expect(result.current.orderError).toContain('Bảng giá đã hết hạn')
    expect(result.current.quote).toBeNull()
  })
})
