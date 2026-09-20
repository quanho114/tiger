import { test, expect } from '@playwright/test'

const _mockAdminUser = {
  id: 'usr-admin-01',
  email: 'admin@tiger345.vn',
  role: 'admin',
  full_name: 'Quản Lý Tiger',
}

const mockTable = {
  id: 'tbl-01',
  code: 'B01',
  name: 'Bàn 01',
  seating_area_id: null,
  area_name: 'Sân vườn',
  active: true,
  sort_order: 1,
  version: 2,
  current_visit_id: 'visit-100',
  visit_opened_at: new Date(Date.now() - 3600000).toISOString(),
  unpaid_orders_count: 2,
  unpaid_total_vnd: 565000,
  active_qr_token: 'qr-token-b01',
}

const mockVisitDetail = {
  visit: {
    id: 'visit-100',
    table_id: 'tbl-01',
    table_code: 'B01',
    table_name: 'Bàn 01',
    status: 'active' as const,
    capability_epoch: 1,
    opened_at: new Date(Date.now() - 3600000).toISOString(),
    closed_at: null,
    opened_by_admin_id: 'usr-admin-01',
    version: 3,
  },
  orders: [
    {
      id: 'ord-01',
      code: 'TG-DINE-001',
      order_type: 'dine_in' as const,
      status: 'served' as const,
      payment_status: 'unpaid' as const,
      payment_method: null,
      total_vnd: 245000,
      created_at: new Date(Date.now() - 3000000).toISOString(),
      paid_at: null,
      version: 2,
      items_summary: [
        {
          name: 'Sườn heo nướng sốt cay',
          quantity: 1,
          line_total_vnd: 245000,
        },
      ],
    },
    {
      id: 'ord-02',
      code: 'TG-DINE-002',
      order_type: 'dine_in' as const,
      status: 'served' as const,
      payment_status: 'unpaid' as const,
      payment_method: null,
      total_vnd: 320000,
      created_at: new Date(Date.now() - 1500000).toISOString(),
      paid_at: null,
      version: 2,
      items_summary: [
        {
          name: 'Lẩu Thái Hải Sản',
          quantity: 1,
          line_total_vnd: 320000,
        },
      ],
    },
  ],
  unpaid_summary: {
    active_orders_count: 2,
    unpaid_orders_count: 2,
    unpaid_total_vnd: 565000,
  },
}

