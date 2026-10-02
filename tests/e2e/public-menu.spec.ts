import { expect, test, type Page } from "@playwright/test";

/** One dish row on a public page. */
function itemRow(page: Page, itemId: string) {
  return page.locator(`[data-item-id="${itemId}"]`);
}

import { allApprovedItems } from "../../scripts/approved-menu";

import {
  CONFIRMED_FAMILY_NOTE,
  CONFIRMED_HOURS,
  CONFIRMED_MAP_URL,
  CONFIRMED_PHONE,
  FISH_LABEL,
  readPublicPrice,
  SEEDED_CATEGORY_NAME,
  SEEDED_CATEGORY_SLUG,
  SEEDED_ITEM_ID,
  SEEDED_ITEM_NAME,
  SEEDED_ITEM_WITHOUT_IMAGE_ID,
} from "./helpers";

/**
 * The dish names straight from the seed module, so a renamed dish fails here rather
 * than quietly making this spec disagree with `approved-menu.ts`.
 */
const APPROVED_DISH_NAMES = allApprovedItems().map((item) => item.nameFr);

/**
 * The public read path against the owner-approved menu.
 *
 * Every assertion here is against something the owner actually confirmed. The specs
 * are as much a guard against invented content as they are a functional test: if a
 * future change starts printing a description, a chef's suggestion, or an address
 * nobody confirmed, these fail.
 */

test.describe("public menu", () => {
  test("home page renders and links to the menu", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("home")).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Resta Pescado" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Poissons et fruits de mer, préparés à Alger.",
    );
    await expect(page.getByRole("link", { name: "Voir la carte" })).toBeVisible();
  });

  test("menu page shows the seeded category, dish, and price", async ({ page }) => {
    await page.goto("/menu");

    await expect(page.getByTestId("menu")).toBeVisible();

    const category = page.locator(
      `[data-testid="menu-category"][data-slug="${SEEDED_CATEGORY_SLUG}"]`,
    );
    await expect(category).toBeVisible();
    await expect(category.getByRole("heading", { name: SEEDED_CATEGORY_NAME })).toBeVisible();
    await expect(category.getByText(SEEDED_ITEM_NAME)).toBeVisible();
    // French grouping uses a narrow no-break space, not an ASCII one, so this matches
    // on the digits rather than on an exact separator.
    await expect(itemRow(page, SEEDED_ITEM_ID).getByTestId("dish-price")).toHaveText(/1\s*200\s*DA/);
  });

  test("all five approved categories render in the owner's order", async ({ page }) => {
    await page.goto("/menu");

    const categories = page.getByTestId("menu-category");
    await expect(categories).toHaveCount(5);
    await expect(categories).toHaveText([
      /Nos Entrées/,
      /Soupes/,
      /Nos Poissons/,
      /Desserts/,
      /Boissons/,
    ]);
  });

  test("the whole approved card is served", async ({ page }) => {
    await page.goto("/menu");

    // 34 dishes across the five categories.
    await expect(page.locator("[data-item-id]")).toHaveCount(34);
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

/**
 * No invented content.
 *
 * These are the load-bearing tests of the whole phase.
 */
test.describe("no invented content", () => {
  test("no dish shows a description the owner never wrote", async ({ page }) => {
    await page.goto("/menu");

    const rows = page.locator("[data-item-id]");
    await expect(rows).toHaveCount(34);

    /*
     * A dish row may only ever contain: the confirmed name, a price in dinars, and the
     * two image states. Anything else — an ingredient, a portion, a catch location, an
     * endorsement — is invented content, so each line is matched against what is
     * allowed rather than being spot-checked.
     *
     * The AI label is explicitly permitted, because it is a required disclosure rather
     * than a claim about the food.
     */
    const ALLOWED = new Set<string>([
      ...APPROVED_DISH_NAMES,
      "Sans image",
      FISH_LABEL,
    ]);
    // Prices are grouped with a narrow no-break space, which is awkward to type
    // literally, so they are matched by shape instead.
    const PRICE = /^\d[\d\s]*DA$/u;

    for (const text of await rows.allInnerTexts()) {
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(
          ALLOWED.has(line) || PRICE.test(line),
          `Unexpected text on a dish card: "${line}"`,
        ).toBe(true);
      }
    }
  });

  /**
   * Pins every dish name to the approved card, so a renamed, added, or removed dish
   * fails here rather than slipping onto the public menu unnoticed.
   */
  test("shows exactly the approved dish names", async ({ page }) => {
    await page.goto("/menu");

    const names = await page.locator("[data-item-id] h3").allInnerTexts();
    expect(names.map((name) => name.trim())).toEqual(APPROVED_DISH_NAMES);
  });

  test("no dish is badged as a recommendation", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Suggestion du chef")).toHaveCount(0);
    await expect(page.getByText("Sélection")).toHaveCount(0);
    await expect(page.getByText(/recommand/i)).toHaveCount(0);
  });

test("the home preview is titled neutrally", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("preview-title")).toHaveText("Découvrez notre carte");
  });

  /**
   * Nothing seeds a featured dish, so the preview falls back to the first illustrated
   * fish dishes. The point of this test is the images, not the count: slicing the first
   * six dishes of the menu outright would put salads and soups on the home page, and
   * those have neither a photo nor a species, so they render as blank tiles.
   */
  test("the home preview only shows dishes that have an image", async ({ page }) => {
    await page.goto("/");

    const rows = page.locator("[data-item-id]");
    await expect(rows).not.toHaveCount(0);

    const cards = await rows.all();
    for (const card of cards) {
      await expect(card.locator("img")).toHaveCount(1);
      // A dish with no image renders this instead of an <img>.
      await expect(card.getByText("Sans image")).toHaveCount(0);
    }
  });

  test("no address is printed anywhere, because none was confirmed", async ({ page }) => {
    for (const route of ["/", "/menu", "/a-propos", "/contact", "/galerie"]) {
      await page.goto(route);
      const text = (await page.locator("body").innerText()).toLowerCase();
      // The seed deliberately leaves `address_fr` null, so no street, city or
      // postcode may appear. These are the patterns a guess would match.
      expect(text).not.toMatch(/\b\d{1,4}\s+(rue|avenue|av\.|bd|boulevard|place)\b/);
      expect(text).not.toMatch(/\b\d{5}\b/); // Algerian postal codes
    }
  });
});

