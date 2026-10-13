import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDeliveryOrder } from '@/features/ordering/delivery/useDeliveryOrder'
import { useDineInOrder } from '@/features/ordering/dine-in/useDineInOrder'
import * as deliveryApi from '@/features/ordering/delivery/api'
import * as dineInApi from '@/features/ordering/dine-in/api'
import { publicApi } from '@/shared/lib/api/client'
import { ApiError } from '@/shared/lib/api/types'
import { readPendingCheckout } from '@/features/ordering/pendingCheckout'

vi.mock('@/features/ordering/delivery/api', () => ({ requestDeliveryQuote: vi.fn(), submitDeliveryOrder: vi.fn() }))
vi.mock('@/features/ordering/dine-in/api', () => ({ requestDineInQuote: vi.fn(), submitDineInOrder: vi.fn() }))
vi.mock('@/shared/lib/api/client', () => ({ publicApi: { post: vi.fn() }, customerApi: { post: vi.fn() } }))

const items = [{ menu_item_id: 'dish-1', quantity: 1 }]
const quote = {
  quote_token: 'signed-quote', expires_at: new Date(Date.now() + 300000).toISOString(),
  subtotal_vnd: 150000, shipping_fee_vnd: 0, total_vnd: 150000,
  items: [{ ...items[0], unit_price_vnd: 150000, line_total_vnd: 150000 }],
}
const receipt = { id: 'order-1', code: 'TG-1', status: 'pending' as const, payment_status: 'unpaid' as const,
  subtotal_vnd: 150000, shipping_fee_vnd: 0, total_vnd: 150000, created_at: new Date().toISOString() }

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  vi.mocked(deliveryApi.requestDeliveryQuote).mockResolvedValue(quote)
  vi.mocked(dineInApi.requestDineInQuote).mockResolvedValue(quote)
})
afterEach(() => vi.restoreAllMocks())

