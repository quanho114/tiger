/**
 * Tiger 345 - Account Deletion, Privacy & Retention E2E Tests
 * Task: T19 (Invariant V23, Decision D04)
 *
 * Importers/Callers:
 * - Playwright test runner (npx playwright test tests/e2e/account-delete.spec.ts)
 *
 * Affected UI & API:
 * - /account/profile (AccountProfilePage)
 * - DELETE /functions/v1/customer-api/profile
 * - GET /functions/v1/customer-api/profile
 * - Supabase auth logout
 *
 * Data Schemas & Invariants:
 * - Invariant V23: Account Deletion Workflow, API Gate Lockout, PII Sanitization
 * - Decision D04: Retention and Cleanup Safeguards
 * - Schemas: public.account_deletion_jobs, public.customer_profiles, public.orders, public.reservations
 *
 * Verbatim Instruction:
 * "làm full các task luôn ấy" (T19 Privacy & Retention)
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

const mockProfilePayload = {
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

test.describe('Tiger 345 Account Deletion & Privacy Policy E2E (Task T19, Invariant V23, Decision D04)', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock customer session into localStorage
    await page.addInitScript(() => {
      const mockSession = {
        access_token: 'mock-customer-bearer-token-e2e',
        refresh_token: 'mock-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: 'user-cust-001',
          email: 'khach@tiger345.vn',
          role: 'authenticated',
        },
      }
      window.localStorage.setItem('tiger345_auth_token', JSON.stringify(mockSession))
    })

    // Mock Supabase Auth / User
    await page.route('**/auth/v1/user*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-cust-001',
          email: 'khach@tiger345.vn',
          role: 'authenticated',
        }),
      })
    })

    // Mock Supabase Auth / Logout
    await page.route('**/auth/v1/logout*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      })
    })

    // Mock Profile lookup from Supabase Client
    await page.route('**/rest/v1/admin_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/rest/v1/customer_profiles*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: 'user-cust-001',
            display_name: 'Nguyễn Văn Khách',
            phone: '0901234567',
            avatar_url: null,
            marketing_opt_in: true,
            deletion_requested_at: null,
          },
        ]),
      })
    })

    // Intercept settings
    await page.route('**/functions/v1/public-api/settings*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSettingsPayload),
      })
    })

    // Intercept customer profile GET
    await page.route('**/functions/v1/customer-api/**profile*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockProfilePayload),
        })
      } else {
        await route.fallback()
      }
    })
  })

  test('Displays Privacy & Account Deletion section on profile page, can open and cancel modal', async ({
    page,
  }) => {
    await page.goto('/account/profile')

    // Check presence of Privacy & Security section
    await expect(page.getByText('Bảo mật & Quyền riêng tư')).toBeVisible()
    await expect(page.getByText('Yêu cầu xóa tài khoản')).toBeVisible()

    // Open modal
    const openBtn = page.locator('[data-testid="open-delete-account-btn"]')
    await expect(openBtn).toBeVisible()
    await openBtn.click()

    // Verify modal is open
    const modal = page.locator('[data-testid="delete-account-modal"]')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Xác nhận xóa tài khoản' })).toBeVisible()

    // Close modal via Cancel button
    const cancelBtn = page.locator('[data-testid="cancel-delete-btn"]')
    await expect(cancelBtn).toBeVisible()
    await cancelBtn.click()

    // Modal is dismissed
    await expect(modal).not.toBeVisible()
  })

  test('Enforces strict confirmation phrase gate before allowing deletion', async ({ page }) => {
    await page.goto('/account/profile')

    // Open modal
    await page.locator('[data-testid="open-delete-account-btn"]').click()

    const confirmBtn = page.locator('[data-testid="confirm-delete-btn"]')
    const input = page.locator('[data-testid="delete-confirm-input"]')

    // Initially disabled
    await expect(confirmBtn).toBeDisabled()

    // Wrong text keeps button disabled
    await input.fill('xoa')
    await expect(confirmBtn).toBeDisabled()

    await input.fill('xoa tai khoan')
    await expect(confirmBtn).toBeDisabled()

    // Exact phrase enables button
    await input.fill('XÓA TÀI KHOẢN')
    await expect(confirmBtn).toBeEnabled()
  })

  test('Handles 401 AUTH_RECENT_REQUIRED error gracefully with security instruction', async ({
    page,
  }) => {
    // Intercept DELETE with 401
    await page.route('**/functions/v1/customer-api/**profile*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'AUTH_RECENT_REQUIRED',
              message: 'Auth recent required',
            },
          }),
        })
      } else {
        await route.fallback()
      }
    })

    await page.goto('/account/profile')
    await page.locator('[data-testid="open-delete-account-btn"]').click()

    await page.locator('[data-testid="delete-confirm-input"]').fill('XÓA TÀI KHOẢN')
    await page.locator('[data-testid="confirm-delete-btn"]').click()

    // Verify error banner
    const errorBanner = page.locator('[data-testid="delete-error-banner"]')
    await expect(errorBanner).toBeVisible()
    await expect(errorBanner).toContainText(
      'Phiên đăng nhập đã quá 10 phút vì lý do bảo mật'
    )
  })

  test('Handles 403 ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN error when admin attempts self-deletion', async ({
    page,
  }) => {
    // Intercept DELETE with 403
    await page.route('**/functions/v1/customer-api/**profile*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'ACTIVE_ADMIN_SELF_DELETE_FORBIDDEN',
              message: 'Active admin self deletion forbidden',
            },
          }),
        })
      } else {
        await route.fallback()
      }
    })

    await page.goto('/account/profile')
    await page.locator('[data-testid="open-delete-account-btn"]').click()

    await page.locator('[data-testid="delete-confirm-input"]').fill('XÓA TÀI KHOẢN')
    await page.locator('[data-testid="confirm-delete-btn"]').click()

    // Verify error banner
    const errorBanner = page.locator('[data-testid="delete-error-banner"]')
    await expect(errorBanner).toBeVisible()
    await expect(errorBanner).toContainText(
      'Tài khoản quản trị viên không thể tự xóa qua cổng khách hàng'
    )
  })

  test('Successfully executes account deletion, signs out, and redirects to home page', async ({
    page,
  }) => {
    // Intercept DELETE with 200
    await page.route('**/functions/v1/customer-api/**profile*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              deleted: true,
              status: 'completed',
              message: 'Đã xóa tài khoản thành công.',
            },
          }),
        })
      } else {
        await route.fallback()
      }
    })

    await page.goto('/account/profile')
    await page.locator('[data-testid="open-delete-account-btn"]').click()

    await page.locator('[data-testid="delete-confirm-input"]').fill('XÓA TÀI KHOẢN')
    await page.locator('[data-testid="confirm-delete-btn"]').click()

    // Expect navigation to '/' after sign out
    await expect(page).toHaveURL('/')
  })
})
