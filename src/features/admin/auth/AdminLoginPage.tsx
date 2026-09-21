import { useState, useEffect, useCallback, type FC, type FormEvent } from 'react'
import { Navigate, useNavigate, useLocation, Link } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, AlertCircle, KeyRound } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../auth'

const DEV_DEFAULT_EMAIL = 'admin_active@tiger345.vn'
const DEV_DEFAULT_PASSWORD = 'TestPassword123!'

export const AdminLoginPage: FC = () => {
  const { user, role, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState(() => (import.meta.env.DEV ? DEV_DEFAULT_EMAIL : ''))
  const [password, setPassword] = useState(() => (import.meta.env.DEV ? DEV_DEFAULT_PASSWORD : ''))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false)

  const performLogin = useCallback(async (loginEmail: string, loginPassword: string) => {
    setErrorMessage(null)

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setErrorMessage('Vui lòng nhập đầy đủ Email và Mật khẩu.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword.trim(),
      })

      if (error) {
        throw new Error(
          error.message === 'Invalid login credentials'
            ? 'Email hoặc mật khẩu không chính xác.'
            : error.message
        )
      }

      if (!data.user) {
        throw new Error('Đăng nhập không thành công.')
      }

      // Check active admin profile in admin_profiles table
      const { data: adminProfile, error: profileError } = await supabase
        .from('admin_profiles')
        .select('user_id, active, display_name')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (profileError) {
        await supabase.auth.signOut()
        throw new Error('Không thể kiểm tra thông tin quản trị viên.')
      }

      if (!adminProfile || !adminProfile.active) {
        await supabase.auth.signOut()
        throw new Error('Tài khoản không có quyền Quản trị hoặc đã bị vô hiệu hóa.')
      }

      // Success -> navigate to dashboard
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin'
      navigate(from, { replace: true })
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Đã có lỗi xảy ra khi đăng nhập.')
    } finally {
      setIsSubmitting(false)
    }
  }, [location.state, navigate])

  // Auto-login in development mode (skipped during automated webdriver tests and manual logouts)
  useEffect(() => {
    const isManualLogout = (location.state as { manualLogout?: boolean })?.manualLogout
    if (
      import.meta.env.DEV &&
      !navigator.webdriver &&
      !isManualLogout &&
      !autoLoginAttempted &&
      !isLoading &&
      (!user || role !== 'admin')
    ) {
      setAutoLoginAttempted(true)
      void performLogin(DEV_DEFAULT_EMAIL, DEV_DEFAULT_PASSWORD)
    }
  }, [location.state, autoLoginAttempted, isLoading, user, role, performLogin])

  // If already authenticated as admin, redirect to dashboard or previous route
  if (!isLoading && user && role === 'admin') {
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/admin'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    await performLogin(email, password)
  }

  return (
    <div className="min-h-screen bg-[#f6f5f3] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon & Name */}
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#2b2e2c] text-white shadow-xs mb-3">
          <ShieldCheck className="w-6 h-6 text-[#7cd56e]" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[#171a17]">
          TIGER 345 • Bếp &amp; Quán
        </h2>
        <p className="mt-1 text-xs text-[#787979]">
          Hệ thống điều phối vận hành &amp; quản lý đơn hàng
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-[#e2e3e3] rounded-2xl sm:px-10">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {errorMessage && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-700 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Email Quản trị viên
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tiger345.vn"
                className="w-full px-3.5 py-2.5 bg-[#faf9f7] border border-[#d2d2d2] rounded-xl text-xs text-[#171a17] placeholder-[#787979] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 focus:border-[#7cd56e] transition"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-slate-700 mb-1">
                Mật khẩu
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 bg-[#faf9f7] border border-[#d2d2d2] rounded-xl text-xs text-[#171a17] placeholder-[#787979] focus:outline-none focus:ring-2 focus:ring-[#7cd56e]/40 focus:border-[#7cd56e] transition"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="elera-btn-primary w-full h-10 rounded-xl text-xs font-semibold shadow-xs"
              >
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Đang đăng nhập...</span>
                  </div>
                ) : (
                  'Đăng nhập Hệ thống'
                )}
              </button>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={() => performLogin(DEV_DEFAULT_EMAIL, DEV_DEFAULT_PASSWORD)}
                  disabled={isSubmitting}
                  className="elera-btn-secondary w-full mt-2.5 h-10 rounded-xl text-xs font-semibold border-[#dedfdb] shadow-2xs gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#2b2e2c]" />
                  <span>Đăng nhập nhanh Dev ({DEV_DEFAULT_EMAIL})</span>
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-100 text-center">
            <Link
              to="/"
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-[#787979] hover:text-[#171a17] transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Quay lại trang chủ khách hàng</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
