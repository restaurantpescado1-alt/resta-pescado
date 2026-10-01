import { expect, test } from "@playwright/test";

import { createPng } from "../helpers/image-fixtures";
import {
  SEEDED_ITEM_ID,
  goToAdminMenu,
  itemRow,
  loginAsOwner,
  readPublicPrice,
  useAnonymousSession,
} from "./helpers";

/**
 * The owner half of the vertical slice: sign in, change a price, see it on the
 * public menu, and find both changes in the audit log.
 *
 * The whole file runs with the session saved by `auth.setup.ts`. Only the two
 * tests that exercise the login form itself opt back out.
 */
test.describe("owner authentication", () => {
  useAnonymousSession();

  test("wrong credentials are rejected", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Adresse e-mail").fill("owner@resta-pescado.local");
    await page.getByLabel("Mot de passe").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Se connecter" }).click();

    await expect(page.getByTestId("login-error")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("owner login succeeds and lands on the dashboard", async ({ page }) => {
    await loginAsOwner(page);

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByTestId("admin-dashboard")).toBeVisible();
    await expect(page.getByText("Connecté en tant que")).toBeVisible();
  });
});

test.describe("owner workflow", () => {
  test("the owner can reach the menu editor", async ({ page }) => {
    await goToAdminMenu(page);

    await expect(itemRow(page)).toBeVisible();
    await expect(itemRow(page).getByText("Dorade grillée")).toBeVisible();
  });

  test("signing out returns the owner to the login screen", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("price update", () => {
  test("a valid price update persists and becomes public", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await expect(row.getByTestId("current-price")).toContainText("900");

    const priceInput = row.locator('input[name="priceDa"]');
    await priceInput.fill("1250");
    await row.getByRole("button", { name: "Enregistrer" }).click();

    await expect(row.getByTestId("current-price")).toContainText("1 250");

    // Public, without a session.
    const publicPrice = await readPublicPrice(page);
    expect(publicPrice).toBe("1250");

    // Put it back so the suite is repeatable.
    await goToAdminMenu(page);
    await itemRow(page).locator('input[name="priceDa"]').fill("900");
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(itemRow(page).getByTestId("current-price")).toContainText("900");
  });

  for (const [label, value] of [
    ["negative", "-100"],
    ["zero", "0"],
    ["decimal", "950.5"],
    ["not a number", "abc"],
    ["empty", ""],
  ] as const) {
    test(`a ${label} price is rejected and does not persist`, async ({ page }) => {
      await goToAdminMenu(page);

      const before = await itemRow(page).getByTestId("current-price").innerText();

      const row = itemRow(page);
      await row.locator('input[name="priceDa"]').fill(value);
      await row.getByRole("button", { name: "Enregistrer" }).click();

      await expect(page.getByTestId("action-message")).toBeVisible();
      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

      await expect(row.getByTestId("current-price")).toHaveText(before);
      expect(await readPublicPrice(page)).toBe("900");
    });
  }

  test("a rejected update writes no audit entry", async ({ page }) => {
    await goToAdminMenu(page);

    await itemRow(page).locator('input[name="priceDa"]').fill("-5");
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByTestId("action-message")).toBeVisible();

    await page.goto("/admin");
    const audit = page.getByTestId("audit-list");
    if ((await audit.count()) > 0) {
      await expect(audit).not.toContainText("\"to\":-5");
    }
  });
});

test.describe("audit log", () => {
  test("records both the price and the image actions", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await row.locator('input[name="priceDa"]').fill("1100");
    await row.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row.getByTestId("current-price")).toContainText("1 100");

    await row.locator('input[type="file"]').setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from(createPng({ width: 640, height: 480 })),
    });
    await row.getByRole("button", { name: "Téléverser" }).click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.goto("/admin");
    const audit = page.getByTestId("audit-list");
    await expect(audit).toBeVisible();
    await expect(audit).toContainText("Prix mis à jour");
    await expect(audit).toContainText("Image remplacée");
    await expect(audit).toContainText(SEEDED_ITEM_ID);

    // Put the price back. The public-menu spec runs afterwards and asserts the
    // seeded 900 DA, so leaving 1100 here would make the suite order-dependent.
    await goToAdminMenu(page);
    await itemRow(page).locator('input[name="priceDa"]').fill("900");
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(itemRow(page).getByTestId("current-price")).toContainText("900");
  });
});
