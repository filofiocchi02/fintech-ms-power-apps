import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { closeDb, createDb, resolveDbPath } from './client';

/**
 * Applies every checked-in migration in ./drizzle to the target database.
 *
 * Safe to run repeatedly: Drizzle records applied migrations and skips them. Point it at a
 * scratch database with INTERNAL_TOOLS_DB_PATH.
 *
 * Opens and closes its own connection. Callers that also need to query should open their own
 * afterwards rather than reusing this one.
 */
export function runMigrations(dbPath: string = resolveDbPath()): void {
  const db = createDb(dbPath);
  try {
    migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    closeDb(db);
  }
}

const isDirectRun = process.argv[1]?.includes('migrate');

if (isDirectRun) {
  const target = resolveDbPath();
  runMigrations(target);
  console.log(`Migrations applied to ${target}`);
}
