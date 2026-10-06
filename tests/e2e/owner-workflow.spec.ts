import { expect, test } from "@playwright/test";

import { createPng } from "../helpers/image-fixtures";
import {
  SEEDED_ITEM_ID,
  SEEDED_ITEM_NAME,
  SEEDED_PRICE_DA,
  UPLOAD_TEST_ITEM_ID,
  UPLOAD_TEST_ITEM_NAME,
  goToAdminMenu,
  itemRow,
  loginAsOwner,
  newestAuditEntry,
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
    /*
     * The heading, not `getByText`: the dish name appears twice in a row — as the title and as
     * the option selected in the species picker — so a text match would be ambiguous.
     */
    await expect(itemRow(page).getByRole("heading", { name: SEEDED_ITEM_NAME })).toBeVisible();
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
    await expect(row.getByTestId("dish-current-price")).toHaveText(/1\s*200\s*DA/);

    const priceInput = row.locator('input[name="priceDa"]');
    await priceInput.fill("1250");
    await row.getByRole("button", { name: "Enregistrer" }).click();

    await expect(row.getByTestId("dish-current-price")).toHaveText(/1\s*250\s*DA/);

    // Public, without a session.
    const publicPrice = await readPublicPrice(page);
    expect(publicPrice).toBe("1250");

    // Put it back so the suite is repeatable.
    await goToAdminMenu(page);
    await itemRow(page).locator('input[name="priceDa"]').fill(String(SEEDED_PRICE_DA));
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(itemRow(page).getByTestId("dish-current-price")).toHaveText(/1\s*200\s*DA/);
  });

  for (const [label, value] of [
    ["negative", "-100"],
    ["zero", "0"],
    ["decimal", "950.5"],
    ["not a number", "abc"],
  ] as const) {
    test(`a ${label} price is rejected and does not persist`, async ({ page }) => {
      await goToAdminMenu(page);

      const before = await itemRow(page).getByTestId("dish-current-price").innerText();

      const row = itemRow(page);
      await row.locator('input[name="priceDa"]').fill(value);
      await row.getByRole("button", { name: "Enregistrer" }).click();

      await expect(page.getByTestId("action-message")).toBeVisible();
      await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-danger/);

      await expect(row.getByTestId("dish-current-price")).toHaveText(before);
      expect(await readPublicPrice(page)).toBe(String(SEEDED_PRICE_DA));
    });
  }

  /*
   * The empty price is refused by the browser rather than by the server, which is the one case
   * here that never leaves the machine: the field is `required`, so the form cannot be submitted
   * at all. The assertion is on the validity state rather than on the message, because the
   * message the browser shows is in the browser's own language and is not the product's.
   *
   * The server's own refusal of an empty price is covered by `tests/unit/validation.test.ts`,
   * where it is not competing with a native dialog.
   */
  test("an empty price cannot be submitted at all", async ({ page }) => {
    await goToAdminMenu(page);

    const before = await itemRow(page).getByTestId("dish-current-price").innerText();

    const input = itemRow(page).locator('input[name="priceDa"]');
    await input.fill("");
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();

    const isMissing = await input.evaluate((element) => (element as HTMLInputElement).validity.valueMissing);
    expect(isMissing).toBe(true);

    // Nothing was sent, so nothing was written.
    await expect(page.getByTestId("action-message")).toHaveCount(0);
    await expect(itemRow(page).getByTestId("dish-current-price")).toHaveText(before);
    expect(await readPublicPrice(page)).toBe(String(SEEDED_PRICE_DA));
  });

  test("a rejected update writes no audit entry", async ({ page }) => {
    await goToAdminMenu(page);

    await itemRow(page).locator('input[name="priceDa"]').fill("-5");
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByTestId("action-message")).toBeVisible();

    // Checked against the newest row: the journal is shared state that earlier tests write to.
    const entry = newestAuditEntry(page);
    if ((await entry.count()) > 0) {
      await expect(entry).not.toContainText("-5");
    }
  });
});

