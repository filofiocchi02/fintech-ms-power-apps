import '@testing-library/jest-dom/vitest';

/**
 * Guard rail, not a convenience: a unit test must never open the developer's demo database.
 * Tests that need persistence call `createTestDb()` from ./helpers/db, which hands back an
 * isolated file per test. This default makes an accidental `getDb()` fail loudly instead of
 * silently mutating ./data/internal-tools.db.
 */
process.env.INTERNAL_TOOLS_DB_PATH ??= './data/__unit-test-should-not-use-this.db';
