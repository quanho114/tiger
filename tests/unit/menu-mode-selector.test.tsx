import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { MenuPage } from '@/features/catalog/MenuPage'
import { CatalogProvider } from '@/features/catalog'
import { CartProvider, useCart } from '@/features/cart'
import { TableSessionProvider, useTableSession } from '@/features/table-session'
import * as catalogApi from '@/features/catalog/api'
import type { MenuItem, MenuResponse, RestaurantSettings } from '@/features/catalog/types'

vi.mock('@/features/catalog/components/DishImage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/catalog/components/DishImage')>()
  return { ...actual, DishImage: vi.fn(actual.DishImage) }
})

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

  return <output aria-label="Trạng thái thực đơn">{JSON.stringify({ search: location.search, itemCount: cartItems.length, lines: cartItems.map(item => ({ quantity: item.quantity, note: item.note })), context, session })}</output>
}

function readState() {
  return JSON.parse(screen.getByLabelText('Trạng thái thực đơn').textContent ?? '{}') as {
    search: string
    itemCount: number
    lines: { quantity: number; note?: string }[]
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

function menuDish(id: string, categoryId: string, name: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id, category_id: categoryId, name, slug: id, description: '', price_vnd: 100000,
    pricing_mode: 'fixed', image_path: '', image_url: '', available: true, is_available: true,
    allow_dine_in: true, allow_delivery: true, featured_rank: null, is_featured: false,
    tags: [], serving_size: '', pairing_note: '', delivery_eta: '', spice_level: 0,
    is_signature: false, is_bestseller: false, is_new: false, ...overrides,
  }
}

const navigationMenu: MenuResponse = {
  categories: [
    { id: 'seafood', name: 'Hải sản', slug: 'hai-san', sort_order: 2 },
    { id: 'chicken', name: 'Gà', slug: 'ga', sort_order: 1 },
  ],
  items: [
    menuDish('chicken-1', 'chicken', 'Gà nướng muối ớt'),
    menuDish('shrimp-1', 'seafood', 'Tôm nướng', { description: 'Ăn cùng rau rừng', tags: ['Đậm đà'] }),
    menuDish('other-1', 'missing-category', 'Món theo ngày'),
    menuDish('dine-in-1', 'chicken', 'Gà dùng tại quán', { allow_delivery: false }),
  ],
}

describe('MenuPage category navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.mocked(catalogApi.fetchMenu).mockResolvedValue(navigationMenu)
    vi.mocked(catalogApi.fetchSettings).mockResolvedValue(settings)
    vi.stubGlobal('scrollTo', vi.fn())
  })

  afterEach(() => vi.unstubAllGlobals())

  it('adjusts a dish quantity inline and returns to the add button at zero', async () => {
    const user = userEvent.setup()
    renderMenu()
    const heading = await screen.findByRole('heading', { name: 'Gà nướng muối ớt' })
    const card = within(heading.closest('article')!)
    await user.click(card.getByRole('button', { name: 'Thêm món' }))
    expect(card.getByRole('status', { name: 'Số lượng Gà nướng muối ớt' })).toHaveTextContent('1')
    await user.click(card.getByRole('button', { name: 'Tăng số lượng Gà nướng muối ớt' }))
    expect(card.getByRole('status', { name: 'Số lượng Gà nướng muối ớt' })).toHaveTextContent('2')
    await user.click(card.getByRole('button', { name: 'Giảm số lượng Gà nướng muối ớt' }))
    expect(card.getByRole('status', { name: 'Số lượng Gà nướng muối ớt' })).toHaveTextContent('1')
    await user.click(card.getByRole('button', { name: 'Giảm số lượng Gà nướng muối ớt' }))
    expect(card.queryByRole('status')).not.toBeInTheDocument()
    expect(card.getByRole('button', { name: 'Thêm món' })).toBeEnabled()
    expect(readState().itemCount).toBe(0)
  })

  it('counts noted portions and decrements without losing the remaining notes', async () => {
    window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify({
      version: 1, updatedAt: Date.now(), context: { mode: 'takeaway' },
      items: [
        { dishId: 'chicken-1', quantity: 1 },
        { dishId: 'chicken-1', quantity: 2, note: 'Không cay' },
      ],
    }))
    const user = userEvent.setup()
    renderMenu('/menu?mode=takeaway')
    const heading = await screen.findByRole('heading', { name: 'Gà nướng muối ớt' })
    const card = within(heading.closest('article')!)
    expect(card.getByRole('status', { name: 'Số lượng Gà nướng muối ớt' })).toHaveTextContent('3')
    await user.click(card.getByRole('button', { name: 'Giảm số lượng Gà nướng muối ớt' }))
    expect(readState().lines).toEqual([{ quantity: 2, note: 'Không cay' }])
    await user.click(card.getByRole('button', { name: 'Giảm số lượng Gà nướng muối ớt' }))
    expect(readState().lines).toEqual([{ quantity: 1, note: 'Không cay' }])
    await user.click(card.getByRole('button', { name: 'Tăng số lượng Gà nướng muối ớt' }))
    expect(card.getByRole('status', { name: 'Số lượng Gà nướng muối ớt' })).toHaveTextContent('2')
    expect(readState().lines).toEqual([{ quantity: 2, note: 'Không cay' }])
  })

  it('shows only the selected group and keeps all category buttons', async () => {
    renderMenu()
    expect(await screen.findByRole('heading', { name: 'Gà' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hải sản' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Món khác' })).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Danh mục món ăn' })
    expect(within(nav).getAllByRole('button').filter(button => button.hasAttribute('aria-controls')).map(button => button.textContent)).toEqual(['Gà', 'Hải sản', 'Món khác'])
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('opens a 98-dish menu with eight cards and still supports distant categories and search', async () => {
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    })
    vi.mocked(catalogApi.fetchMenu).mockResolvedValue({
      categories: navigationMenu.categories,
      items: Array.from({ length: 98 }, (_, i) => menuDish(`dish-${i}`, i < 49 ? 'chicken' : 'seafood', `Món số ${i}`)),
    })
    const user = userEvent.setup()
    const { container } = renderMenu()
    const nav = await screen.findByRole('navigation', { name: 'Danh mục món ăn' })
    expect(container.querySelectorAll('[data-menu-slot-id]')).toHaveLength(49)
    expect(screen.getAllByRole('article')).toHaveLength(8)
    await user.click(within(nav).getByRole('button', { name: 'Hải sản' }))
    expect(screen.getByRole('heading', { name: 'Món số 49' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(8)
    await user.type(screen.getByRole('searchbox', { name: 'Tìm món' }), 'Món số 97')
    expect(screen.getByRole('heading', { name: 'Món số 97' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('switches groups without retaining the previous dishes, including uncategorized dishes', async () => {
    const user = userEvent.setup()
    renderMenu()
    const nav = await screen.findByRole('navigation', { name: 'Danh mục món ăn' })
    await user.click(within(nav).getByRole('button', { name: 'Hải sản' }))
    expect(screen.queryByRole('heading', { name: 'Gà nướng muối ớt' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tôm nướng' })).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    await user.click(within(nav).getByRole('button', { name: 'Món khác' }))
    expect(screen.getByRole('heading', { name: 'Món theo ngày' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tôm nướng' })).not.toBeInTheDocument()
  })

  it.each(['tom', 'rau rung', 'dam da'])('searches the whole menu without accents for %s and clears back to the selected group', async query => {
    const user = userEvent.setup()
    renderMenu()
    const nav = await screen.findByRole('navigation', { name: 'Danh mục món ăn' })
    await user.click(within(nav).getByRole('button', { name: 'Gà' }))
    await user.type(screen.getByRole('searchbox', { name: 'Tìm món' }), query)
    expect(screen.getByRole('heading', { name: 'Tôm nướng' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gà nướng muối ớt' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('retains service availability while showing grouped dishes', async () => {
    renderMenu('/menu?mode=delivery')
    expect(await screen.findByRole('heading', { name: 'Gà nướng muối ớt' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Gà dùng tại quán' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })
})

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
