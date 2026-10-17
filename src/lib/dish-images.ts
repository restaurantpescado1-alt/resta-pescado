/**
 * Bundled menu photo manifest.
 *
 * Every file in `public/images/menu/` is an **AI-generated illustrative picture of a
 * dish or a drink**, delivered by the owner to give every row of the menu a consistent
 * image. None of them is a photograph of what the restaurant actually serves, so
 * `docs/CONTENT_POLICY.md` ranks them fifth — above no image, below a real photograph —
 * and every surface has to carry `MENU_PHOTO_EXPLANATION_FR` alongside them.
 *
 * ## Where these sit in the image order
 *
 * A dish row resolves its image through three tiers, highest first:
 *
 * 1. `menu_items.image_key` — an **owner upload** from the dashboard, served through
 *    `/api/media`. Always wins, because a photograph the owner chose beats any
 *    generated picture. Clearing the upload falls back down this list.
 * 2. The bundled photo declared here, keyed by the stable item id.
 * 3. `menu_items.fish_reference_slug` — the bundled fish *species* illustration, which
 *    answers "which fish" and can never stand in for a plate. It is now the last resort
 *    on a menu row because a cooked-dish picture says more than a species drawing.
 *
 * Tier 2 is deliberately **not** stored in the database. It is a static fallback in
 * `public/`, exactly like the category covers and the gallery photographs, so the
 * owner can still override any single dish from the dashboard without a deployment,
 * and removing a bundled photo needs no migration and no reseed.
 *
 * The fish guide keeps its own illustrations and its own sentence on the pages that
 * teach species (`/` and `/a-propos`); nothing here replaces them there.
 */

/**
 * The one concise sentence, shown once per page that displays bundled menu photos.
 *
 * Repeating a badge under every dish would bury the menu in boilerplate. The wording
 * is deliberately blunt about what the pictures are: generated, illustrative, and not
 * a promise about the plate.
 */
export const MENU_PHOTO_EXPLANATION_FR =
  "Photos illustratives générées par IA. Présentation et portions variables.";

/**
 * Phrase used inside alt text, where there is no room for the section-level sentence
 * and the reader needs to be told what kind of image this is rather than what it
 * shows. Kept even though the visible sentence is once per page: it is the one
 * assurance a screen-reader user gets that this is a generated picture.
 */
const MENU_PHOTO_ALT_KIND_FR = "photo illustrative générée par IA";

/** Derivative geometry produced by `scripts/process-menu-photos.ts`. */
const MENU_PHOTO_WIDTH = 720;
const MENU_PHOTO_HEIGHT = 540;

export interface DishPhoto {
  /** Stable id from `scripts/approved-menu.ts` (`menu_items.id`). */
  readonly itemId: string;
  /** Public path under `/`, served straight from `public/`. */
  readonly src: string;
  /** Intrinsic size of the derived file, so the row does not shift on load. */
  readonly width: number;
  readonly height: number;
  /**
   * Alt text. Names the dish and says what kind of image this is, because a visitor
   * using a screen reader has no other way to learn the picture was generated.
   *
   * Deliberately does not describe ingredients, portions, brands, or presentation:
   * nothing about the contents of these pictures has been confirmed by the restaurant.
   */
  readonly altFr: string;
}

/**
 * The stable id minus its `item-` prefix, which is also the derivative filename.
 *
 * Lives here rather than only in the build script so the two cannot drift: the unit
 * suite imports this module and checks it against the files actually on disk.
 */
export function dishSlugFromItemId(itemId: string): string {
  return itemId.replace(/^item-/u, "");
}

function photo(itemId: string, nameFr: string): DishPhoto {
  return {
    itemId,
    src: `/images/menu/${dishSlugFromItemId(itemId)}.webp`,
    width: MENU_PHOTO_WIDTH,
    height: MENU_PHOTO_HEIGHT,
    altFr: `${nameFr} — ${MENU_PHOTO_ALT_KIND_FR}.`,
  };
}

/**
 * One photo per approved dish, keyed by the canonical menu id.
 *
 * Every one of the 37 approved items appears exactly once. Two entries were chosen
 * deliberately rather than by taking the newest file: `item-canette` uses
 * `canette-v2` instead of the superseded generic silver can, and
 * `item-crevettes-en-sauce` uses `crevettes-en-sauce-v2`. See `docs/MENU_PHOTOS.md`
 * for the full source-to-derivative mapping and the one duplicate that needs the
 * owner's attention.
 */
