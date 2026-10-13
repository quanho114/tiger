import { useCallback, useRef, useState } from 'react'
import { ApiError } from '@/shared/lib/api/types'
import { validatePhoneNumber } from '@/shared/lib/validation'
import { requestTakeawayQuote, submitTakeawayOrder } from './api'
import { storeOrderClaimSecret } from '../claims/claimStorage'
import {
  CheckoutRecoveryError,
  beginCheckout,
  finishCheckout,
  isDefinitiveCheckoutRejection,
  readPendingCheckout,
  recoverCheckout,
} from '../pendingCheckout'
import type {
  TakeawayFieldErrors,
  TakeawayFormState,
  TakeawayOrderReceipt,
  TakeawayQuoteItem,
} from './types'

const INITIAL_FORM_STATE: TakeawayFormState = {
  customerName: '',
  customerPhone: '',
  orderNote: '',
  pickupTime: null,
}

function generateTakeawayIdempotencyKey(): string {
  return `idemp-take-${crypto.randomUUID()}`
}

export function useTakeawayOrder() {
  const [formState, setFormState] = useState<TakeawayFormState>(INITIAL_FORM_STATE)
  const [fieldErrors, setFieldErrors] = useState<TakeawayFieldErrors>({})

  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [orderError, setOrderError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<TakeawayOrderReceipt | null>(null)

  // Retain idempotency key across retries for the same takeaway submission
  const idempotencyKeyRef = useRef<string | null>(null)
  const submittingRef = useRef(false)

  const setFormField = useCallback((field: keyof TakeawayFormState, value: string | null) => {
    setFormState((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => {
      if (!prev[field as keyof TakeawayFormState]) return prev
      const next = { ...prev }
      delete next[field as keyof TakeawayFormState]
      return next
    })
  }, [])

  const validateForm = useCallback((): boolean => {
    const errors: TakeawayFieldErrors = {}

    if (!formState.customerName.trim()) {
      errors.customerName = 'Vui lòng nhập họ và tên của bạn.'
    }

    const phoneValidation = validatePhoneNumber(formState.customerPhone)
    if (!phoneValidation.isValid) {
      errors.customerPhone = phoneValidation.error || 'Số điện thoại không hợp lệ (cần 10 chữ số).'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }, [formState])

  const mapApiError = useCallback((err: unknown, target: 'quote' | 'order'): string | null => {
    if (err instanceof CheckoutRecoveryError) return err.message
    if (!(err instanceof ApiError)) {
      return target === 'quote'
        ? 'Lỗi kết nối khi tính bảng giá. Vui lòng kiểm tra mạng và thử lại.'
        : 'Lỗi kết nối mạng khi gửi đơn. Vui lòng thử lại.'
    }
    if (err.code === 'SERVICE_CLOSED' || err.code === 'STORE_CLOSED_DELIVERY') {
      return 'Nhà hàng hiện đang tạm dừng nhận đơn hoặc ngoài giờ phục vụ.'
    }
    if (err.code === 'ITEM_UNAVAILABLE') {
      return 'Một số món bạn chọn hiện đã hết hoặc không áp dụng mang đi.'
    }
    if (err.code === 'QUOTE_EXPIRED' || err.code === 'QUOTE_CHANGED' || err.code === 'PRICE_CHANGED') {
      return 'Bảng giá vừa thay đổi hoặc đã hết hạn. Vui lòng thử lại.'
    }
    if (err.code === 'VALIDATION_ERROR') {
      if (err.fieldErrors) {
        const mapped: TakeawayFieldErrors = {}
        if (err.fieldErrors.customer_name) {
          mapped.customerName = err.fieldErrors.customer_name[0]
        }
        if (err.fieldErrors.customer_phone) {
          mapped.customerPhone = err.fieldErrors.customer_phone[0]
        }
        if (err.fieldErrors.pickup_time) {
          mapped.pickupTime = err.fieldErrors.pickup_time[0]
        }
        if (Object.keys(mapped).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...mapped }))
        }
      }
      return err.message || 'Thông tin đặt đơn chưa hợp lệ.'
    }
    return err.message || (target === 'quote'
      ? 'Không thể tính bảng giá. Vui lòng thử lại.'
      : 'Không thể tạo đơn mang đi. Vui lòng thử lại.')
  }, [])

  // Single-step checkout: validate -> quote -> submit
  const placeOrder = useCallback(
    async (items: TakeawayQuoteItem[]): Promise<TakeawayOrderReceipt | null> => {
      if (submittingRef.current) return null
      if (items.length === 0) {
        setOrderError('Giỏ hàng đang trống. Vui lòng chọn món trước khi đặt.')
        return null
      }
      const isValid = validateForm()
      if (!isValid) {
        setOrderError('Vui lòng kiểm tra và điền đầy đủ thông tin nhận món.')
        return null
      }

      submittingRef.current = true
      setIsPlacingOrder(true)
      setOrderError(null)

      let beganKey: string | null = null
      let hadPendingAttempt = false

      try {
        // Recover an earlier ambiguous attempt before doing anything new
        const existingPending = readPendingCheckout('takeaway')
        if (existingPending) {
          const recovered = await recoverCheckout<TakeawayOrderReceipt>(existingPending)
          if (recovered) {
            storeOrderClaimSecret(recovered.id, existingPending.claimSecret)
            setReceipt(recovered)
            finishCheckout('takeaway', existingPending.key)
            idempotencyKeyRef.current = null
            return null
          }
        }

        const quoteRes = await requestTakeawayQuote({
          order_type: 'takeaway',
          items,
          pickup_time: formState.pickupTime || null,
        })

        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = existingPending?.key || generateTakeawayIdempotencyKey()
        }
        hadPendingAttempt = Boolean(readPendingCheckout('takeaway'))
        const pending = beginCheckout('takeaway', idempotencyKeyRef.current)
        beganKey = pending.key
        idempotencyKeyRef.current = pending.key
        const claimSecret = pending.claimSecret

        const orderReceipt = await submitTakeawayOrder(
          {
            quote_token: quoteRes.quote_token,
            customer_name: formState.customerName.trim(),
            customer_phone: formState.customerPhone.trim(),
            note: formState.orderNote.trim() || undefined,
            items,
            claim_secret: claimSecret,
          },
          pending.key
        )

        if (orderReceipt?.id) {
          storeOrderClaimSecret(orderReceipt.id, claimSecret)
        }

        finishCheckout('takeaway', pending.key)
        setReceipt(orderReceipt)
        idempotencyKeyRef.current = null
        return orderReceipt
      } catch (err) {
        // An older ambiguous attempt must remain recoverable even if this retry fails.
        if (beganKey && !hadPendingAttempt && isDefinitiveCheckoutRejection(err)) {
          finishCheckout('takeaway', beganKey)
        }
        setOrderError(mapApiError(err, beganKey ? 'order' : 'quote'))
        return null
      } finally {
        submittingRef.current = false
        setIsPlacingOrder(false)
      }
    },
    [formState, validateForm, mapApiError]
  )

  const resetErrors = useCallback(() => {
    setOrderError(null)
    setFieldErrors({})
    idempotencyKeyRef.current = null
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
    isPlacingOrder,
    orderError,
    receipt,
    setFormField,
    validateForm,
    placeOrder,
    resetErrors,
    resetReceipt,
    resetForm,
  }
}
