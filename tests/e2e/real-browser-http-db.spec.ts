/**
 * Tiger 345 - Real Browser -> Edge HTTP -> Database -> Admin E2E Tests (F09 Remediation)
 *
 * Fact-Forcing Metadata:
 * - Importers/Callers: Executed by Playwright runner via playwright.config.ts (npm run test:e2e)
 * - Affected API:
 *   - /admin/login
 *   - /admin
 *   - /menu
 *   - GET /functions/v1/public-api/menu
 *   - GET /functions/v1/public-api/settings
 * - Data Schemas:
 *   - auth.users (email, encrypted_password)
 *   - public.admin_profiles (user_id, display_name, active)
 *   - public.menu_items, public.menu_categories, public.restaurant_settings
 * - Verbatim Instructions:
 *   - "BƯỚC 9 — F09: E2E THẬT, CI VÀ BÁO CÁO"
 *   - "Rà soát toàn bộ các test E2E (Playwright) hiện có."
 *   - "Nếu test E2E chạy trên mock, hãy cấu hình/viết lại để chạy trên Edge function HTTP + database thật (hoặc đánh dấu rõ ràng những flow D01-D06 đang bị BLOCKED do giao diện/chức năng chưa implement)."
 *   - "Giữ mock UI tests nhưng thêm suite browser→real HTTP→DB→admin."
 */

import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import pg from 'pg'
import { assertIsolatedTestDatabase } from '../fixtures/test-db-guard'

const { Pool } = pg
const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

