import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, trackConsoleErrors } from './helpers';

test.describe('public pages', () => {
  test('landing page shows the product, all 20 features and streams', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Rehearse the interview');
    await expect(page.locator('.feature')).toHaveCount(20);
    await expect(page.locator('.stream').first()).toBeVisible();
    await expect(page.locator('.stream', { hasText: 'MBA' })).toBeVisible();
    await expect(page.locator('.demo-card')).toBeVisible();
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });

  test('mobile menu opens and links scroll to sections', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'mobile only');
    await page.goto('/');
    await page.getByRole('button', { name: 'Menu' }).click();
    await page.getByRole('link', { name: 'What it notices' }).click();
    await expect(page.locator('#features')).toBeInViewport();
  });

  test('protected routes redirect to sign in, unknown routes show 404', async ({ page }) => {
    await page.goto('/app/insights');
    await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Finsights/);
    await page.goto('/this/does/not/exist');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('silent');
  });

  test('API health endpoint and security headers', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).db).toBe('up');
    const page = await request.get('/');
    expect(page.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(page.headers()['x-frame-options'] ?? page.headers()['content-security-policy']).toBeTruthy();
  });
});

test.describe('authentication', () => {
  test('register, sign out and sign back in', async ({ page }) => {
    const email = `ui.${Date.now()}.${Math.random().toString(36).slice(2, 6)}@example.com`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Kabir Shah');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('weak');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('Password needs');
    await page.getByLabel('Password', { exact: true }).fill('Str0ngPass!');
    await page.getByLabel('Your stream').selectOption('bcom');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/app\/new\?welcome=1/);
    await expect(page.getByText('Welcome to Vivace, Kabir')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL('/');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('wrong-pass1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect');
    await page.getByLabel('Password', { exact: true }).fill('Str0ngPass!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Kabir');
  });
});
