import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { schema } from './schema';

/**
 * Server-only SQLite connection for app-owned workflow state and internal-tool audit.
 *
 * The prototype uses Drizzle + SQLite so the whole thing runs from one checkout. Production
 * swaps this module for PostgreSQL / Azure SQL and the company's durable audit platform;
 * nothing outside src/db and the repository implementations should know which it is.
 */

/** Default demo database. Overridable so tests never touch the developer's demo data. */
export const DEFAULT_DB_PATH = './data/internal-tools.db';

export function resolveDbPath(): string {
  return resolve(process.env.INTERNAL_TOOLS_DB_PATH ?? DEFAULT_DB_PATH);
}

export type AppDatabase = ReturnType<typeof createDb>;

/**
 * Opens a connection and applies the pragmas we want everywhere. Callers that need a
 * throwaway database (tests) should pass an explicit path or ':memory:'.
 */
export function createDb(dbPath: string = resolveDbPath()) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  // WAL survives restart and tolerates concurrent readers; FK enforcement is off by default.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

/**
 * Closes the underlying SQLite handle.
 *
 * Drizzle does not own the connection lifecycle, so a caller that opened a short-lived
 * database (migrations, a seed run, a test) must close it. Leaving it open leaks a file
 * descriptor per connection and, because WAL is enabled, leaves `-wal`/`-shm` sidecar files
 * uncheckpointed on disk.
 */
export function closeDb(db: AppDatabase): void {
  db.$client.close();
}

let cached: AppDatabase | undefined;

/**
 * Process-wide handle for the running app. Cached because `next dev` re-evaluates modules
 * and reopening the file per request leaks handles.
 */
export function getDb(): AppDatabase {
  cached ??= createDb();
  return cached;
}