test.describe('F09: Real Browser -> Edge HTTP -> Database -> Admin E2E Suite (Zero Mocks)', () => {
  test.beforeEach(async ({ context }) => {
    // Explicitly ensure NO page.route mocks are registered
    // All network requests must hit the real Vite dev server, real Edge functions, and real Supabase stack
    await context.clearCookies()
  })

  test('1. Real Public API: Menu & Settings load from real Edge Functions & DB into UI', async ({
    page,
  }) => {
    // Monitor actual network requests to Edge functions
    const menuResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/functions/v1/public-api/menu') && res.status() === 200
    )
    const settingsResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/functions/v1/public-api/settings') && res.status() === 200
    )

    // Navigate to /menu
    await page.goto('/menu')

    // Verify real Edge HTTP calls completed successfully
    const [menuRes, settingsRes] = await Promise.all([
      menuResponsePromise,
      settingsResponsePromise,
    ])
    expect(menuRes.ok()).toBe(true)
    expect(settingsRes.ok()).toBe(true)

    const menuJson = await menuRes.json()
    expect(menuJson.data.categories.length).toBeGreaterThan(0)
    expect(menuJson.data.items.length).toBeGreaterThan(0)

    // Verify DOM renders dishes from real database
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // Real dish items must be rendered
    const dishCards = page.locator('[data-dish-id], [data-testid="dish-card"], img[alt]')
    await expect(dishCards.first()).toBeVisible()

    // Check that at least one dish name from the database is visible in DOM
    const firstDishName = menuJson.data.items[0].name
    await expect(page.getByText(firstDishName).first()).toBeVisible()
  })

  test('2. Real Admin Login Flow: Authenticates against GoTrue and admin_profiles RLS, redirects to /admin', async ({
    page,
  }) => {
    // Navigate to /admin/login
    await page.goto('/admin/login')

    await expect(page.getByText('TIGER 345')).toBeVisible()
    await expect(page.getByRole('heading', { name: /đăng nhập hệ thống điều phối/i })).toBeVisible()

    // Fill in real active admin credentials (seeded in auth-users.ts)
    await page.getByLabel(/email quản trị/i).fill('admin_active@tiger345.vn')
    await page.getByLabel(/^mật khẩu/i).fill('TestPassword123!')

    // Wait for the auth response and profile response
    const authResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/auth/v1/token') && res.status() === 200
    )
    const profileResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/rest/v1/admin_profiles') && res.status() === 200
    )

    // Click submit
    await page.getByRole('button', { name: /đăng nhập vào hệ thống/i }).click()

    await Promise.all([authResponsePromise, profileResponsePromise])

    // Should successfully redirect to /admin dashboard
    await expect(page).toHaveURL(/\/admin/)

    // Verify admin layout is loaded (Admin dashboard heading or navigation)
    await expect(page.getByText(/quản lý/i).first()).toBeVisible()
  })

  test('3. Real Admin Security: Disabled admin is rejected by admin_profiles check and signed out', async ({
    page,
  }) => {
    await page.goto('/admin/login')

    // Fill in disabled admin credentials
    await page.getByLabel(/email quản trị/i).fill('admin_disabled@tiger345.vn')
    await page.getByLabel(/^mật khẩu/i).fill('TestPassword123!')

    await page.getByRole('button', { name: /đăng nhập vào hệ thống/i }).click()

    // Must display error message indicating disabled / no permission
    await expect(
      page.getByText(/tài khoản không có quyền quản trị hoặc đã bị vô hiệu hóa/i)
    ).toBeVisible()

    // User remains on /admin/login
    expect(page.url()).toContain('/admin/login')
  })

  test('4. Real Admin Security: Invalid credentials error handled gracefully', async ({ page }) => {
    await page.goto('/admin/login')

    await page.getByLabel(/email quản trị/i).fill('admin_unknown@tiger345.vn')
    await page.getByLabel(/^mật khẩu/i).fill('WrongPassword123!')

    await page.getByRole('button', { name: /đăng nhập vào hệ thống/i }).click()

    // Must display invalid credentials message
    await expect(page.getByText(/email hoặc mật khẩu không chính xác/i)).toBeVisible()
    expect(page.url()).toContain('/admin/login')
  })

  test('5. Real End-to-End Dine-In Flow: Scan/Enter table QR -> View menu -> Get quote -> Submit order via real HTTP API -> Save to real DB -> Admin views and confirms', async ({
    page,
  }) => {
    test.setTimeout(90000)
    const pool = new Pool({ connectionString })
    await assertIsolatedTestDatabase(pool)

    // 1. Seed table, active QR token, and open visit in real test DB
    const tableId = '00000000-0000-0000-0000-00000000e2e1'
    const tableCode = 'T_E2E'
    const tableName = 'Bàn E2E 01'
    const rawQrToken = `tiger-e2e-token-${Date.now()}`
    const tokenHash = crypto.createHash('sha256').update(rawQrToken).digest('hex')

    await pool.query(
      `INSERT INTO public.dining_tables (id, code, name, active, sort_order)
       VALUES ($1, $2, $3, true, 999)
       ON CONFLICT (code) DO UPDATE SET active = true, name = $3
       RETURNING id`,
      [tableId, tableCode, tableName]
    )

    // Revoke older tokens for this table if any, then insert active one
    await pool.query(
      `UPDATE public.table_qr_tokens SET active = false WHERE table_id = $1`,
      [tableId]
    )
    await pool.query(
      `INSERT INTO public.table_qr_tokens (table_id, token_hash, active)
       VALUES ($1, $2, true)`,
      [tableId, tokenHash]
    )

    // Ensure open visit exists
    const visitId = '00000000-0000-0000-0000-00000000e2e2'
    await pool.query(
      `INSERT INTO public.table_visits (id, table_id, status, capability_epoch, opened_at)
       VALUES ($1, $2, 'open', 1, now())
       ON CONFLICT (id) DO UPDATE SET status = 'open', updated_at = now()`,
      [visitId, tableId]
    )

    try {
      // 2. Customer opens web and resolves QR token
      const resolvePromise = page.waitForResponse(
        (res) =>
          res.url().includes('/functions/v1/public-api/tables/resolve') && res.status() === 200
      )
      await page.goto(`/table/${rawQrToken}`)

      const resolveRes = await resolvePromise
      expect(resolveRes.ok()).toBe(true)

      // Verifies URL strip & redirect to /menu?mode=dine-in
      await expect(page).toHaveURL(/\/menu\?mode=dine-in/)
      expect(page.url()).not.toContain(rawQrToken)

      // Verify table badge is rendered in header
      await expect(page.locator('header').getByText(tableName)).toBeVisible()

      // 3. Customer selects a dish from real menu
      const addToCartBtn = page.locator('article button:has-text("Gọi món")').first()
      await expect(addToCartBtn).toBeVisible()
      await addToCartBtn.click()

      // 4. Customer opens cart drawer
      const cartTrigger = page.getByRole('button', { name: /xem giỏ hàng|giỏ món/i }).first()
      await cartTrigger.click()

      const cartDialog = page.getByRole('dialog')
      await expect(cartDialog).toBeVisible()
      await expect(cartDialog.getByText(`Đang phục vụ tại ${tableName}`)).toBeVisible()

      // 5. Customer requests quote (real Edge HTTP call to /order-quotes)
      const quotePromise = page.waitForResponse(
        (res) =>
          res.url().includes('/functions/v1/public-api/order-quotes') && res.status() === 200
      )
      await cartDialog.getByRole('button', { name: /xem bảng giá & gọi món/i }).click()

      const quoteRes = await quotePromise
      expect(quoteRes.ok()).toBe(true)
      const quoteJson = await quoteRes.json()
      expect(quoteJson.data.total_vnd).toBeGreaterThan(0)

      // Verify quote review screen in cart drawer
      await expect(cartDialog.getByText(/Bảng Giá Đã Xác Nhận Từ Quầy/i)).toBeVisible()

      // 6. Customer confirms and submits order (real Edge HTTP call to /orders)
      const orderPromise = page.waitForResponse(
        (res) =>
          res.url().includes('/functions/v1/public-api/orders') &&
          (res.status() === 200 || res.status() === 201)
      )
      const submitOrderBtn = cartDialog.getByRole('button', {
        name: /xác nhận gửi đơn vào bếp|gọi món ngay|xác nhận gửi bếp/i,
      })
      await submitOrderBtn.click()

      const orderRes = await orderPromise
      expect(orderRes.ok()).toBe(true)
      const orderJson = await orderRes.json()
      const createdOrderId = orderJson.data.id
      const createdOrderCode = orderJson.data.code
      expect(createdOrderId).toBeDefined()
      expect(createdOrderCode).toBeDefined()

      // UI confirms order placed
      await expect(cartDialog.getByText(/Đã Gửi Đơn Vào Bếp|Gửi Bếp Thành Công/i)).toBeVisible()
      await expect(cartDialog.getByText(createdOrderCode)).toBeVisible()

      // 7. Verify real database state: Order saved with status = 'pending'
      const dbOrderRes = await pool.query(
        `SELECT id, code, status, order_type, table_id, total_vnd
         FROM public.orders
         WHERE id = $1`,
        [createdOrderId]
      )
      expect(dbOrderRes.rows.length).toBe(1)
      expect(dbOrderRes.rows[0].status).toBe('pending')
      expect(dbOrderRes.rows[0].order_type).toBe('dine_in')
      expect(dbOrderRes.rows[0].table_id).toBe(tableId)

      // 8. Admin login and order confirmation flow
      await page.goto('/admin/login')
      await page.getByLabel(/email quản trị/i).fill('admin_active@tiger345.vn')
      await page.getByLabel(/^mật khẩu/i).fill('TestPassword123!')

      const authResponsePromise = page.waitForResponse(
        (res) => res.url().includes('/auth/v1/token') && res.status() === 200
      )
      const profileResponsePromise = page.waitForResponse(
        (res) => res.url().includes('/rest/v1/admin_profiles') && res.status() === 200
      )

      await page.getByRole('button', { name: /đăng nhập vào hệ thống/i }).click()
      await Promise.all([authResponsePromise, profileResponsePromise])

      // Wait until admin dashboard is fully loaded
      await expect(page).toHaveURL(/\/admin(\/)?$/)
      await expect(page.getByText(/quản lý/i).first()).toBeVisible()

      // Navigate to /admin/orders
      await page.goto('/admin/orders')
      await expect(page.getByRole('heading', { name: /hàng đợi đơn hàng/i })).toBeVisible()

      // The created order must appear in admin orders queue
      await expect(page.getByText(createdOrderCode)).toBeVisible()

      // Open order detail modal
      const detailBtn = page
        .locator(`tr:has-text("${createdOrderCode}")`)
        .getByRole('button', { name: /chi tiết/i })
        .or(page.getByText(createdOrderCode))
        .first()
      await detailBtn.click()

      // Detail modal opens
      const detailModal = page.locator('div[role="dialog"]').or(page.locator('.fixed.inset-0')).last()
      await expect(detailModal).toBeVisible()
      await expect(detailModal.getByText(createdOrderCode)).toBeVisible()

      // 9. Admin confirms the order (Tiếp nhận đơn)
      const transitionPromise = page.waitForResponse(
        (res) =>
          res.url().includes(`/orders/${createdOrderId}/transition`) && res.status() === 200
      )
      const confirmBtn = detailModal.getByRole('button', { name: /tiếp nhận đơn/i })
      await expect(confirmBtn).toBeVisible()
      await confirmBtn.click()

      const transitionRes = await transitionPromise
      expect(transitionRes.ok()).toBe(true)

      // 10. Verify real database state: Order status is now 'confirmed'
      const updatedDbOrderRes = await pool.query(
        `SELECT status, confirmed_at FROM public.orders WHERE id = $1`,
        [createdOrderId]
      )
      expect(updatedDbOrderRes.rows[0].status).toBe('confirmed')
      expect(updatedDbOrderRes.rows[0].confirmed_at).not.toBeNull()
    } finally {
      // Clean up test records
      await pool.query(
        `DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE table_id = $1)`,
        [tableId]
      )
      await pool.query(`DELETE FROM public.orders WHERE table_id = $1`, [tableId])
      await pool.query(`DELETE FROM public.table_visits WHERE table_id = $1`, [tableId])
      await pool.query(`DELETE FROM public.table_qr_tokens WHERE table_id = $1`, [tableId])
      await pool.query(`DELETE FROM public.dining_tables WHERE id = $1`, [tableId])
      await pool.end()
    }
  })
})
