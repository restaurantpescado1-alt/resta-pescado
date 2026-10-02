import { expect, test, type Locator, type Page } from "@playwright/test";

import { createPng, createTruncatedJpeg, createTruncatedWebp, encodeImage } from "../helpers/image-fixtures";
import { goToAdminMenu, itemRow, UPLOAD_TEST_ITEM_ID } from "./helpers";

/**
 * Image replacement. The three rejection cases are the ones the spec calls out
 * (wrong type, bad signature, oversized) plus the successful replacement, and
 * each rejection asserts the stored key did not change.
 *
 * These run with the shared owner session from `auth.setup.ts`.
 *
 * Two things make these specs safe to run alongside the public ones:
 *
 * - No seeded dish carries a photograph to begin with, so `before` is normally null
 *   and the first upload onto a dish with no image is covered too. That is the state
 *   every dish is really in.
 * - Every spec here targets `UPLOAD_TEST_ITEM_ID`, a dish no other spec makes an
 *   assertion about, because an upload cannot be undone and would otherwise leak into
 *   later specs.
 */

/** One dish row in the editor. */
function editorRow(page: Page) {
  return itemRow(page, UPLOAD_TEST_ITEM_ID);
}

/** The `<img>` src in an editor row, or null when the dish has no photo yet. */
async function currentImageSrc(row: Locator): Promise<string | null> {
  const image = row.locator("img");
  if ((await image.count()) === 0) {
    return null;
  }
  return image.first().getAttribute("src");
}

test.describe("image replacement", () => {
  test("a valid replacement succeeds and serves through /api/media", async ({ page, request }) => {
    await goToAdminMenu(page);

    const row = editorRow(page);
    const before = await currentImageSrc(row);

    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.png",
      mimeType: "image/png",
      buffer: Buffer.from(createPng({ width: 800, height: 600, colour: [0x22, 0x66, 0x88] })),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.reload();
    const after = await currentImageSrc(editorRow(page));
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);

    // The private bucket is readable only through the Worker route.
    const media = await request.get(after!);
    expect(media.status()).toBe(200);
    expect(media.headers()["content-type"]).toBe("image/png");

    // And the previous object was removed once D1 pointed at the new one.
    if (before) {
      const stale = await request.get(before);
      expect(stale.status()).toBe(404);
    }
  });

  test("a valid JPEG replacement succeeds", async ({ page }) => {
    await goToAdminMenu(page);

    const row = editorRow(page);
    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.jpg",
      mimeType: "image/jpeg",
      buffer: await encodeImage("jpeg", { width: 720, height: 540 }),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
  });

  test("a valid WebP replacement succeeds", async ({ page }) => {
    await goToAdminMenu(page);

    const row = editorRow(page);
    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.webp",
      mimeType: "image/webp",
      buffer: await encodeImage("webp", { width: 640, height: 640 }),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
  });

  /*
   * A file that stops after its header passes signature sniffing and dimension parsing,
   * so every check that reads the front of the file accepts it.
   *
   * Accepting one is not a cosmetic problem: there is no control for removing a dish
   * photo, so a truncated upload could not be undone from the dashboard and would show a
   * broken image on the live menu until someone edited the database directly.
   */
  for (const [label, file] of [
    [
      "JPEG truncated after its header",
      { name: "truncated.jpg", mimeType: "image/jpeg", bytes: createTruncatedJpeg({ width: 720, height: 540 }) },
    ],
    [
      "WebP truncated after its header",
      { name: "truncated.webp", mimeType: "image/webp", bytes: createTruncatedWebp({ width: 640, height: 640 }) },
    ],
  ] as const) {
    test(`${label} is rejected`, async ({ page }) => {
      await goToAdminMenu(page);

      const row = editorRow(page);
      const before = await currentImageSrc(row);

      await row.locator('input[type="file"]').setInputFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: Buffer.from(file.bytes),
      });
      await row.getByRole("button", { name: "Téléverser" }).click();

      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

      // And, critically, the stored key did not move.
      await page.reload();
      expect(await currentImageSrc(editorRow(page))).toBe(before);
    });
  }

  for (const [label, file] of [
    [
      "disallowed type",
      { name: "animation.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") },
    ],
    [
      "content that does not match the declared type",
      {
        name: "pretend.png",
        mimeType: "image/png",
        buffer: Buffer.from("<!doctype html><script>alert(1)</script>"),
      },
    ],
    [
      "oversized file",
      {
        name: "huge.png",
        mimeType: "image/png",
        buffer: Buffer.alloc(2 * 1024 * 1024 + 1024, 0x41),
      },
    ],
    [
      "dimensions below the minimum",
      {
        name: "tiny.png",
        mimeType: "image/png",
        buffer: Buffer.from(createPng({ width: 20, height: 20 })),
      },
    ],
  ] as const) {
    test(`an upload with a ${label} is rejected`, async ({ page }) => {
      await goToAdminMenu(page);

      const row = editorRow(page);
      const before = await currentImageSrc(row);

      await row.locator('input[type="file"]').setInputFiles(file);
      await row.getByRole("button", { name: "Téléverser" }).click();

      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

      await page.reload();
      expect(await currentImageSrc(editorRow(page))).toBe(before);
    });
  }

  test("a rejected upload writes no audit entry", async ({ page }) => {
    await goToAdminMenu(page);

    const row = editorRow(page);
    await row.locator('input[type="file"]').setInputFiles({
      name: "animation.gif",
      mimeType: "image/gif",
      buffer: Buffer.from("GIF89a"),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

    await page.goto("/admin");
    const audit = page.getByTestId("audit-list");
    if ((await audit.count()) > 0) {
      await expect(audit).not.toContainText("image/gif");
    }
  });
});

test.describe("media route", () => {
  test("rejects a key outside the menu namespace", async ({ request }) => {
    const response = await request.get("/api/media/gallery/2026/some-key.png");
    expect(response.status()).toBe(404);
  });

  test("rejects a missing key", async ({ request }) => {
    const response = await request.get("/api/media/");
    expect(response.status()).toBe(404);
  });
});
