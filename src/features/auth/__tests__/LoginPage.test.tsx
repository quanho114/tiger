import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '../LoginPage'
import { AuthContext, type AuthState } from '../AuthContext'
import { supabase } from '@/shared/lib/supabase'

vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
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

  it('renders login heading and Google OAuth without a guest continuation button', () => {
    renderLoginPage()

    expect(
      screen.getByRole('heading', { name: /Tài khoản của bạn/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Đăng nhập với Google/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tiếp tục với tư cách Khách/i })).not.toBeInTheDocument()
  })

  it('offers only Google login', () => {
    renderLoginPage()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
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

  it('reports unavailable Google login without suggesting SMS', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { message: 'Provider not enabled', name: 'AuthApiError', status: 400 } as never,
    })
    renderLoginPage()
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập với Google/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('chưa được kích hoạt')
    expect(screen.getByRole('alert')).not.toHaveTextContent('điện thoại')
  })
})
