import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Shared helpers for the end-to-end suite.
 *
 * Credentials come from the environment. `OWNER_PASSWORD` is required and is
 * never written to a file, logged, or committed.
 */

export const SEEDED_CATEGORY_SLUG = "poissons";
export const SEEDED_CATEGORY_NAME = "Nos Poissons";

/**
 * A dish from the owner-approved menu that carries a fish reference illustration.
 *
 * `Dorade` rather than the old placeholder dish: the seeded menu is now the real
 * 34-item card, and this one has both a confirmed price and a generated illustration,
 * which is what the public and admin assertions need.
 */
export const SEEDED_ITEM_ID = "item-dorade";
export const SEEDED_ITEM_NAME = "Dorade";
export const SEEDED_PRICE_DA = 1200;

/**
 * A dish with neither a photograph nor an illustration, used to assert the
 * "no image" path renders honestly rather than inventing a placeholder photo.
 */
export const SEEDED_ITEM_WITHOUT_IMAGE_ID = "item-soda";

/**
 * The dish the upload specs mutate.
 *
 * Every spec here that uploads has to use a dish nothing else makes an assertion about, or
 * the suite becomes order-dependent and a failure looks like a product bug.
 *
 * `item-canette` is a drink with no species, so it is invisible to the fish-guide and
 * menu-card assertions.
 */
export const UPLOAD_TEST_ITEM_ID = "item-canette";

/**
 * Dishes the removal specs mutate.
 *
 * Removal is the one image operation that is reversible, so these specs restore the
 * seeded state themselves. Two are used rather than one because the fallback differs:
 * removing a photograph from a mapped dish must bring its species illustration back, and
 * removing one from an unmapped dish must leave a plain text row. Testing only the first
 * would leave the second path unproven, and it is the one a visitor is likelier to hit.
 */
export const REMOVAL_TEST_ITEM_ID = "item-merlan";
export const REMOVAL_TEST_ITEM_WITHOUT_FISH_ID = "item-jus";

/** The species slug mapped to {@link SEEDED_ITEM_ID}. */
export const SEEDED_FISH_SLUG = "dorade";

/** Phone, hours, and map are owner-confirmed and appear on several pages. */
export const CONFIRMED_PHONE = "0540559967";
export const CONFIRMED_HOURS =
  "Ouvert tous les jours ouvrables de 11h15 à 15h15. Fermé le vendredi.";
export const CONFIRMED_MAP_URL = "https://maps.app.goo.gl/n3cMmMpeXeLDsQtY6";
export const CONFIRMED_FAMILY_NOTE =
  "Restaurant familial. Une chaise haute est disponible pour les enfants.";

/**
 * The mandatory visible label for every AI-generated fish illustration.
 *
 * Deliberately short. It sits on every dish card that carries one, so the full sentence
 * was repeated fifteen times on the menu; `FISH_EXPLANATION` below carries it once per
 * section instead.
 */
export const FISH_LABEL = "Illustration IA";

/**
 * The one-time explanation that the illustrations show a species and not the served dish.
 * Asserted alongside `FISH_LABEL` so shortening the label cannot quietly remove the
 * disclosure it depends on.
 */
export const FISH_EXPLANATION =
  "Les images de poissons sont des illustrations de référence générées par IA. " +
  "Elles représentent le type de poisson, pas le plat servi.";

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
  const row = itemRow(page);
  const text = await row.innerText();
  const match = /(\d[\d\s]*)\s*DA/.exec(text);
  expect(match, `No price found in: ${text}`).not.toBeNull();
  return (match?.[1] ?? "").replace(/\s/g, "");
}