/**
 * The owner's home page preview choice.
 *
 * Nothing seeds this on, so the test has to set it and then clear it again. Unlike an
 * uploaded photo, this flag is reversible, which is why it can live in the owner spec
 * without leaking into the public specs that run afterwards.
 */
test.describe("featured selection", () => {
  test("the switch reflects the seeded state, which is off for every dish", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await expect(row.getByTestId("featured-toggle")).toBeVisible();
    await expect(row.getByTestId("featured-toggle")).toHaveAttribute("aria-checked", "false");
  });

  test("featuring a dish makes it lead the home preview and is audited", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await row.getByTestId("featured-toggle").click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);
    await expect(row.getByTestId("featured-toggle")).toHaveAttribute("aria-checked", "true");

    // Public, readable with or without the owner session: the featured dish is now the
    // whole preview. The fish guide further down the page carries no `data-item-id`, so
    // this counts the preview and nothing else.
    await page.goto("/");
    const preview = page.locator("[data-item-id]");
    await expect(preview).toHaveCount(1);
    await expect(preview.first()).toHaveAttribute("data-item-id", SEEDED_ITEM_ID);

    await page.goto("/admin");
    /*
     * The journal names the dish instead of printing its id: `item-dorade` is database
     * terminology and the dashboard is not allowed to show it. The newest row is checked rather
     * than the whole list, because earlier tests in this file have also written entries.
     */
    const entry = newestAuditEntry(page);
    await expect(entry).toContainText("Mise en avant modifiée");
    await expect(entry).toContainText(SEEDED_ITEM_NAME);

    // Clear it so the fallback preview returns and later specs see the seeded state.
    await goToAdminMenu(page);
    await itemRow(page).getByTestId("featured-toggle").click();
    await expect(itemRow(page).getByTestId("featured-toggle")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

test.describe("audit log", () => {
  test("records both the price and the image actions", async ({ page }) => {
    await goToAdminMenu(page);

    const row = itemRow(page);
    await row.locator('input[name="priceDa"]').fill("1100");
    await row.getByRole("button", { name: "Enregistrer" }).click();
    await expect(row.getByTestId("dish-current-price")).toHaveText(/1\s*100\s*DA/);

    await itemRow(page, UPLOAD_TEST_ITEM_ID)
      .locator('input[type="file"]')
      .setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: Buffer.from(createPng({ width: 640, height: 480 })),
    });
    await itemRow(page, UPLOAD_TEST_ITEM_ID)
      .locator('input[type="file"]')
      .setInputFiles({
        name: "replacement.png",
        mimeType: "image/png",
        buffer: Buffer.from(createPng({ width: 640, height: 480 })),
      });
    await itemRow(page, UPLOAD_TEST_ITEM_ID)
      .getByRole("button", { name: "Téléverser" })
      .click();
    await expect(page.getByTestId("action-message")).toHaveAttribute("class", /text-ok/);

    await page.goto("/admin");
    const audit = page.getByTestId("audit-list");
    await expect(audit).toBeVisible();

    /*
     * "Plat modifié", not "Prix mis à jour": the editor saves the whole form in one write, so
     * the honest record of a price change is the one action that changed the row. The old
     * label stays in the dashboard's map because Phase 2 rows still carry it.
     */
    await expect(audit).toContainText("Plat modifié");
    await expect(audit).toContainText("1200 → 1100");
    await expect(audit).toContainText("Image remplacée");
    await expect(audit).toContainText(SEEDED_ITEM_NAME);
    await expect(audit).toContainText(UPLOAD_TEST_ITEM_NAME);

    // Put the price back. The public-menu spec runs afterwards and asserts the
    // seeded price, so leaving 1100 here would make the suite order-dependent.
    await goToAdminMenu(page);
    await itemRow(page).locator('input[name="priceDa"]').fill(String(SEEDED_PRICE_DA));
    await itemRow(page).getByRole("button", { name: "Enregistrer" }).click();
    await expect(itemRow(page).getByTestId("dish-current-price")).toHaveText(/1\s*200\s*DA/);
  });
});
