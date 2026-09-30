/**
 * Where the owner's session cookie is saved for reuse across the suite.
 *
 * Kept in its own module so both `playwright.config.ts` and the setup project can
 * read it without importing anything that touches a Playwright fixture.
 */
export const AUTH_STORAGE_STATE = "playwright/.auth/owner.json";

/** An empty storage state, for tests that must start signed out. */
export const ANONYMOUS_STORAGE_STATE = { cookies: [], origins: [] };
