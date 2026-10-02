/**
 * The owner-approved Phase 2 menu.
 *
 * Every name and price in this file was supplied and confirmed by the owner. They
 * are transcribed verbatim, including the typographic apostrophes (U+2019), because
 * a menu is the product and silently "fixing" its punctuation is not a call this
 * codebase gets to make.
 *
 * Two rules govern what is *not* here, both from `docs/CONTENT_POLICY.md`:
 *
 * 1. **No descriptions.** `descriptionFr` is `null` for every item. The owner
 *    supplied names and prices only. Inventing a description would mean inventing
 *    ingredients, portions, or preparation, which the policy forbids and which no
 *    one has confirmed. The schema makes `description_fr` nullable for this.
 * 2. **No invented imagery.** No cooked-dish photograph is seeded. The only images
 *    referenced are AI-generated fish *reference illustrations*, attached by
 *    species and always labelled as such.
 *
 * Prices are integer Algerian dinars. `menu_items` enforces `price_da > 0` and
 * stores integers, never floats.
 *
 * This module is the single source of truth for the seed and is imported by the unit
 * suite, so a transcription slip fails a test rather than reaching the website.
 */

export interface ApprovedCategory {
  /** Stable id, safe to use as a URL slug fragment. */
  id: string;
  nameFr: string;
  slug: string;
}

export interface ApprovedItem {
  /** Deterministic id derived from the confirmed name. */
  id: string;
  nameFr: string;
  priceDa: number;
  /**
   * Key into `src/lib/fish-images.ts`, set only where the owner confirmed the dish
   * is that fish. Never set for a mixed or unnamed-fish dish.
   */
  fishReferenceSlug?: string;
}

/**
 * Categories in the owner's order. Order is manual, never alphabetical, which is why
 * `sort_order` starts at 1 and increments.
 */
export const APPROVED_CATEGORIES: readonly ApprovedCategory[] = [
  { id: "cat-nos-entrees", nameFr: "Nos Entrées", slug: "entrees" },
  { id: "cat-soupes", nameFr: "Soupes", slug: "soupes" },
  { id: "cat-nos-poissons", nameFr: "Nos Poissons", slug: "poissons" },
  { id: "cat-desserts", nameFr: "Desserts", slug: "desserts" },
  { id: "cat-boissons", nameFr: "Boissons", slug: "boissons" },
];

