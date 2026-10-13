import { test, expect } from '@playwright/test'
import pg from 'pg'
import crypto from 'node:crypto'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard'

test.describe('Real Browser admin backend integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel(/email quản trị/i).fill('admin_active@tiger345.vn')
    await page.getByLabel(/^mật khẩu/i).fill('TestPassword123!')
    await page.getByRole('button', { name: 'Đăng nhập Hệ thống', exact: true }).click()
    await expect(page).toHaveURL(/\/admin$/)
  })
  test('reports and invoices render real HTTP data and export a file', async ({ page }) => {
    const response = page.waitForResponse(r => r.url().includes('/admin-api/reports?range=today'))
    await page.goto('/admin/reports')
    const reportResponse = await response
    expect(reportResponse.status()).toBe(200)
    const report = (await reportResponse.json()).data
    await expect(page.getByText(`${report.received.toLocaleString('vi-VN')}đ`, { exact: true }).first()).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Xuất CSV' }).click()
    expect((await download).suggestedFilename()).toBe('bao-cao.csv')
    const invoicesResponse = page.waitForResponse(r => r.url().includes('/admin-api/invoices?range=today'))
    await page.goto('/admin/invoices')
    expect((await invoicesResponse).status()).toBe(200)
    await expect(page.getByRole('heading', { name: 'Hóa đơn & Xuất Bill' })).toBeVisible()
    await expect(page.getByText('HD-1092', { exact: true })).toHaveCount(0)
  })
  test('creates a real Auth account and persists lock/unlock through UI', async ({ page }) => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
    const email = `admin-e2e-${crypto.randomUUID()}@example.test`
    await assertIsolatedTestDatabase(pool)
    try {
      await page.goto('/admin/accounts')
      await page.getByRole('button', { name: 'Thêm tài khoản admin' }).click()
      await page.getByLabel('Họ tên', { exact: true }).fill('Integration Admin')
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel(/Mật khẩu/).fill(`Test-${crypto.randomUUID()}!`)
      const created = page.waitForResponse(r => r.url().endsWith('/admin-api/accounts') && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click()
      expect((await created).status()).toBe(201)
      const row = page.getByRole('row').filter({ hasText: email })
      await expect(row).toContainText('Đang hoạt động')
      await row.getByRole('button', { name: 'Khóa', exact: true }).click()
      await expect(row).toContainText('Đã khóa')
      let stored = await pool.query('SELECT a.active FROM public.admin_profiles a JOIN auth.users u ON a.user_id = u.id WHERE u.email = $1', [email])
      expect(stored.rows[0].active).toBe(false)
      await page.reload()
      await row.getByRole('button', { name: 'Mở khóa', exact: true }).click()
      await expect(row).toContainText('Đang hoạt động')
      stored = await pool.query('SELECT a.active FROM public.admin_profiles a JOIN auth.users u ON a.user_id = u.id WHERE u.email = $1', [email])
      expect(stored.rows[0].active).toBe(true)
    } finally {
      await pool.query("DELETE FROM public.audit_logs WHERE entity_type = 'admin_profiles' AND entity_id IN (SELECT a.id::text FROM public.admin_profiles a JOIN auth.users u ON a.user_id = u.id WHERE u.email = $1 UNION SELECT id::text FROM auth.users WHERE email = $1)", [email])
      await pool.query('DELETE FROM public.admin_profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email = $1)', [email])
      await pool.query('DELETE FROM auth.users WHERE email = $1', [email])
      await pool.end()
    }
  })
  test('records a payment, saves a note, opens actual receipt items and closes the visit', async ({ page }) => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
    await assertIsolatedTestDatabase(pool)
    const tableId = crypto.randomUUID(), visitId = crypto.randomUUID(), orderId = crypto.randomUUID()
    const code = `E2E-${orderId.slice(0, 8)}`
    const tableName = `Bàn E2E ${tableId.slice(0, 8)}`
    try {
      await pool.query('INSERT INTO public.dining_tables (id, code, name) VALUES ($1,$2,$3)', [tableId, code, tableName])
      await pool.query("INSERT INTO public.table_visits (id, table_id, status) VALUES ($1,$2,'open')", [visitId, tableId])
      await pool.query("INSERT INTO public.orders (id, code, order_type, status, table_id, table_visit_id, table_name_snapshot, subtotal_vnd, total_vnd) VALUES ($1,$2,'dine_in','served',$3,$4,$5,123456,123456)", [orderId, code, tableId, visitId, tableName])
      await pool.query("INSERT INTO public.order_items (order_id, item_name, unit_price_vnd, quantity, line_total_vnd) VALUES ($1,'Món kiểm tra thật',61728,2,123456)", [orderId])
      await page.goto(`/admin/orders?orderId=${orderId}`)
      await expect(page.getByText('Món kiểm tra thật', { exact: true })).toBeVisible()
      await page.getByPlaceholder('VD: Khách dặn làm ít cay, đã xin lỗi vì bàn chờ lâu...').fill('Ghi chú lưu thật')
      const note = page.waitForResponse(r => r.url().endsWith(`/orders/${orderId}/note`) && r.request().method() === 'PATCH')
      await page.getByRole('button', { name: 'Lưu ghi chú' }).click()
      expect((await note).status()).toBe(200)
      await page.getByRole('button', { name: 'Ghi nhận thanh toán', exact: true }).click()
      const payment = page.waitForResponse(r => r.url().endsWith(`/orders/${orderId}/payment`))
      await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).click()
      expect((await payment).status()).toBe(200)
      await expect(page.getByRole('button', { name: 'Hoàn thành đơn hàng', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: 'Hoàn thành đơn hàng', exact: true }).click()
      await expect.poll(async () => (await pool.query('SELECT status FROM public.orders WHERE id = $1', [orderId])).rows[0].status).toBe('completed')
      const stored = await pool.query('SELECT internal_note, payment_status, payment_method FROM public.orders WHERE id = $1', [orderId])
      expect(stored.rows[0]).toMatchObject({ internal_note: 'Ghi chú lưu thật', payment_status: 'paid', payment_method: 'cash' })
      await page.goto('/admin/invoices')
      const row = page.getByRole('row').filter({ hasText: code })
      await expect(row).toContainText('123.456')
      await row.getByRole('button').first().click()
      await expect(page.getByText('Món kiểm tra thật', { exact: true }).last()).toBeVisible()
      await page.goto('/admin/tables')
      const button = page.getByRole('button', { name: `Chi tiết và thanh toán bàn ${tableName}`, exact: true })
      await expect(button).toBeVisible()
      const card = button.locator('..').locator('..').locator('..')
      page.once('dialog', dialog => dialog.accept())
      await card.getByRole('button', { name: 'Đóng bàn (Kết thúc phiên)', exact: true }).click()
      await expect.poll(async () => (await pool.query('SELECT status FROM public.table_visits WHERE id = $1', [visitId])).rows[0].status).toBe('closed')
    } finally {
      await pool.query('DELETE FROM public.idempotency_requests WHERE result_id = $1', [orderId])
      await pool.query('DELETE FROM public.audit_logs WHERE entity_id IN ($1,$2,$3)', [orderId, tableId, visitId])
      await pool.query('DELETE FROM public.orders WHERE id = $1', [orderId])
      await pool.query('DELETE FROM public.table_visits WHERE id = $1', [visitId])
      await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [tableId])
      await pool.end()
    }
  })

  test('creates a dine-in order from the admin form into PostgreSQL', async ({ page }) => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' })
    await assertIsolatedTestDatabase(pool)
    const tableId = crypto.randomUUID(), visitId = crypto.randomUUID(), itemId = crypto.randomUUID(), hourId = crypto.randomUUID()
    const tableName = `Tạo đơn ${tableId.slice(0, 8)}`
    const itemName = `Món mới ${itemId.slice(0, 8)}`
    let createdId: string | undefined
    try {
      // Add a uniquely owned test opening only when the current minute is outside existing hours.
      await pool.query(`INSERT INTO public.business_hours (id, weekday, service_type, open_time, close_time, active)
        SELECT $1, extract(dow FROM local_now)::int, 'restaurant', local_now::time,
          least((local_now + interval '2 minutes')::time, '23:59:59'::time), true
        FROM (SELECT now() AT TIME ZONE 'Asia/Ho_Chi_Minh' AS local_now) t
        WHERE local_now::time < '23:57:00'::time AND NOT EXISTS (
          SELECT 1 FROM public.business_hours h WHERE h.weekday = extract(dow FROM local_now)::int
          AND h.service_type = 'restaurant' AND h.active AND h.open_time <= (local_now + interval '2 minutes')::time AND h.close_time >= local_now::time
        )`, [hourId])
      await pool.query('INSERT INTO public.dining_tables (id, code, name) VALUES ($1,$2,$3)', [tableId, `NEW-${tableId.slice(0, 8)}`, tableName])
      await pool.query("INSERT INTO public.table_visits (id, table_id, status) VALUES ($1,$2,'open')", [visitId, tableId])
      const category = await pool.query('SELECT id FROM public.categories ORDER BY sort_order LIMIT 1')
      await pool.query("INSERT INTO public.menu_items (id, category_id, name, slug, price_vnd, published, available, allow_dine_in) VALUES ($1,$2,$3,$4,50000,true,true,true)", [itemId, category.rows[0].id, itemName, `new-${itemId}`])
      await page.goto('/admin/orders?action=new&type=dine_in')
      await expect(page.getByRole('dialog', { name: 'Tạo đơn hàng' })).toBeVisible()
      await page.getByLabel('Bàn đang phục vụ', { exact: true }).selectOption(tableId)
      await page.getByLabel(`Số lượng ${itemName}`, { exact: true }).fill('2')
      const created = page.waitForResponse(r => r.url().endsWith('/admin-api/orders') && r.request().method() === 'POST')
      await page.getByRole('button', { name: 'Gửi đơn hàng', exact: true }).click()
      const response = await created
      expect(response.status()).toBe(201)
      const receipt = (await response.json()).data.receipt
      createdId = receipt.id
      await expect(page).toHaveURL(new RegExp(`orderId=${createdId}`))
      const persisted = await pool.query('SELECT total_vnd, table_visit_id FROM public.orders WHERE id = $1', [createdId])
      expect(persisted.rows[0]).toMatchObject({ total_vnd: '100000', table_visit_id: visitId })
      await expect(page.getByText(itemName, { exact: true })).toBeVisible()
    } finally {
      const owned = await pool.query('SELECT id FROM public.orders WHERE table_visit_id = $1', [visitId])
      const ids = owned.rows.map(row => row.id)
      await pool.query('DELETE FROM public.idempotency_requests WHERE result_id = ANY($1::uuid[])', [ids])
      await pool.query('DELETE FROM public.audit_logs WHERE entity_id = ANY($1::text[])', [ids])
      await pool.query('DELETE FROM public.orders WHERE table_visit_id = $1', [visitId])
      await pool.query('DELETE FROM public.table_visits WHERE id = $1', [visitId])
      await pool.query('DELETE FROM public.dining_tables WHERE id = $1', [tableId])
      await pool.query('DELETE FROM public.menu_items WHERE id = $1', [itemId])
      await pool.query('DELETE FROM public.business_hours WHERE id = $1', [hourId])
      await pool.end()
    }
  })

})
