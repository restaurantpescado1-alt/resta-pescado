/**
 * Category cover images for the home page "Nos catégories" tiles.
 *
 * The owner supplied one cover for each introduction category that the bundled
 * gallery set does not photograph (soups, desserts, drinks). The two categories the
 * curated gallery does cover — starters and fish — keep their gallery photographs;
 * `Entrées` and `Poissons` are deliberately absent from this manifest so the two
 * sources never compete for the same tile.
 *
 * ## What these files are
 *
 * The files were delivered as category covers and nothing here inspected their
 * pixels, so the alt text describes the tile's role (a preview of that menu
 * category) rather than asserting a scene, a dish, or a species. That follows
 * `docs/CONTENT_POLICY.md`: prose may not claim more than the data can show.
 *
 * The derivatives live in `public/images/categories/` and are served straight from
 * `public/` like the gallery files, not through `/api/media`. `scripts/…` build them
 * from the same masters the owner delivered; see the module's size constants for the
 * geometry every entry shares.
 */

export interface CategoryCoverImage {
  /** Category slug the tile links to, and the derived filename: `${slug}.webp`. */
  readonly slug: string;
  /** Served path, relative to the site root. */
  readonly src: string;
  /** French alt text. Describes the tile's role, never the filename. */
  readonly altFr: string;
  /** Intrinsic size of the derived file, so the tile does not shift on load. */
  readonly width: number;
  readonly height: number;
}

/** The directory the derived covers are served from. */
export const CATEGORY_COVER_ROOT = "categories";

/**
 * Geometry of every derived cover. The owner's masters are 1448x1086 (4:3) and the
 * tiles are cropped to 4:3, so nothing is stretched and the grid lines up.
 */
const COVER_WIDTH = 1448;
const COVER_HEIGHT = 1086;

function cover(slug: string, altFr: string): CategoryCoverImage {
  return {
    slug,
    src: `/images/${CATEGORY_COVER_ROOT}/${slug}.webp`,
    altFr,
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
  };
}

const CATEGORY_COVERS: readonly CategoryCoverImage[] = [
  cover("soupes", "Aperçu de la carte : nos soupes."),
  cover("desserts", "Aperçu de la carte : nos desserts."),
  cover("boissons", "Aperçu de la carte : nos boissons."),
];

export function getCategoryCover(slug: string): CategoryCoverImage | undefined {
  return CATEGORY_COVERS.find((image) => image.slug === slug);
}

export function listCategoryCovers(): readonly CategoryCoverImage[] {
  return CATEGORY_COVERS;
}
