import { test, expect } from '@playwright/test'

const mockSettingsPayload = {
  data: {
    id: 1,
    name: 'Tiger 345 Demo',
    phone: '0901234567',
    address: '345 Đường 30 Tháng 4, Cần Thơ',
    timezone: 'Asia/Ho_Chi_Minh',
    accepting_orders: true,
    accepting_dine_in_orders: true,
    accepting_delivery_orders: true,
    booking_enabled: true,
    min_delivery_order_vnd: 50000,
    reservation_min_notice_minutes: 120,
    reservation_max_days_ahead: 30,
    reservation_duration_minutes: 120,
    reservation_cancel_notice_minutes: 60,
    reservation_no_show_grace_minutes: 15,
    version: 1,
  },
}

const mockCategoriesPayload = {
  data: {
    items: [
      {
        id: 'cat-01',
        name: 'Món Nướng Đặc Sản',
        slug: 'mon-nuong-dac-san',
        sort_order: 1,
        active: true,
        item_count: 5,
        version: 1,
      },
      {
        id: 'cat-02',
        name: 'Lẩu Đồng Quê',
        slug: 'lau-dong-que',
        sort_order: 2,
        active: true,
        item_count: 3,
        version: 1,
      },
    ],
  },
}

const mockMenuItemsPayload = {
  data: {
    items: [
      {
        id: 'dish-01',
        category_id: 'cat-01',
        category_name: 'Món Nướng Đặc Sản',
        name: 'Sườn Nướng Tiger',
        slug: 'suon-nuong-tiger',
        description: 'Sườn sốt cay đậm vị miền Tây',
        price_vnd: 250000,
        image_path: null,
        published: true,
        available: true,
        allow_dine_in: true,
        allow_delivery: true,
        featured_rank: 1,
        version: 1,
      },
      {
        id: 'dish-02',
        category_id: 'cat-02',
        category_name: 'Lẩu Đồng Quê',
        name: 'Lẩu Cua Đồng',
        slug: 'lau-cua-dong',
        description: 'Nước dùng thanh ngọt rau muống đồng',
        price_vnd: 350000,
        image_path: null,
        published: true,
        available: false,
        allow_dine_in: true,
        allow_delivery: false,
        featured_rank: null,
        version: 2,
      },
    ],
  },
}

const mockHoursPayload = {
  data: {
    items: [
      {
        id: 'hour-01',
        weekday: 1,
        service_type: 'restaurant',
        open_time: '10:00:00',
        close_time: '22:30:00',
        active: true,
      },
      {
        id: 'hour-02',
        weekday: 1,
        service_type: 'delivery',
        open_time: '10:30:00',
        close_time: '21:30:00',
        active: true,
      },
    ],
  },
}

const mockClosuresPayload = {
  data: {
    items: [
      {
        id: 'close-01',
        date: '2026-12-31',
        service_type: 'all',
        reason: 'Nghỉ bảo trì cuối năm',
      },
    ],
  },
}

const mockSeatingAreasPayload = {
  data: {
    items: [
      {
        id: 'area-01',
        code: 'SAN-VUON',
        name: 'Khu Vực Sân Vườn Thoáng Mát',
        sort_order: 1,
        active: true,
        version: 1,
      },
      {
        id: 'area-02',
        code: 'PHONG-LANH',
        name: 'Phòng VIP Máy Lạnh',
        sort_order: 2,
        active: true,
        version: 1,
      },
    ],
  },
}

const mockDeliveryZonesPayload = {
  data: {
    items: [
      {
        id: 'zone-01',
        name: 'Quận Ninh Kiều (Nội Thành)',
        description: 'Giao nhanh 30 phút',
        fee_vnd: 15000,
        free_threshold_vnd: 250000,
        sort_order: 1,
        active: true,
        version: 1,
      },
    ],
  },
}

const mockFeedbacksPayload = {
  data: {
    data: [
      {
        id: 'fb-01',
        proposal_id: 'prop-12345678',
        proposal_version: 1,
        rating: 'perfect',
        feedback_text: 'Thực đơn gợi ý rất hợp khẩu vị gia đình',
        status: 'NEW',
        admin_notes: null,
        created_at: new Date().toISOString(),
      },
    ],
  },
}

