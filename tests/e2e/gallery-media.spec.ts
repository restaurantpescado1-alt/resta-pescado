import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { createPng } from "../helpers/image-fixtures";

/**
 * Gallery media authorization: the `/api/media/gallery/...` branch, which did not
 * exist before this phase — owner-uploaded photographs were rejected by a route
 * that only knew about `menu/`.
 *
 * What is being protected is the `isVisible` promise on a `gallery_images` row.
 * Hiding a photograph on `/admin/galerie` has to take it away from visitors, not
 * just off the grid, and the bucket has no public URL to bypass this route
 * through. So the four cases below are one sentence each: a visible photograph
 * reaches anyone, a hidden one reaches only the owner, and a key with no row
 * behind it reaches nobody.
 *
 * The anonymous half runs in a browser context created here rather than in the
 * `anonymous` project, because nothing exists to fetch until this test uploads
 * it. The context gets the project's `baseURL` and an explicitly empty storage
 * state, which is exactly what that project is.
 */

/** The uploaded-photograph list items, as distinct from the forms inside them. */
function uploadedRows(page: Page) {
  return page.locator('li[data-testid^="uploaded-"]');
}

/** The testid of the row for the photograph just uploaded. */
async function uploadedRowId(page: Page): Promise<string> {
  const row = uploadedRows(page).first();
  await expect(row).toBeVisible();
  const testId = await row.getAttribute("data-testid");
  expect(testId).toMatch(/^uploaded-[0-9a-f-]{36}$/);
  return testId!;
}

/**
 * Removes every uploaded photograph, so the suite starts from the empty state it
 * was seeded with and a run that crashed halfway does not leave one behind.
 *
 * Best effort on purpose: this runs in a `finally`, where throwing would replace
 * the assertion failure that actually explains the run.
 */
async function deleteUploadedPhotographs(page: Page): Promise<void> {
  await page.goto("/admin/galerie");

  for (;;) {
    const rows = uploadedRows(page);
    if ((await rows.count()) === 0) {
      return;
    }

    const testId = await rows.first().getAttribute("data-testid");
    if (!testId) {
      return;
    }

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId(`${testId}-delete`).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
    await expect(uploadedRows(page).first()).toHaveCount(0);
  }
}

test.describe("gallery media authorization", () => {
  test("serves a visible photograph to anyone and a hidden one only to the owner", async ({
    page,
    request,
    browser,
  }) => {
    // An explicit empty storage state: Playwright Test applies the project's
    // `storageState` to contexts created inside a test, so without this the
    // "anonymous" caller below would quietly carry the owner's session cookie
    // and the route's owner bypass would answer for it.
    const anonymous: BrowserContext = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    });

    try {
      await deleteUploadedPhotographs(page);

      await page.goto("/admin/galerie");
      await expect(page.getByTestId("gallery-upload-form")).toBeVisible();

      await page.locator("#gallery-file").setInputFiles({
        name: "salle.png",
        mimeType: "image/png",
        buffer: Buffer.from(createPng({ width: 800, height: 600, colour: [0x22, 0x66, 0x88] })),
      });
      await page.locator("#gallery-alt").fill("La salle du restaurant");
      await page.getByTestId("gallery-upload").click();
      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

      const testId = await uploadedRowId(page);
      const src = await page.getByTestId(testId).locator("img").getAttribute("src");
      expect(src).toMatch(/^\/api\/media\/gallery\/\d{4}\/[0-9a-f-]{36}\.png$/);

      // Visible: the photograph is public content, so anyone gets the bytes.
      const visible = await anonymous.request.get(src!);
      expect(visible.status()).toBe(200);
      expect(visible.headers()["content-type"]).toBe("image/png");
      // And a hide has to be able to happen, so this is not cached for a year.
      expect(visible.headers()["cache-control"]).toBe("public, max-age=0, must-revalidate");

      // The owner's own thumbnail works too, through the same URL.
      expect((await request.get(src!)).status()).toBe(200);

      // Hidden: the bytes stay in the bucket and stay with the owner.
      // Re-read between saves: a save bumps `expectedVersion`, and the row's next save has to
      // send the version the server holds now rather than the one it held on arrival.
      await page.reload();
      await page.locator(`#${testId}-visible`).uncheck();
      await page.getByTestId(`${testId}-save`).click();
      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

      const hidden = await anonymous.request.get(src!);
      expect(hidden.status()).toBe(404);
      expect((await request.get(src!)).status()).toBe(200);

      // Visible again: hiding is reversible and the check is read per request.
      await page.reload();
      await page.locator(`#${testId}-visible`).check();
      await page.getByTestId(`${testId}-save`).click();
      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

      expect((await anonymous.request.get(src!)).status()).toBe(200);

      // A well-formed gallery key that no upload ever produced serves nothing,
      // to an anonymous caller as to the owner.
      const unknownKey = "/api/media/gallery/2026/00000000-0000-4000-8000-000000000000.png";
      expect((await anonymous.request.get(unknownKey)).status()).toBe(404);
      expect((await request.get(unknownKey)).status()).toBe(404);
    } finally {
      try {
        await deleteUploadedPhotographs(page);
      } catch (error) {
        console.error("gallery cleanup failed; a photograph may be left behind", error);
      }
      await anonymous.close();
    }
  });
});
