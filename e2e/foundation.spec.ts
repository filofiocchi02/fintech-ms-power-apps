import { expect, test } from '@playwright/test';

const ROLES = [
  {
    role: 'support',
    label: 'Support Agent',
    allowed: ['Refunds'],
    forbidden: ['KYC', 'Feature Flags', 'Audit'],
  },
  {
    role: 'compliance',
    label: 'Compliance Analyst',
    allowed: ['KYC'],
    forbidden: ['Refunds', 'Feature Flags', 'Audit'],
  },
  {
    role: 'release-engineer',
    label: 'Release Engineer',
    allowed: ['Feature Flags'],
    forbidden: ['KYC', 'Refunds', 'Audit'],
  },
  {
    role: 'manager-admin',
    label: 'Manager / Admin',
    allowed: ['KYC', 'Refunds', 'Feature Flags', 'Audit'],
    forbidden: [],
  },
] as const;

function collectConsoleErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function actAsRole(page: import('@playwright/test').Page, role: string) {
  const res = await page.request.post('/api/demo/role', { data: { role } });
  expect(res.ok()).toBe(true);
}

test.describe('role-based shell', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  for (const { role, label, allowed, forbidden } of ROLES) {
    test(`${label} sees only allowed apps`, async ({ page }) => {
      const errors = collectConsoleErrors(page);

      await actAsRole(page, role);
      await page.goto('/');

      for (const app of allowed) {
        await expect(page.getByRole('link', { name: app, exact: false })).toBeVisible();
      }
      for (const app of forbidden) {
        await expect(page.getByRole('link', { name: app, exact: false })).toBeHidden();
      }

      expect(errors).toEqual([]);
    });
  }

  test('manager can open every app without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'manager-admin');

    for (const path of ['/kyc', '/refunds', '/flags', '/audit']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }

    expect(errors).toEqual([]);
  });
});

test.describe('direct forbidden access', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('authenticated forbidden page redirects to console home with no data leaked', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'support');
    await page.goto('/kyc');

    // A user who already has a role should land back on the console home, where the
    // role switcher and allowed apps are visible, rather than a dead-end Access denied page.
    await expect(page).toHaveURL('/');
    await expect(page.getByText('KYC Review Queue')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1, name: 'Operations Console' })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('unauthenticated user sees Access denied state with the role switcher available', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto('/kyc');

    await expect(page.getByText('Access denied')).toBeVisible();
    await expect(page.getByText('Select a role using the switcher in the header')).toBeVisible();
    await expect(page.getByLabel('Act as role')).toBeVisible();
    await expect(page.getByText('Internal Tools')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('role switcher rejects an unknown role with a typed error', async ({ page }) => {
    const res = await page.request.post('/api/demo/role', { data: { role: 'superuser' } });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toContain('Invalid role');
  });
});
