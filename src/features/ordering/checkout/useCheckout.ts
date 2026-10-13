import { useState, useEffect, useRef, useMemo, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '@/features/cart'
import { useTableSession } from '@/features/table-session'
import { useDineInOrder } from '@/features/ordering/dine-in'
import { useDeliveryOrder, type DeliveryZoneOption } from '@/features/ordering/delivery'
import { useTakeawayOrder } from '@/features/ordering/takeaway'
import { CatalogContext } from '@/features/catalog'
import { useAuth } from '@/features/auth'
import { fetchCustomerAddresses } from '@/features/account/api'
import type { CustomerAddress } from '@/features/account/types'
import { getStoredClaimSecret, claimGuestOrder } from '@/features/ordering/claims/claimStorage'
import type { CartDrawerProps } from './types'
import { FALLBACK_DELIVERY_ZONES } from '../delivery/zones'

export function useCheckout({
  isOpen,
  onClose,
  cartItems,
  onClearCart,
}: Pick<CartDrawerProps, 'isOpen' | 'onClose' | 'cartItems' | 'onClearCart'>) {
  const { context: cartContext } = useCart()
  const { session: tableSession, hasActiveTable } = useTableSession()

  const catalogContext = useContext(CatalogContext)
  const settings = catalogContext?.settings

  const {
    quote: dineInQuote,
    isRequestingQuote: isDineInRequestingQuote,
    quoteError: dineInQuoteError,
    isSubmittingOrder: isDineInSubmittingOrder,
    orderError: dineInOrderError,
    receipt: dineInReceipt,
    getQuote: getDineInQuote,
    submitOrder: submitDineInOrder,
    resetQuote: resetDineInQuote,
    resetReceipt: resetDineInReceipt,
  } = useDineInOrder()

  const {
    formState: deliveryForm,
    fieldErrors: deliveryFieldErrors,
    quote: deliveryQuote,
    isRequestingQuote: isDeliveryRequestingQuote,
    quoteError: deliveryQuoteError,
    isSubmittingOrder: isDeliverySubmittingOrder,
    orderError: deliveryOrderError,
    receipt: deliveryReceipt,
    setFormField: setDeliveryFormField,
    validateForm: validateDeliveryForm,
    getQuote: getDeliveryQuote,
    submitOrder: submitDeliveryOrder,
    resetQuote: resetDeliveryQuote,
    resetReceipt: resetDeliveryReceipt,
    resetForm: resetDeliveryForm,
  } = useDeliveryOrder()

  const {
    formState: takeawayForm,
    fieldErrors: takeawayFieldErrors,
    isPlacingOrder: isTakeawayPlacingOrder,
    orderError: takeawayOrderError,
    receipt: takeawayReceipt,
    setFormField: setTakeawayFormField,
    placeOrder: placeTakeawayOrder,
    resetErrors: resetTakeawayErrors,
    resetReceipt: resetTakeawayReceipt,
  } = useTakeawayOrder()

  const isTakeaway = cartContext.mode === 'takeaway'
  const isDineIn =
    cartContext.mode === 'dine-in' ||
    (Boolean(tableSession) && cartContext.mode !== 'delivery' && !isTakeaway)
  const lastClearedReceipt = useRef<string | null>(null)
  useEffect(() => {
    const receiptId = dineInReceipt?.id || deliveryReceipt?.id || takeawayReceipt?.id
    if (receiptId && receiptId !== lastClearedReceipt.current) {
      lastClearedReceipt.current = receiptId
      onClearCart()
    }
  }, [dineInReceipt, deliveryReceipt, takeawayReceipt, onClearCart])
  const [dineInNote, setDineInNote] = useState('')

  const navigate = useNavigate()
  const { role, user } = useAuth()
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([])
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)

  const handleClaimOrder = async (orderId: string) => {
    const secret = getStoredClaimSecret(orderId)
    if (!secret) {
      setClaimError('Không tìm thấy mã bí mật nhận đơn trên thiết bị này.')
      return
    }
    setIsClaiming(true)
    setClaimError(null)
    try {
      const result = await claimGuestOrder(orderId, secret)
      if (result.claimed) {
        setClaimSuccess('Đã liên kết đơn hàng thành công vào tài khoản của bạn!')
      }
    } catch (err: unknown) {
      setClaimError(err instanceof Error ? err.message : 'Không thể liên kết đơn hàng.')
    } finally {
      setIsClaiming(false)
    }
  }

  useEffect(() => {
    if (role === 'customer' && isOpen && cartContext.mode === 'delivery') {
      let isMounted = true
      fetchCustomerAddresses()
        .then((addrs) => {
          if (!isMounted) return
          setSavedAddresses(addrs)
          const defaultAddr = addrs.find((a) => a.is_default)
          if (defaultAddr && !deliveryForm.address) {
            setDeliveryFormField('customerName', defaultAddr.recipient_name)
            setDeliveryFormField('customerPhone', defaultAddr.phone)
            setDeliveryFormField(
              'address',
              `${defaultAddr.address_line}${defaultAddr.ward ? `, ${defaultAddr.ward}` : ''}${defaultAddr.district ? `, ${defaultAddr.district}` : ''}`
            )
            if (defaultAddr.delivery_note) {
              setDeliveryFormField('orderNote', defaultAddr.delivery_note)
            }
          }
        })
        .catch(() => {})
      return () => {
        isMounted = false
      }
    }
  }, [role, isOpen, cartContext.mode])

  // Prefill delivery details drafted via the MenuPage "Nhập địa chỉ giao" dialog
  useEffect(() => {
    if (!isOpen || cartContext.mode !== 'delivery' || !cartContext.address) return
    if (deliveryForm.address) return
    setDeliveryFormField('address', cartContext.address)
    if (cartContext.recipientName) setDeliveryFormField('customerName', cartContext.recipientName)
    if (cartContext.phone) setDeliveryFormField('customerPhone', cartContext.phone)
    if (cartContext.zoneId) setDeliveryFormField('deliveryZoneId', cartContext.zoneId)
    if (cartContext.deliveryNote) setDeliveryFormField('orderNote', cartContext.deliveryNote)
  }, [isOpen, cartContext, deliveryForm.address, setDeliveryFormField])

  const deliveryZones: DeliveryZoneOption[] = useMemo(() => {
    if (settings?.delivery_zones && settings.delivery_zones.length > 0) {
      return settings.delivery_zones
    }
    return FALLBACK_DELIVERY_ZONES
  }, [settings?.delivery_zones])

  const selectedZone = useMemo(() => {
    return deliveryZones.find((z) => z.id === deliveryForm.deliveryZoneId) || null
  }, [deliveryZones, deliveryForm.deliveryZoneId])

  // Invalidate active quotes whenever cart items, quantities, or delivery zone change
  const cartItemsFingerprint = useMemo(
    () => cartItems.map((item) => `${item.dish.id}:${item.quantity}`).join(','),
    [cartItems]
  )
  const prevFingerprintRef = useRef(cartItemsFingerprint)
  const prevZoneIdRef = useRef(deliveryForm.deliveryZoneId)

  useEffect(() => {
    if (
      prevFingerprintRef.current !== cartItemsFingerprint ||
      prevZoneIdRef.current !== deliveryForm.deliveryZoneId
    ) {
      prevFingerprintRef.current = cartItemsFingerprint
      prevZoneIdRef.current = deliveryForm.deliveryZoneId
      if (deliveryQuote) {
        resetDeliveryQuote()
      }
      if (dineInQuote) {
        resetDineInQuote()
      }
      if (takeawayOrderError) {
        resetTakeawayErrors()
      }
    }
  }, [
    cartItemsFingerprint,
    deliveryForm.deliveryZoneId,
    deliveryQuote,
    dineInQuote,
    takeawayOrderError,
    resetDeliveryQuote,
    resetDineInQuote,
    resetTakeawayErrors,
  ])

  const minDeliveryOrder = settings?.min_delivery_order_vnd ?? 100000

  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.dish.price * item.quantity, 0),
    [cartItems]
  )

  const estimatedShippingFee = useMemo(() => {
    if (isDineIn || isTakeaway) return 0
    if (deliveryQuote) return deliveryQuote.shipping_fee_vnd
    if (!selectedZone) return 0
    if (selectedZone.free_threshold_vnd !== null && subtotal >= selectedZone.free_threshold_vnd) {
      return 0
    }
    return selectedZone.fee_vnd
  }, [isDineIn, isTakeaway, deliveryQuote, selectedZone, subtotal])

  const estimatedTotal = useMemo(() => {
    if (deliveryQuote) return deliveryQuote.total_vnd
    if (dineInQuote) return dineInQuote.total_vnd
    return subtotal + estimatedShippingFee
  }, [deliveryQuote, dineInQuote, subtotal, estimatedShippingFee])

  // Dine-in actions
  const handleRequestDineInQuote = async () => {
    if (!tableSession?.visitCapability) return
    const items = cartItems.map((item) => ({
      menu_item_id: item.dish.id,
      quantity: item.quantity,
    }))
    await getDineInQuote(items, tableSession.visitCapability)
  }

  const handleSubmitDineInOrder = async () => {
    await submitDineInOrder(dineInNote)
  }

  const handleCloseDineInReceipt = () => {
    resetDineInReceipt()
    setClaimSuccess(null)
    setClaimError(null)
    onClose()
  }

  // Delivery actions
  const handleRequestDeliveryQuote = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault()
    const isValid = validateDeliveryForm()
    if (!isValid) return

    const items = cartItems.map((item) => ({
      menu_item_id: item.dish.id,
      quantity: item.quantity,
      note: deliveryForm.orderNote ? deliveryForm.orderNote : undefined,
    }))

    await getDeliveryQuote(items, deliveryForm.deliveryZoneId)
  }

  const handleSubmitDeliveryOrder = async () => {
    const createdReceipt = await submitDeliveryOrder()
    if (createdReceipt) {
      resetDeliveryForm()
    }
  }

  const handleCloseDeliveryReceipt = () => {
    resetDeliveryReceipt()
    setClaimSuccess(null)
    setClaimError(null)
    onClose()
  }

  // Takeaway actions
  const handlePlaceTakeawayOrder = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault()
    const items = cartItems.map((item) => ({
      menu_item_id: item.dish.id,
      quantity: item.quantity,
      note: item.note || undefined,
    }))
    await placeTakeawayOrder(items)
  }

  const handleCloseTakeawayReceipt = () => {
    resetTakeawayReceipt()
    setClaimSuccess(null)
    setClaimError(null)
    onClose()
  }

  const activeTableName =
    (cartContext.mode === 'dine-in' ? cartContext.tableName : null) ||
    tableSession?.tableName ||
    'Bàn'

  return {
    hasActiveTable,
    dineInQuote,
    isDineInRequestingQuote,
    dineInQuoteError,
    isDineInSubmittingOrder,
    dineInOrderError,
    dineInReceipt,
    resetDineInQuote,
    deliveryForm,
    deliveryFieldErrors,
    deliveryQuote,
    isDeliveryRequestingQuote,
    deliveryQuoteError,
    isDeliverySubmittingOrder,
    deliveryOrderError,
    deliveryReceipt,
    setDeliveryFormField,
    resetDeliveryQuote,
    isDineIn,
    isTakeaway,
    dineInNote,
    setDineInNote,
    navigate,
    user,
    savedAddresses,
    isClaiming,
    claimSuccess,
    claimError,
    handleClaimOrder,
    deliveryZones,
    selectedZone,
    minDeliveryOrder,
    subtotal,
    estimatedShippingFee,
    estimatedTotal,
    takeawayForm,
    takeawayFieldErrors,
    takeawayOrderError,
    setTakeawayFormField,
    isTakeawayPlacingOrder,
    takeawayReceipt,
    handleRequestDineInQuote,
    handleSubmitDineInOrder,
    handleCloseDineInReceipt,
    handleRequestDeliveryQuote,
    handleSubmitDeliveryOrder,
    handleCloseDeliveryReceipt,
    handlePlaceTakeawayOrder,
    handleCloseTakeawayReceipt,
    activeTableName,
  }
}

export type CheckoutState = ReturnType<typeof useCheckout>
