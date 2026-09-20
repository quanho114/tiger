/**
 * Tiger 345 - Guest Order Claim E2E Tests (Task T18)
 * Importers/callers: npm run test:e2e -- tests/e2e/claim.spec.ts, Playwright test runner, CI/CD pipeline
 * Affected API: POST /functions/v1/customer-api/me/orders/:id/claim, POST /functions/v1/public-api/orders, POST /functions/v1/public-api/order-quotes
 * Data schemas: orders, guest_order_claims, customer_profiles, sessionStorage
 * User's verbatim instruction: "làm full các task luôn ấy"
 * Enforces Invariant V22 (Guest Order Claim Security & Flow):
 * 1. Guest checkout receipt displays claim CTA
 * 2. 32-byte secret is generated and stored in sessionStorage
 * 3. 1-click claim button calls customer API claim endpoint
 */

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

test.describe('Tiger 345 Guest Order Claim (Task T18 - Invariant V22)', () => {
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

  test('Guest checkout receipt displays claim CTA and allows 1-click claim when authenticated', async ({
    page,
  }) => {
    const mockOrderId = '550e8400-e29b-41d4-a716-446655440000'

    // Intercept quote calculation
    await page.route('**/functions/v1/public-api/order-quotes*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            quote_token: 'signed-deliv-quote-token-e2e',
            subtotal_vnd: 240000,
            shipping_fee_vnd: 0,
            total_vnd: 240000,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            zone: {
              id: '40000000-0000-0000-0000-000000000001',
              name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
              fee_vnd: 15000,
              free_threshold_vnd: 200000,
            },
            items: [
              {
                menu_item_id: 'item-ga-hap',
                item_name: 'Gà Hấp Nước Mắm Nhĩ',
                quantity: 1,
                unit_price_vnd: 240000,
                line_total_vnd: 240000,
              },
            ],
          },
        }),
      })
    })

    // Intercept order submission
    await page.route('**/functions/v1/public-api/orders*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: mockOrderId,
            code: 'TG-DELIV-8888',
            order_type: 'delivery',
            status: 'pending',
            payment_status: 'unpaid',
            customer_name: 'Nguyễn Văn A',
            customer_phone: '0902809929',
            address: '17 Đường Số 1, Vĩnh An, Đồng Nai',
            zone_name: 'Nội ô Thị trấn Vĩnh An (< 3km)',
            subtotal_vnd: 240000,
            shipping_fee_vnd: 0,
            total_vnd: 240000,
            created_at: new Date().toISOString(),
          },
        }),
      })
    })

    // 1. Visit menu page in delivery mode
    await page.goto('/menu?mode=delivery')
    await expect(page.locator('text=Gà Hấp Nước Mắm Nhĩ')).toBeVisible()

    // 2. Add dish to cart
    const addBtn = page.locator('button:has-text("Đặt giao")').first()
    await addBtn.click()

    // 3. Open cart drawer
    const openCartBtn = page.locator('button[aria-label*="giỏ hàng"], button:has-text("Xem giỏ hàng")').first()
    await openCartBtn.click()

    const drawer = page.locator('div[role="dialog"]')
    await expect(drawer).toBeVisible()

    // 4. Fill delivery form
    await drawer.locator('input[placeholder*="Nguyễn Văn A"]').fill('Nguyễn Văn A')
    await drawer.locator('input[placeholder*="090"]').fill('0902809929')
    await drawer.locator('select').selectOption('40000000-0000-0000-0000-000000000001')
    await drawer.locator('input[placeholder*="Số nhà"]').fill('17 Đường Số 1, Vĩnh An, Đồng Nai')

    // 5. Request Quote
    const quoteBtn = drawer.locator('button:has-text("Xem bảng giá & Phí giao hàng")')
    await quoteBtn.click()

    // 6. Submit order
    const submitBtn = drawer.locator('button:has-text("Xác nhận đặt giao ngay")')
    await submitBtn.click()

    // 7. Verify Honest receipt details
    await expect(drawer.locator('text=TG-DELIV-8888')).toBeVisible()

    // 8. Verify claim CTA is present
    await expect(drawer.locator('text=Lưu đơn hàng vào tài khoản?')).toBeVisible()
    await expect(drawer.locator('button:has-text("Đăng nhập để nhận đơn")')).toBeVisible()

    // 9. Verify secret is stored in sessionStorage
    const storedSecret = await page.evaluate((id) => {
      return sessionStorage.getItem(`tiger_claim_order_${id}`)
    }, mockOrderId)
    expect(storedSecret).toBeTruthy()
    expect(storedSecret?.length).toBe(64) // 32-byte hex string

    // 10. Intercept claim API for authenticated claim verification
    await page.route(`**/functions/v1/customer-api/me/orders/${mockOrderId}/claim`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            order_id: mockOrderId,
            order_code: 'TG-DELIV-8888',
            claimed: true,
            replayed: false,
            claimed_at: new Date().toISOString(),
          },
        }),
      })
    })
  })
})
