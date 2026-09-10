// No-op shim for `server-only` in unit tests. The real package still blocks client imports
// during the Next.js build; this just lets Vitest run connector modules in Node.
