import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../LoginPage'
import { AuthContext, type AuthState } from '../AuthContext'
import { supabase } from '../../../lib/supabase'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}))

function renderLoginPage(authStateOverrides?: Partial<AuthState>) {
  const defaultAuthState: AuthState = {
    user: null,
    session: null,
    role: 'guest',
    customerProfile: null,
    adminProfile: null,
    isLoading: false,
    error: null,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    ...authStateOverrides,
  }

  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthContext.Provider value={defaultAuthState}>
        <LoginPage />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login heading, Google OAuth button, and guest continuation button', () => {
    renderLoginPage()

    expect(
      screen.getByRole('heading', { name: /Đăng nhập Tài khoản Khách hàng/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đăng nhập với Google/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tiếp tục với tư cách Khách/i })).toBeInTheDocument()
  })

  it('switches between Magic Link and OTP tab modes', () => {
    renderLoginPage()

    const otpTab = screen.getByRole('button', { name: /Mã OTP 6 số/i })
    fireEvent.click(otpTab)

    expect(screen.getByRole('button', { name: /Gửi Mã Xác Thực OTP/i })).toBeInTheDocument()

    const magicLinkTab = screen.getByRole('button', { name: /Liên kết Đăng nhập/i })
    fireEvent.click(magicLinkTab)

    expect(screen.getByRole('button', { name: /Gửi Liên kết Đăng nhập/i })).toBeInTheDocument()
  })

  it('handles Google OAuth click and calls supabase.auth.signInWithOAuth', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com' },
      error: null,
    })

    renderLoginPage()

    const googleBtn = screen.getByRole('button', { name: /Đăng nhập với Google/i })
    fireEvent.click(googleBtn)

    await waitFor(() => {
      expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/auth/callback'),
        }),
      })
    })
  })

  it('validates email before sending Magic Link', async () => {
    renderLoginPage()

    const submitBtn = screen.getByRole('button', { name: /Gửi Liên kết Đăng nhập/i })
    const emailInput = screen.getByLabelText(/Địa chỉ Email của bạn/i)

    fireEvent.change(emailInput, { target: { value: 'invalid-email' } })
    fireEvent.submit(submitBtn.closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/địa chỉ email hợp lệ/i)
    })
  })
})
