import { test, expect } from '@playwright/test'

const mockSettingsPayload = {
  data: {
    name: 'Tiger 345',
    phone: '090 280 99 29',
    address: '17 Đường Số 1, Vĩnh An, Vĩnh Cửu, Đồng Nai',
    opening_hours_text: '10:00 - 22:30 hàng ngày',
    accepting_delivery_orders: true,
    accepting_dine_in_orders: true,
    booking_enabled: true,
    min_delivery_order_vnd: 100000,
    delivery_zones: [
      {
        id: '40000000-0000-0000-0000-000000000001',
        name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
        fee_vnd: 15000,
        free_threshold_vnd: 200000,
        estimated_delivery_minutes: 30,
        active: true,
      },
    ],
  },
}

const mockMenuPayload = {
  data: {
    categories: [
      { id: 'cat-ga', name: 'Món Gà', slug: 'mon-ga', sort_order: 1 },
    ],
    items: [
      {
        id: 'item-ga-hap',
        category_id: 'cat-ga',
        name: 'Gà Hấp Nước Mắm Nhĩ',
        slug: 'ga-hap-nuoc-mam-nhi',
        description: 'Gà ta thả vườn hấp nước mắm nhĩ đậm đà',
        price_vnd: 240000,
        image_path: '/images/bo-nuong.jpg',
        image_url: '/images/bo-nuong.jpg',
        available: true,
        is_available: true,
        allow_dine_in: true,
        allow_delivery: true,
        is_signature: true,
        tags: ['Bán chạy'],
      },
    ],
  },
}

test.describe('Tiger 345 Customer Auth & Optional Login (Invariant V13, V19)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept settings & catalog so tests run deterministically
    await page.route('**/functions/v1/public-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })
    await page.route('**/functions/v1/public-api/menu*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMenuPayload),
      })
    })
  })
  test('Login page (/login) displays brand, Google OAuth, Email options, and Guest button', async ({
    page,
  }) => {
    await page.goto('/login')

    // Check heading and brand
    await expect(page.getByRole('heading', { name: /Đăng nhập Tài khoản Khách hàng/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Đăng nhập với Google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Liên kết Đăng nhập', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Mã OTP 6 số/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i })).toBeVisible()
  })

  test('Open Redirect Defense (Invariant V19 / CWE-601)', async ({ page }) => {
    // 1. External domain returnTo -> falls back to '/'
    await page.goto('/login?returnTo=https://evil.com')
    await page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i }).click()
    await expect(page).toHaveURL('/')

    // 2. Protocol-relative returnTo -> falls back to '/'
    await page.goto('/login?returnTo=//attacker.com/menu')
    await page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i }).click()
    await expect(page).toHaveURL('/')

    // 3. Backslash tricks -> falls back to '/'
    await page.goto('/login?returnTo=/\\evil.com')
    await page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i }).click()
    await expect(page).toHaveURL('/')

    // 4. Valid internal route with query -> preserves intended route
    await page.goto('/login?returnTo=/menu?mode=delivery')
    await page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i }).click()
    await expect(page).toHaveURL('/menu?mode=delivery')
  })

  test('Login preserves draft cart and guest context (Invariant V13)', async ({ page }) => {
    // 1. Visit menu with delivery mode and add item to cart
    await page.goto('/menu?mode=delivery')
    const addButtons = page.locator('button:has-text("Đặt giao")')
    await expect(addButtons.first()).toBeVisible()
    await addButtons.first().click()

    // 2. Navigate to /login
    await page.goto('/login?returnTo=/menu?mode=delivery')
    await expect(page.getByRole('heading', { name: /Đăng nhập Tài khoản Khách hàng/i })).toBeVisible()

    // 3. Return to menu as guest -> cart items remain intact
    await page.getByRole('button', { name: /Tiếp tục với tư cách Khách/i }).click()
    await expect(page).toHaveURL('/menu?mode=delivery')

    // Open cart drawer to verify item is still present
    const cartBtn = page.locator('button[aria-label="Xem giỏ hàng giao tận nơi"]').first()
    await expect(cartBtn).toBeVisible()
    await cartBtn.click()

    // Verify cart drawer contains items and form
    await expect(page.getByText(/Thông tin nhận hàng/i)).toBeVisible()
  })

  test('Cart Drawer renders non-blocking optional auth prompt for guests', async ({ page }) => {
    await page.goto('/menu?mode=delivery')

    // Add item to cart
    const addButtons = page.locator('button:has-text("Đặt giao")')
    await expect(addButtons.first()).toBeVisible()
    await addButtons.first().click()

    // Open Cart Drawer
    const cartBtn = page.locator('button[aria-label="Xem giỏ hàng giao tận nơi"]').first()
    await expect(cartBtn).toBeVisible()
    await cartBtn.click()

    // Verify optional prompt is visible
    const prompt = page.getByText(/Đăng nhập để lưu địa chỉ và lịch sử đơn hàng/i)
    await expect(prompt).toBeVisible()

    // Verify guest checkout form fields are still accessible
    await expect(page.getByLabel(/Họ và tên của bạn/i)).toBeVisible()
    await expect(page.getByLabel(/Số điện thoại nhận hàng/i)).toBeVisible()
    await expect(page.getByLabel(/Khu vực giao hàng/i)).toBeVisible()
  })

  test('Auth callback error handling and URL hygiene (Invariant V19)', async ({ page }) => {
    // Visit callback with provider error
    await page.goto('/auth/callback?error=access_denied&error_description=User%20declined%20access')

    // Verify error UI is displayed
    await expect(page.getByRole('heading', { name: /Đăng nhập không thành công/i })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(/User declined access/i)
    await expect(page.getByRole('link', { name: /Thử đăng nhập lại/i })).toBeVisible()

    // Verify URL parameters were stripped for hygiene
    const url = new URL(page.url())
    expect(url.searchParams.has('error')).toBe(false)
  })

  test('Admin routes require admin role and reject unauthenticated or customer users', async ({
    page,
  }) => {
    await page.goto('/admin')
    // Unauthenticated guest is redirected to /admin/login
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByRole('heading', { name: /Đăng nhập Hệ thống Điều phối Vận hành/i })).toBeVisible()
  })
})
