import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Minimal browser-verification setup. Kept deliberately small: it exists so an agent can
 * drive the real UI, check console errors, and take screenshots at desktop and mobile
 * widths, not to become a second full test framework.
 *
 * E2E runs against its own database (never ./data/internal-tools.db) so a browser run cannot
 * corrupt demo state and a demo cannot make an e2e assertion pass.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      INTERNAL_TOOLS_DB_PATH: './data/e2e.db',
    },
  },
});
