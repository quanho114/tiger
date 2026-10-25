import { useState, type FC } from 'react'
import { useSearchParams, Link, Navigate } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from './useAuth'
import { safeReturnTo, getAuthRedirectUrl, savePendingReturnTo } from './auth-helpers'
import { useOptionalConciergeSession } from '@/features/concierge/ConciergeProvider'

export const LoginPage: FC = () => {
  const [searchParams] = useSearchParams()
  const { user, role, isLoading: isAuthLoading } = useAuth()
  const concierge = useOptionalConciergeSession()

  // Sanitize returnTo to prevent Open Redirect (CWE-601 / Invariant V19)
  const returnTo = safeReturnTo(searchParams.get('returnTo'), '/')

  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isAuthLoading && user && role === 'customer') {
    return <Navigate to={returnTo} replace />
  }

  // Handle Google OAuth Login with PKCE
  const handleGoogleLogin = async () => {
    setErrorMessage(null)
    setIsGoogleLoading(true)

    try {
      try { await concierge?.prepareLoginTransition() } catch { /* Login remains available without chat transfer. */ }
      savePendingReturnTo(returnTo)
      const redirectUrl = getAuthRedirectUrl(returnTo)

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        // Explicit honest reporting if Google OAuth is not configured on local Supabase
        if (
          error.message.includes('not enabled') ||
          error.message.includes('Provider') ||
          error.message.includes('unsupported')
        ) {
          throw new Error(
            'Phương thức Google OAuth chưa được kích hoạt trong môi trường này. Vui lòng thử lại sau.'
          )
        }
        throw error
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Đăng nhập Google tạm thời không khả dụng. Vui lòng thử lại sau.'
      )
    } finally {
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7f9] flex flex-col px-4 pt-20 md:pt-36 pb-12 sm:px-6 lg:px-8 font-body">
      <div className="mx-auto md:my-auto w-full sm:max-w-md">
        {/* Logo & Brand Header */}
        <div className="text-left md:text-center">
          <Link
            to="/"
            className="hidden md:inline-flex items-center gap-2.5 group cursor-pointer focus:outline-none"
            aria-label="Tiger 345 - Về trang chủ"
          >
            <img
              src="/tiger.svg"
              alt="Logo Tiger 345"
              className="w-12 h-12 rounded-full object-contain shadow-xs group-hover:scale-105 transition-transform"
            />
            <div className="text-left">
              <span className="font-['Fraunces',serif] font-bold text-2xl tracking-tight text-[#234386] leading-none block">
                Tiger 345<span className="text-[#ed7328]">.</span>
              </span>
              <span className="text-[10px] tracking-[0.2em] font-semibold uppercase text-[#ed7328] block mt-0.5">
                Ẩm Thực Đương Đại
              </span>
            </div>
          </Link>

          <h1 className="md:mt-6 text-2xl font-semibold font-body md:font-['Fraunces',serif] text-[#234386] tracking-tight">
            Tài khoản của bạn
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-sm md:mx-auto leading-relaxed">
            Đăng nhập để xem đơn hàng, lưu địa chỉ và những món bạn yêu thích.
          </p>
        </div>

        {/* Main Card */}
        <div className="mt-7 bg-white py-6 px-5 border border-slate-200 rounded-2xl shadow-sm sm:px-8 md:py-8">
          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-sm text-rose-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Method 1: Google OAuth */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 rounded-xl shadow-2xs bg-white hover:bg-stone-50 text-sm font-semibold text-black/80 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isGoogleLoading ? 'Đang kết nối Google...' : 'Đăng nhập với Google'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
