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

const mockCustomerHomePayload = {
  data: {
    recent_orders: [
      {
        id: 'ord-001',
        code: 'TG-101',
        order_type: 'delivery',
        status: 'completed',
        payment_status: 'paid',
        payment_method: 'payos',
        subtotal_vnd: 240000,
        shipping_fee_vnd: 15000,
        total_vnd: 255000,
        note: 'Giao trước 18h',
        table_name_snapshot: null,
        address_snapshot: '123 Đường 3/2, KP2, Vĩnh An',
        zone_name_snapshot: 'Nội ô',
        item_count: 1,
        items_summary: [{ item_name: 'Gà Hấp Nước Mắm Nhĩ', quantity: 1 }],
        created_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        cancelled_at: null,
      },
    ],
    frequent_items: [
      {
        menu_item_id: 'item-ga-hap',
        name: 'Gà Hấp Nước Mắm Nhĩ',
        slug: 'ga-hap-nuoc-mam-nhi',
        price_vnd: 240000,
        image_path: '/images/bo-nuong.jpg',
        available: true,
        allow_dine_in: true,
        allow_delivery: true,
        category_id: 'cat-ga',
        category_name: 'Món Gà',
        total_quantity: 4,
        order_count: 4,
        last_ordered_at: new Date().toISOString(),
      },
    ],
    favorites: [
      {
        menu_item_id: 'item-ga-hap',
        name: 'Gà Hấp Nước Mắm Nhĩ',
        slug: 'ga-hap-nuoc-mam-nhi',
        price_vnd: 240000,
        image_path: '/images/bo-nuong.jpg',
        available: true,
        allow_dine_in: true,
        allow_delivery: true,
        category_id: 'cat-ga',
        category_name: 'Món Gà',
        created_at: new Date().toISOString(),
      },
    ],
    upcoming_reservations: [
      {
        id: 'res-001',
        code: 'RES-101',
        customer_name: 'Nguyễn Văn Khách',
        customer_phone: '0901234567',
        starts_at: new Date(Date.now() + 180 * 60 * 1000).toISOString(),
        ends_at: new Date(Date.now() + 240 * 60 * 1000).toISOString(),
        guest_count: 4,
        seating_area_id: null,
        area_name_snapshot: 'Khu vực Sân Vườn',
        status: 'confirmed',
        note: 'Bàn thoáng mát',
        version: 1,
        created_at: new Date().toISOString(),
      },
    ],
  },
}

const mockCustomerProfilePayload = {
  data: {
    user_id: 'user-cust-001',
    display_name: 'Nguyễn Văn Khách',
    phone: '0901234567',
    avatar_url: null,
    marketing_opt_in: true,
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-02-01T10:00:00Z',
  },
}

const mockCustomerAddressesPayload = {
  data: [
    {
      id: 'addr-001',
      label: 'Nhà riêng',
      recipient_name: 'Nguyễn Văn Khách',
      phone: '0901234567',
      address_line: '123 Đường 3/2',
      ward: 'Khu phố 2',
      district: 'Vĩnh Cửu',
      province: 'Đồng Nai',
      delivery_note: 'Cổng màu xanh',
      is_default: true,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
}

test.describe('Tiger 345 Customer Account & Personalization (T16, Invariant V04, V16, V20, V21)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept common public APIs
    await page.route('**/functions/v1/public-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })

    // Intercept customer endpoints
    await page.route('**/functions/v1/customer-api/home*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCustomerHomePayload),
      })
    })

    await page.route('**/functions/v1/customer-api/profile*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCustomerProfilePayload),
      })
    })

    await page.route('**/functions/v1/customer-api/addresses*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCustomerAddressesPayload),
      })
    })

    await page.route('**/functions/v1/customer-api/favorites*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockCustomerHomePayload.data.favorites }),
      })
    })

    await page.route('**/functions/v1/customer-api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockCustomerHomePayload.data.recent_orders }),
      })
    })

    await page.route('**/functions/v1/customer-api/reservations*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: mockCustomerHomePayload.data.upcoming_reservations }),
      })
    })
  })

  test('Guest is redirected to /login with returnTo parameter when accessing /account', async ({ page }) => {
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount/)
    await expect(page.locator('h1')).toContainText(/Đăng nhập|Tài khoản/)
  })

  test('Guest can access public pages without forced login (Invariant V13)', async ({ page }) => {
    await page.goto('/menu')
    await expect(page).toHaveURL('/menu')
    await page.goto('/reservation')
    await expect(page).toHaveURL('/reservation')
    await page.goto('/location')
    await expect(page).toHaveURL('/location')
  })
})
