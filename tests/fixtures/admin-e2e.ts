import { test as base, expect } from '@playwright/test'

// Unhandled admin requests must fail the fixture instead of reaching a real backend.
export const test = base.extend<{ adminApiGuard: void }>({
  adminApiGuard: [
    async ({ page }, use) => {
      const unexpected: string[] = []
      await page.route('**/functions/v1/admin-api/**', async (route) => {
        unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
        await route.fulfill({
          status: 501,
          json: {
            error: {
              code: 'UNMOCKED_ENDPOINT',
              message: 'Missing admin E2E fixture',
            },
          },
        })
      })
      await page.route('**/functions/v1/admin-api/dashboard', (route) =>
        route.fulfill({
          json: {
            data: {
              pending_orders_count: 0,
              preparing_orders_count: 0,
              open_visits_count: 0,
              confirmed_bookings_today_count: 0,
              recent_pending_orders: [],
              settings: {
                accepting_orders: true,
                accepting_dine_in_orders: true,
                accepting_delivery_orders: true,
                booking_enabled: true,
                version: 1,
              },
            },
          },
        })
      )
      await use()
      expect(unexpected, 'All admin HTTP requests must have explicit mocks').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
