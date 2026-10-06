import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { loginAsOwner } from "./helpers";

/**
 * Writes full-page screenshots of every public and owner route for the manual visual review.
 *
 * Deliberately skipped during the normal gate. This test has no assertions and its job
 * is to produce files, so running it on every `npm run test:e2e` would rewrite the
 * committed PNGs on a developer machine and add a minute of runtime for no check.
 *
 * Capture them on purpose, with the variable set inline:
 *
 *   Windows: set CAPTURE_SCREENSHOTS=1 && npm run test:e2e -- tests/e2e/screenshots.spec.ts
 *   POSIX:   CAPTURE_SCREENSHOTS=1 npm run test:e2e -- tests/e2e/screenshots.spec.ts
 *
 * There is no npm script for this because a one-line cross-platform env prefix would
 * mean taking on `cross-env` for a command nobody runs daily.
 *
 * The public routes go to `docs/screenshots/phase-2/`, which is where the Phase 2 review record
 * points, and the owner routes to `docs/screenshots/phase-3/admin/`. The two sets are written
 * by separate tests because the owner set needs a signed-in session and the public set needs
 * the opposite: the login page is captured before signing in, and is gone afterwards.
 *
 * The mechanical half of these reviews lives in `layout.spec.ts` and `responsive-accessibility.spec.ts`;
 * this is the part that needs eyes.
 */

/** Where the Phase 2 review record expects the public routes. */
const PUBLIC_OUTPUT_DIR = "docs/screenshots/phase-2";

/** Where the Phase 3 review record expects the owner routes. */
const ADMIN_OUTPUT_DIR = "docs/screenshots/phase-3/admin";

const ROUTES: Array<[string, string]> = [
  ["home", "/"],
  ["menu", "/menu"],
  ["galerie", "/galerie"],
  ["a-propos", "/a-propos"],
  ["contact", "/contact"],
];

/**
 * The owner routes, in the order the dashboard links them.
 *
 * `/admin/login` is not listed: it redirects the moment there is a session, so it is captured
 * on the way in rather than in this loop.
 */
const ADMIN_ROUTES: Array<[string, string]> = [
  ["dashboard", "/admin"],
  ["menu", "/admin/menu"],
  ["galerie", "/admin/galerie"],
  ["informations", "/admin/informations"],
  ["compte", "/admin/compte"],
];

/**
 * The suite has one desktop project, so both widths are driven here with explicit
 * viewports rather than relying on a mobile project existing.
 */
const VIEWPORTS: Array<[string, { width: number; height: number }]> = [
  ["desktop", { width: 1440, height: 900 }],
  ["phone", { width: 390, height: 844 }],
];

test.describe("screenshots", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("capture every public route at both widths", async ({ page }) => {
    test.skip(
      !process.env.CAPTURE_SCREENSHOTS,
      "set CAPTURE_SCREENSHOTS=1 (npm run screenshots) to write the review PNGs",
    );

    await mkdir(PUBLIC_OUTPUT_DIR, { recursive: true });

    for (const [suffix, viewport] of VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const [name, route] of ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("body")).toBeVisible();
        await page.screenshot({
          path: `${PUBLIC_OUTPUT_DIR}/${name}-${suffix}.png`,
          fullPage: true,
        });
      }
    }
  });

  test("capture every owner route at both widths", async ({ page }) => {
    test.skip(
      !process.env.CAPTURE_SCREENSHOTS,
      "set CAPTURE_SCREENSHOTS=1 (npm run screenshots) to write the review PNGs",
    );

    await mkdir(ADMIN_OUTPUT_DIR, { recursive: true });

    /*
     * The login page first, at both widths, and only then one sign-in for the whole test.
     *
     * Signing in is not undoable from here: once a session exists `/admin/login` redirects to
     * the dashboard, so a per-width sign-in would find no form to fill on the second pass.
     */
    for (const [suffix, viewport] of VIEWPORTS) {
      await page.setViewportSize(viewport);

      await page.goto("/admin/login", { waitUntil: "networkidle" });
      await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
      await page.screenshot({
        path: `${ADMIN_OUTPUT_DIR}/login-${suffix}.png`,
        fullPage: true,
      });
    }

    await loginAsOwner(page);

    for (const [suffix, viewport] of VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const [name, route] of ADMIN_ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("body")).toBeVisible();
        await page.screenshot({
          path: `${ADMIN_OUTPUT_DIR}/${name}-${suffix}.png`,
          fullPage: true,
        });
      }
    }
  });
});