const mockAuditLogsPayload = {
  data: {
    items: [
      {
        id: 'audit-01',
        admin_id: '00000000-0000-0000-0000-000000000001',
        admin_name: 'Quản Trị Viên',
        actor_kind: 'admin',
        action: 'replace_business_hours',
        entity_type: 'restaurant_settings',
        entity_id: '1',
        metadata: { hours_count: 2, new_version: 2 },
        created_at: new Date().toISOString(),
      },
    ],
  },
}

const mockTablesPayload = {
  data: {
    items: [
      {
        id: 'tbl-01',
        code: 'B01',
        name: 'Bàn Sân Vườn 01',
        area_id: 'area-01',
        area_name: 'Khu Vực Sân Vườn Thoáng Mát',
        sort_order: 1,
        active: true,
        version: 1,
        current_visit_id: null,
        active_qr_token: 'valid-qr-token-demo',
      },
    ],
  },
}

test.describe('Tiger 345 Admin Content, Settings, Storage & QR E2E (Task T13, Invariants V17, V07, V24)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock session into localStorage
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

    // Mock Supabase Auth & Admin Profile
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
        body: JSON.stringify([
          {
            user_id: '00000000-0000-0000-0000-000000000001',
            role: 'owner',
            active: true,
            display_name: 'Quản Trị Viên',
          },
        ]),
      })
    })

    // Mock Admin API Endpoints
    await page.route('**/functions/v1/admin-api/settings/hours*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockHoursPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/settings/closures*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClosuresPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/categories*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockCategoriesPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/menu-items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMenuItemsPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/seating-areas*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSeatingAreasPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/delivery-zones*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDeliveryZonesPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/concierge/feedback*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFeedbacksPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/audit*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAuditLogsPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTablesPayload),
      })
    })
  })

  test('1. Loads Admin Settings Page with full navigation tabs and version badge', async ({ page }) => {
    await page.goto('/admin/settings')

    // Expect header & version
    await expect(page.getByRole('heading', { name: /Cấu Hình & Quản Trị Nội Dung/i })).toBeVisible()
    await expect(page.getByText('v1')).toBeVisible()

    // Expect all 4 tab buttons
    await expect(page.getByRole('button', { name: /Vận Hành & Giờ Mở Cửa/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Thực Đơn & Danh Mục/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Khu Vực & Phí Vận Chuyển/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Phản Hồi & Nhật Ký/i })).toBeVisible()
  })

  test('2. Switches between settings tabs and displays corresponding content', async ({ page }) => {
    await page.goto('/admin/settings')

    // Tab 2: Menu & Categories
    await page.getByRole('button', { name: /Thực Đơn & Danh Mục/i }).click()
    await expect(page.getByRole('cell', { name: 'Món Nướng Đặc Sản' })).toBeVisible()
    await expect(page.getByText('Sườn Nướng Tiger')).toBeVisible()
    await expect(page.getByText(/250\.000/)).toBeVisible()

    // Tab 3: Areas & Zones
    await page.getByRole('button', { name: /Khu Vực & Phí Vận Chuyển/i }).click()
    await expect(page.getByText('Khu Vực Sân Vườn Thoáng Mát')).toBeVisible()
    await expect(page.getByText('Quận Ninh Kiều (Nội Thành)')).toBeVisible()
    await expect(page.getByText(/15\.000/)).toBeVisible()

    // Tab 4: Feedback & Audit Logs
    await page.getByRole('button', { name: /Phản Hồi & Nhật Ký/i }).click()
    await expect(page.getByText(/Thực đơn gợi ý rất hợp khẩu vị gia đình/i)).toBeVisible()
    await expect(page.getByText('replace_business_hours')).toBeVisible()
  })

  test('3. Tables Management: Displays table QR action and opens rotate confirmation', async ({ page }) => {
    await page.goto('/admin/tables')

    await expect(page.getByRole('heading', { name: /Quản lý Bàn & Mã QR/i })).toBeVisible()
    await expect(page.getByText('Bàn Sân Vườn 01')).toBeVisible()

    // Verify QR actions exist
    const rotateButton = page.getByRole('button', { name: /Đổi mã QR/i })
    await expect(rotateButton).toBeVisible()
    await rotateButton.click()

    // Modal confirmation opens
    await expect(page.getByRole('heading', { name: /Xác nhận Đổi mã QR/i })).toBeVisible()
    await expect(page.getByText(/Invariant V07 \(QR Lifecycle\)/i)).toBeVisible()
    await expect(page.getByText(/vô hiệu hóa ngay lập tức/i)).toBeVisible()
  })
})