export const APPROVED_MENU: readonly {
  categoryId: string;
  items: readonly ApprovedItem[];
}[] = [
  {
    categoryId: "cat-nos-entrees",
    items: [
      { id: "item-salade-aubergines", nameFr: "Salade d’Aubergines", priceDa: 250 },
      { id: "item-salade-tomate", nameFr: "Salade de Tomate", priceDa: 250 },
      { id: "item-salade-poulpe", nameFr: "Salade de Poulpe", priceDa: 600 },
      { id: "item-salade-pomme-de-terre", nameFr: "Salade de Pomme de Terre", priceDa: 300 },
      { id: "item-hmis", nameFr: "Hmis", priceDa: 300 },
      { id: "item-salade-variee", nameFr: "Salade Variée", priceDa: 150 },
    ],
  },
  {
    categoryId: "cat-soupes",
    items: [
      { id: "item-soupe-de-poissons", nameFr: "Soupe de Poissons", priceDa: 300 },
      { id: "item-soupe-turque", nameFr: "Soupe Turque", priceDa: 250 },
    ],
  },
  {
    categoryId: "cat-nos-poissons",
    items: [
      {
        id: "item-sardines-friture",
        nameFr: "Sardines Friture",
        priceDa: 500,
        fishReferenceSlug: "sardine",
      },
      {
        id: "item-sardines-fritures-garnies",
        nameFr: "Sardines Fritures Garnies",
        priceDa: 600,
        fishReferenceSlug: "sardine",
      },
      {
        id: "item-chtitha-sardines",
        nameFr: "Chtitha Sardines",
        priceDa: 600,
        fishReferenceSlug: "sardine",
      },
      {
        id: "item-sepia-en-sauce",
        nameFr: "Sepia en Sauce",
        priceDa: 1500,
        fishReferenceSlug: "sepia",
      },
      {
        id: "item-thon-grille",
        nameFr: "Thon Grillé",
        priceDa: 1400,
        fishReferenceSlug: "thon",
      },
      {
        id: "item-rouget",
        nameFr: "Rouget",
        priceDa: 1200,
        fishReferenceSlug: "rouget",
      },
      {
        id: "item-merlan",
        nameFr: "Merlan",
        priceDa: 1200,
        fishReferenceSlug: "merlan",
      },
      {
        id: "item-espadon",
        nameFr: "Espadon",
        priceDa: 1500,
        fishReferenceSlug: "espadon",
      },
      {
        id: "item-espadon-en-sauce",
        nameFr: "Espadon en Sauce",
        priceDa: 1500,
        fishReferenceSlug: "espadon",
      },
      {
        id: "item-chien-de-mer",
        nameFr: "Chien de Mer",
        priceDa: 1500,
        fishReferenceSlug: "chien-de-mer",
      },
      {
        id: "item-calamar",
        nameFr: "Calamar",
        priceDa: 1500,
        fishReferenceSlug: "calamar",
      },
      {
        id: "item-dorade",
        nameFr: "Dorade",
        priceDa: 1200,
        fishReferenceSlug: "dorade",
      },
      {
        id: "item-loup-de-mer",
        nameFr: "Loup de Mer",
        priceDa: 1400,
        fishReferenceSlug: "loup-de-mer",
      },
      {
        id: "item-crevettes-en-sauce",
        nameFr: "Crevettes en Sauce",
        priceDa: 1200,
        fishReferenceSlug: "crevette",
      },
      {
        id: "item-crevettes-grillees",
        nameFr: "Crevettes Grillées",
        priceDa: 1500,
        fishReferenceSlug: "crevette",
      },
      // `Plat Varié de Poissons` is deliberately left without an illustration. The
      // owner excluded it, and attaching one fish would misstate what the dish is.
      { id: "item-plat-varie-de-poissons", nameFr: "Plat Varié de Poissons", priceDa: 2000 },
    ],
  },
  {
    categoryId: "cat-desserts",
    items: [
      { id: "item-flan-caramel", nameFr: "Flan Caramel", priceDa: 100 },
      { id: "item-flan-cafe", nameFr: "Flan Café", priceDa: 100 },
      { id: "item-salade-de-fruits", nameFr: "Salade de Fruits", priceDa: 200 },
    ],
  },
  {
    categoryId: "cat-boissons",
    items: [
      { id: "item-soda", nameFr: "Soda", priceDa: 50 },
      { id: "item-jus", nameFr: "Jus", priceDa: 50 },
      { id: "item-eau-minerale-pm", nameFr: "Eau Minérale PM", priceDa: 50 },
      { id: "item-canette", nameFr: "Canette", priceDa: 100 },
      { id: "item-jus-de-citron", nameFr: "Jus de Citron", priceDa: 600 },
      { id: "item-jus-d-orange", nameFr: "Jus d’Orange", priceDa: 600 },
      { id: "item-cocktail-de-fruits", nameFr: "Cocktail de Fruits", priceDa: 800 },
    ],
  },
];

/**
 * Owner-selected featured dishes.
 *
 * **Empty, deliberately, and it stays empty until the owner picks the dishes.**
 *
 * `is_featured` exists so the owner can promote dishes on the home page from the
 * dashboard. Seeding a default would have been claiming the restaurant endorses
 * those dishes, which nobody confirmed: not Dorade, not Espadon, not Loup de Mer,
 * not Thon Grillé.
 *
 * Consequently no badge is rendered on any card. Both "Suggestion du chef" and
 * "Sélection" are endorsements, and neither has been confirmed, so neither appears.
 * The home page instead shows a neutral preview, "Découvrez notre carte", built from
 * the first visible items in manual sort order, with no badge at all.
 *
 * When the owner does choose dishes, they go here or straight into the database via
 * the dashboard; the home page then switches to rendering the confirmed selection.
 */
export const FEATURED_ITEM_IDS: readonly string[] = [];

/**
 * Number of dishes the neutral home page preview shows.
 *
 * A small fixed number rather than a fraction of the menu, so the preview stays a
 * teaser at 34 items and at 3. Fish dishes are preferred because they carry a
 * reference illustration, which is what makes the preview worth looking at.
 */
export const HOME_PREVIEW_LIMIT = 6;

/** Flat list of every approved item, in display order. */
export function allApprovedItems(): ApprovedItem[] {
  return APPROVED_MENU.flatMap((group) => [...group.items]);
}

/** Looks up one approved item by id. */
export function findApprovedItem(id: string): ApprovedItem | undefined {
  return allApprovedItems().find((item) => item.id === id);
}