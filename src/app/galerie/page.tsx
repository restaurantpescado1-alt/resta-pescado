import { GalleryGrid } from "@/components/gallery-grid";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicGalleryImages, getSiteSettings } from "@/db/repositories/menu";
import { listBundledGalleryState } from "@/db/repositories/owner";
import type { GalleryImageRow, SiteSettingsRow } from "@/db/schema";
import { mergeBundledGalleryState } from "@/lib/gallery-images";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Galerie",
  description: "Photographies du restaurant.",
};

type GalleryData =
  | {
      status: "ok";
      images: GalleryImageRow[];
      bundled: ReturnType<typeof mergeBundledGalleryState>;
      settings: SiteSettingsRow | null;
    }
  | { status: "error"; detail: string };

async function loadGallery(): Promise<GalleryData> {
  try {
    const db = getDb();
    const [images, bundledState, settings] = await Promise.all([
      getPublicGalleryImages(db),
      listBundledGalleryState(db),
      getSiteSettings(db),
    ]);
    return {
      status: "ok",
      images,
      /*
       * Merged here rather than in the component, so the grid has no opinion about the
       * database: `mergeBundledGalleryState` is the single place the manifest and the owner's
       * stored decisions are combined, and the dashboard reads it too.
       *
       * Photographs the owner has hidden are dropped here, and only here. The table still
       * holds them, which is what makes "masquée" reversible rather than a deletion.
       */
      bundled: mergeBundledGalleryState(bundledState).filter((image) => image.isVisible),
      settings,
    };
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
 *    `src/lib/gallery-images.ts` and served from `public/`. Their description, caption, order
 *    and visibility are the owner's, stored in `bundled_gallery_images`.
 * 2. Whatever the owner uploads through the dashboard, in R2 via `gallery_images`. Their
 *    order is `sort_order`.
 *
 * Bundled first, because that is the sequence a curator chose and uploads arrive later.
 * Both tables are read on every request rather than inlined, so a photograph the owner adds,
 * hides or reorders shows up without a rebuild.
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

  return (
    <div data-testid="gallery">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Galerie</h1>
        {/*
          "Photographies de la salle et des plats" was the original line and it claims
          more than the repository can support. The owner has since confirmed these are
          photographs of the restaurant, so this says so plainly, and `GalleryGrid`
          discloses what was done to the files.
        */}
        <p className="mt-2 max-w-prose text-ink/75">
          Photographies du restaurant, fournies par le propriétaire.
        </p>
      </header>

      <GalleryGrid bundled={data.bundled} uploaded={data.images} />
    </div>
  );
}
