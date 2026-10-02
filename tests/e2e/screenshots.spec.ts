import { mkdir } from "node:fs/promises";

import { expect, test } from "@playwright/test";

/**
 * Writes full-page screenshots of every public route for the manual visual review.
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
 * Output lands in `docs/screenshots/phase-2/`, which is where the Phase 2 review record
 * points. The mechanical half of that review lives in `layout.spec.ts`; this is the part
 * that needs eyes.
 */

const OUTPUT_DIR = "docs/screenshots/phase-2";

const ROUTES: Array<[string, string]> = [
  ["home", "/"],
  ["menu", "/menu"],
  ["galerie", "/galerie"],
  ["a-propos", "/a-propos"],
  ["contact", "/contact"],
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

    await mkdir(OUTPUT_DIR, { recursive: true });

    for (const [suffix, viewport] of VIEWPORTS) {
      await page.setViewportSize(viewport);

      for (const [name, route] of ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("body")).toBeVisible();
        await page.screenshot({
          path: `${OUTPUT_DIR}/${name}-${suffix}.png`,
          fullPage: true,
        });
      }
    }
  });
});