import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAdminOrders } from '@/features/admin/orders/api'
import { useAdminOrders } from '@/features/admin/orders/useAdminOrders'

const get = vi.hoisted(() => vi.fn())
vi.mock('@/shared/lib/api/client', () => ({ adminApi: { get } }))

beforeEach(() => { get.mockReset() })

describe('admin order list data boundary', () => {
  it('encodes filters and pagination without leaking URL syntax from the search term', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0 } })
    await fetchAdminOrders({ type: 'delivery', status: 'pending', search: 'A&B + C', page: 2 })
    const url = new URL(get.mock.calls[0][0], 'http://localhost')
    expect(url.pathname).toBe('/orders')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '50', offset: '100', order_type: 'delivery', status: 'pending', search: 'A&B + C',
    })
  })

  it('keeps the newest filter result when an older request finishes later', async () => {
    let rejectOld!: (error: Error) => void
    let resolveNew!: (value: unknown) => void
    get.mockReturnValueOnce(new Promise((_, reject) => { rejectOld = reject }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve }))
    const { result, rerender } = renderHook(
      ({ search }) => useAdminOrders({ type: 'all', status: 'all', search, page: 0 }, 0),
      { initialProps: { search: 'old' } },
    )
    rerender({ search: 'new' })
    await act(async () => { resolveNew({ data: { items: [{ id: 'new' }], total: 1 } }) })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { rejectOld(new Error('Old request failed')) })
    expect(result.current.orders).toEqual([{ id: 'new' }])
    expect(result.current.total).toBe(1)
    expect(result.current.error).toBeNull()
  })
})
