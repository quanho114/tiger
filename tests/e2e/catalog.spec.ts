import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const orderModeGroupName = 'Chọn hình thức thưởng thức'

const mockMenuPayload = {
  data: {
    categories: [
      { id: 'cat-bo', name: 'Bò nướng', slug: 'bo-nuong', sort_order: 1 },
      { id: 'cat-lau', name: 'Lẩu đặc sản', slug: 'lau-dac-san', sort_order: 2 },
    ],
    items: [
      {
        id: 'item-1',
        category_id: 'cat-bo',
        name: 'Bò tơ nướng tảng sốt tiêu',
        slug: 'bo-to-nuong-tang-sot-tieu',
        description: 'Thịt bò tơ mềm nướng than hoa',
        price_vnd: 185000,
        image_path: '/images/bo-nuong.jpg',
        image_url: '/images/bo-nuong.jpg',
        available: true,
        is_available: true,
        allow_dine_in: true,
        allow_delivery: true,
        featured_rank: 1,
        is_featured: true,
        tags: ['Đặc sản'],
        serving_size: '2-3 người',
        pairing_note: 'Bia Tiger',
        delivery_eta: '25-35 phút',
        spice_level: 1,
        is_signature: true,
        is_bestseller: true,
        is_new: false,
      },
      {
        id: 'item-2',
        category_id: 'cat-lau',
        name: 'Lẩu riêu cua bắp bò',
        slug: 'lau-rieu-cua-bap-bo',
        description: 'Lẩu riêu cua đồng chua thanh',
        price_vnd: 295000,
        image_path: '/images/lau-rieu.jpg',
        image_url: '/images/lau-rieu.jpg',
        available: false,
        is_available: false,
        allow_dine_in: true,
        allow_delivery: true,
        featured_rank: 2,
        is_featured: true,
        tags: [],
        serving_size: '3-4 người',
        pairing_note: '',
        delivery_eta: '30-40 phút',
        spice_level: 0,
        is_signature: false,
        is_bestseller: false,
        is_new: false,
      },
    ],
  },
}

const mockSettingsPayload = {
  data: {
    name: 'Tiger 345',
    phone: '090 280 99 29',
    address: '17 Đường Số 1, Vĩnh An, An Nhơn Tây, Củ Chi, TP.HCM',
    opening_hours_text: '10:00 - 23:00 hàng ngày',
    accepting_delivery_orders: true,
    booking_enabled: true,
    min_delivery_order_vnd: 100000,
    business_hours: [
      { day_of_week: 1, open_time: '10:00', close_time: '23:00', is_closed: false },
    ],
    business_closures: [],
    delivery_zones: [
      { id: 'zone-1', name: 'Nội thành', district: 'Củ Chi', fee_vnd: 15000, min_order_vnd: 100000, is_active: true },
    ],
    seating_areas: [
      { id: 'area-1', name: 'Sân vườn', description: 'Thoáng mát', is_active: true },
    ],
  },
}

const fixtureCart = {
  version: 1,
  updatedAt: Date.now(),
  context: { mode: 'delivery' },
  items: [
    {
      dishId: 'item-1',
      quantity: 1,
      dishSnapshot: { id: 'item-1', name: 'Bò tơ nướng tảng sốt tiêu', price: 185000, image: '/images/bo-nuong.jpg' },
    },
  ],
}

function orderModeGroup(page: Page) {
  return page.getByRole('group', { name: orderModeGroupName })
}

function orderModeRadio(page: Page, name: string) {
  return orderModeGroup(page).getByRole('radio', { name })
}

async function selectOrderMode(page: Page, name: string) {
  await orderModeGroup(page).getByText(name, { exact: true }).click()
}

async function mockCatalog(page: Page) {
  await page.route('**/functions/v1/public-api/menu*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockMenuPayload),
    })
  })
}

