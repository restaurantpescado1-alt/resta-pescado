import { GalleryGrid } from "@/components/gallery-grid";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicGalleryImages, getSiteSettings } from "@/db/repositories/menu";
import type { GalleryImageRow, SiteSettingsRow } from "@/db/schema";
import { listBundledGalleryImages } from "@/lib/gallery-images";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Galerie",
  description: "Photographies du restaurant.",
};

type GalleryData =
  | { status: "ok"; images: GalleryImageRow[]; settings: SiteSettingsRow | null }
  | { status: "error"; detail: string };

async function loadGallery(): Promise<GalleryData> {
  try {
    const db = getDb();
    const [images, settings] = await Promise.all([
      getPublicGalleryImages(db),
      getSiteSettings(db),
    ]);
    return { status: "ok", images, settings };
  } catch (error) {
    console.error("Gallery read failed", error);
    return { status: "error", detail: "La galerie n'a pas pu être chargée." };
  }
}

/**
 * The gallery.
 *
 * Two sources, shown in one grid:
 *
 * 1. The curated photographs bundled in the repository, described by
 *    `src/lib/gallery-images.ts` and served from `public/`. Their order is curated.
 * 2. Whatever the owner uploads through the dashboard, in R2 via `gallery_images`. Their
 *    order is `sort_order`.
 *
 * Bundled first, because that is the sequence a curator chose and uploads arrive later.
 * The table is read on every request rather than inlined, so a photo the owner adds shows
 * up without a rebuild.
 *
 * The tempting shortcut would be to reuse the AI fish illustrations here. They are not
 * photographs of the restaurant, they illustrate species, and putting them on a page
 * captioned as the restaurant would be exactly the misrepresentation
 * `docs/CONTENT_POLICY.md` rules out. So they never appear in this grid, and a test says so.
 */
export default async function GalleryPage() {
  const data = await loadGallery();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  const bundled = listBundledGalleryImages();

  return (
    <div data-testid="gallery">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Galerie</h1>
        {/*
          "Photographies de la salle et des plats" was the original line and it claims
          more than the repository can support: these files arrived as curated exports
          whose contents cannot be verified from here. This says what is actually known,
          and the provenance caveat below carries the rest.
        */}
        <p className="mt-2 max-w-prose text-ink/75">
          Photographies fournies pour le restaurant.
        </p>
      </header>

      <GalleryGrid bundled={bundled} uploaded={data.images} />
    </div>
  );
}
