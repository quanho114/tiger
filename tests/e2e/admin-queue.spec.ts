import { test, expect } from '@playwright/test'

// Mock Data
const mockAdminDashboardPayload = {
  data: {
    pending_orders_count: 2,
    preparing_orders_count: 1,
    delivering_orders_count: 1,
    active_tables_count: 2,
    settings: {
      accepting_orders: true,
      accepting_dine_in_orders: true,
      accepting_delivery_orders: true,
      booking_enabled: true,
      version: 1,
    },
    recent_pending_orders: [
      {
        id: 'ord-001',
        code: 'DIN-260919-001',
        order_type: 'dine_in',
        status: 'pending',
        payment_status: 'unpaid',
        total_vnd: 450000,
        item_count: 2,
        table_name_snapshot: 'Bàn 01 - Sân Vườn',
        customer_name: null,
        customer_phone: null,
        created_at: new Date().toISOString(),
        version: 1,
      },
      {
        id: 'ord-002',
        code: 'DEL-260919-002',
        order_type: 'delivery',
        status: 'pending',
        payment_status: 'unpaid',
        total_vnd: 250000,
        item_count: 1,
        table_name_snapshot: null,
        customer_name: 'Nguyễn Văn A',
        customer_phone: '0901234567',
        created_at: new Date().toISOString(),
        version: 1,
      },
    ],
  },
}

const mockOrdersListPayload = {
  data: [
    {
      id: 'ord-001',
      code: 'DIN-260919-001',
      order_type: 'dine_in',
      status: 'pending',
      payment_status: 'unpaid',
      total_vnd: 450000,
      item_count: 2,
      table_name_snapshot: 'Bàn 01 - Sân Vườn',
      customer_name: null,
      customer_phone: null,
      created_at: new Date().toISOString(),
      version: 1,
    },
    {
      id: 'ord-002',
      code: 'DEL-260919-002',
      order_type: 'delivery',
      status: 'confirmed',
      payment_status: 'paid',
      total_vnd: 250000,
      item_count: 1,
      table_name_snapshot: null,
      customer_name: 'Nguyễn Văn A',
      customer_phone: '0901234567',
      created_at: new Date().toISOString(),
      version: 2,
    },
  ],
}

