import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/types'
import { validatePhoneNumber } from '@/lib/validation'
import { requestDeliveryQuote, submitDeliveryOrder } from './api'
import {
  getOrCreateCheckoutClaimSecret,
  storeOrderClaimSecret,
} from '../claims/claimStorage'
import type {
  DeliveryFieldErrors,
  DeliveryFormState,
  DeliveryOrderReceipt,
  DeliveryQuoteItem,
  DeliveryQuoteResponse,
} from './types'

const INITIAL_FORM_STATE: DeliveryFormState = {
  customerName: '',
  customerPhone: '',
  address: '',
  deliveryZoneId: '',
  orderNote: '',
}

function generateDeliveryIdempotencyKey(): string {
  const timestamp = Date.now()
  const randomStr = Math.random().toString(36).substring(2, 12)
  return `idemp-deliv-${timestamp}-${randomStr}`
}

export function useDeliveryOrder() {
  const [formState, setFormState] = useState<DeliveryFormState>(INITIAL_FORM_STATE)
  const [fieldErrors, setFieldErrors] = useState<DeliveryFieldErrors>({})

  const [quote, setQuote] = useState<DeliveryQuoteResponse | null>(null)
  const [isRequestingQuote, setIsRequestingQuote] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)

  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<DeliveryOrderReceipt | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)

  // Retain idempotency key across retries for the same delivery submission
  const idempotencyKeyRef = useRef<string | null>(null)
  const lastQuoteItemsRef = useRef<DeliveryQuoteItem[]>([])

  const setFormField = useCallback((field: keyof DeliveryFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const validateForm = useCallback((): boolean => {
    const errors: DeliveryFieldErrors = {}

    if (!formState.customerName.trim()) {
      errors.customerName = 'Vui lòng nhập họ và tên của bạn.'
    }

    const phoneValidation = validatePhoneNumber(formState.customerPhone)
    if (!phoneValidation.isValid) {
      errors.customerPhone = phoneValidation.error || 'Số điện thoại không hợp lệ (cần 10 chữ số).'
    }

    if (!formState.address.trim()) {
      errors.address = 'Vui lòng nhập địa chỉ giao hàng chi tiết.'
    }

    if (!formState.deliveryZoneId) {
      errors.deliveryZoneId = 'Vui lòng chọn khu vực giao hàng.'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [formState])

  const getQuote = useCallback(
    async (
      items: DeliveryQuoteItem[],
      zoneId: string
    ): Promise<DeliveryQuoteResponse | null> => {
      if (!zoneId) {
        setFieldErrors((prev) => ({ ...prev, deliveryZoneId: 'Vui lòng chọn khu vực giao hàng.' }))
        setQuoteError('Vui lòng chọn khu vực giao hàng để tính phí vận chuyển.')
        return null
      }

      setIsRequestingQuote(true)
      setQuoteError(null)
      setOrderError(null)

      try {
        const quoteRes = await requestDeliveryQuote({
          order_type: 'delivery',
          delivery_zone_id: zoneId,
          items,
        })

        setQuote(quoteRes)
        lastQuoteItemsRef.current = items
        // Generate new idempotency key for new quote
        const newKey = generateDeliveryIdempotencyKey()
        idempotencyKeyRef.current = newKey
        setIdempotencyKey(newKey)
        return quoteRes
      } catch (err) {
        setQuote(null)
        if (err instanceof ApiError) {
          if (err.code === 'ZONE_UNAVAILABLE') {
            setQuoteError('Khu vực giao hàng đã chọn hiện không khả dụng hoặc đã ngưng phục vụ.')
            setFieldErrors((prev) => ({
              ...prev,
              deliveryZoneId: 'Khu vực này hiện tạm ngưng phục vụ.',
            }))
          } else if (err.code === 'SERVICE_CLOSED' || err.code === 'STORE_CLOSED_DELIVERY') {
            setQuoteError('Nhà hàng hiện đang tạm dừng nhận đơn giao tận nơi hoặc ngoài giờ phục vụ.')
          } else if (err.code === 'ITEM_UNAVAILABLE') {
            setQuoteError('Một số món bạn chọn hiện đã hết hoặc không áp dụng giao hàng.')
          } else if (err.code === 'VALIDATION_ERROR') {
            setQuoteError(err.message || 'Thông tin đặt đơn chưa hợp lệ.')
            if (err.fieldErrors) {
              const mapped: DeliveryFieldErrors = {}
              if (err.fieldErrors.delivery_zone_id) {
                mapped.deliveryZoneId = err.fieldErrors.delivery_zone_id[0]
              }
              if (err.fieldErrors.customer_name) {
                mapped.customerName = err.fieldErrors.customer_name[0]
              }
              if (err.fieldErrors.customer_phone) {
                mapped.customerPhone = err.fieldErrors.customer_phone[0]
              }
              if (err.fieldErrors.address) {
                mapped.address = err.fieldErrors.address[0]
              }
              setFieldErrors((prev) => ({ ...prev, ...mapped }))
            }
          } else {
            setQuoteError(err.message || 'Không thể tính bảng giá giao hàng. Vui lòng thử lại.')
          }
        } else {
          setQuoteError('Lỗi kết nối khi tính bảng giá giao hàng. Vui lòng kiểm tra mạng.')
        }
        return null
      } finally {
        setIsRequestingQuote(false)
      }
    },
    []
  )

  const submitOrder = useCallback(async (): Promise<DeliveryOrderReceipt | null> => {
    if (!quote) {
      setOrderError('Chưa có thông tin bảng giá. Vui lòng xem bảng giá trước khi đặt đơn.')
      return null
    }

    const isValid = validateForm()
    if (!isValid) {
      setOrderError('Vui lòng kiểm tra và điền đầy đủ các trường thông tin nhận hàng.')
      return null
    }

    // Retain exact same idempotency key across retries
    if (!idempotencyKeyRef.current) {
      const generated = generateDeliveryIdempotencyKey()
      idempotencyKeyRef.current = generated
      setIdempotencyKey(generated)
    }
    const key = idempotencyKeyRef.current

    setIsSubmittingOrder(true)
    setOrderError(null)

    try {
      const claimSecret = getOrCreateCheckoutClaimSecret(key)
      const orderReceipt = await submitDeliveryOrder(
        {
          quote_token: quote.quote_token,
          customer_name: formState.customerName.trim(),
          customer_phone: formState.customerPhone.trim(),
          address: formState.address.trim(),
          note: formState.orderNote.trim() || undefined,
          items: lastQuoteItemsRef.current,
          claim_secret: claimSecret,
        },
        key
      )

      if (orderReceipt?.id) {
        storeOrderClaimSecret(orderReceipt.id, claimSecret)
      }

      setReceipt(orderReceipt)
      setQuote(null)
      // Order succeeded: reset key for future new orders
      idempotencyKeyRef.current = null
      setIdempotencyKey(null)
      return orderReceipt
    } catch (err) {
      // DO NOT reset idempotencyKeyRef on failure, so retry sends identical key!
      if (err instanceof ApiError) {
        if (err.code === 'QUOTE_EXPIRED') {
          setOrderError('Bảng giá đã hết hạn (quá 5 phút). Vui lòng tính lại bảng giá mới.')
          setQuote(null)
        } else if (err.code === 'QUOTE_CHANGED' || err.code === 'PRICE_CHANGED') {
          setOrderError('Giá món hoặc phí khu vực đã thay đổi. Vui lòng xem lại bảng giá mới.')
          setQuote(null)
        } else if (err.code === 'ZONE_UNAVAILABLE') {
          setOrderError('Khu vực giao hàng đã tạm dừng phục vụ hoặc không hợp lệ.')
          setQuote(null)
        } else if (err.code === 'ITEM_UNAVAILABLE') {
          setOrderError('Một số món bạn chọn hiện đã hết hoặc không áp dụng giao hàng.')
          setQuote(null)
        } else if (err.code === 'SERVICE_CLOSED') {
          setOrderError('Nhà hàng hiện đã ngưng nhận đơn giao hàng.')
          setQuote(null)
        } else if (err.code === 'VALIDATION_ERROR') {
          setOrderError(err.message || 'Thông tin đơn hàng không hợp lệ.')
          if (err.fieldErrors) {
            const mapped: DeliveryFieldErrors = {}
            if (err.fieldErrors.delivery_zone_id) {
              mapped.deliveryZoneId = err.fieldErrors.delivery_zone_id[0]
            }
            if (err.fieldErrors.customer_name) {
              mapped.customerName = err.fieldErrors.customer_name[0]
            }
            if (err.fieldErrors.customer_phone) {
              mapped.customerPhone = err.fieldErrors.customer_phone[0]
            }
            if (err.fieldErrors.address) {
              mapped.address = err.fieldErrors.address[0]
            }
            setFieldErrors((prev) => ({ ...prev, ...mapped }))
          }
        } else {
          setOrderError(err.message || 'Không thể tạo đơn đặt giao. Vui lòng thử lại.')
        }
      } else {
        setOrderError('Lỗi kết nối mạng khi gửi đơn. Nhấn "Thử lại" để gửi lại đơn hàng.')
      }
      return null
    } finally {
      setIsSubmittingOrder(false)
    }
  }, [quote, formState, validateForm])

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

  const resetForm = useCallback(() => {
    setFormState(INITIAL_FORM_STATE)
    setFieldErrors({})
  }, [])

  return {
    formState,
    fieldErrors,
    quote,
    isRequestingQuote,
    quoteError,
    isSubmittingOrder,
    orderError,
    receipt,
    idempotencyKey,
    setFormField,
    setFormState,
    validateForm,
    getQuote,
    submitOrder,
    resetQuote,
    resetReceipt,
    resetForm,
  }
}
