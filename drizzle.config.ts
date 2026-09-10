import { defineConfig } from 'drizzle-kit';

import { DEFAULT_DB_PATH } from './src/db/client';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.INTERNAL_TOOLS_DB_PATH ?? DEFAULT_DB_PATH,
  },
  strict: true,
  verbose: true,
});
