import { test, expect } from '@playwright/test';

test.describe('Tiger 345 Route Smoke Tests', () => {
  test('Home page (/) loads successfully', async ({ page }) => {
    await page.goto('/');

    // Check main title / branding
    await expect(page).toHaveTitle(/Tiger 345/i);
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Check footer exists
    await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByText(/090\s*280\s*99/i).first()).toBeVisible();
  });

  test('Menu page (/menu) renders dishes and toggles modes', async ({ page }) => {
    await page.goto('/menu');

    // Heading verification
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Dish cards are present
    const dishCards = page.locator('[data-dish-id], img[alt]');
    await expect(dishCards.first()).toBeVisible();

    // Mode switch check
    const deliveryTab = page.getByRole('tab', { name: /giao tận nơi/i }).first();
    if (await deliveryTab.isVisible()) {
      await deliveryTab.click();
      await expect(page).toHaveURL(/mode=delivery/);
    }
  });

  test('Reservation page (/reservation) displays booking form and rules', async ({ page }) => {
    await page.goto('/reservation');

    // Heading verification
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Booking form fields
    await expect(page.getByLabel(/họ và tên quý khách/i)).toBeVisible();
    await expect(page.getByLabel(/số điện thoại liên hệ/i)).toBeVisible();
    await expect(page.getByLabel(/ngày dùng bữa/i)).toBeVisible();

    // Submit button
    await expect(page.getByRole('button', { name: /gửi yêu cầu đặt bàn/i })).toBeVisible();
  });

  test('Location page (/location) displays address, map, and contact channels', async ({ page }) => {
    await page.goto('/location');

    // Heading verification
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Address verification
    await expect(page.getByText(/Vĩnh An/i).first()).toBeVisible();

    // Hotline and Facebook links
    await expect(page.locator('a[href^="tel:0902809929"]').first()).toBeVisible();
    await expect(page.locator('a[href*="facebook.com/Tiger345HT"]').first()).toBeVisible();
  });
});
