import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GalleryGrid } from "../../src/components/gallery-grid";
import { listBundledGalleryImages } from "../../src/lib/gallery-images";

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
  const bundled = listBundledGalleryImages();

  it("renders a tile per photograph with a caption", () => {
    const html = renderToStaticMarkup(<GalleryGrid bundled={bundled} uploaded={[]} />);

    expect(html).not.toContain('data-testid="gallery-empty"');
    expect(html).toContain('data-testid="safe-image"');
    expect((html.match(/<figcaption/gu) ?? []).length).toBe(bundled.length);
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

  it("states the provenance caveat alongside the photographs", () => {
    const html = renderToStaticMarkup(<GalleryGrid bundled={bundled} uploaded={[]} />);

    expect(html).toContain("provenance exacte reste");
  });
});