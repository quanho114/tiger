import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext, type AuthState } from '@/features/auth/AuthContext'
import { CartProvider } from '@/store/CartProvider'
import { CustomerRouteGuard } from '../CustomerRouteGuard'
import { AccountOverviewPage } from '../AccountOverviewPage'
import { AccountOrdersPage } from '../AccountOrdersPage'
import { AccountReservationsPage } from '../AccountReservationsPage'
import { AccountAddressesPage } from '../AccountAddressesPage'
import { AccountFavoritesPage } from '../AccountFavoritesPage'
import { AccountProfilePage } from '../AccountProfilePage'
import { ReorderWarningModal } from '../ReorderWarningModal'
import * as api from '../api'

vi.mock('../api', () => ({
  fetchCustomerHome: vi.fn(),
  fetchCustomerOrders: vi.fn(),
  fetchCustomerOrderDetail: vi.fn(),
  fetchCustomerReservations: vi.fn(),
  cancelCustomerReservation: vi.fn(),
  fetchCustomerAddresses: vi.fn(),
  createCustomerAddress: vi.fn(),
  updateCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
  fetchCustomerFavorites: vi.fn(),
  addCustomerFavorite: vi.fn(),
  removeCustomerFavorite: vi.fn(),
  fetchCustomerProfile: vi.fn(),
  updateCustomerProfile: vi.fn(),
  prepareCustomerReorder: vi.fn(),
}))

