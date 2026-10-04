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
 * - `unverified`: delivered as a curated export, but the repository cannot show whether
 *   it is an unaltered photograph of this restaurant. Needs owner confirmation.
 */
export type GalleryProvenance = "unverified";

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
}

function bundled(
  slug: string,
  altFr: string,
  sourceFile: string,
  provenance: GalleryProvenance = "unverified",
): BundledGalleryImage {
  return {
    slug,
    altFr,
    sourceFile,
    webpFile: `gallery/webp/${slug}.webp`,
    width: GALLERY_WIDTH,
    height: GALLERY_HEIGHT,
    provenance,
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
  ),
  bundled(
    "marine-decor-plants",
    "La décoration intérieure du restaurant, dans un style maritime avec des plantes.",
    "gallery/marine-decor-plants.png",
  ),
  bundled(
    "full-seafood-display",
    "Vue d'ensemble du comptoir de poissons et de fruits de mer.",
    "gallery/full-seafood-display.png",
  ),
  bundled(
    "fresh-seafood-counter",
    "Poissons et fruits de mer présentés sur le comptoir du restaurant.",
    "gallery/fresh-seafood-counter.png",
  ),
  bundled(
    "fresh-seafood-detail",
    "Sélection de poissons et de fruits de mer sur le comptoir.",
    "gallery/fresh-seafood-detail.png",
  ),
  bundled(
    "fresh-tuna-display",
    "Tranches de thon présentées sur le comptoir.",
    "gallery/fresh-tuna-display.png",
  ),
  bundled(
    "starters-and-salads",
    "Salades et entrées préparées, présentées avant le service.",
    "gallery/starters-and-salads.png",
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
 * Public URL of a derived gallery file.
 *
 * Bundled assets are served straight from `public/`, so unlike an uploaded image this
 * does not go through `/api/media`. It is still passed through the same escaping helper
 * the rest of the UI uses.
 */
export function bundledGalleryUrl(webpFile: string): string {
  return `/images/${webpFile}`;
}