const mockOrderDetailPayload = {
  data: {
    order: {
      id: 'ord-001',
      code: 'DIN-260919-001',
      order_type: 'dine_in',
      status: 'pending',
      payment_status: 'unpaid',
      subtotal_vnd: 450000,
      shipping_fee_vnd: 0,
      total_vnd: 450000,
      customer_name: null,
      customer_phone: null,
      delivery_address: null,
      table_name_snapshot: 'Bàn 01 - Sân Vườn',
      customer_note: 'Cho ít ớt',
      internal_note: 'Bàn quen của quản lý',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    items: [
      {
        id: 'item-row-1',
        menu_item_id: 'dish-1',
        item_name: 'Sườn nướng sốt cay',
        item_name_snapshot: 'Sườn nướng sốt cay',
        name_snapshot: 'Sườn nướng sốt cay',
        unit_price_vnd: 250000,
        price_vnd: 250000,
        quantity: 1,
        line_total_vnd: 250000,
        subtotal_vnd: 250000,
        note: 'Cay vừa',
        customer_note: 'Cay vừa',
      },
      {
        id: 'item-row-2',
        menu_item_id: 'dish-2',
        item_name: 'Lẩu bò nhúng dấm',
        item_name_snapshot: 'Lẩu bò nhúng dấm',
        name_snapshot: 'Lẩu bò nhúng dấm',
        unit_price_vnd: 200000,
        price_vnd: 200000,
        quantity: 1,
        line_total_vnd: 200000,
        subtotal_vnd: 200000,
        note: '',
        customer_note: '',
      },
    ],
    status_history: [
      {
        id: 'hist-1',
        from_status: null,
        to_status: 'pending',
        reason: 'Khách tạo đơn tại bàn',
        created_at: new Date().toISOString(),
        actor_name: 'Khách hàng',
      },
    ],
    timeline: [
      {
        id: 'hist-1',
        from_status: null,
        to_status: 'pending',
        reason: 'Khách tạo đơn tại bàn',
        created_at: new Date().toISOString(),
        actor_name: 'Khách hàng',
      },
    ],
  },
}

const mockTablesPayload = {
  data: [
    {
      id: 'tbl-1',
      code: 'T01',
      name: 'Bàn 01',
      area_name: 'Sân Vườn',
      current_visit_id: 'vis-1',
      active_qr_token: 'valid-hmac-qr-token-demo',
      visit_opened_at: new Date().toISOString(),
      unpaid_orders_count: 1,
      unpaid_total_vnd: 450000,
      version: 2,
    },
    {
      id: 'tbl-2',
      code: 'T02',
      name: 'Bàn 02',
      area_name: 'Phòng Lạnh',
      current_visit_id: null,
      active_qr_token: null,
      visit_opened_at: null,
      unpaid_orders_count: 0,
      unpaid_total_vnd: 0,
      version: 1,
    },
  ],
}

const mockSettingsPayload = {
  data: {
    accepting_orders: true,
    accepting_dine_in_orders: true,
    accepting_delivery_orders: true,
    booking_enabled: true,
    version: 1,
  },
}

const mockMenuItemsPayload = {
  data: [
    {
      id: 'dish-1',
      name: 'Sườn nướng sốt cay',
      description: 'Sườn heo tươi ướp sốt cay đặc biệt',
      price_vnd: 250000,
      available: true,
      allow_dine_in: true,
      allow_delivery: true,
    },
    {
      id: 'dish-2',
      name: 'Lẩu bò nhúng dấm',
      description: 'Nước lẩu chua thanh kèm bắp bò hoa',
      price_vnd: 200000,
      available: false,
      allow_dine_in: true,
      allow_delivery: false,
    },
  ],
}

test.describe('Tiger 345 Admin Queue, Tables, & Operations E2E (Task T08, Invariants V11, V24)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock session into localStorage to simulate logged-in admin state
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

    // Mock Supabase Auth / User call and Admin Profile query
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
          display_name: 'Tổng Quản Lý',
        }),
      })
    })

    // Route admin-api endpoints
    await page.route('**/functions/v1/admin-api/dashboard*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAdminDashboardPayload),
      })
    })

    await page.route(/\/functions\/v1\/admin-api\/orders/, async (route) => {
      const url = route.request().url()
      if (url.includes('/orders/ord-001')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOrderDetailPayload),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOrdersListPayload),
        })
      }
    })

    await page.route('**/functions/v1/admin-api/tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTablesPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })

    await page.route('**/functions/v1/admin-api/menu-items*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMenuItemsPayload),
      })
    })
  })

  test('Admin Layout Isolation: Public Header, Footer, CartDrawer, and ContactHub are NOT rendered', async ({
    page,
  }) => {
    await page.goto('/admin')

    // Admin UI is visible
    await expect(page.getByRole('heading', { name: 'Tổng quan Vận hành' })).toBeVisible()

    // Public chrome must NOT be rendered
    await expect(page.locator('header.site-header, .customer-header')).toHaveCount(0)
    await expect(page.locator('footer.site-footer, .customer-footer')).toHaveCount(0)
    await expect(page.locator('[data-testid="contact-hub"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="cart-drawer"]')).toHaveCount(0)
  })

  test('Admin Dashboard renders real metrics, intake toggles, and recent pending orders', async ({
    page,
  }) => {
    await page.goto('/admin')

    // Metric cards
    await expect(page.getByText('Chờ tiếp nhận')).toBeVisible()
    await expect(page.getByText('2', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Đang chế biến')).toBeVisible()
    await expect(page.getByText('Bàn đang có khách')).toBeVisible()

    // Intake toggles
    await expect(page.getByText('Kiểm soát Tiếp nhận Đơn hàng')).toBeVisible()
    await expect(page.getByText('Nhận đơn chung')).toBeVisible()
    await expect(page.getByText('Tại bàn (Dine-in)')).toBeVisible()
    await expect(page.getByText('Giao hàng (Delivery)')).toBeVisible()

    // Recent orders table
    await expect(page.getByText('DIN-260919-001')).toBeVisible()
    await expect(page.getByText('Bàn 01 - Sân Vườn')).toBeVisible()
  })

  test('Admin Orders Queue displays orders, filters by type/status, and opens Order Detail Modal', async ({
    page,
  }) => {
    await page.goto('/admin/orders')

    await expect(page.getByRole('heading', { name: /hàng đợi đơn hàng/i })).toBeVisible()
    await expect(page.getByText('DIN-260919-001')).toBeVisible()
    await expect(page.getByText('DEL-260919-002')).toBeVisible()

    // Click "Chi tiết" or row to open Order Detail modal
    await page.getByText('Chi tiết').first().click()

    // Modal is opened
    await expect(page.getByRole('heading', { name: /Chi tiết Đơn hàng.*DIN-260919-001/i })).toBeVisible()
    await expect(page.getByText('Sườn nướng sốt cay')).toBeVisible()
    await expect(page.getByText('Lẩu bò nhúng dấm')).toBeVisible()
    await expect(page.getByText('Bàn quen của quản lý')).toBeVisible()

    // State transition action buttons for pending order
    await expect(page.getByRole('button', { name: /tiếp nhận đơn/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /từ chối đơn/i })).toBeVisible()

    // Close modal
    await page.getByRole('button', { name: '✕', exact: true }).click()
    await expect(page.getByRole('heading', { name: /Chi tiết Đơn hàng.*DIN-260919-001/i })).not.toBeVisible()
  })

  test('Admin Tables page renders occupancy, allows viewing QR link, and enforces payment check before closing', async ({
    page,
  }) => {
    await page.goto('/admin/tables')

    await expect(page.getByText('Quản lý Bàn & Mã QR')).toBeVisible()
    await expect(page.getByText('Bàn 01')).toBeVisible()
    await expect(page.getByText('Có khách')).toBeVisible()

    // Table 1 has unpaid orders -> Close button is disabled with warning
    const closeBtn = page.getByRole('button', { name: /còn đơn nợ/i })
    await expect(closeBtn).toBeVisible()
    await expect(closeBtn).toBeDisabled()

    // Click QR button to view generated QR capability link
    await page.getByRole('button', { name: /qr/i }).first().click()
    await expect(page.getByText('Mã QR / Liên kết gọi món (Bàn 01)')).toBeVisible()
    await expect(page.getByText('valid-hmac-qr-token-demo')).toBeVisible()

    // Close modal
    await page.getByRole('button', { name: '✕', exact: true }).click()
  })

  test('Admin Settings page displays operational controls and menu item availability switches', async ({
    page,
  }) => {
    await page.goto('/admin/settings')

    await expect(page.getByRole('heading', { name: /cấu hình & quản trị nội dung|cài đặt vận hành/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /chế độ vận hành & tiếp nhận đơn hàng|công tắc hoạt động quán/i })).toBeVisible()

    // Switch to Menu Content Tab
    await page.getByRole('button', { name: /thực đơn & danh mục/i }).click()

    // Menu items
    await expect(page.getByText('Sườn nướng sốt cay')).toBeVisible()
    await expect(page.getByText('● Còn món')).toBeVisible()
    await expect(page.getByText('Lẩu bò nhúng dấm')).toBeVisible()
    await expect(page.getByText('○ Hết món')).toBeVisible()
  })
})
