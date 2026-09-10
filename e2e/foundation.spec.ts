import { expect, test } from '@playwright/test';

const ROLES = [
  {
    role: 'support',
    label: 'Support Agent',
    allowed: ['Refunds'],
    forbidden: ['KYC', 'Feature Flags', 'Platform'],
  },
  {
    role: 'compliance',
    label: 'Compliance Analyst',
    allowed: ['KYC'],
    forbidden: ['Refunds', 'Feature Flags', 'Platform'],
  },
  {
    role: 'release-engineer',
    label: 'Release Engineer',
    allowed: ['Feature Flags'],
    forbidden: ['KYC', 'Refunds', 'Platform'],
  },
  {
    role: 'manager-admin',
    label: 'Manager / Admin',
    allowed: ['KYC', 'Refunds', 'Feature Flags', 'Platform'],
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

    for (const path of ['/kyc', '/refunds', '/flags']) {
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
    await expect(page.getByText('Select a user in the header picker')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Act as user' })).toBeVisible();
    await expect(page.getByText('Internal Tools')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('user picker rejects an unknown role or user with a typed error', async ({ page }) => {
    const badRole = await page.request.post('/api/demo/role', { data: { role: 'superuser' } });
    expect(badRole.status()).toBe(403);
    const roleBody = await badRole.json();
    expect(roleBody.success).toBe(false);
    expect(roleBody.error.code).toBe('FORBIDDEN');
    expect(roleBody.error.message).toContain('Invalid role');

    const badUser = await page.request.post('/api/demo/role', { data: { userId: 'user_hacker' } });
    expect(badUser.status()).toBe(403);
    const userBody = await badUser.json();
    expect(userBody.success).toBe(false);
    expect(userBody.error.code).toBe('FORBIDDEN');
    expect(userBody.error.message).toContain('Invalid user');
  });
});
