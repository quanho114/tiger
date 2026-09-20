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
      {
        id: '40000000-0000-0000-0000-000000000002',
        name: 'Khu vực lân cận Vĩnh Tân / Trị An (3 - 7km)',
        fee_vnd: 30000,
        free_threshold_vnd: 400000,
        estimated_delivery_minutes: 45,
        active: true,
      },
    ],
  },
}

const mockMenuPayload = {
  data: {
    categories: [
      { id: 'cat-ga', name: 'Món Gà', slug: 'mon-ga', sort_order: 1 },
      { id: 'cat-lau', name: 'Lẩu', slug: 'lau', sort_order: 2 },
    ],
    items: [
      {
        id: 'item-ga-hap',
        category_id: 'cat-ga',
        name: 'Gà Hấp Nước Mắm Nhĩ',
        slug: 'ga-hap-nuoc-mam-nhi',
        description: 'Gà ta thả vườn hấp nước mắm nhĩ đậm đà',
        price_vnd: 240000,
        image_path: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500',
        available: true,
        is_available: true,
        allow_dine_in: true,
        allow_delivery: true,
        is_signature: true,
        tags: ['Bán chạy'],
      },
      {
        id: 'item-lau-thai',
        category_id: 'cat-lau',
        name: 'Lẩu Thái Hải Sản',
        slug: 'lau-thai-hai-san',
        description: 'Nước lẩu chua cay chuẩn vị với tôm mực tươi',
        price_vnd: 320000,
        image_path: 'https://images.unsplash.com/photo-1547928576-a4a33237cbc3?w=500',
        available: true,
        is_available: true,
        allow_dine_in: true,
        allow_delivery: true,
        is_signature: false,
        tags: [],
      },
    ],
  },
}

test.describe('Customer Delivery Ordering Flow (T11, V10, V13, V14, V24)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept settings & catalog
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

  test('executes complete delivery checkout flow: quote generation, review, and honest order receipt', async ({
    page,
  }) => {
    let capturedQuoteRequest: any = null
    let capturedOrderRequest: any = null
    let capturedIdempotencyKey: string | null = null

    // Intercept quote calculation
    await page.route('**/functions/v1/public-api/order-quotes*', async (route) => {
      capturedQuoteRequest = route.request().postDataJSON()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            quote_token: 'signed-deliv-quote-token-e2e',
            subtotal_vnd: 240000,
            shipping_fee_vnd: 0, // >= 200,000 threshold freeship
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
      capturedOrderRequest = route.request().postDataJSON()
      capturedIdempotencyKey = route.request().headers()['idempotency-key'] || null

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'ord-deliv-e2e-001',
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
            note: 'Giao trước 12h trưa giúp quán',
            created_at: new Date().toISOString(),
          },
        }),
      })
    })

    // 1. Visit menu page in delivery mode
    await page.goto('/thuc-don?mode=delivery')
    await expect(page.locator('text=Gà Hấp Nước Mắm Nhĩ')).toBeVisible()

    // 2. Add dish to cart
    const addBtn = page.locator('button:has-text("Thêm vào giỏ")').first()
    await addBtn.click()

    // 3. Open cart drawer
    const openCartBtn = page.locator('button[aria-label*="giỏ hàng"], button:has-text("Xem giỏ hàng")').first()
    if (await openCartBtn.isVisible()) {
      await openCartBtn.click()
    } else {
      await page.locator('[data-testid="floating-cart"], button:has-text("giỏ")').first().click()
    }

    const drawer = page.locator('div[role="dialog"]')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('text=Món Giao Tận Nơi')).toBeVisible()

    // 4. Fill delivery form
    await drawer.locator('input[placeholder*="Nguyễn Văn A"]').fill('Nguyễn Văn A')
    await drawer.locator('input[placeholder*="090"]').fill('0902809929')
    await drawer.locator('select').selectOption('40000000-0000-0000-0000-000000000001')
    await drawer.locator('input[placeholder*="Số nhà"]').fill('17 Đường Số 1, Vĩnh An, Đồng Nai')
    await drawer.locator('input[placeholder*="Ít cay"]').fill('Giao trước 12h trưa giúp quán')

    // 5. Request Quote
    const quoteBtn = drawer.locator('button:has-text("Xem bảng giá & Phí giao hàng")')
    await quoteBtn.click()

    // Verify Quote Request payload
    await expect(drawer.locator('text=Bảng Giá Giao Hàng Xác Nhận')).toBeVisible()
    expect(capturedQuoteRequest).toBeDefined()
    expect(capturedQuoteRequest.order_type).toBe('delivery')
    expect(capturedQuoteRequest.delivery_zone_id).toBe('40000000-0000-0000-0000-000000000001')

    // 6. Verify Quoted breakdown
    await expect(drawer.locator('text=Hiệu lực trong 5 phút')).toBeVisible()
    await expect(drawer.locator('text=Thông tin nhận món')).toBeVisible()
    await expect(drawer.locator('text=Nguyễn Văn A - 0902809929')).toBeVisible()
    await expect(drawer.locator('text=Miễn phí').first()).toBeVisible()

    // 7. Submit order
    const submitBtn = drawer.locator('button:has-text("Xác nhận đặt giao ngay")')
    await submitBtn.click()

    // 8. Verify order submission payload and idempotency key
    await expect(drawer.locator('text=Đã Tiếp Nhận Đơn Giao Hàng!')).toBeVisible()
    expect(capturedOrderRequest).toBeDefined()
    expect(capturedOrderRequest.quote_token).toBe('signed-deliv-quote-token-e2e')
    expect(capturedOrderRequest.customer_name).toBe('Nguyễn Văn A')
    expect(capturedOrderRequest.customer_phone).toBe('0902809929')
    expect(capturedIdempotencyKey).toMatch(/^idemp-deliv-/)

    // 9. Verify Honest receipt details
    await expect(drawer.locator('text=TG-DELIV-8888')).toBeVisible()
    await expect(drawer.locator('text=Chờ nhà hàng xác nhận')).toBeVisible()
    await expect(drawer.locator('text=Nhân viên Tiger 345 sẽ liên hệ qua số điện thoại')).toBeVisible()

    // 10. Invariant V13: Verify customer PII was never leaked to localStorage
    const storedPii = await page.evaluate(() => {
      return {
        name: localStorage.getItem('customerName'),
        phone: localStorage.getItem('customerPhone'),
        address: localStorage.getItem('address'),
      }
    })
    expect(storedPii.name).toBeNull()
    expect(storedPii.phone).toBeNull()
    expect(storedPii.address).toBeNull()
  })
})
