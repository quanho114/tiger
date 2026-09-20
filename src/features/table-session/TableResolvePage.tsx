import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, ArrowRight, Loader2, Utensils } from 'lucide-react'
import { useCart } from '@/store/cart'
import { useTableSession } from './useTableSession'
import type { TableSession } from './types'

export function TableResolvePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { resolveToken } = useTableSession()
  const { cartItems, clear: clearCart, setContext: setCartContext, context: cartContext } = useCart()

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingSession, setPendingSession] = useState<TableSession | null>(null)
  const [requiresReassignConfirm, setRequiresReassignConfirm] = useState(false)

  useEffect(() => {
    // Enforce no-referrer policy before resolving or loading external resources
    let metaTag = document.querySelector('meta[name="referrer"]') as HTMLMetaElement | null
    if (!metaTag) {
      metaTag = document.createElement('meta')
      metaTag.name = 'referrer'
      metaTag.content = 'no-referrer'
      document.head.appendChild(metaTag)
    }

    if (!token) {
      setError('Mã QR không hợp lệ hoặc thiếu thông tin bàn.')
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function handleResolve() {
      setIsLoading(true)
      setError(null)

      try {
        const session = await resolveToken(token!)
        if (!isMounted) return

        // Strip the raw QR token from URL and history immediately to avoid token leakage
        window.history.replaceState({}, '', '/menu?mode=dine-in')

        // Check for table/mode reassignment conflict if cart currently has items
        const hasCartItems = cartItems.length > 0
        const isDifferentTable =
          cartContext.mode === 'dine-in' && cartContext.tableId !== session.tableId
        const isDifferentMode = cartContext.mode === 'delivery'

        if (hasCartItems && (isDifferentTable || isDifferentMode)) {
          setPendingSession(session)
          setRequiresReassignConfirm(true)
          setIsLoading(false)
          return
        }

        // No conflict: apply table context to cart immediately and redirect to menu
        setCartContext({
          mode: 'dine-in',
          tableId: session.tableId,
          tableCode: session.tableCode,
          tableName: session.tableName,
          visitId: session.visitId,
        })
        navigate('/menu?mode=dine-in', { replace: true })
      } catch (err: any) {
        if (!isMounted) return
        setError(err.message || 'Không thể xác thực mã QR bàn. Vui lòng liên hệ nhân viên.')
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    handleResolve()

    return () => {
      isMounted = false
    }
  }, [token, resolveToken, cartItems.length, cartContext, setCartContext, navigate])

  const handleConfirmReassign = () => {
    if (!pendingSession) return
    clearCart()
    setCartContext({
      mode: 'dine-in',
      tableId: pendingSession.tableId,
      tableCode: pendingSession.tableCode,
      tableName: pendingSession.tableName,
      visitId: pendingSession.visitId,
    })
    navigate('/menu?mode=dine-in', { replace: true })
  }

  const handleKeepExisting = () => {
    navigate('/menu', { replace: true })
  }

  if (isLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#ed7328]/10 flex items-center justify-center text-[#ed7328] mb-4 animate-pulse">
          <Loader2 size={32} className="animate-spin" />
        </div>
        <h2 className="text-xl font-bold font-['Noto_Serif',serif] text-[#234386] mb-2">
          Đang xác thực bàn ăn...
        </h2>
        <p className="text-sm text-black/60 max-w-sm">
          Vui lòng đợi trong giây lát, hệ thống Bếp Tiger 345 đang kết nối tới bàn của bạn.
        </p>
      </div>
    )
  }

  if (requiresReassignConfirm && pendingSession) {
    const currentTableLabel =
      cartContext.mode === 'dine-in'
        ? `Bàn ${cartContext.tableName}`
        : 'Giao tận nơi'

    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-[#d2b68c]/30 text-center">
          <div className="w-16 h-16 rounded-full bg-[#ffc400]/20 text-[#ed7328] flex items-center justify-center mx-auto mb-4">
            <Utensils size={32} />
          </div>

          <h2 className="text-xl font-bold font-['Noto_Serif',serif] text-[#234386] mb-2">
            Thay Đổi Bàn Phục Vụ?
          </h2>

          <p className="text-sm text-black/70 mb-6 leading-relaxed">
            Bạn đang có <strong className="text-[#ed7328]">{cartItems.length} món</strong> trong giỏ hàng
            thuộc chế độ <strong>{currentTableLabel}</strong>.
            <br />
            Bạn có muốn chuyển sang gọi món tại <strong>{pendingSession.tableName}</strong> và làm trống giỏ hàng cũ không?
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleConfirmReassign}
              className="w-full py-3.5 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md transition-all flex items-center justify-center gap-2"
            >
              <span>Đổi sang {pendingSession.tableName} (Làm mới giỏ)</span>
              <ArrowRight size={16} />
            </button>

            <button
              type="button"
              onClick={handleKeepExisting}
              className="w-full py-3 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-sm transition-colors"
            >
              Giữ giỏ hàng hiện tại & quay lại
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-red-200 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} />
          </div>

          <h2 className="text-xl font-bold font-['Noto_Serif',serif] text-red-600 mb-2">
            Không Thể Xác Thực Bàn
          </h2>

          <p className="text-sm text-black/70 mb-6 leading-relaxed">
            {error}
          </p>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3.5 px-4 rounded-full bg-[#ed7328] hover:bg-[#d86218] text-white font-semibold text-sm shadow-md transition-all"
            >
              Thử quét lại mã QR
            </button>

            <button
              type="button"
              onClick={() => navigate('/menu')}
              className="w-full py-3 px-4 rounded-full border border-black/15 text-black/70 hover:bg-black/5 font-medium text-sm transition-colors"
            >
              Xem thực đơn nhà hàng
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
