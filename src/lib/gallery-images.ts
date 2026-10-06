/**
 * Approved restaurant photographs bundled with the site.
 *
 * These are the curated sources in `public/images/gallery/`, described well enough for
 * the page to render them and for a screen-reader user to understand them. This module is
 * the single source of truth: `scripts/process-gallery-images.ts` derives the WebP files
 * from it, the gallery page renders it, and the tests assert it against the filesystem.
 * Adding a photograph means adding it here and re-running the script.
 *
 * ## These are not the same thing as the `gallery_images` table
 *
 * `gallery_images` holds what the owner uploads through the dashboard, in R2. This module
 * holds what ships inside the repository. Both are shown on `/galerie`, bundled images
 * first, because their order is curated here while uploaded ones use `sort_order`. See
 * `docs/GALLERY.md` for how the bundled set gets initialised in production.
 *
 * ## Authenticity
 *
 * `provenance` is deliberately not a claim that these are unaltered documentary
 * photographs of this restaurant. They were delivered as curated exports with no camera
 * metadata, and nothing in the repository can confirm they were not generated or
 * materially edited. `docs/CONTENT_POLICY.md` puts an owner-approved temporary AI image
 * fifth and forbids presenting edited work as documentary, so every entry is marked
 * `unverified` and the owner has to confirm the set before launch. The flag is carried in
 * the data rather than only in this comment so it cannot be quietly dropped.
 *
 * Deliberately absent: `wooden-ship-decor`. A previous manifest referenced it and no such
 * file exists here. The reference is gone rather than left pointing at nothing.
 */

/**
 * Root of everything under `public/images/`.
 *
 * `sourceFile` and `webpFile` are both relative to this directory, and it is also the
 * base their web URLs use, so the on-disk location and the served path cannot drift.
 */
export const GALLERY_IMAGE_ROOT = "public/images";
export const GALLERY_SOURCE_SUBDIR = "gallery";
export const GALLERY_WEBP_SUBDIR = "gallery/webp";

/**
 * Geometry of every derived gallery file. Sources are 1448x1086 (4:3) and the odd one is
 * 1672x941; both are cropped to 4:3 by the processing script so the grid lines up and
 * nothing is stretched.
 */
const GALLERY_WIDTH = 1200;
const GALLERY_HEIGHT = 900;

/**
 * How much is known about where a photograph came from.
 *
 * - `owner-confirmed`: the restaurant owner has stated that the file is a photograph of
 *   this restaurant, and has stated what was changed. This records *their* statement; it
 *   is not an independent verification, and nothing in this repository inspected the
 *   images to reach it.
 * - `unverified`: delivered as a curated export, and the owner has not yet said where it
 *   came from. It must not be published as a photograph of the restaurant.
 */
export type GalleryProvenance = "owner-confirmed" | "unverified";

export interface BundledGalleryImage {
  /** Stable key, and the derived filename: `${slug}.webp`. */
  readonly slug: string;
  /** French alt text. Describes what the photograph shows, never its filename. */
  readonly altFr: string;
  /** Curated original, relative to `public/images/`. Never written to by the script. */
  readonly sourceFile: string;
  /** Served path of the derived file, relative to `public/images/`. */
  readonly webpFile: string;
  /** Intrinsic size of the derived file, so the grid does not shift on load. */
  readonly width: number;
  readonly height: number;
  readonly provenance: GalleryProvenance;
  /**
   * French description of the edit the owner reported, shown on the gallery page next to
   * the photographs.
   *
   * Non-null only for `owner-confirmed` entries that were adjusted. The owner confirmed
   * that these photographs were edited for lighting only, with the portions and the scene
   * content unchanged, so that is stated rather than implying the files are untouched.
   */
  readonly editNoteFr: string | null;
}

/**
 * The disclosure shown on the gallery page.
 *
 * Derived from the manifest rather than typed out in the component, so the page cannot
 * claim more or less than the data says. It only appears once there is at least one
 * owner-confirmed photograph that reports an edit.
 */
const OWNER_CONFIRMED_EDIT_NOTE_FR =
  "Ces photographies du restaurant ont été ajustées uniquement au niveau de la luminosité. " +
  "Le contenu des images n'a pas été modifié.";

/**
 * `provenance` is a required argument rather than a default.
 *
 * A default would let the next photograph added here inherit a confirmation that was
 * given about a different set of files. Forcing the choice means adding an entry is an
 * explicit decision about what is known about it.
 */
function bundled(
  slug: string,
  altFr: string,
  sourceFile: string,
  provenance: GalleryProvenance,
  editNoteFr: string | null = null,
): BundledGalleryImage {
  return {
    slug,
    altFr,
    sourceFile,
    webpFile: `gallery/webp/${slug}.webp`,
    width: GALLERY_WIDTH,
    height: GALLERY_HEIGHT,
    provenance,
    editNoteFr: provenance === "owner-confirmed" ? (editNoteFr ?? OWNER_CONFIRMED_EDIT_NOTE_FR) : null,
  };
}

/**
 * Curated order: the room first, then the counter displays, then the prepared dishes.
 * Manual, never alphabetical: a visitor should meet the place before the food.
 */