export const BUNDLED_DISH_PHOTOS: Readonly<Record<string, DishPhoto>> = {
  // Nos Entrées
  "item-salade-aubergines": photo("item-salade-aubergines", "Salade d’Aubergines"),
  "item-salade-tomate": photo("item-salade-tomate", "Salade de Tomate"),
  "item-salade-poulpe": photo("item-salade-poulpe", "Salade de Poulpe"),
  "item-salade-pomme-de-terre": photo("item-salade-pomme-de-terre", "Salade de Pomme de Terre"),
  "item-hmis": photo("item-hmis", "Hmis"),
  "item-salade-variee": photo("item-salade-variee", "Salade Variée"),
  "item-frites": photo("item-frites", "Frites"),
  "item-bourek-crevettes": photo("item-bourek-crevettes", "Bourek Crevettes"),
  "item-bourek-thon": photo("item-bourek-thon", "Bourek Thon"),
  // Nos Soupes
  "item-soupe-de-poissons": photo("item-soupe-de-poissons", "Soupe de Poissons"),
  "item-soupe-turque": photo("item-soupe-turque", "Soupe Turque"),
  // Nos Poissons
  "item-sardines-friture": photo("item-sardines-friture", "Sardines Friture"),
  "item-sardines-fritures-garnies": photo(
    "item-sardines-fritures-garnies",
    "Sardines Fritures Garnies",
  ),
  "item-chtitha-sardines": photo("item-chtitha-sardines", "Chtitha Sardines"),
  "item-sepia-en-sauce": photo("item-sepia-en-sauce", "Sepia en Sauce"),
  "item-thon-grille": photo("item-thon-grille", "Thon Grillé"),
  "item-rouget": photo("item-rouget", "Rouget"),
  "item-merlan": photo("item-merlan", "Merlan"),
  "item-espadon": photo("item-espadon", "Espadon"),
  "item-espadon-en-sauce": photo("item-espadon-en-sauce", "Espadon en Sauce"),
  "item-chien-de-mer": photo("item-chien-de-mer", "Chien de Mer"),
  "item-calamar": photo("item-calamar", "Calamar"),
  "item-dorade": photo("item-dorade", "Dorade"),
  "item-loup-de-mer": photo("item-loup-de-mer", "Loup de Mer"),
  "item-crevettes-en-sauce": photo("item-crevettes-en-sauce", "Crevettes en Sauce"),
  "item-crevettes-grillees": photo("item-crevettes-grillees", "Crevettes Grillées"),
  "item-plat-varie-de-poissons": photo("item-plat-varie-de-poissons", "Plat Varié de Poissons"),
  // Nos Desserts
  "item-flan-caramel": photo("item-flan-caramel", "Flan Caramel"),
  "item-flan-cafe": photo("item-flan-cafe", "Flan Café"),
  "item-salade-de-fruits": photo("item-salade-de-fruits", "Salade de Fruits"),
  // Nos Boissons
  "item-soda": photo("item-soda", "Soda"),
  "item-jus": photo("item-jus", "Jus"),
  "item-eau-minerale-pm": photo("item-eau-minerale-pm", "Eau Minérale PM"),
  "item-canette": photo("item-canette", "Canette"),
  "item-jus-de-citron": photo("item-jus-de-citron", "Jus de Citron (1 L)"),
  "item-jus-d-orange": photo("item-jus-d-orange", "Jus d’Orange (1 L)"),
  "item-cocktail-de-fruits": photo("item-cocktail-de-fruits", "Cocktail de Fruits (1 L)"),
};

/** How many approved dishes a bundled photo exists for. */
export const BUNDLED_DISH_PHOTO_COUNT = Object.keys(BUNDLED_DISH_PHOTOS).length;

export function getBundledDishPhoto(itemId: string): DishPhoto | undefined {
  return BUNDLED_DISH_PHOTOS[itemId];
}

/** Every photo, in the order the approved menu lists its dishes. */
export function listBundledDishPhotos(): DishPhoto[] {
  return Object.values(BUNDLED_DISH_PHOTOS);
}
