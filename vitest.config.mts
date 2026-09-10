import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` alias from tsconfig.json natively (no vite-tsconfig-paths needed).
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Playwright owns e2e/. Running it under Vitest would launch browsers in the unit run.
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