test.describe('Tiger 345 Public Catalog E2E (T05 / V06, V17)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*', async (route) => {
      const requestUrl = new URL(route.request().url())
      if (['http://127.0.0.1:5173', 'http://localhost:5173'].includes(requestUrl.origin) && route.request().method() === 'GET') {
        await route.continue()
        return
      }
      await route.abort('blockedbyclient')
    })
    await page.route('**/functions/v1/public-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })
  })

  test('Menu page renders live categories and dishes from API', async ({ page }) => {
    await page.route('**/functions/v1/public-api/menu*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMenuPayload),
      })
    })

    await page.goto('/menu')

    // Page title and branding
    await expect(page).toHaveTitle(/Tiger 345/i)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Verify "Tất cả món" and specific category tabs
    const allTab = page.getByRole('button', { name: /tất cả món/i })
    await expect(allTab).toBeVisible()
    await expect(page.getByRole('button', { name: /bò nướng/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /lẩu đặc sản/i })).toBeVisible()

    // Dishes should render
    const dishCards = page.locator('article[data-dish-id]')
    await expect(dishCards.first()).toBeVisible({ timeout: 5000 })
    expect(await dishCards.count()).toBe(2)

    // Unavailable dish shows "Tạm hết"
    await expect(page.locator('article[data-dish-id="item-2"]').getByRole('button', { name: 'Tạm hết' })).toBeVisible()
  })

  test('Mode radio group updates checked state and URL for all service modes', async ({ page }) => {
    await mockCatalog(page)

    await page.goto('/menu')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(orderModeGroup(page)).toBeVisible()

    const dineInMode = orderModeRadio(page, 'Tại quán')
    const deliveryMode = orderModeRadio(page, 'Giao tận nơi')
    const takeawayMode = orderModeRadio(page, 'Mang đi')

    await expect(dineInMode).toBeChecked()
    await expect(deliveryMode).not.toBeChecked()
    await expect(takeawayMode).not.toBeChecked()

    await selectOrderMode(page, 'Giao tận nơi')
    await expect(page).toHaveURL(/\/menu\?mode=delivery$/)
    await expect(deliveryMode).toBeChecked()
    await expect(dineInMode).not.toBeChecked()
    await expect(takeawayMode).not.toBeChecked()

    await selectOrderMode(page, 'Mang đi')
    await expect(page).toHaveURL(/\/menu\?mode=takeaway$/)
    await expect(takeawayMode).toBeChecked()
    await expect(dineInMode).not.toBeChecked()
    await expect(deliveryMode).not.toBeChecked()

    await selectOrderMode(page, 'Tại quán')
    await expect(page).toHaveURL(/\/menu$/)
    await expect(dineInMode).toBeChecked()
    await expect(deliveryMode).not.toBeChecked()
    await expect(takeawayMode).not.toBeChecked()
  })

  test('Cancelling or escaping a pending mode change preserves the fixture cart and delivery selection', async ({ page }) => {
    await mockCatalog(page)
    await page.addInitScript((cart) => {
      window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify(cart))
    }, fixtureCart)

    await page.goto('/menu?mode=delivery')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const deliveryMode = orderModeRadio(page, 'Giao tận nơi')
    const takeawayMode = orderModeRadio(page, 'Mang đi')
    await expect(deliveryMode).toBeChecked()

    await selectOrderMode(page, 'Mang đi')
    const dialog = page.getByRole('dialog', { name: 'Thay Đổi Hình Thức Phục Vụ?' })
    await expect(dialog).toBeVisible()
    await expect(deliveryMode).toBeChecked()
    await expect(takeawayMode).not.toBeChecked()
    await expect(page).toHaveURL(/\/menu\?mode=delivery$/)

    await page.getByRole('button', { name: 'Giữ giỏ hàng hiện tại' }).click()
    await expect(dialog).toBeHidden()
    await expect(deliveryMode).toBeChecked()
    await expect(page).toHaveURL(/\/menu\?mode=delivery$/)
    await expect.poll(async () => page.evaluate(() => {
      const storedCart = window.localStorage.getItem('tiger_cart_draft_v1')
      if (!storedCart) return null
      const { items, context } = JSON.parse(storedCart)
      return { items, context }
    })).toEqual({ items: fixtureCart.items, context: fixtureCart.context })

    await selectOrderMode(page, 'Mang đi')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(deliveryMode).toBeChecked()
    await expect(page).toHaveURL(/\/menu\?mode=delivery$/)
    await expect.poll(async () => page.evaluate(() => {
      const storedCart = window.localStorage.getItem('tiger_cart_draft_v1')
      if (!storedCart) return null
      const { items, context } = JSON.parse(storedCart)
      return { items, context }
    })).toEqual({ items: fixtureCart.items, context: fixtureCart.context })
  })

  test('Confirming a pending mode change clears the fixture cart and selects takeaway', async ({ page }) => {
    await mockCatalog(page)
    await page.addInitScript((cart) => {
      window.localStorage.setItem('tiger_cart_draft_v1', JSON.stringify(cart))
    }, fixtureCart)

    await page.goto('/menu?mode=delivery')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const deliveryMode = orderModeRadio(page, 'Giao tận nơi')
    const takeawayMode = orderModeRadio(page, 'Mang đi')
    await selectOrderMode(page, 'Mang đi')
    await expect(page.getByRole('dialog', { name: 'Thay Đổi Hình Thức Phục Vụ?' })).toBeVisible()
    await expect(deliveryMode).toBeChecked()

    await page.getByRole('button', { name: 'Đồng ý chuyển & làm mới giỏ hàng' }).click()
    await expect(page).toHaveURL(/\/menu\?mode=takeaway$/)
    await expect(takeawayMode).toBeChecked()
    await expect(deliveryMode).not.toBeChecked()
    await expect.poll(async () => page.evaluate(() => {
      const storedCart = window.localStorage.getItem('tiger_cart_draft_v1')
      return storedCart ? JSON.parse(storedCart).items?.length ?? 0 : 0
    })).toBe(0)
  })

  test('Search input filters dishes in real time and shows empty state', async ({ page }) => {
    await page.route('**/functions/v1/public-api/menu*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMenuPayload),
      })
    })

    await page.goto('/menu')

    const searchInput = page.getByPlaceholder(/tìm món ngon theo tên/i)
    await expect(searchInput).toBeVisible()

    // Search for non-existent item
    await searchInput.fill('xyznonexistentdish123')

    // Expect empty state message
    await expect(
      page.getByText(/không tìm thấy món/i)
    ).toBeVisible()

    // Clear search input
    await searchInput.fill('')
    const dishCards = page.locator('article[data-dish-id]')
    await expect(dishCards.first()).toBeVisible()
    expect(await dishCards.count()).toBe(2)
  })

  test('Truthful error state when public API fails (no synthetic mock fallback)', async ({ page }) => {
    // Intercept menu endpoint to return 500
    await page.route('**/functions/v1/public-api/menu*', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Database connection failed',
          },
        }),
      })
    })

    await page.goto('/menu')

    // Must show clear error alert and retry button
    const errorAlert = page.getByRole('alert')
    await expect(errorAlert).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/không thể tải danh mục món ăn/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /thử tải lại/i })).toBeVisible()

    // Must NOT render fake mock menu items
    const dishCards = page.locator('article[data-dish-id]')
    await expect(dishCards).toHaveCount(0)
  })
})
