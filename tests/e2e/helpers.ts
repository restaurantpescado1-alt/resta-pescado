import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Shared helpers for the end-to-end suite.
 *
 * Credentials come from the environment. `OWNER_PASSWORD` is required and is
 * never written to a file, logged, or committed.
 */

export const SEEDED_CATEGORY_SLUG = "poissons";
export const SEEDED_ITEM_ID = "dev-item-dorade";
export const SEEDED_PRICE_DA = 900;

export function ownerEmail(): string {
  return process.env.OWNER_EMAIL ?? "owner@resta-pescado.local";
}

export function ownerPassword(): string {
  const value = process.env.OWNER_PASSWORD;
  if (!value) {
    throw new Error(
      "OWNER_PASSWORD is not set. Copy .env.example to .dev.vars, fill it in, then run npm run db:seed:local.",
    );
  }
  return value;
}

export async function loginAsOwner(page: Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Adresse e-mail").fill(ownerEmail());
  await page.getByLabel("Mot de passe").fill(ownerPassword());
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("admin-dashboard")).toBeVisible();
}

/**
 * Forgets the saved owner session for a single test.
 *
 * Most specs run with the shared session from `auth.setup.ts`; the few that
 * exercise the login form itself need to start signed out.
 */
export function useAnonymousSession(): void {
  test.use({ storageState: { cookies: [], origins: [] } });
}

export async function goToAdminMenu(page: Page): Promise<void> {
  await page.goto("/admin/menu");
  await expect(page.getByTestId("menu-editor")).toBeVisible();
}

export function itemRow(page: Page, itemId: string = SEEDED_ITEM_ID): Locator {
  return page.locator(`[data-item-id="${itemId}"]`);
}

/** Reads the price currently shown on the public menu for the seeded dish. */
export async function readPublicPrice(page: Page): Promise<string> {
  await page.goto("/menu");
  const row = page.locator(`[data-item-id="${SEEDED_ITEM_ID}"], li`).filter({ hasText: "Dorade" }).first();
  const text = await row.innerText();
  const match = /(\d[\d\s]*)\s*DA/.exec(text);
  expect(match, `No price found in: ${text}`).not.toBeNull();
  return (match?.[1] ?? "").replace(/\s/g, "");
}
