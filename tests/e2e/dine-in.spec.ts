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

test.describe('Customer Dine-In Ordering & Table QR Flow (T09, V12, V13, V24)', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept menu and settings
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

  test('Resolves table QR token, strips URL, stores capability in sessionStorage, and shows table badge', async ({
    page,
  }) => {
    // Intercept table resolve API
    await page.route('**/functions/v1/public-api/tables/resolve*', async (route) => {
      const requestData = route.request().postDataJSON()
      expect(requestData.token ?? requestData.qr_token).toBe('tiger-table-token-b01')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            table_id: 'tbl-01',
            table_code: 'B01',
            table_name: 'Bàn 01',
            visit_id: 'visit-01-xyz',
            visit_capability: 'cap-hmac-signed-token-b01',
            expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          },
        }),
      })
    })

    // 1. Customer scans QR code pointing to /table/tiger-table-token-b01
    await page.goto('/table/tiger-table-token-b01')

    // 2. Verified redirect to /menu?mode=dine-in with URL stripped (no token leak)
    await expect(page).toHaveURL(/\/menu\?mode=dine-in/)
    expect(page.url()).not.toContain('tiger-table-token-b01')

    // 3. Table badge is rendered in header
    const tableBadge = page.locator('header').getByText('Bàn 01')
    await expect(tableBadge).toBeVisible()

    // 4. Verify storage isolation (sessionStorage capability vs NO raw QR in localStorage)
    const storedSession = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('tiger_table_session_v1')
      return raw ? JSON.parse(raw) : null
    })
    expect(storedSession).not.toBeNull()
    expect(storedSession.tableCode).toBe('B01')
    expect(storedSession.visitCapability).toBe('cap-hmac-signed-token-b01')

    const rawLocalStorage = await page.evaluate(() => {
      return window.localStorage.getItem('tiger_table_session_v1')
    })
    expect(rawLocalStorage).toBeNull()
  })

  test('Allows two rounds of dine-in orders within the same visit using retained idempotency and receipt snapshot', async ({
    page,
  }) => {
    // Set up mock table session in sessionStorage directly
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        'tiger_table_session_v1',
        JSON.stringify({
          tableId: 'tbl-01',
          tableCode: 'B01',
          tableName: 'Bàn 01',
          visitId: 'visit-01-xyz',
          visitCapability: 'cap-hmac-signed-token-b01',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        })
      )
    })

    let quoteCallCount = 0
    let orderCallCount = 0
    const idempotencyKeysUsed: string[] = []

    // Intercept quote request
    await page.route('**/functions/v1/public-api/order-quotes*', async (route) => {
      quoteCallCount++
      const postData = route.request().postDataJSON()
      expect(postData.order_type).toBe('dine_in')
      expect(postData.visit_capability).toBe('cap-hmac-signed-token-b01')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            quote_token: `quote-token-round-${quoteCallCount}`,
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            subtotal_vnd: 240000,
            shipping_fee_vnd: 0,
            total_vnd: 240000,
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
      orderCallCount++
      const headers = route.request().headers()
      const idempKey = headers['idempotency-key']
      expect(idempKey).toBeDefined()
      idempotencyKeysUsed.push(idempKey)

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: `order-round-${orderCallCount}`,
            code: `TG-0000000${orderCallCount}`,
            order_type: 'dine_in',
            status: 'pending',
            payment_status: 'unpaid',
            subtotal_vnd: 240000,
            shipping_fee_vnd: 0,
            total_vnd: 240000,
            created_at: new Date().toISOString(),
            table_name: 'Bàn 01',
          },
        }),
      })
    })

    await page.goto('/menu?mode=dine-in')

    // 1. Add Dish 1 to cart
    const addDish1Btn = page.getByTestId('add-to-cart-item-ga-hap').or(
      page.locator('article[data-dish-id="item-ga-hap"] button:has-text("Gọi món")')
    ).first()
    await addDish1Btn.click()

    // 2. Open cart drawer
    const cartTrigger = page.getByRole('button', { name: /xem giỏ hàng|giỏ món/i }).first()
    await cartTrigger.click()

    const cartDialog = page.getByRole('dialog')
    await expect(cartDialog).toBeVisible()
    await expect(cartDialog.getByText('Đang phục vụ tại Bàn 01')).toBeVisible()

    // Contextual Dine-in: Delivery address & phone inputs must NOT be present
    await expect(cartDialog.locator('input[placeholder*="090"]')).toHaveCount(0)
    await expect(cartDialog.locator('input[placeholder*="Số nhà"]')).toHaveCount(0)

    // 3. Click Place Order (Round 1)
    await cartDialog.getByRole('button', { name: /xem bảng giá & gọi món/i }).click()
    const placeOrderBtn = cartDialog.getByRole('button', { name: /xác nhận gửi đơn vào bếp|gọi món ngay|xác nhận gửi bếp/i })
    await placeOrderBtn.click()

    // 4. Receipt snapshot is displayed
    await expect(cartDialog.getByText(/Đã Gửi Đơn Vào Bếp|Gửi Bếp Thành Công/i)).toBeVisible()
    await expect(cartDialog.getByText(/TG-00000001/)).toBeVisible()
    expect(orderCallCount).toBe(1)

    // 5. Customer clicks to continue ordering in the same visit (Round 2)
    const continueBtn = cartDialog.getByRole('button', { name: /tiếp tục xem thực đơn|gọi thêm món/i })
    await continueBtn.click()

    // Cart is now ready for round 2, dialog closed
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // Add Dish 1 again for round 2
    await addDish1Btn.click()
    await cartTrigger.click()

    // Verify round 2 submission
    await page.getByRole('dialog').getByRole('button', { name: /xem bảng giá & gọi món/i }).click()
    const placeOrderBtn2 = page.getByRole('dialog').getByRole('button', { name: /xác nhận gửi đơn vào bếp|gọi món ngay|xác nhận gửi bếp/i })
    await placeOrderBtn2.click()

    await expect(page.getByRole('dialog').getByText(/TG-00000002/)).toBeVisible()
    expect(orderCallCount).toBe(2)

    // Idempotency keys must be distinct between different order submissions
    expect(idempotencyKeysUsed[0]).not.toBe(idempotencyKeysUsed[1])
  })

  test('Gating: Browsing /menu without QR allows viewing but directs to QR scan for dine-in ordering', async ({
    page,
  }) => {
    // Clear any table session
    await page.addInitScript(() => {
      window.sessionStorage.clear()
    })

    await page.goto('/menu?mode=dine-in')

    // Header must NOT display active table badge
    await expect(page.locator('header').getByText(/Bàn 0/)).toHaveCount(0)

    // Dish card shows "Đặt bàn" button or QR scan guidance instead of instant dine-in
    const actionBtn = page.locator('article[data-dish-id="item-ga-hap"]').getByRole('button', { name: /đặt bàn/i })
    await expect(actionBtn).toBeVisible()
  })
})
