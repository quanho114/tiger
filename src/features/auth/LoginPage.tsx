import { useState, type FC, type FormEvent } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  Mail,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Sparkles,
  UserCheck,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './useAuth'
import { safeReturnTo, getAuthRedirectUrl, savePendingReturnTo } from './auth-helpers'

export const LoginPage: FC = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, role, isLoading: isAuthLoading } = useAuth()

  // Sanitize returnTo to prevent Open Redirect (CWE-601 / Invariant V19)
  const returnTo = safeReturnTo(searchParams.get('returnTo'), '/')

  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [authMethod, setAuthMethod] = useState<'magic-link' | 'otp'>('magic-link')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)

  // If already authenticated as customer, navigate to destination
  if (!isAuthLoading && user && role === 'customer') {
    navigate(returnTo, { replace: true })
    return null
  }

  // Handle Google OAuth Login with PKCE
  const handleGoogleLogin = async () => {
    setErrorMessage(null)
    setInfoMessage(null)
    setIsGoogleLoading(true)

    try {
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
            'Phương thức Google OAuth chưa được kích hoạt trong môi trường này. Vui lòng sử dụng Đăng nhập qua Email (Mã OTP / Magic Link) bên dưới.'
          )
        }
        throw error
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Đăng nhập Google tạm thời không khả dụng. Vui lòng thử đăng nhập bằng Email.'
      )
    } finally {
      setIsGoogleLoading(false)
    }
  }

  // Handle Email Magic Link request
  const handleSendMagicLink = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    const cleanEmail = email.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.')
      return
    }

    setIsSubmitting(true)
    try {
      savePendingReturnTo(returnTo)
      const redirectUrl = getAuthRedirectUrl(returnTo)

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectUrl,
          shouldCreateUser: true,
        },
      })

      if (error) throw error

      setMagicLinkSent(true)
      setInfoMessage(
        `Liên kết đăng nhập đã được gửi tới ${cleanEmail}. Vui lòng kiểm tra hòm thư của bạn để tiếp tục.`
      )
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể gửi email đăng nhập. Vui lòng thử lại.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Send OTP Code request
  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setInfoMessage(null)

    const cleanEmail = email.trim()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMessage('Vui lòng nhập địa chỉ email hợp lệ.')
      return
    }

    setIsSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
        },
      })

      if (error) throw error

      setOtpSent(true)
      setInfoMessage(`Mã xác thực gồm 6 chữ số đã được gửi tới ${cleanEmail}.`)
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Không thể gửi mã OTP. Vui lòng kiểm tra lại email.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Verify OTP Code
  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanCode = otpCode.trim()
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMessage('Vui lòng nhập đầy đủ mã xác thực 6 chữ số.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanCode,
        type: 'email',
      })

      if (error) {
        if (error.message.includes('expired') || error.message.includes('Token has expired')) {
          throw new Error('Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới.')
        }
        if (error.message.includes('invalid') || error.message.includes('Token is invalid')) {
          throw new Error('Mã xác thực không chính xác. Vui lòng kiểm tra lại.')
        }
        throw error
      }

      if (data.session) {
        // Success -> redirect to intended safe returnTo
        navigate(returnTo, { replace: true })
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Xác thực không thành công. Vui lòng thử lại.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fbf9f6] flex flex-col px-4 pt-28 md:pt-36 pb-12 sm:px-6 lg:px-8 font-body">
      <div className="m-auto w-full sm:max-w-md">
        {/* Logo & Brand Header */}
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 group cursor-pointer focus:outline-none"
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

          <h1 className="mt-6 text-xl sm:text-2xl font-bold font-['Fraunces',serif] text-[#234386] tracking-tight">
            Đăng nhập Tài khoản Khách hàng
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-black/60 max-w-sm mx-auto leading-relaxed">
            Lưu sổ địa chỉ nhận món, theo dõi đơn hàng và đặt lại các món yêu thích nhanh chóng.
          </p>
        </div>

        {/* Main Card */}
        <div className="mt-8 bg-white py-8 px-6 shadow-sm border border-[#d2b68c]/35 rounded-2xl sm:px-10">
          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Info / Success Message */}
          {infoMessage && (
            <div
              role="status"
              className="mb-5 rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-800 flex items-start gap-2.5 animate-in fade-in"
            >
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{infoMessage}</span>
            </div>
          )}

          {/* Method 1: Google OAuth */}
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleLoading || isSubmitting}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-[#d2b68c]/60 rounded-xl shadow-2xs bg-white hover:bg-stone-50 text-xs sm:text-sm font-semibold text-black/80 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
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

            {/* Divider */}
            <div className="relative flex items-center justify-center my-6">
              <div className="border-t border-[#d2b68c]/30 w-full" />
              <span className="bg-white px-3 text-[11px] font-medium text-black/50 uppercase tracking-wider shrink-0">
                Hoặc qua Email
              </span>
              <div className="border-t border-[#d2b68c]/30 w-full" />
            </div>

            {/* Method Toggle: Magic Link vs OTP Code */}
            {!otpSent && !magicLinkSent && (
              <div className="flex rounded-xl bg-stone-100 p-1 mb-4 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setAuthMethod('magic-link')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    authMethod === 'magic-link'
                      ? 'bg-white text-[#234386] shadow-2xs'
                      : 'text-black/60 hover:text-black'
                  }`}
                >
                  Liên kết Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod('otp')}
                  className={`flex-1 py-1.5 rounded-lg transition-all ${
                    authMethod === 'otp'
                      ? 'bg-white text-[#234386] shadow-2xs'
                      : 'text-black/60 hover:text-black'
                  }`}
                >
                  Mã OTP 6 số
                </button>
              </div>
            )}

            {/* Form: Step 1 - Enter Email for Magic Link */}
            {authMethod === 'magic-link' && !magicLinkSent && (
              <form onSubmit={handleSendMagicLink} className="space-y-4">
                <div>
                  <label
                    htmlFor="customer-email"
                    className="block text-xs font-semibold text-black/80 mb-1"
                  >
                    Địa chỉ Email của bạn
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"
                    />
                    <input
                      id="customer-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ban@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] focus:ring-1 focus:ring-[#234386] bg-[#fbf9f6]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3468] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang gửi liên kết...
                    </span>
                  ) : (
                    <>
                      <Sparkles size={15} />
                      <span>Gửi Liên kết Đăng nhập</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Form: Magic Link Sent Confirmation */}
            {magicLinkSent && (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <h3 className="text-sm font-bold text-[#234386]">Đã Gửi Liên Kết!</h3>
                <p className="text-xs text-black/70 leading-relaxed max-w-xs mx-auto">
                  Vui lòng bấm vào liên kết trong email gửi từ Tiger 345 để hoàn tất đăng nhập.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMagicLinkSent(false)
                      setInfoMessage(null)
                    }}
                    className="text-xs font-semibold text-[#ed7328] hover:underline"
                  >
                    Gửi lại liên kết khác hoặc đổi email
                  </button>
                </div>
              </div>
            )}

            {/* Form: Step 1 - Enter Email for OTP */}
            {authMethod === 'otp' && !otpSent && (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div>
                  <label
                    htmlFor="customer-otp-email"
                    className="block text-xs font-semibold text-black/80 mb-1"
                  >
                    Địa chỉ Email nhận mã OTP
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"
                    />
                    <input
                      id="customer-otp-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ban@example.com"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] focus:ring-1 focus:ring-[#234386] bg-[#fbf9f6]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#234386] hover:bg-[#1a3468] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang gửi mã...
                    </span>
                  ) : (
                    <>
                      <KeyRound size={15} />
                      <span>Gửi Mã Xác Thực OTP</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Form: Step 2 - Enter 6-digit OTP Code */}
            {authMethod === 'otp' && otpSent && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label
                      htmlFor="customer-otp-code"
                      className="block text-xs font-semibold text-black/80"
                    >
                      Nhập mã xác thực 6 chữ số
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false)
                        setOtpCode('')
                        setInfoMessage(null)
                      }}
                      className="text-[11px] font-semibold text-[#ed7328] hover:underline"
                    >
                      Đổi email
                    </button>
                  </div>
                  <div className="relative">
                    <KeyRound
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"
                    />
                    <input
                      id="customer-otp-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      autoFocus
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className="w-full pl-10 pr-3.5 py-2.5 text-base font-mono tracking-widest text-center rounded-xl border border-[#d2b68c]/50 focus:outline-none focus:border-[#234386] focus:ring-1 focus:ring-[#234386] bg-[#fbf9f6]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 rounded-xl bg-[#ed7328] hover:bg-[#d86218] text-white text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang xác nhận mã...
                    </span>
                  ) : (
                    <>
                      <UserCheck size={16} />
                      <span>Xác nhận & Đăng nhập</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Local InBucket Hint for Development */}
            <div className="pt-2 text-[11px] text-black/50 bg-amber-500/5 p-3 rounded-xl border border-amber-500/15">
              <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-0.5">
                <ShieldCheck size={13} className="text-amber-600 shrink-0" />
                <span>Môi trường Thử nghiệm Local</span>
              </div>
              <p>
                Email xác thực và mã OTP được gửi tới hòm thư nội bộ{' '}
                <a
                  href="http://localhost:54324"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#234386] underline inline-flex items-center gap-0.5"
                >
                  InBucket (cổng 54324) <ExternalLink size={10} />
                </a>
                .
              </p>
            </div>
          </div>

          {/* Guest Continuation Action (Invariant V19 / Optional Login) */}
          <div className="mt-8 pt-6 border-t border-[#d2b68c]/30 text-center space-y-3">
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="w-full py-2.5 px-4 rounded-xl border border-[#d2b68c] text-xs sm:text-sm font-semibold text-black/70 hover:text-black hover:bg-stone-50 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Tiếp tục với tư cách Khách</span>
              <ArrowRight size={14} />
            </button>
            <p className="text-[11px] text-black/50">
              Bạn vẫn có thể đặt món giao tận nơi hoặc tại bàn mà không cần tài khoản.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
