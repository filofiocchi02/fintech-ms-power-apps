import { rmSync } from 'node:fs';

import { closeDb, createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { seedDatabase } from '../src/db/seed';

/**
 * Rebuilds the isolated e2e database before every suite run.
 *
 * Workflow rows and audit events persist in SQLite, so without this a second `npm run
 * test:e2e` replays against yesterday's cases and assertions like "no cases yet" fail on
 * stale data. The web server command runs after this, so the file is rebuilt before the
 * server opens it. Nothing here touches the developer demo database.
 */
export default function globalSetup() {
  // The restart-persistence test verifies state written by a previous run; wiping the
  // database here would destroy exactly what it exists to read.
  if (process.env.REFUNDS_RESTART_STATE) return;

  const dbPath = './data/e2e.db';
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  runMigrations(dbPath);
  const db = createDb(dbPath);
  try {
    seedDatabase(db);
  } finally {
    closeDb(db);
  }
}
