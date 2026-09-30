import { defineConfig, devices } from "@playwright/test";

import { ANONYMOUS_STORAGE_STATE, AUTH_STORAGE_STATE } from "./tests/e2e/auth-state";
import { readEnvFile } from "./scripts/env";

/**
 * The end-to-end suite runs against the real Worker in workerd, with local D1 and
 * local R2. That is deliberate: it is the only place where the D1 driver, the
 * R2 binding, Better Auth's session cookies, and the server actions are all
 * exercised together, which is exactly the Phase 1 vertical slice.
 *
 * The owner password is read from `.dev.vars` here rather than being passed on
 * every command line, so a plain `npm run test:e2e` works. Nothing is written to
 * disk: `readEnvFile` only populates this process, and values already in the
 * environment win.
 */
readEnvFile();

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8787";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // Signs in once and writes the session cookie to disk. Everything else runs
    // against that saved state, so the suite performs a single sign-in instead of
    // one per test, which Better Auth's per-minute sign-in limit does not allow.
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
    },
    {
      // Access control has to be proven from a genuinely signed-out browser, so
      // this project starts from an empty storage state rather than the saved one.
      // Without `testIgnore` on the authenticated project below, these tests would
      // also run there with a session and would prove nothing.
      name: "anonymous",
      testMatch: /anonymous-access\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], storageState: ANONYMOUS_STORAGE_STATE },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /(auth\.setup|anonymous-access)\.(setup|spec)\.ts$/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STORAGE_STATE,
      },
    },
  ],

  webServer: {
    // `opennextjs-cloudflare preview` runs the built Worker in workerd with local
    // binding simulations, so this is the same runtime as production. The seed is
    // applied first because the suite needs a known owner, dish, and image.
    command: "npm run db:seed:local && npm run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
