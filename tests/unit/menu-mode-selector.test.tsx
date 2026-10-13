import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MenuPage } from '@/features/catalog/MenuPage'
import { CatalogProvider } from '@/features/catalog'
import { CartProvider, useCart } from '@/features/cart'
import { TableSessionProvider, useTableSession } from '@/features/table-session'
import * as catalogApi from '@/features/catalog/api'
import type { MenuResponse, RestaurantSettings } from '@/features/catalog/types'

vi.mock('@/features/catalog/api', () => ({
  fetchMenu: vi.fn(),
  fetchSettings: vi.fn(),
}))

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ role: 'guest' }),
}))

vi.mock('@/features/concierge/ConciergeProvider', () => ({
  useConciergeSession: () => ({ setViewedMenuItemId: vi.fn() }),
}))

const menu: MenuResponse = {
  categories: [],
  items: [],
}

const settings: RestaurantSettings = {
  name: 'Tiger 345',
  phone: '0900000000',
  zalo: '0900000000',
  facebook: 'https://example.test/tiger345',
  maps_url: 'https://example.test/map',
  address: 'Vĩnh An',
  timezone: 'Asia/Ho_Chi_Minh',
  accepting_orders: true,
  accepting_dine_in_orders: true,
  accepting_delivery_orders: true,
  booking_enabled: true,
  min_delivery_order_vnd: 0,
  reservation_policy: {
    min_notice_minutes: 60,
    max_days_ahead: 30,
    duration_minutes: 120,
    cancel_notice_minutes: 30,
    no_show_grace_minutes: 15,
  },
  business_hours: [],
  business_closures: [],
  delivery_zones: [],
  seating_areas: [],
}

function StateObserver() {
  const location = useLocation()
  const { cartItems, context } = useCart()
  const { session } = useTableSession()

  return <output aria-label="Trạng thái thực đơn">{JSON.stringify({ search: location.search, itemCount: cartItems.length, context, session })}</output>
}

function readState() {
  return JSON.parse(screen.getByLabelText('Trạng thái thực đơn').textContent ?? '{}') as {
    search: string
    itemCount: number
    context: Record<string, string>
    session: Record<string, string> | null
  }
}

function renderMenu(initialEntry = '/menu') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CatalogProvider>
        <TableSessionProvider>
          <CartProvider>
            <MenuPage />
            <StateObserver />
          </CartProvider>
        </TableSessionProvider>
      </CatalogProvider>
    </MemoryRouter>
  )
}

function seedCart() {
  window.localStorage.setItem(
    'tiger_cart_draft_v1',
    JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      context: { mode: 'delivery' },
      items: [{ dishId: 'dish-1', quantity: 1, dishSnapshot: { id: 'dish-1', name: 'Món thử', price: 100000 } }],
    })
  )
}

function seedTableSession() {
  window.sessionStorage.setItem(
    'tiger_table_session_v1',
    JSON.stringify({
      tableId: 'table-9',
      tableCode: 'T9',
      tableName: 'Bàn 9',
      visitId: 'visit-9',
      visitCapability: 'capability-9',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
  )
}

function radio(name: string) {
  return screen.getByRole('radio', { name })
}

describe('MenuPage order-mode selector', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.mocked(catalogApi.fetchMenu).mockResolvedValue(menu)
    vi.mocked(catalogApi.fetchSettings).mockResolvedValue(settings)
  })

  it.each([
    ['/menu', 'Tại quán'],
    ['/menu?mode=delivery', 'Giao tận nơi'],
    ['/menu?mode=takeaway', 'Mang đi'],
  ])('derives the controlled native radio selection from %s', (initialEntry, selectedLabel) => {
    renderMenu(initialEntry)

    expect(screen.getByRole('group', { name: 'Chọn hình thức thưởng thức' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(radio('Tại quán')).toHaveAttribute('type', 'radio')
    expect(radio('Giao tận nơi')).toHaveAttribute('type', 'radio')
    expect(radio('Mang đi')).toHaveAttribute('type', 'radio')
    expect(radio(selectedLabel)).toBeChecked()
  })

  it.each([
    ['/menu', 'Giao tận nơi', '?mode=delivery'],
    ['/menu', 'Mang đi', '?mode=takeaway'],
    ['/menu?mode=delivery', 'Tại quán', ''],
  ])('changes an empty cart from %s to the expected URL for %s', async (initialEntry, targetLabel, expectedSearch) => {
    const user = userEvent.setup()
    renderMenu(initialEntry)

    await user.click(radio(targetLabel))

    expect(readState().search).toBe(expectedSearch)
    expect(radio(targetLabel)).toBeChecked()
  })

  it('does nothing when the already-selected mode is chosen', async () => {
    const user = userEvent.setup()
    seedCart()
    renderMenu('/menu?mode=delivery')
    const before = readState()

    await user.click(radio('Giao tận nơi'))

    expect(screen.queryByRole('dialog', { name: 'Thay Đổi Hình Thức Phục Vụ?' })).not.toBeInTheDocument()
    expect(readState()).toEqual(before)
    expect(radio('Giao tận nơi')).toBeChecked()
  })

  it('keeps the selected mode, cart, and context when a pending change is cancelled or escaped', async () => {
    const user = userEvent.setup()
    seedCart()
    renderMenu('/menu?mode=delivery')
    const before = readState()

    await user.click(radio('Mang đi'))
    expect(screen.getByRole('dialog', { name: 'Thay Đổi Hình Thức Phục Vụ?' })).toBeInTheDocument()
    expect(radio('Giao tận nơi')).toBeChecked()
    expect(readState()).toEqual(before)

    await user.click(screen.getByRole('button', { name: 'Giữ giỏ hàng hiện tại' }))
    expect(readState()).toEqual(before)

    await user.click(radio('Mang đi'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Thay Đổi Hình Thức Phục Vụ?' })).not.toBeInTheDocument()
    expect(readState()).toEqual(before)
  })

  it('clears a pending cart once and restores the table session context after confirming dine-in', async () => {
    const user = userEvent.setup()
    seedCart()
    seedTableSession()
    renderMenu('/menu?mode=delivery')

    await user.click(radio('Tại quán'))
    expect(radio('Giao tận nơi')).toBeChecked()
    expect(readState().itemCount).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Đồng ý chuyển & làm mới giỏ hàng' }))

    expect(readState()).toMatchObject({
      search: '',
      itemCount: 0,
      context: {
        mode: 'dine-in',
        tableId: 'table-9',
        tableCode: 'T9',
        tableName: 'Bàn 9',
        visitId: 'visit-9',
      },
    })
    expect(radio('Tại quán')).toBeChecked()
  })
})
