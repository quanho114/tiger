import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAdminOrders, type OrderFilters } from './api'
import type { AdminOrderSummary } from '../types'

export function useAdminOrders({ type, status, search, page }: OrderFilters, refreshKey: number) {
  const [orders, setOrders] = useState<AdminOrderSummary[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestSequence = useRef(0)

  const loadOrders = useCallback(async () => {
    const sequence = ++requestSequence.current
    try {
      setIsLoading(true)
      setError(null)
      const result = await fetchAdminOrders({ type, status, search, page })
      if (sequence === requestSequence.current) {
        setOrders(result.items)
        setTotal(result.total)
      }
    } catch (err: unknown) {
      if (sequence === requestSequence.current) {
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách đơn hàng')
      }
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false)
    }
  }, [type, status, search, page])

  useEffect(() => {
    void loadOrders()
    return () => {
      requestSequence.current += 1
    }
  }, [loadOrders, refreshKey])

  return { orders, total, isLoading, error, loadOrders }
}
