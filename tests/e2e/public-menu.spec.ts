import { expect, test } from "@playwright/test";

import { SEEDED_CATEGORY_SLUG, readPublicPrice } from "./helpers";

/**
 * Public read path. A visitor with no session sees the seeded category, the
 * seeded dish, and its price.
 */
test.describe("public menu", () => {
  test("home page renders and links to the menu", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("home")).toBeVisible();
    // The restaurant name lives in the header; the h1 is the owner-editable hero
    // title the seed writes into `site_settings`.
    await expect(page.getByRole("banner").getByRole("link", { name: "Resta Pescado" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Poissons et fruits de mer, préparés à Alger.",
    );
    await expect(page.getByRole("link", { name: "Voir la carte" })).toBeVisible();
  });

  test("menu page shows the seeded category, dish, and price", async ({ page }) => {
    await page.goto("/menu");

    await expect(page.getByTestId("menu")).toBeVisible();

    const category = page.locator(`[data-testid="menu-category"][data-slug="${SEEDED_CATEGORY_SLUG}"]`);
    await expect(category).toBeVisible();
    await expect(category.getByRole("heading", { name: "Poissons" })).toBeVisible();

    await expect(category.getByText("Dorade grillée")).toBeVisible();
    await expect(category.getByText("900").first()).toBeVisible();
  });

  test("public price is readable as a number", async ({ page }) => {
    const price = await readPublicPrice(page);
    expect(Number(price)).toBeGreaterThan(0);
  });

  test("public pages do not expose the admin surface", async ({ page }) => {
    await page.goto("/menu");
    await expect(page.getByTestId("menu-editor")).toHaveCount(0);
  });
});