describe.each(['delivery', 'dine_in'] as const)('%s checkout recovery', (mode) => {
  const submitApi = mode === 'delivery' ? deliveryApi.submitDeliveryOrder : dineInApi.submitDineInOrder
  const quoteApi = mode === 'delivery' ? deliveryApi.requestDeliveryQuote : dineInApi.requestDineInQuote
  const useCheckout = mode === 'delivery' ? () => {
    const order = useDeliveryOrder()
    return { ...order, prepare: () => order.getQuote(items, 'zone-1'), fill: () => {
      order.setFormField('customerName', 'Khach Test')
      order.setFormField('customerPhone', '0901234567')
      order.setFormField('address', '17 Duong So 1')
      order.setFormField('deliveryZoneId', 'zone-1')
    } }
  } : () => {
    const order = useDineInOrder()
    return { ...order, prepare: () => order.getQuote(items, 'visit-capability'), fill: () => {} }
  }

  async function start() {
    const hook = renderHook(() => useCheckout())
    act(() => hook.result.current.fill())
    await act(async () => { await hook.result.current.prepare() })
    return hook
  }

  it('recovers a committed receipt after a lost response and reload without submitting another order', async () => {
    const first = await start()
    vi.mocked(submitApi).mockRejectedValueOnce(new Error('Network timeout'))
    await act(async () => { await first.result.current.submitOrder() })
    const pending = readPendingCheckout(mode)!
    expect(pending.key).toBe(vi.mocked(submitApi).mock.calls[0][1])
    expect(Object.keys(pending).sort()).toEqual(['claimSecret', 'createdAt', 'key'])
    expect(localStorage.length).toBe(0)
    first.unmount()

    const recoveredReceipt = { ...receipt, order_type: mode }
    vi.mocked(publicApi.post).mockResolvedValueOnce({ data: { receipt: recoveredReceipt }, requestId: 'recovery' })
    const second = renderHook(() => useCheckout())
    await act(async () => { await second.result.current.prepare() })
    expect(second.result.current.receipt).toEqual(recoveredReceipt)
    expect(publicApi.post).toHaveBeenCalledWith('/orders/recover', {
      idempotency_key: pending.key, claim_secret: pending.claimSecret,
    })
    expect(submitApi).toHaveBeenCalledTimes(1)
    expect(quoteApi).toHaveBeenCalledTimes(1)
    expect(readPendingCheckout(mode)).toBeNull()
  })

  it('retains both credentials when no receipt is found and the quote is refreshed after reload', async () => {
    const first = await start()
    vi.mocked(submitApi).mockRejectedValue(new Error('Network timeout'))
    await act(async () => { await first.result.current.submitOrder() })
    const pending = readPendingCheckout(mode)!
    first.unmount()
    vi.mocked(publicApi.post).mockResolvedValue({ data: { receipt: null }, requestId: 'recovery' })
    const second = await start()
    act(() => second.result.current.resetQuote())
    await act(async () => { await second.result.current.prepare() })
    await act(async () => { await second.result.current.submitOrder() })
    expect(vi.mocked(submitApi).mock.calls[1][1]).toBe(pending.key)
    expect(vi.mocked(submitApi).mock.calls[1][0].claim_secret).toBe(pending.claimSecret)
    expect(readPendingCheckout(mode)).toEqual(pending)
  })

  it('blocks a new quote when recovery cannot reach the server', async () => {
    const first = await start()
    vi.mocked(submitApi).mockRejectedValue(new Error('Network timeout'))
    await act(async () => { await first.result.current.submitOrder() })
    first.unmount()
    vi.mocked(publicApi.post).mockRejectedValue(new Error('Network timeout'))
    const second = renderHook(() => useCheckout())
    await act(async () => { await second.result.current.prepare() })
    expect(second.result.current.quote).toBeNull()
    expect(second.result.current.quoteError).toBeTruthy()
    expect(quoteApi).toHaveBeenCalledTimes(1)
    expect(readPendingCheckout(mode)).not.toBeNull()
  })

  it('clears a definitively rejected first attempt, but preserves an ambiguous older attempt', async () => {
    const hook = await start()
    vi.mocked(submitApi).mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'invalid', 422, 'request'))
    await act(async () => { await hook.result.current.submitOrder() })
    expect(readPendingCheckout(mode)).toBeNull()
    vi.mocked(submitApi).mockRejectedValueOnce(new Error('Network timeout'))
    await act(async () => { await hook.result.current.submitOrder() })
    const pending = readPendingCheckout(mode)
    vi.mocked(submitApi).mockRejectedValueOnce(new ApiError('VALIDATION_ERROR', 'invalid', 422, 'request'))
    await act(async () => { await hook.result.current.submitOrder() })
    expect(readPendingCheckout(mode)).toEqual(pending)
  })

  it('does not send concurrent duplicate submissions', async () => {
    const hook = await start()
    vi.mocked(submitApi).mockRejectedValue(new Error('Network timeout'))
    await act(async () => { await Promise.all([hook.result.current.submitOrder(), hook.result.current.submitOrder()]) })
    expect(submitApi).toHaveBeenCalledTimes(1)
  })

  it('does not send an order when browser storage cannot retain the recovery credentials', async () => {
    const hook = await start()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    await act(async () => { await hook.result.current.submitOrder() })
    expect(submitApi).not.toHaveBeenCalled()
    expect(hook.result.current.orderError).toContain('lưu trạng thái')
    expect(hook.result.current.isSubmittingOrder).toBe(false)
  })

  it('does not silently replace an unresolved key beyond the server retention period', async () => {
    const hook = await start()
    vi.mocked(submitApi).mockRejectedValue(new Error('Network timeout'))
    await act(async () => { await hook.result.current.submitOrder() })
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 25 * 60 * 60 * 1000)
    await act(async () => { await hook.result.current.submitOrder() })
    expect(submitApi).toHaveBeenCalledTimes(1)
    expect(hook.result.current.orderError).toContain('liên hệ nhà hàng')
  })
})
