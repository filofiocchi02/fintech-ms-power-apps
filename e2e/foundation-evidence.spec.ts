import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ROLES = [
  { role: 'support', label: 'support' },
  { role: 'compliance', label: 'compliance' },
  { role: 'release-engineer', label: 'release-engineer' },
  { role: 'manager-admin', label: 'manager-admin' },
] as const;

function screenshotPath(name: string) {
  const project = test.info().project.name;
  const path = `test-results/evidence/${project}/${name}.png`;
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function actAsRole(page: import('@playwright/test').Page, role: string) {
  const res = await page.request.post('/api/demo/role', { data: { role } });
  expect(res.ok()).toBe(true);
}

test.describe('foundation visual evidence', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  for (const { role, label } of ROLES) {
    test(`${label} home`, async ({ page }) => {
      await actAsRole(page, role);
      await page.goto('/');
      await page.screenshot({ path: screenshotPath(`home-${label}`) });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('forbidden /kyc as support', async ({ page }) => {
    await actAsRole(page, 'support');
    await page.goto('/kyc');
    await page.screenshot({ path: screenshotPath('access-denied-kyc-support') });
    await expect(page.getByText('Access denied')).toBeVisible();
  });
});
