import { test, expect } from '@playwright/test'

test('Back twice with the cart open restores menu scrolling', async ({ page }) => {
  await page.goto('/menu')
  await page.getByRole('button', { name: 'Tiger 345 — Trang chủ' }).click()
  await expect(page).toHaveURL('/')
  await page.locator('#home').getByRole('button', { name: 'Xem thực đơn' }).click()
  await expect(page).toHaveURL('/menu')
  await page.getByRole('button', { name: 'Xem giỏ hàng giao tận nơi', exact: true }).click()
  await expect(page.getByTestId('cart-drawer-backdrop')).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

  await page.goBack()
  await page.goBack()
  await expect(page).toHaveURL('/menu')
  await expect(page.getByTestId('cart-drawer-backdrop')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveCSS('overflow-y', 'hidden')
  await page.mouse.move(150, 350)
  await page.mouse.wheel(0, 500)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('button', { name: 'Xem giỏ hàng giao tận nơi', exact: true }).click()
  await expect(page.getByTestId('cart-drawer-backdrop')).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('cart-drawer-backdrop')).toHaveCount(0)
  await expect(page.locator('body')).not.toHaveCSS('overflow-y', 'hidden')
})
