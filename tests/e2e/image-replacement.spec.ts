import { expect, test } from "@playwright/test";

import { createJpeg, createPng, createWebp } from "../helpers/image-fixtures";
import { goToAdminMenu, itemRow } from "./helpers";

/**
 * Image replacement. The three rejection cases are the ones the spec calls out
 * (wrong type, bad signature, oversized) plus the successful replacement, and
 * each rejection asserts the stored key did not change.
 *
 * These run with the shared owner session from `auth.setup.ts`.
 */
test.describe("image replacement", () => {
  test("a valid replacement succeeds and serves through /api/media", async ({ page, request }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    const before = await row.locator("img").getAttribute("src");

    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.png",
      mimeType: "image/png",
      buffer: Buffer.from(createPng({ width: 800, height: 600, colour: [0x22, 0x66, 0x88] })),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.reload();
    const after = await itemRow(page).locator("img").getAttribute("src");
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

    const row = itemRow(page);
    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from(createJpeg({ width: 720, height: 540 })),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
  });

  test("a valid WebP replacement succeeds", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await row.locator('input[type="file"]').setInputFiles({
      name: "plat.webp",
      mimeType: "image/webp",
      buffer: Buffer.from(createWebp({ width: 640, height: 640 })),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();

    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
  });

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

      const row = itemRow(page);
      const before = await row.locator("img").getAttribute("src");

      await row.locator('input[type="file"]').setInputFiles(file);
      await row.getByRole("button", { name: "Téléverser" }).click();

      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

      await page.reload();
      expect(await itemRow(page).locator("img").getAttribute("src")).toBe(before);
    });
  }

  test("a rejected upload writes no audit entry", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
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
