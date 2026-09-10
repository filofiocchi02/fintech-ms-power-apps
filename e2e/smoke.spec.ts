import { expect, test } from '@playwright/test';

/**
 * Proves the Playwright harness itself works before any feature exists. Feature sessions add
 * e2e/{kyc,refunds,flags}.spec.ts and the role/authorization matrix alongside this file.
 */
test('the console shell renders without browser console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