/**
 * Fish reference illustrations.
 */
test.describe("fish reference illustrations", () => {
  test("a dish with a species illustration carries the mandatory AI label", async ({ page }) => {
    await page.goto("/menu");

    const row = itemRow(page, SEEDED_ITEM_ID);
    await expect(row.locator("img")).toHaveCount(1);
    await expect(row.getByTestId("fish-reference-label")).toHaveText(FISH_LABEL);
  });

  test("the illustration is served from public/ and is a real WebP", async ({ page, request }) => {
    await page.goto("/menu");

    const src = await itemRow(page, SEEDED_ITEM_ID).locator("img").getAttribute("src");
    expect(src).toMatch(/^\/images\/fish-guide\/dorade\.webp$/);

    const response = await request.get(src!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/webp");
  });

/**
   * Every species illustration carries the mandatory AI disclosure.
   *
   * This counts illustrations by their source path rather than counting rows that
   * happen to hold an `<img>`. The two are not the same once the owner uploads a real
   * photograph: an uploaded photo replaces the illustration on that dish, so the row
   * still has an image but no species reference and correctly no label. Asserting on
   * row-with-img count would make this fail depending on which other spec ran first.
   *
   * The exact number of mapped dishes is pinned in `approved-menu.test.ts` instead, where
   * it is a fact about the data rather than about one render of it.
   */
  test("every illustration on the menu is labelled", async ({ page }) => {
    await page.goto("/menu");

    const illustration = page.locator('img[src*="/images/fish-guide/"]');
    const count = await illustration.count();
    expect(count).toBeGreaterThan(0);

    for (const image of await illustration.all()) {
      // Nearest ancestor row, not `has:` on the src: three sardine dishes share one
      // image file, so matching by src alone would return all three rows at once.
      const row = image.locator("xpath=ancestor::*[@data-item-id][1]");
      await expect(row.getByTestId("fish-reference-label")).toHaveCount(1);
    }

    // A dish carrying a species must never show the "no image" placeholder instead.
    const labelled = page.locator("[data-item-id]", {
      has: page.getByTestId("fish-reference-label"),
    });
    expect(await labelled.count()).toBe(count);
  });

  test("a dish with no species shows the honest no-image state", async ({ page }) => {
    await page.goto("/menu");

    const row = itemRow(page, SEEDED_ITEM_WITHOUT_IMAGE_ID);
    await expect(row.locator("img")).toHaveCount(0);
    await expect(row.getByText("Sans image")).toBeVisible();
  });

  test("the mixed platter is shown without an illustration", async ({ page }) => {
    await page.goto("/menu");

    const plat = page.locator("[data-item-id]", { hasText: "Plat Varié de Poissons" });
    await expect(plat).toHaveCount(1);
    await expect(plat.locator("img")).toHaveCount(0);
  });

  test("the guide lists all 11 species, each labelled", async ({ page }) => {
    await page.goto("/a-propos#guide-poissons");

    await expect(page.getByTestId("about")).toBeVisible();
    await expect(page.getByTestId("guide-ai-label")).toHaveCount(11);
  });

  test("the guide never claims an image shows the cooked dish", async ({ page }) => {
    await page.goto("/a-propos");

    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).toContain("le poisson, pas le plat");
    expect(text).not.toContain("photo du plat");
  });
});

