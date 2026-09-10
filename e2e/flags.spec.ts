import { expect, test, type Page } from '@playwright/test';

/**
 * Browser verification for the feature-flag tool: the environment is always explicit, a
 * Release Engineer can change dev but not production, and a production change needs the
 * typed flag key plus a reason. The API bypass check matters most — the dialog is UX, the
 * server is the boundary.
 */

const FLAG_KEY = 'new-dashboard';

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function actAsRole(page: Page, role: string) {
  const res = await page.request.post('/api/demo/role', { data: { role } });
  expect(res.ok()).toBe(true);
}

/**
 * Issues a request from the page itself. The demo role cookie is SameSite=Strict, so a
 * request made from Playwright's API context arrives without it and would prove nothing
 * about role enforcement.
 */
async function requestFromPage(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: string }> {
  return page.evaluate(
    async ({ path, init }) => {
      const response = await fetch(path, {
        method: init?.method ?? 'GET',
        headers: init?.body ? { 'content-type': 'application/json' } : undefined,
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
      return { status: response.status, body: await response.text() };
    },
    { path, init },
  );
}

test.describe('feature flag administration', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('release engineer lists, searches and switches environment', async ({ page }, testInfo) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'release-engineer');
    await page.goto('/flags');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('Feature Flag');
    await expect(page.getByRole('link', { name: FLAG_KEY, exact: true })).toBeVisible();

    await page.getByLabel('Search flags').fill('dashboard');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByRole('link', { name: FLAG_KEY, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'instant-payouts', exact: true })).toBeHidden();

    await page.getByRole('link', { name: 'Production' }).click();
    await expect(page).toHaveURL(/env=production/);
    await expect(page.getByText('Acting on')).toBeVisible();

    await testInfo.attach('flags-production-view', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    expect(errors).toEqual([]);
  });

  test('release engineer changes a dev flag through the confirmation dialog', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'release-engineer');
    await page.goto(`/flags?env=dev&key=${FLAG_KEY}`);

    const toggle = page.getByRole('button', { name: /^(Enable|Disable) flag$/ });
    const wasEnabled = (await toggle.innerText()).startsWith('Disable');

    await toggle.click();
    await page.getByLabel('Reason').fill('Browser verification of the dev toggle');
    await page.getByRole('button', { name: /Apply change/ }).click();

    await expect(
      page.getByRole('button', { name: wasEnabled ? 'Enable flag' : 'Disable flag' }),
    ).toBeVisible();
    await expect(page.getByText('Browser verification of the dev toggle').first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('release engineer cannot write production, in the UI or through the API', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'release-engineer');
    await page.goto(`/flags?env=production&key=${FLAG_KEY}`);

    await expect(page.getByText('Production changes are restricted to Manager / Admin')).toBeVisible();
    await expect(page.getByRole('button', { name: /flag$/ })).toBeHidden();

    // The dialog is a courtesy; the server is the boundary.
    const bypass = await requestFromPage(page, `/api/flags/${FLAG_KEY}`, {
      method: 'PATCH',
      body: {
        environment: 'production',
        enabled: false,
        reason: 'Direct API bypass attempt',
        confirmation: FLAG_KEY,
      },
    });
    expect(bypass.status).toBe(403);

    // The rejected request itself is logged by the browser; nothing else may be.
    expect(errors.filter((error) => !error.includes('403 (Forbidden)'))).toEqual([]);
  });

  test('manager admin changes production only after typing the flag key', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await actAsRole(page, 'manager-admin');
    await page.goto(`/flags?env=production&key=${FLAG_KEY}`);

    const toggle = page.getByRole('button', { name: /^(Enable|Disable) flag$/ });
    const wasEnabled = (await toggle.innerText()).startsWith('Disable');
    await toggle.click();

    await page.getByLabel('Reason').fill('Incident 1421: production verification');
    const apply = page.getByRole('button', { name: /Apply change/ });
    await expect(apply).toBeDisabled();

    await page.getByLabel(/Type the flag key/).fill(`${FLAG_KEY}-wrong`);
    await expect(apply).toBeDisabled();

    await page.getByLabel(/Type the flag key/).fill(FLAG_KEY);
    await apply.click();

    await expect(
      page.getByRole('button', { name: wasEnabled ? 'Enable flag' : 'Disable flag' }),
    ).toBeVisible();
    await expect(page.getByText('Incident 1421: production verification').first()).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('roles without flag access see no flag data', async ({ page }) => {
    await actAsRole(page, 'compliance');
    await page.goto('/flags');

    await expect(page).toHaveURL('/');
    await expect(page.getByText(FLAG_KEY)).toBeHidden();

    const denied = await requestFromPage(page, '/api/flags?environment=dev');
    expect(denied.status).toBe(403);
    expect(denied.body).not.toContain(FLAG_KEY);
  });
});