const mockUser = {
  id: 'cust-123',
  email: 'khachhang@tiger345.com',
  user_metadata: { full_name: 'Trần Văn Khách' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
} as any

function createMockAuthState(overrides?: Partial<AuthState>): AuthState {
  return {
    user: mockUser,
    session: {} as any,
    role: 'customer',
    customerProfile: {
      userId: 'cust-123',
      displayName: 'Trần Văn Khách',
      phone: '0901234567',
      avatarUrl: null,
      marketingOptIn: true,
    },
    adminProfile: null,
    isLoading: false,
    error: null,
    signOut: vi.fn(),
    refreshSession: vi.fn(),
    ...overrides,
  }
}

function renderWithProviders(ui: React.ReactElement, authState: AuthState) {
  return render(
    <MemoryRouter>
      <CartProvider>
        <AuthContext.Provider value={authState}>{ui}</AuthContext.Provider>
      </CartProvider>
    </MemoryRouter>
  )
}

describe('T16: Customer Account & Personalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('CustomerRouteGuard', () => {
    it('redirects unauthenticated/guest users to /login', () => {
      const guestState = createMockAuthState({ user: null, role: 'guest' })

      render(
        <MemoryRouter initialEntries={['/account']}>
          <AuthContext.Provider value={guestState}>
            <Routes>
              <Route
                path="/account"
                element={
                  <CustomerRouteGuard>
                    <div>Account Protected Content</div>
                  </CustomerRouteGuard>
                }
              />
              <Route path="/login" element={<div>Login Page Redirect Target</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(screen.getByText('Login Page Redirect Target')).toBeInTheDocument()
      expect(screen.queryByText('Account Protected Content')).not.toBeInTheDocument()
    })

    it('renders children when authenticated as customer', () => {
      const customerState = createMockAuthState({ role: 'customer' })

      render(
        <MemoryRouter initialEntries={['/account']}>
          <AuthContext.Provider value={customerState}>
            <CustomerRouteGuard>
              <div>Account Protected Content</div>
            </CustomerRouteGuard>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(screen.getByText('Account Protected Content')).toBeInTheDocument()
    })

    it('redirects admin users to /admin', () => {
      const adminState = createMockAuthState({
        role: 'admin',
        adminProfile: {
          userId: 'cust-123',
          displayName: 'Bếp Trưởng Admin',
          active: true,
        },
      })

      render(
        <MemoryRouter initialEntries={['/account']}>
          <AuthContext.Provider value={adminState}>
            <Routes>
              <Route
                path="/account"
                element={
                  <CustomerRouteGuard>
                    <div>Account Protected Content</div>
                  </CustomerRouteGuard>
                }
              />
              <Route path="/admin" element={<div>Admin Dashboard Redirect Target</div>} />
            </Routes>
          </AuthContext.Provider>
        </MemoryRouter>
      )

      expect(screen.getByText('Admin Dashboard Redirect Target')).toBeInTheDocument()
      expect(screen.queryByText('Account Protected Content')).not.toBeInTheDocument()
    })
  })

  describe('AccountOverviewPage', () => {
    it('fetches and renders customer summary, recent orders, and quick stats', async () => {
      const authState = createMockAuthState()
      vi.mocked(api.fetchCustomerHome).mockResolvedValue({
        recent_orders: [
          {
            id: 'ord-1',
            code: 'TG-101',
            order_type: 'delivery',
            status: 'completed',
            payment_status: 'paid',
            payment_method: 'payos',
            subtotal_vnd: 250000,
            shipping_fee_vnd: 0,
            total_vnd: 250000,
            note: null,
            table_name_snapshot: null,
            address_snapshot: '123 Q1',
            zone_name_snapshot: null,
            item_count: 2,
            items_summary: [{ item_name: 'Gỏi Củ Hủ Dừa', quantity: 2 }],
            created_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
            confirmed_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            cancelled_at: null,
          },
        ],
        frequent_items: [],
        favorites: [
          {
            menu_item_id: 'item-1',
            name: 'Gỏi Củ Hủ Dừa Tôm Thịt',
            slug: 'goi-cu-hu-dua',
            price_vnd: 145000,
            image_path: null,
            available: true,
            allow_dine_in: true,
            allow_delivery: true,
            category_id: 'cat-1',
            category_name: 'Khai vị',
            created_at: new Date().toISOString(),
          },
        ],
        upcoming_reservations: [],
      })

      renderWithProviders(<AccountOverviewPage />, authState)

      const headings = await screen.findAllByText('Đơn hàng gần đây')
      expect(headings.length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('#TG-101')).toBeInTheDocument()
    })
  })

  describe('AccountOrdersPage', () => {
    it('renders order list and opens order detail modal on click', async () => {
      const authState = createMockAuthState()
      vi.mocked(api.fetchCustomerOrders).mockResolvedValue([
        {
          id: 'ord-1',
          code: 'TG-888',
          order_type: 'delivery',
          status: 'delivering',
          payment_status: 'paid',
          payment_method: 'payos',
          subtotal_vnd: 300000,
          shipping_fee_vnd: 20000,
          total_vnd: 320000,
          note: null,
          table_name_snapshot: null,
          address_snapshot: '123 Nguyễn Thị Minh Khai, Q1',
          zone_name_snapshot: null,
          item_count: 3,
          items_summary: [{ item_name: 'Bò Lúc Lắc Tiger', quantity: 1 }],
          created_at: new Date().toISOString(),
          paid_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          completed_at: null,
          cancelled_at: null,
        },
      ])

      vi.mocked(api.fetchCustomerOrderDetail).mockResolvedValue({
        id: 'ord-1',
        code: 'TG-888',
        order_type: 'delivery',
        status: 'delivering',
        payment_status: 'paid',
        payment_method: 'payos',
        subtotal_vnd: 300000,
        shipping_fee_vnd: 20000,
        total_vnd: 320000,
        note: null,
        table_name_snapshot: null,
        address_snapshot: '123 Nguyễn Thị Minh Khai, Q1',
        zone_name_snapshot: null,
        item_count: 3,
        items_summary: [{ item_name: 'Bò Lúc Lắc Tiger', quantity: 1 }],
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        completed_at: null,
        cancelled_at: null,
        customer_name: 'Trần Văn Khách',
        customer_phone: '0901234567',
        version: 1,
        items: [
          {
            id: 'item-1',
            menu_item_id: 'm-1',
            item_name: 'Bò Lúc Lắc Tiger',
            quantity: 1,
            unit_price_vnd: 220000,
            line_total_vnd: 220000,
            note: null,
            position: 1,
          },
        ],
        timeline: [],
      })

      renderWithProviders(<AccountOrdersPage />, authState)

      expect(await screen.findByText('#TG-888')).toBeInTheDocument()
      expect(screen.getByText(/320\.000/)).toBeInTheDocument()

      const viewBtn = screen.getByRole('button', { name: /Xem/i })
      fireEvent.click(viewBtn)

      expect(await screen.findByText(/Đơn hàng #TG-888/i)).toBeInTheDocument()
    })
  })

  describe('AccountReservationsPage & Invariant V16 (60-min Cutoff)', () => {
    it('permits cancellation when reservation is more than 60 mins away', async () => {
      const authState = createMockAuthState()
      const futureDate = new Date(Date.now() + 120 * 60 * 1000).toISOString()

      vi.mocked(api.fetchCustomerReservations).mockResolvedValue([
        {
          id: 'res-1',
          code: 'RES-999',
          customer_name: 'Trần Văn Khách',
          customer_phone: '0901234567',
          starts_at: futureDate,
          ends_at: futureDate,
          guest_count: 4,
          seating_area_id: null,
          area_name_snapshot: null,
          status: 'confirmed',
          note: 'Bàn cạnh cửa sổ',
          version: 1,
          created_at: new Date().toISOString(),
        },
      ])

      renderWithProviders(<AccountReservationsPage />, authState)

      expect(await screen.findByText(/RES-999/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Hủy bàn/i })).toBeInTheDocument()
    })

    it('displays hotline instructions and disables self-cancel when under 60 mins (Invariant V16)', async () => {
      const authState = createMockAuthState()
      const nearFutureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString()

      vi.mocked(api.fetchCustomerReservations).mockResolvedValue([
        {
          id: 'res-2',
          code: 'RES-001',
          customer_name: 'Trần Văn Khách',
          customer_phone: '0901234567',
          starts_at: nearFutureDate,
          ends_at: nearFutureDate,
          guest_count: 2,
          seating_area_id: null,
          area_name_snapshot: null,
          status: 'confirmed',
          note: null,
          version: 1,
          created_at: new Date().toISOString(),
        },
      ])

      renderWithProviders(<AccountReservationsPage />, authState)

      expect(await screen.findByText(/RES-001/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Hủy bàn/i })).not.toBeInTheDocument()
      expect(screen.getByText(/090 280 99 29/)).toBeInTheDocument()
    })
  })

  describe('AccountAddressesPage & Invariant V20 (Address Book Integrity)', () => {
    it('displays address list with default badge and handles add address modal', async () => {
      const authState = createMockAuthState()
      vi.mocked(api.fetchCustomerAddresses).mockResolvedValue([
        {
          id: 'addr-1',
          label: 'Nhà riêng',
          recipient_name: 'Trần Văn Khách',
          phone: '0901234567',
          address_line: '345 Trần Hưng Đạo',
          ward: 'Phường Cầu Kho',
          district: 'Quận 1',
          province: 'TP. Hồ Chí Minh',
          delivery_note: 'Giao giờ hành chính',
          is_default: true,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])

      renderWithProviders(<AccountAddressesPage />, authState)

      expect(await screen.findByText(/345 Trần Hưng Đạo/)).toBeInTheDocument()
      expect(screen.getByText('Mặc định')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thêm địa chỉ mới/i })).toBeInTheDocument()
    })
  })

  describe('AccountFavoritesPage', () => {
    it('displays favorite items with option to remove or add to cart', async () => {
      const authState = createMockAuthState()
      vi.mocked(api.fetchCustomerFavorites).mockResolvedValue([
        {
          menu_item_id: 'fav-1',
          name: 'Cua Lột Rang Muối Hồng Kông',
          slug: 'cua-lot-rang-muoi',
          price_vnd: 285000,
          image_path: null,
          available: true,
          allow_dine_in: true,
          allow_delivery: true,
          category_id: 'cat-2',
          category_name: 'Hải sản',
          created_at: new Date().toISOString(),
        },
      ])

      renderWithProviders(<AccountFavoritesPage />, authState)

      expect(await screen.findByText('Cua Lột Rang Muối Hồng Kông')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Thêm vào giỏ/i })).toBeInTheDocument()
    })
  })

  describe('AccountProfilePage & Invariant V04 (Privacy and Data Deletion)', () => {
    it('renders profile fields and data deletion CTA', async () => {
      const authState = createMockAuthState()
      vi.mocked(api.fetchCustomerProfile).mockResolvedValue({
        user_id: 'cust-123',
        display_name: 'Trần Văn Khách',
        phone: '0901234567',
        avatar_url: null,
        marketing_opt_in: true,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      })

      renderWithProviders(<AccountProfilePage />, authState)

      expect(await screen.findByDisplayValue('Trần Văn Khách')).toBeInTheDocument()
      expect(screen.getByDisplayValue('0901234567')).toBeInTheDocument()
      expect(screen.getByText(/Yêu cầu xóa tài khoản/i)).toBeInTheDocument()
    })
  })

  describe('ReorderWarningModal & Invariant V21 (Reorder Safety)', () => {
    it('displays transparent price change and availability warnings before cart replacement', () => {
      const onClose = vi.fn()

      const reorderData = {
        source_order_id: 'ord-123',
        source_order_code: 'TG-123',
        target_order_type: 'delivery' as const,
        subtotal_vnd: 420000,
        items: [
          {
            menu_item_id: 'item-1',
            item_name: 'Lẩu Tôm Càng Xanh',
            unit_price_vnd: 420000,
            quantity: 1,
            line_total_vnd: 420000,
            note: '',
            available: true,
            allow_dine_in: true,
            allow_delivery: true,
          },
        ],
        warnings: [
          {
            type: 'PRICE_CHANGED' as const,
            item_name: 'Lẩu Tôm Càng Xanh',
            old_price_vnd: 380000,
            new_price_vnd: 420000,
            message: 'Giá món "Lẩu Tôm Càng Xanh" đã cập nhật từ 380.000đ thành 420.000đ.',
          },
          {
            type: 'ITEM_OUT_OF_STOCK' as const,
            item_name: 'Hàu Nướng Phô Mai',
            message: 'Món "Hàu Nướng Phô Mai" hiện tạm ngưng phục vụ và sẽ không được thêm vào giỏ.',
          },
        ],
      }

      render(
        <CartProvider>
          <ReorderWarningModal
            isOpen={true}
            onClose={onClose}
            reorderData={reorderData}
          />
        </CartProvider>
      )

      expect(screen.getByText(/Đặt lại đơn #TG-123/i)).toBeInTheDocument()
      expect(screen.getByText(/Giá món "Lẩu Tôm Càng Xanh" đã cập nhật/i)).toBeInTheDocument()
      expect(screen.getByText(/Món "Hàu Nướng Phô Mai" hiện tạm ngưng/i)).toBeInTheDocument()

      const confirmBtn = screen.getByRole('button', { name: /Cập nhật vào giỏ hàng/i })
      fireEvent.click(confirmBtn)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
