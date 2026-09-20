import { useEffect, useState, type FC } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { safeReturnTo, getAndClearPendingReturnTo } from './auth-helpers'
import {
  getPendingUnclaimedOrders,
  claimGuestOrder,
} from '../ordering/claims/claimStorage'

export const AuthCallbackPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [status, setStatus] = useState<'loading' | 'error' | 'success'>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false

    async function handleAuthCallback() {
      // 1. Resolve returnTo target safely
      const queryReturnTo = searchParams.get('returnTo')
      const storedReturnTo = getAndClearPendingReturnTo()
      const rawTarget = queryReturnTo || storedReturnTo || '/'
      const destination = safeReturnTo(rawTarget, '/')

      // 2. Check for explicit error parameters in URL (OAuth denial or provider error)
      const errorParam = searchParams.get('error')
      const errorDescription = searchParams.get('error_description')

      if (errorParam || errorDescription) {
        // Strip sensitive params from URL immediately
        try {
          window.history.replaceState({}, document.title, window.location.pathname)
        } catch {
          // Ignore
        }

        if (!isCancelled) {
          setStatus('error')
          setErrorMessage(
            errorDescription || 'Quá trình xác thực bị hủy hoặc xảy ra lỗi từ phía nhà cung cấp.'
          )
        }
        return
      }

      try {
        // 3. Process session exchange (PKCE code or Hash fragment)
        const { data, error } = await supabase.auth.getSession()

        // Clean query and hash parameters immediately to prevent credential lingering (Invariant V19)
        try {
          window.history.replaceState({}, document.title, window.location.pathname)
        } catch {
          // Ignore
        }

        if (error) {
          throw error
        }

        if (!data.session?.user) {
          throw new Error('Không tìm thấy phiên đăng nhập hợp lệ hoặc liên kết đã hết hạn.')
        }

        // Process any pending guest order claims for this session (Invariant V22)
        try {
          const pendingClaims = getPendingUnclaimedOrders()
          for (const claim of pendingClaims) {
            try {
              await claimGuestOrder(claim.orderId, claim.secret)
            } catch {
              // Ignore individual claim errors
            }
          }
        } catch {
          // Ignore claim process error
        }

        if (!isCancelled) {
          setStatus('success')
          // Navigate to clean destination route
          navigate(destination, { replace: true })
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          setStatus('error')
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Xác thực không thành công. Liên kết có thể đã được sử dụng hoặc hết hạn.'
          )
        }
      }
    }

    void handleAuthCallback()

    return () => {
      isCancelled = true
    }
  }, [navigate, searchParams])

  return (
    <div className="min-h-screen bg-[#fbf9f6] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-body">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2">
            <img
              src="/tiger.svg"
              alt="Logo Tiger 345"
              className="w-12 h-12 rounded-full object-contain"
            />
            <span className="font-['Fraunces',serif] font-bold text-2xl tracking-tight text-[#234386]">
              Tiger 345<span className="text-[#ed7328]">.</span>
            </span>
          </Link>
        </div>

        <div className="bg-white py-10 px-6 shadow-sm border border-[#d2b68c]/35 rounded-2xl sm:px-10 text-center">
          {status === 'loading' && (
            <div className="space-y-4">
              <div className="w-12 h-12 border-3 border-[#234386] border-t-transparent rounded-full animate-spin mx-auto" />
              <h2 className="text-base sm:text-lg font-bold text-[#234386]">
                Đang hoàn tất đăng nhập...
              </h2>
              <p className="text-xs sm:text-sm text-black/60">
                Hệ thống đang xác thực danh tính của bạn. Quá trình này chỉ mất một vài giây.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <span className="text-xl font-bold">✓</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#234386]">
                Đăng nhập thành công!
              </h2>
              <p className="text-xs sm:text-sm text-black/60">
                Đang chuyển hướng về trang của bạn...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-5">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle size={28} />
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#234386]">
                Đăng nhập không thành công
              </h2>
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left leading-relaxed"
              >
                {errorMessage || 'Liên kết đăng nhập không hợp lệ hoặc đã hết hạn.'}
              </div>

              <div className="pt-3 space-y-2.5">
                <Link
                  to="/login"
                  className="w-full py-3 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3468] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition"
                >
                  <RotateCcw size={15} />
                  <span>Thử đăng nhập lại</span>
                </Link>
                <Link
                  to="/"
                  className="w-full py-2.5 px-4 rounded-xl border border-[#d2b68c] text-xs font-semibold text-black/70 hover:text-black hover:bg-stone-50 transition flex items-center justify-center gap-2"
                >
                  <span>Tiếp tục với tư cách Khách</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