test.describe('Dine-In Visit Settlement & Lifecycle E2E (Task T17, Invariant V18)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock session into localStorage to simulate logged-in admin state
    await page.addInitScript(() => {
      const mockSession = {
        access_token: 'mock-admin-bearer-token-e2e',
        refresh_token: 'mock-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'usr-admin-01',
          email: 'admin@tiger345.vn',
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
          id: 'usr-admin-01',
          email: 'admin@tiger345.vn',
          role: 'authenticated',
        }),
      })
    })

    await page.route('**/rest/v1/admin_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user_id: 'usr-admin-01',
          active: true,
          display_name: 'Quản Lý Tiger',
        }),
      })
    })
  })

  test('Admin views active visit, settles all orders atomically, and closes visit', async ({
    page,
  }) => {
    let visitDetailState = JSON.parse(JSON.stringify(mockVisitDetail))
    let tableState = JSON.parse(JSON.stringify(mockTable))
    let settleCalls = 0
    let closeCalls = 0

    // Intercept tables list
    await page.route('**/functions/v1/admin-api/tables*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            tables: [tableState],
            seating_areas: [],
          },
        }),
      })
    })

    // Intercept visit detail
    await page.route('**/functions/v1/admin-api/visits/visit-100', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: visitDetailState,
        }),
      })
    })

    // Intercept visit settle
    await page.route('**/functions/v1/admin-api/visits/visit-100/settle', async (route) => {
      settleCalls++
      const postData = route.request().postDataJSON()
      expect(postData.payment_method).toBe('bank_transfer')
      expect(postData.expected_orders.length).toBe(2)

      // Update mock visit state to settled
      visitDetailState.orders.forEach((o: any) => {
        o.payment_status = 'paid'
        o.payment_method = 'bank_transfer'
        o.paid_at = new Date().toISOString()
      })
      visitDetailState.unpaid_summary.unpaid_orders_count = 0
      visitDetailState.unpaid_summary.unpaid_total_vnd = 0
      tableState.unpaid_orders_count = 0
      tableState.unpaid_total_vnd = 0

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            visit_id: 'visit-100',
            batch_id: 'batch-settle-001',
            settled_orders_count: 2,
            total_amount_vnd: 565000,
            payment_method: 'bank_transfer',
            settled_at: new Date().toISOString(),
          },
        }),
      })
    })

    // Intercept visit close
    await page.route('**/functions/v1/admin-api/visits/visit-100/close', async (route) => {
      closeCalls++
      tableState.current_visit_id = null
      tableState.visit_opened_at = null

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'visit-100',
            status: 'closed',
            closed_at: new Date().toISOString(),
          },
        }),
      })
    })

    // 1. Navigate to admin tables page
    await page.goto('/admin/tables')

    // 2. Verify table B01 displays unpaid order count and total
    await expect(page.getByText('Bàn 01')).toBeVisible()
    await expect(page.getByText('2 đơn chưa thanh toán')).toBeVisible()
    await expect(page.getByText('565.000 đ')).toBeVisible()

    // 3. Open visit details modal
    await page.getByRole('button', { name: /Chi tiết và thanh toán bàn Bàn 01/i }).click()

    // 4. Modal shows both orders
    await expect(page.getByText('TG-DINE-001')).toBeVisible()
    await expect(page.getByText('TG-DINE-002')).toBeVisible()
    await expect(page.getByText('Sườn heo nướng sốt cay')).toBeVisible()
    await expect(page.getByText('Lẩu Thái Hải Sản')).toBeVisible()

    // 5. Select payment method 'Chuyển khoản' and settle
    await page.getByLabel(/Chuyển khoản/i).check()
    await page.getByRole('button', { name: /Xác nhận thanh toán toàn bộ/i }).click()

    // 6. Verify settlement succeeded and unpaid summary updated
    expect(settleCalls).toBe(1)
    await expect(page.getByText('Đã thanh toán toàn bộ 2 đơn hàng thành công!')).toBeVisible()

    // 7. Close visit
    await page.getByRole('button', { name: /Đóng phiên bàn/i }).click()
    expect(closeCalls).toBe(1)

    // 8. Modal closed and table now shows as available / ready for new visit
    await expect(page.getByText('Bàn trống')).toBeVisible()
  })

  test('Admin Order Detail Modal enforces paid cancellation guard and audit timeline', async ({
    page,
  }) => {
    let orderState: {
      order: any
      items: any[]
      status_history: any[]
      payment_events: any[]
    } = {
      order: {
        id: 'ord-deliv-01',
        code: 'TG-DELIV-001',
        order_type: 'delivery' as const,
        status: 'confirmed' as const,
        payment_status: 'paid' as const,
        total_vnd: 245000,
        subtotal_vnd: 245000,
        shipping_fee_vnd: 0,
        customer_name: 'Anh Nam',
        customer_phone: '0901234567',
        address_snapshot: '123 Đường Số 1, Vĩnh Cửu',
        note: 'Giao nhanh',
        internal_note: '',
        item_count: 1,
        version: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      items: [
        {
          id: 'item-01',
          menu_item_id: '10000000-0000-0000-0000-000000000001',
          name_snapshot: 'Sườn heo nướng sốt cay',
          price_vnd: 245000,
          quantity: 1,
          subtotal_vnd: 245000,
        },
      ],
      status_history: [
        {
          id: 'hist-01',
          from_status: null,
          to_status: 'pending' as const,
          reason: 'Khách tạo đơn',
          actor_name: 'Khách',
          created_at: new Date(Date.now() - 1000000).toISOString(),
        },
        {
          id: 'hist-02',
          from_status: 'pending' as const,
          to_status: 'confirmed' as const,
          reason: 'Xác nhận đơn',
          actor_name: 'Quản Lý Tiger',
          created_at: new Date(Date.now() - 500000).toISOString(),
        },
      ],
      payment_events: [
        {
          id: 'pe-01',
          order_id: 'ord-deliv-01',
          event: 'paid' as const,
          amount_vnd: 245000,
          method: 'cash' as const,
          actor_admin_name: 'Quản Lý Tiger',
          reason: null,
          created_at: new Date(Date.now() - 200000).toISOString(),
        },
      ],
    }

    // Intercept orders list
    await page.route(/\/functions\/v1\/admin-api\/orders(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            orders: [orderState.order],
            total: 1,
          },
        }),
      })
    })

    // Intercept order detail
    await page.route(/\/functions\/v1\/admin-api\/orders\/ord-deliv-01(\?.*)?$/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: orderState }),
      })
    })

    // Navigate to admin orders
    await page.goto('/admin/orders')

    // Click on the order to open modal
    await page.getByText('TG-DELIV-001').click()

    // Verify order modal opened
    await expect(page.getByText('Chi tiết đơn hàng TG-DELIV-001')).toBeVisible()

    // Verify payment timeline displays the cash payment
    await expect(page.getByText('Lịch sử thanh toán & sự kiện tiền tệ')).toBeVisible()
    await expect(page.getByText('Thu tiền mặt: +245.000 đ')).toBeVisible()

    // Verify "Hủy đơn" button is disabled with guard tooltip/notice
    const cancelBtn = page.getByRole('button', { name: /Hủy đơn/i })
    await expect(cancelBtn).toBeDisabled()
    await expect(
      page.getByText('Đơn đã thanh toán, phải hoàn tiền trước khi hủy/từ chối')
    ).toBeVisible()

    // Refund order
    await page.route('**/functions/v1/admin-api/orders/ord-deliv-01/payment', async (route) => {
      const postData = route.request().postDataJSON()
      expect(postData.event).toBe('refunded')
      expect(postData.reason).toBe('Khách hủy đơn hoàn tiền')

      orderState.order.payment_status = 'refunded'
      orderState.payment_events.push({
        id: 'pe-02',
        order_id: 'ord-deliv-01',
        event: 'refunded',
        amount_vnd: 245000,
        method: null,
        actor_admin_name: 'Quản Lý Tiger',
        reason: 'Khách hủy đơn hoàn tiền',
        created_at: new Date().toISOString(),
      })

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            order_id: 'ord-deliv-01',
            payment_status: 'refunded',
            payment_method: null,
          },
        }),
      })
    })

    // Click "Hoàn tiền"
    await page.getByRole('button', { name: /Hoàn tiền/i }).click()
    await page.getByPlaceholder(/Lý do hoàn tiền/i).fill('Khách hủy đơn hoàn tiền')
    await page.getByRole('button', { name: /Xác nhận hoàn tiền/i }).click()

    // Now cancellation button is enabled!
    await expect(cancelBtn).toBeEnabled()
  })
})
