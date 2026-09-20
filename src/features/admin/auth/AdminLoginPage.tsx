import { useState, useEffect, useCallback, type FC, type FormEvent } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
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
    <div className="min-h-screen bg-stone-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center space-x-2">
          <span className="text-3xl font-black tracking-wider text-amber-500">TIGER 345</span>
          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded font-mono font-bold tracking-wider">
            ADMIN
          </span>
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-stone-100">
          Đăng nhập Hệ thống Điều phối Vận hành
        </h2>
        <p className="mt-1 text-center text-xs text-stone-400">
          Khu vực bảo mật dành cho Bếp Trưởng và Quản Lý
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-stone-900 py-8 px-6 shadow-2xl rounded-xl sm:px-10 border border-stone-800">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {errorMessage && (
              <div className="rounded-lg bg-rose-950/70 border border-rose-800 p-3.5 text-xs text-rose-200 flex items-start space-x-2">
                <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider">
                Email Quản trị
              </label>
              <div className="mt-1.5">
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@tiger345.local"
                  className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-700 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-stone-300 uppercase tracking-wider">
                Mật khẩu
              </label>
              <div className="mt-1.5">
                <input
                  id="admin-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-stone-950 border border-stone-700 rounded-lg text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-stone-950 bg-amber-500 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                    <span>Đang đăng nhập...</span>
                  </div>
                ) : (
                  'Đăng nhập vào Hệ thống'
                )}
              </button>

              {import.meta.env.DEV && (
                <button
                  type="button"
                  onClick={() => performLogin(DEV_DEFAULT_EMAIL, DEV_DEFAULT_PASSWORD)}
                  disabled={isSubmitting}
                  className="w-full mt-3 py-2 px-4 border border-amber-500/40 rounded-lg text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <span>⚡ Đăng nhập nhanh Dev ({DEV_DEFAULT_EMAIL})</span>
                </button>
              )}
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-stone-800 text-center">
            <a
              href="/"
              className="text-xs font-medium text-stone-400 hover:text-amber-400 transition"
            >
              ← Quay lại trang chủ khách hàng
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
