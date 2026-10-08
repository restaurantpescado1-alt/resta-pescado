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
 * Public pages therefore show one short sentence (`FISH_REFERENCE_EXPLANATION`)
 * once per page, instead of repeating a visible badge on every card. The generated
 * nature never disappears for a screen-reader user: the alt text still says what
 * kind of image this is. These images stay out of the gallery, which is
 * photographs only, and the source/provenance record in `docs/CONTENT_POLICY.md`
 * is internal, not a public claim about the plates.
 */

/**
 * The one concise sentence, shown once per page that displays reference illustrations.
 *
 * Repeating a badge under every illustrated dish would bury the menu in boilerplate,
 * so a single short sentence appears once where the section starts.
 *
 * The second sentence is the important one. A visitor has to understand that the
 * picture answers "which fish is this" and not "what does the plate look like".
 */
export const FISH_REFERENCE_EXPLANATION =
  "Visuels des poissons à titre illustratif. Présentation des plats variable.";

/**
 * Phrase used inside alt text, where there is no room for the section-level sentence
 * and the reader needs to be told what kind of image this is rather than what it
 * shows. Kept even though the visible badge is gone: it is the one assurance a
 * screen-reader user gets that this is a drawing, not a photograph.
 */
const FISH_REFERENCE_ALT_KIND = "Illustration de référence générée par IA";

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
   * Alt text. Describes the species and says what kind of image this is, because a
   * visitor using a screen reader has no other way to learn that this is a drawing.
   *
   * Deliberately does not claim the drawing proves which species the restaurant sells.
   * The species mapping is owner-confirmed in `scripts/approved-menu.ts`; the picture is
   * a generated illustration, so it is evidence of nothing.
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
    altFr: `${altFr} ${FISH_REFERENCE_ALT_KIND}.`,
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