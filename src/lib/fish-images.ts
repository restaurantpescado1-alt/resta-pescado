/**
 * Fish reference image manifest.
 *
 * Every image in `public/images/fish-guide/` is an **AI-generated reference
 * illustration** of a fish species. None of them is a photograph of a cooked dish,
 * a plate, or a serving, and `docs/CONTENT_POLICY.md` ranks an owner-approved
 * temporary AI image above no image at all. So the rule these images exist to
 * enforce is simple and non-negotiable: they may illustrate *which fish*, and they
 * may never stand in for *what the dish looks like*.
 *
 * `FISH_REFERENCE_LABEL` is therefore not decoration. Every surface that renders one
 * of these images has to show it, which is why it is exported as a constant rather
 * than typed into each component, and why the label is asserted by the test suite.
 * Do not present these as photographs of the cooked dishes.
 */

/**
 * The exact wording the owner approved for identifying these images.
 *
 * French, matching the public UI. Kept as one constant so the label can never drift
 * between the menu, the fish guide, and the home page.
 */
export const FISH_REFERENCE_LABEL = "Illustration de référence générée par IA";

export interface FishReferenceImage {
  /** Stable key used in the database (`menu_items.fish_reference_slug`). */
  readonly slug: string;
  /** Display name of the species, in French. */
  readonly nameFr: string;
  /** Public path under `/`, served straight from `public/`. */
  readonly src: string;
  /** Intrinsic size of the generated file, so layout does not shift on load. */
  readonly width: number;
  readonly height: number;
  /**
   * Alt text. Describes the species and says what the image is, because a visitor
   * using a screen reader has no other way to learn that this is a drawing.
   */
  readonly altFr: string;
}

/** Output geometry produced by `scripts/process-fish-images.ts`. */
const FISH_IMAGE_WIDTH = 1200;
const FISH_IMAGE_HEIGHT = 900;

function fish(
  slug: string,
  nameFr: string,
  altFr: string,
): FishReferenceImage {
  return {
    slug,
    nameFr,
    src: `/images/fish-guide/${slug}.webp`,
    width: FISH_IMAGE_WIDTH,
    height: FISH_IMAGE_HEIGHT,
    altFr: `${altFr} ${FISH_REFERENCE_LABEL.toLowerCase()}.`,
  };
}

/**
 * All fish reference illustrations, keyed by slug.
 *
 * Order is the order the guide page shows them, chosen to move from the
 * whole-fish shapes visitors recognise to the less familiar ones.
 */
export const FISH_REFERENCE_IMAGES: Readonly<Record<string, FishReferenceImage>> = {
  sardine: fish("sardine", "Sardine", "Sardines argentées, représentées entières."),
  dorade: fish("dorade", "Dorade", "Dorade, poisson de mer à chair ferme."),
  "loup-de-mer": fish("loup-de-mer", "Loup de mer", "Loup de mer, allongé et argenté."),
  rouget: fish("rouget", "Rouget", "Rouget, poisson de mer à tête caractéristique."),
  merlan: fish("merlan", "Merlan", "Merlan, poisson allongé au corps clair."),
  thon: fish("thon", "Thon", "Thon, grand poisson de mer au corps massif."),
  espadon: fish("espadon", "Espadon", "Espadon, identifiable à son rostre long et plat."),
  "chien-de-mer": fish("chien-de-mer", "Chien de mer", "Chien de mer, poisson de mer à la peau tachetée."),
  calamar: fish("calamar", "Calamar", "Calamar, céphalopode allongé muni de tentacules."),
  sepia: fish("sepia", "Sepia", "Sepia, céphalopode au corps ovale et plat."),
  crevette: fish("crevette", "Crevette", "Crevette, crustacé à la queue segmentée."),
};

/** Slugs in display order, for the fish guide page. */
export const FISH_REFERENCE_ORDER: readonly string[] = [
  "sardine",
  "dorade",
  "loup-de-mer",
  "rouget",
  "merlan",
  "thon",
  "espadon",
  "chien-de-mer",
  "calamar",
  "sepia",
  "crevette",
];

export function getFishReferenceImage(slug: string): FishReferenceImage | undefined {
  return FISH_REFERENCE_IMAGES[slug];
}

/**
 * All images in display order.
 *
 * Returns only entries that are actually present in the manifest, so a typo in
 * `FISH_REFERENCE_ORDER` cannot crash the guide page.
 */
export function listFishReferenceImages(): FishReferenceImage[] {
  const images: FishReferenceImage[] = [];
  for (const slug of FISH_REFERENCE_ORDER) {
    const image = FISH_REFERENCE_IMAGES[slug];
    if (image) {
      images.push(image);
    }
  }
  return images;
}