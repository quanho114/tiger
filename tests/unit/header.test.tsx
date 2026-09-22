import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Header } from '@/components/Header'
import { AuthContext, type AuthState } from '@/features/auth/AuthContext'
import { CartProvider } from '@/store/CartProvider'
import { TableSessionProvider } from '@/features/table-session/TableSessionContext'

function createMockAuthState(overrides?: Partial<AuthState>): AuthState {
  return {
    user: null,
    session: null,
    role: 'guest',
    customerProfile: null,
    adminProfile: null,
    isLoading: false,
    error: null,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    ...overrides,
  }
}

function renderHeader(authState: AuthState) {
  return render(
    <MemoryRouter>
      <CartProvider>
        <TableSessionProvider>
          <AuthContext.Provider value={authState}>
            <Header />
          </AuthContext.Provider>
        </TableSessionProvider>
      </CartProvider>
    </MemoryRouter>
  )
}

describe('Public Header Navigation & Role Separation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders login button for guest user and preserves reservation CTA', () => {
    const guestState = createMockAuthState({ user: null, role: 'guest' })
    renderHeader(guestState)

    // Guest sees "Đăng nhập" button
    const loginButton = screen.getByRole('button', { name: /đăng nhập/i })
    expect(loginButton).toBeInTheDocument()

    // CTA "Đặt bàn ngay" is preserved
    const ctaButtons = screen.getAllByRole('button', { name: /đặt bàn/i })
    expect(ctaButtons.length).toBeGreaterThan(0)
  })

  it('renders customer account dropdown with customer links for customer user', async () => {
    const user = userEvent.setup()
    const customerState = createMockAuthState({
      user: { id: 'cust-1', email: 'khach@tiger345.com' } as any,
      role: 'customer',
      customerProfile: {
        userId: 'cust-1',
        displayName: 'Nguyễn Văn Khách',
        phone: '0901234567',
        avatarUrl: null,
        marketingOptIn: true,
      },
    })

    renderHeader(customerState)

    // Find and click the desktop account trigger button
    const accountTrigger = screen.getByRole('button', { name: /tài khoản nguyễn văn khách/i })
    expect(accountTrigger).toBeInTheDocument()
    await user.click(accountTrigger)

    // Customer sees customer-specific links
    expect(screen.getByRole('link', { name: /tài khoản của tôi/i })).toHaveAttribute('href', '/account')
    expect(screen.getByRole('link', { name: /lịch sử đặt bàn/i })).toHaveAttribute('href', '/account/reservations')
    expect(screen.getByRole('link', { name: /đơn hàng/i })).toHaveAttribute('href', '/account/orders')
    expect(screen.getByRole('menuitem', { name: /đăng xuất/i })).toBeInTheDocument()

    // Must NOT show admin elements
    expect(screen.queryByText('Quản trị viên')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /trang quản trị/i })).not.toBeInTheDocument()
  })

  it('renders admin dropdown with "Trang quản trị" and NO customer links for admin user', async () => {
    const user = userEvent.setup()
    const adminState = createMockAuthState({
      user: { id: 'admin-1', email: 'admin@tiger345.com' } as any,
      role: 'admin',
      adminProfile: {
        userId: 'admin-1',
        displayName: 'Bếp Trưởng Tiger',
        active: true,
      },
    })

    renderHeader(adminState)

    // Find and click the desktop account trigger button
    const accountTrigger = screen.getByRole('button', { name: /tài khoản bếp trưởng tiger/i })
    expect(accountTrigger).toBeInTheDocument()
    await user.click(accountTrigger)

    // Admin sees admin badge & "Trang quản trị" link
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument()
    const adminLink = screen.getByRole('link', { name: /trang quản trị/i })
    expect(adminLink).toBeInTheDocument()
    expect(adminLink).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('menuitem', { name: /đăng xuất/i })).toBeInTheDocument()

    // Must NOT show customer links
    expect(screen.queryByRole('link', { name: /tài khoản của tôi/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /lịch sử đặt bàn/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /đơn hàng/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /yêu thích/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sổ địa chỉ/i })).not.toBeInTheDocument()
  })
})
