import { rmSync } from 'node:fs';

import { closeDb, createDb, resolveDbPath } from './client';
import { runMigrations } from './migrate';
import { seedDatabase, SEED_KYC_CASES } from './seed';

/**
 * Drops the demo database and rebuilds it from migrations plus the seed.
 *
 * The mock connectors keep their state in memory, so a restarted server forgets every refund
 * the payments system executed while app-owned cases and audit survive on disk. Demoing from
 * that split state is misleading: a case reads EXECUTED next to a payment that reports the
 * money never left. Resetting both halves together keeps a restart a genuine clean slate.
 *
 * Development only. Production runs migrations against a real database and never deletes it.
 */
export function resetDatabase(dbPath: string = resolveDbPath()): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database in production');
  }

  // WAL leaves sidecar files; keeping them would resurrect the rows we just dropped.
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

const isDirectRun = process.argv[1]?.includes('reset');

if (isDirectRun) {
  const target = resolveDbPath();
  resetDatabase(target);
  console.log(`Reset ${target} and reseeded ${SEED_KYC_CASES.length} KYC workflow rows`);
}
