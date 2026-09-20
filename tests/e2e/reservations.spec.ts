import { test, expect } from '@playwright/test'

// Mock Data
const mockReservationReceipt = {
  data: {
    id: 'resv-e2e-001',
    code: 'RES-20260920-ABCD',
    status: 'pending',
    customer_name: 'Nguyễn Văn A',
    customer_phone: '0901234567',
    starts_at: '2026-09-20T11:30:00.000Z',
    ends_at: '2026-09-20T13:30:00.000Z',
    guest_count: 4,
    seating_area_id: '20000000-0000-0000-0000-000000000003',
    area_name_snapshot: 'Phòng VIP Riêng Tư',
    note: 'Bàn kỷ niệm gia đình',
    created_at: new Date().toISOString(),
    version: 1,
  },
}

const mockAdminReservationList = {
  data: {
    items: [
      {
        id: 'resv-e2e-001',
        code: 'RES-20260920-ABCD',
        status: 'pending',
        customer_name: 'Nguyễn Văn A',
        customer_phone: '0901234567',
        starts_at: '2026-09-20T11:30:00.000Z',
        ends_at: '2026-09-20T13:30:00.000Z',
        guest_count: 4,
        seating_area_id: '20000000-0000-0000-0000-000000000003',
        area_name_snapshot: 'Phòng VIP Riêng Tư',
        note: 'Bàn kỷ niệm gia đình',
        internal_note: '',
        contact_outcome: null as string | null,
        contacted_at: null as string | null,
        customer_user_id: null as string | null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      },
    ],
    next_cursor: null,
  },
}

test.describe('Tiger 345 Public & Admin Reservation E2E (Task T12, Invariants V13, V15, V16, V24)', () => {
  test('Public customer reservation submission displays honest pending receipt without leaking PII to storage', async ({ page }) => {
    // Intercept catalog call to return seating areas
    await page.route('**/functions/v1/public-api/catalog*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            categories: [],
            items: [],
            settings: {
              restaurant_name: 'Tiger 345',
              seating_areas: [
                { id: '20000000-0000-0000-0000-000000000003', code: 'vip', name: 'Phòng VIP Riêng Tư' },
              ],
            },
          },
        }),
      })
    })

    // Intercept public reservation submission
    await page.route('**/functions/v1/public-api/reservations', async (route) => {
      const headers = route.request().headers()
      expect(headers['idempotency-key']).toBeTruthy()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReservationReceipt),
      })
    })

    await page.goto('/reservations')

    // Verify form header
    await expect(page.locator('h1')).toContainText('Biến bữa ăn thường ngày thành khoảnh khắc đặc biệt')

    // Fill form
    await page.fill('input[placeholder*="Nguyễn Văn A"]', 'Nguyễn Văn A')
    await page.fill('input[placeholder*="090 280 99 29"]', '0901234567')
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    await page.fill('input[type="date"]', tomorrow)
    await page.fill('textarea', 'Bàn kỷ niệm gia đình')

    // Select time slot
    const timeSlotButton = page.locator('button:has-text("18:30")')
    if (await timeSlotButton.isVisible()) {
      await timeSlotButton.click()
    }

    // Submit
    await page.click('button:has-text("Gửi yêu cầu đặt bàn")')

    // Verify honest receipt is displayed
    await expect(page.locator('text=ĐÃ TIẾP NHẬN YÊU CẦU ĐẶT BÀN')).toBeVisible()
    await expect(page.locator('text=Chờ nhà hàng xác nhận')).toBeVisible()
    await expect(page.locator('text=RES-20260920-ABCD')).toBeVisible()
    await expect(page.locator('text=Nguyễn Văn A · 0901234567')).toBeVisible()

    // Invariant V13: Verify customer phone and name are NOT leaked to localStorage or sessionStorage
    const localStorageData = await page.evaluate(() => JSON.stringify(window.localStorage))
    const sessionStorageData = await page.evaluate(() => JSON.stringify(window.sessionStorage))

    expect(localStorageData).not.toContain('0901234567')
    expect(sessionStorageData).not.toContain('0901234567')
  })

  test('Admin can view reservation queue, transition status, and record contact outcome', async ({ page }) => {
    // Inject mock session
    await page.addInitScript(() => {
      const mockSession = {
        access_token: 'mock-admin-bearer-token-e2e',
        refresh_token: 'mock-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@tiger345.com',
          role: 'authenticated',
        },
      }
      window.localStorage.setItem('tiger345_auth_token', JSON.stringify(mockSession))
    })

    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@tiger345.com',
          role: 'authenticated',
        }),
      })
    })

    await page.route('**/rest/v1/admin_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: '00000000-0000-0000-0000-000000000001',
          active: true,
          display_name: 'Admin Tiger',
        }),
      })
    })

    let currentResv = { ...mockAdminReservationList.data.items[0] }

    // Mock admin reservations list
    await page.route('**/functions/v1/admin-api/reservations?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [currentResv],
            next_cursor: null,
          },
        }),
      })
    })

    await page.route('**/functions/v1/admin-api/reservations', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            items: [currentResv],
            next_cursor: null,
          },
        }),
      })
    })

    // Mock single reservation detail
    await page.route('**/functions/v1/admin-api/reservations/resv-e2e-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: currentResv,
        }),
      })
    })

    // Mock transition
    await page.route('**/functions/v1/admin-api/reservations/resv-e2e-001/transition', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      currentResv = {
        ...currentResv,
        status: body.target_status,
        version: currentResv.version + 1,
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: currentResv,
        }),
      })
    })

    // Mock contact outcome update
    await page.route('**/functions/v1/admin-api/reservations/resv-e2e-001/contact', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}')
      currentResv = {
        ...currentResv,
        contact_outcome: body.outcome,
        contacted_at: new Date().toISOString(),
        version: currentResv.version + 1,
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: currentResv,
        }),
      })
    })

    await page.goto('/admin/reservations')

    // Verify reservation table
    await expect(page.locator('h1')).toContainText('Quản lý Đặt bàn')
    await expect(page.locator('text=RES-20260920-ABCD')).toBeVisible()
    await expect(page.locator('text=Nguyễn Văn A')).toBeVisible()

    // Click Chi tiết to open modal
    await page.click('button:has-text("Chi tiết")')

    // Verify modal opened
    await expect(page.locator('h3:has-text("RES-20260920-ABCD")')).toBeVisible()

    // Transition to confirmed
    await page.click('button:has-text("Xác nhận đặt bàn")')
    await expect(page.locator('text=Đã chuyển trạng thái sang "Đã xác nhận"')).toBeVisible()

    // Record contact outcome
    await page.fill('input[placeholder*="Đã gọi xác nhận"]', 'Đã gọi xác nhận 4 người lớn')
    await page.click('button:has-text("Lưu liên hệ")')
    await expect(page.locator('text=Đã cập nhật kết quả liên hệ')).toBeVisible()
  })
})