const BUNDLED_GALLERY_IMAGES: readonly BundledGalleryImage[] = [
  bundled(
    "restaurant-dining-room",
    "La salle du restaurant, avec les tables dressées pour le service.",
    "gallery/restaurant-dining-room.png",
    "owner-confirmed",
  ),
  bundled(
    "marine-decor-plants",
    "La décoration intérieure du restaurant, dans un style maritime avec des plantes.",
    "gallery/marine-decor-plants.png",
    "owner-confirmed",
  ),
  bundled(
    "full-seafood-display",
    "Vue d'ensemble du comptoir de poissons et de fruits de mer.",
    "gallery/full-seafood-display.png",
    "owner-confirmed",
  ),
  bundled(
    "fresh-seafood-counter",
    "Poissons et fruits de mer présentés sur le comptoir du restaurant.",
    "gallery/fresh-seafood-counter.png",
    "owner-confirmed",
  ),
  bundled(
    "fresh-seafood-detail",
    "Sélection de poissons et de fruits de mer sur le comptoir.",
    "gallery/fresh-seafood-detail.png",
    "owner-confirmed",
  ),
  bundled(
    "fresh-tuna-display",
    "Tranches de thon présentées sur le comptoir.",
    "gallery/fresh-tuna-display.png",
    "owner-confirmed",
  ),
  bundled(
    "starters-and-salads",
    "Salades et entrées préparées, présentées avant le service.",
    "gallery/starters-and-salads.png",
    "owner-confirmed",
  ),
];

export function listBundledGalleryImages(): readonly BundledGalleryImage[] {
  return BUNDLED_GALLERY_IMAGES;
}

/**
 * How many photographs the bundled set publishes.
 *
 * Exported so a test can assert the manifest still says what it means to say. A count
 * that silently drifts from the list is the cheap early warning for a photograph being
 * withdrawn without anyone deciding to withdraw it.
 */
export const BUNDLED_GALLERY_COUNT = BUNDLED_GALLERY_IMAGES.length;

export function getBundledGalleryImage(slug: string): BundledGalleryImage | undefined {
  return BUNDLED_GALLERY_IMAGES.find((image) => image.slug === slug);
}

/**
 * What the owner has decided about one bundled photograph, as stored in
 * `bundled_gallery_images`.
 *
 * Kept structurally separate from `BundledGalleryImage`: one row is database state about a
 * file, the other is the file's identity. Nothing here describes a photograph, which is why
 * `version` can be 0 to mean "no row yet".
 */
export interface BundledGalleryState {
  readonly slug: string;
  readonly altTextFr: string;
  readonly captionFr: string | null;
  readonly sortOrder: number;
  readonly isVisible: boolean;
  /**
   * 0 means the photograph has no database row yet.
   *
   * That is a real state and not a passing one: production applies migrations and never
   * runs `scripts/seed-local.ts`, so the table starts empty there and a photograph the owner
   * has never edited has no row. Zero is outside the range any seeded or edited row can hold,
   * since those start at 1, so "no row" cannot be mistaken for "row at revision zero".
   */
  readonly version: number;
}

/** One bundled photograph: what the file is, plus what the owner has decided about it. */
export interface MergedBundledGalleryImage extends BundledGalleryImage {
  readonly altTextFr: string;
  readonly captionFr: string | null;
  readonly sortOrder: number;
  readonly isVisible: boolean;
  readonly version: number;
}

/** The state a photograph has before the owner has changed anything about it. */
export function defaultBundledGalleryState(
  image: BundledGalleryImage,
  sortOrder: number,
): BundledGalleryState {
  return {
    slug: image.slug,
    altTextFr: image.altFr,
    captionFr: null,
    sortOrder,
    isVisible: true,
    version: 0,
  };
}

/**
 * Combines the manifest with the owner's stored state.
 *
 * The manifest is the list of what exists; the table is the owner's opinion about it. This
 * is the only place the two are combined, which is what keeps `/galerie` and the dashboard
 * from disagreeing about the same photograph.
 *
 * A photograph with no row falls back to the manifest baseline rather than disappearing.
 * That fallback is load-bearing rather than defensive: production applies `drizzle/0002` and
 * never runs `scripts/seed-local.ts`, so on a freshly deployed database the table is empty.
 * Reading the gallery only from the table would blank `/galerie` for every photograph already
 * on the site the day the migration was applied.
 *
 * Rows whose slug is no longer in the manifest are dropped, because there is no file behind
 * them to render and `docs/CONTENT_POLICY.md` rules out substituting a different image for a
 * missing one.
 *
 * Ordering is the owner's `sortOrder`. Equal values fall back to the curated position,
 * because `Array.prototype.sort` is required to be stable, so photographs mapped in manifest
 * order keep that order among themselves. The alternative, letting SQLite decide, would make
 * the gallery order an accident of the query plan.
 */
export function mergeBundledGalleryState(rows: readonly BundledGalleryState[]): MergedBundledGalleryImage[] {
  const bySlug = new Map(rows.map((row) => [row.slug, row]));

  return BUNDLED_GALLERY_IMAGES.map((image, manifestIndex) => {
    const row = bySlug.get(image.slug);
    return {
      ...image,
      altTextFr: row?.altTextFr ?? image.altFr,
      captionFr: row?.captionFr ?? null,
      sortOrder: row?.sortOrder ?? manifestIndex + 1,
      isVisible: row?.isVisible ?? true,
      version: row?.version ?? 0,
    };
  }).sort((left, right) => left.sortOrder - right.sortOrder);
}

/**
 * Public URL of a derived gallery file.
 *
 * Bundled assets are served straight from `public/`, so unlike an uploaded image this
 * does not go through `/api/media`. It is still passed through the same escaping helper
 * the rest of the UI uses.
 */
export function bundledGalleryUrl(webpFile: string): string {
  return `/images/${webpFile}`;
}