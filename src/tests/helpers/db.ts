import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createDb, type AppDatabase } from '@/db/client';
import { runMigrations } from '@/db/migrate';

/**
 * Gives a test its own migrated database in a temp directory.
 *
 * Every suite that touches workflow state or audit uses this. Sharing one database between
 * tests makes ordering matter and lets a negative-path test pass because an earlier test
 * left the row in the state it expected.
 */
export function createTestDb(): { db: AppDatabase; dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'internal-tools-test-'));
  const dbPath = join(dir, 'test.db');

  runMigrations(dbPath);
  const db = createDb(dbPath);

  return {
    db,
    dbPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
