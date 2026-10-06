import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GalleryGrid } from "../../src/components/gallery-grid";
import { listBundledGalleryImages, mergeBundledGalleryState } from "../../src/lib/gallery-images";

/**
 * The gallery grid's two branches.
 *
 * The empty state is unreachable over HTTP for as long as any photograph exists, and
 * emptying the bundled set to test it would mean deleting the owner's files. Rendering
 * the component directly covers both branches without touching anything.
 *
 * `SafeImage` is a client component, so server rendering here produces the markup with no
 * `failedSrc` state, which is the initial state anyway. That is enough: what is being
 * checked here is which branch renders, not the fallback behaviour, which
 * `safe-image` covers through the browser.
 */
describe("gallery grid", () => {
  /**
   * What the page passes once it has merged the manifest with the owner's stored state.
   * Merging against no rows is the state of a freshly migrated production database.
   */
  const bundled = mergeBundledGalleryState([]);

  it("renders a tile per photograph with a caption", () => {
    const html = renderToStaticMarkup(<GalleryGrid bundled={bundled} uploaded={[]} />);

    expect(html).not.toContain('data-testid="gallery-empty"');
    expect(html).toContain('data-testid="safe-image"');
    expect((html.match(/<figcaption/gu) ?? []).length).toBe(listBundledGalleryImages().length);
  });

  it("renders the empty state when there is nothing at all", () => {
    const html = renderToStaticMarkup(<GalleryGrid bundled={[]} uploaded={[]} />);

    expect(html).toContain('data-testid="gallery-empty"');
    expect(html).toContain("Les photos arrivent bientôt");
    expect(html).not.toContain("<img");
  });

  it("keeps the empty state away when only uploads exist", () => {
    const uploaded = [
      {
        id: "upload-1",
        imageKey: "gallery/2026/owner.png",
        altTextFr: "Une photographie ajoutée par le propriétaire.",
        sortOrder: 0,
      },
    ] as never;

    const html = renderToStaticMarkup(<GalleryGrid bundled={[]} uploaded={uploaded} />);

    expect(html).not.toContain('data-testid="gallery-empty"');
    expect(html).toContain("/api/media/gallery/2026/owner.png");
  });

  it("shows bundled photographs before uploads", () => {
    const uploaded = [
      {
        id: "upload-1",
        imageKey: "gallery/2026/owner.png",
        altTextFr: "Une photographie ajoutée par le propriétaire.",
        sortOrder: 0,
      },
    ] as never;

    const html = renderToStaticMarkup(<GalleryGrid bundled={bundled} uploaded={uploaded} />);

    expect(html.indexOf("/images/gallery/webp/")).toBeLessThan(
      html.indexOf("/api/media/gallery/2026/owner.png"),
    );
  });

  it("discloses the lighting edit the owner reported", () => {
    const html = renderToStaticMarkup(<GalleryGrid bundled={bundled} uploaded={[]} />);

    expect(html).toContain("ajustées uniquement au niveau de la luminosité");
  });

  it("says nothing about its provenance when no entry reports an edit", () => {
    const unconfirmed = bundled.map((image) => ({ ...image, editNoteFr: null }));
    const html = renderToStaticMarkup(<GalleryGrid bundled={unconfirmed} uploaded={[]} />);

    expect(html).not.toContain("gallery-edit-note");
    expect(html).not.toContain("luminosité");
  });

it("shows the owner's own description and caption rather than the manifest's", () => {
    const first = bundled[0]!;
    const edited = [
      {
        ...first,
        altTextFr: "Une salle de restaurant côté fenêtre.",
        captionFr: "Le midi, avant le coup de feu.",
      },
      ...bundled.slice(1),
    ];

    const html = renderToStaticMarkup(<GalleryGrid bundled={edited} uploaded={[]} />);

    expect(html).toContain("Une salle de restaurant côté fenêtre.");
    expect(html).toContain("Le midi, avant le coup de feu.");
    // The caption replaced the description under the tile rather than being added beside it.
    expect(html).not.toContain(`<figcaption class="px-3 py-2 text-xs leading-snug text-ink/75">Une salle`);
  });

  it("uses the description as the caption when the owner wrote no caption", () => {
    // Keeping the two the same means the visible text is what a screen reader announces.
    const first = bundled[0]!;
    const edited = [{ ...first, altTextFr: "Le comptoir.", captionFr: null }, ...bundled.slice(1)];

    const html = renderToStaticMarkup(<GalleryGrid bundled={edited} uploaded={[]} />);

    expect(html).toContain('alt="Le comptoir."');
    expect(html).toContain(">Le comptoir.</figcaption>");
  });
});