/**
 * Confirmed contact facts.
 */
test.describe("confirmed settings", () => {
  test("the confirmed phone is dialable on the contact page", async ({ page }) => {
    await page.goto("/contact");

    await expect(page.getByTestId("contact-phone")).toHaveText(CONFIRMED_PHONE);
    await expect(page.getByTestId("contact-phone")).toHaveAttribute("href", `tel:${CONFIRMED_PHONE}`);
  });

  test("the confirmed opening hours are shown", async ({ page }) => {
    for (const route of ["/", "/contact"]) {
      await page.goto(route);
      await expect(page.getByText(CONFIRMED_HOURS).first()).toBeVisible();
    }
  });

  test("the confirmed map link opens in a new tab safely", async ({ page }) => {
    await page.goto("/contact");

    const link = page.getByTestId("contact-map");
    await expect(link).toHaveAttribute("href", CONFIRMED_MAP_URL);
    await expect(link).toHaveAttribute("rel", /noopener/);
  });

  test("the family note is the owner's own sentence", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(CONFIRMED_FAMILY_NOTE)).toBeVisible();
  });

  test("delivery is explained without an invented fee, zone, or minimum", async ({ page }) => {
    await page.goto("/contact");

    await expect(page.getByText(/frais de livraison/i)).toBeVisible();
    await expect(page.getByText(/pas de commande minimum/i)).toBeVisible();
    await expect(page.getByText(/mêmes que les heures d'ouverture/i)).toBeVisible();

    const text = (await page.locator("body").innerText()).toLowerCase();
    expect(text).not.toMatch(/\d+\s*da\s*(de|par)?\s*livraison/);
    expect(text).not.toMatch(/\b(alger|oran|constantine|blida)\b/);
  });

  test("table reservation is offered by phone, not online", async ({ page }) => {
    await page.goto("/contact");

    await expect(page.getByRole("heading", { name: "Réserver une table" })).toBeVisible();
    // No booking form exists in this phase, and adding one must not be accidental.
    await expect(page.locator("form")).toHaveCount(0);
  });
});

/**
 * The gallery is empty on purpose and says so.
 */
test.describe("gallery empty state", () => {
  test("the gallery says it has no photographs yet", async ({ page }) => {
    await page.goto("/galerie");

    await expect(page.getByTestId("gallery")).toBeVisible();
    await expect(page.getByTestId("gallery-empty")).toBeVisible();
    await expect(page.getByText("Les photos arrivent bientôt")).toBeVisible();
  });

  test("the empty gallery does not borrow the fish illustrations", async ({ page }) => {
    await page.goto("/galerie");

    // The AI species illustrations are not photographs of the restaurant.
    await expect(page.locator('img[src^="/images/fish-guide/"]')).toHaveCount(0);
  });
});

