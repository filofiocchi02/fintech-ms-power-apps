import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement the native <dialog> APIs, but several shared UI primitives use
 * them. Provide minimal, event-emitting stubs so component tests can exercise open/close
 * behaviour without browser integration.
 */
if (typeof window !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    this.open = false;
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    this.dispatchEvent(new Event('close', { bubbles: false }));
  };
}

/**
 * Guard rail, not a convenience: a unit test must never open the developer's demo database.
 * Tests that need persistence call `createTestDb()` from ./helpers/db, which hands back an
 * isolated file per test. This default makes an accidental `getDb()` fail loudly instead of
 * silently mutating ./data/internal-tools.db.
 */
process.env.INTERNAL_TOOLS_DB_PATH ??= './data/__unit-test-should-not-use-this.db';
