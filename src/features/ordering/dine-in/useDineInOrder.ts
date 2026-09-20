import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/types'
import { requestDineInQuote, submitDineInOrder } from './api'
import {
  getOrCreateCheckoutClaimSecret,
  storeOrderClaimSecret,
} from '../claims/claimStorage'
import type {
  DineInOrderReceipt,
  DineInQuoteItem,
  DineInQuoteResponse,
} from './types'

function generateIdempotencyKey(): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 12)
  return `idemp-dinein-${timestamp}-${randomStr}`
}

export function useDineInOrder() {
  const [quote, setQuote] = useState<DineInQuoteResponse | null>(null)
  const [isRequestingQuote, setIsRequestingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<DineInOrderReceipt | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  // Retain idempotency key across retries for the same order submission
  const idempotencyKeyRef = useRef<string | null>(null)
  const lastQuoteItemsRef = useRef<DineInQuoteItem[]>([])

  const getQuote = useCallback(
    async (
      items: DineInQuoteItem[],
      visitCapability: string
    ): Promise<DineInQuoteResponse | null> => {
      setIsRequestingQuote(true)
      setQuoteError(null)
      setOrderError(null)

      try {
        const quoteRes = await requestDineInQuote({
          order_type: 'dine_in',
          visit_capability: visitCapability,
          items,
        })

        setQuote(quoteRes)
        lastQuoteItemsRef.current = items
        // Generate new idempotency key for new quote
        const newKey = generateIdempotencyKey()
        idempotencyKeyRef.current = newKey
        setIdempotencyKey(newKey)
        return quoteRes
      } catch (err) {
        setQuote(null)
        if (err instanceof ApiError) {
          if (err.code === 'VISIT_CLOSED') {
            setQuoteError('Bàn đã kết thúc phiên phục vụ hoặc đã đóng. Vui lòng liên hệ nhân viên.')
          } else if (err.code === 'STORE_CLOSED_DINE_IN' || err.code === 'STORE_CLOSED') {
            setQuoteError('Nhà hàng hiện đang tạm dừng nhận đơn gọi món tại bàn.')
          } else if (err.code === 'ITEM_UNAVAILABLE') {
            setQuoteError('Một số món bạn chọn hiện đã hết hoặc không áp dụng tại bàn.')
          } else if (err.code === 'INVALID_VISIT_CAPABILITY') {
            setQuoteError('Mã xác thực bàn không hợp lệ hoặc đã hết hạn.')
          } else {
            setQuoteError(err.message || 'Không thể tính giá đơn món. Vui lòng thử lại.')
          }
        } else {
          setQuoteError('Lỗi kết nối khi tải bảng giá. Vui lòng kiểm tra mạng.')
        }
        return null
      } finally {
        setIsRequestingQuote(false)
      }
    },
    []
  )

  const submitOrder = useCallback(
    async (orderNote?: string): Promise<DineInOrderReceipt | null> => {
      if (!quote) {
        setOrderError('Chưa có thông tin bảng giá. Vui lòng thử lại.')
        return null
      }

      // Ensure we retain the exact same idempotency key on network retries
      if (!idempotencyKeyRef.current) {
        const generated = generateIdempotencyKey()
        idempotencyKeyRef.current = generated
        setIdempotencyKey(generated)
      }
      const key = idempotencyKeyRef.current

      setIsSubmittingOrder(true)
      setOrderError(null)

      try {
        const claimSecret = getOrCreateCheckoutClaimSecret(key)
        const orderReceipt = await submitDineInOrder(
          {
            quote_token: quote.quote_token,
            items: lastQuoteItemsRef.current,
            note: orderNote,
            claim_secret: claimSecret,
          },
          key
        )

        if (orderReceipt?.id) {
          storeOrderClaimSecret(orderReceipt.id, claimSecret)
        }

        setReceipt(orderReceipt)
        setQuote(null)
        // Order succeeded: can reset idempotency key for future new orders
        idempotencyKeyRef.current = null
        setIdempotencyKey(null)
        return orderReceipt
      } catch (err) {
        // DO NOT reset idempotencyKeyRef on failure, so that retry uses the exact same key!
        if (err instanceof ApiError) {
          if (err.code === 'QUOTE_EXPIRED') {
            setOrderError('Bảng giá đã hết hạn (quá 5 phút). Vui lòng cập nhật lại giỏ hàng.')
            setQuote(null)
          } else if (err.code === 'PRICE_CHANGED') {
            setOrderError('Giá món ăn đã thay đổi. Vui lòng tải lại bảng giá mới.')
            setQuote(null)
          } else if (err.code === 'VISIT_CLOSED') {
            setOrderError('Phiên bàn đã kết thúc. Vui lòng liên hệ nhân viên phục vụ.')
            setQuote(null)
          } else {
            setOrderError(err.message || 'Không thể tạo đơn đặt món. Vui lòng thử lại.')
          }
        } else {
          setOrderError('Lỗi kết nối mạng khi gửi đơn. Nhấn "Thử lại" để gửi lại.')
        }
        return null
      } finally {
        setIsSubmittingOrder(false)
      }
    },
    [quote]
  )

  const resetQuote = useCallback(() => {
    setQuote(null)
    setQuoteError(null)
    setOrderError(null)
    idempotencyKeyRef.current = null
    setIdempotencyKey(null)
  }, [])

  const resetReceipt = useCallback(() => {
    setReceipt(null)
    setOrderError(null)
  }, [])

  return {
    quote,
    isRequestingQuote,
    quoteError,
    isSubmittingOrder,
    orderError,
    receipt,
    idempotencyKey,
    getQuote,
    submitOrder,
    resetQuote,
    resetReceipt,
  }
}
