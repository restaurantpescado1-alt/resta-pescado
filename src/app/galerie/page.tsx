import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicGalleryImages, getSiteSettings } from "@/db/repositories/menu";
import type { GalleryImageRow, SiteSettingsRow } from "@/db/schema";
import { mediaUrl } from "@/lib/format";

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
 * `gallery_images` is empty until the owner uploads photographs of the place. The page
 * says so plainly instead of filling the space with something else.
 *
 * The tempting shortcut would be to reuse the AI fish illustrations here. They are not
 * photographs of the restaurant, they illustrate species, and putting them on a page
 * captioned as the restaurant would be exactly the misrepresentation
 * `docs/CONTENT_POLICY.md` rules out.
 */
export default async function GalleryPage() {
  const data = await loadGallery();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  const { images } = data;

  return (
    <div data-testid="gallery">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Galerie</h1>
        <p className="mt-2 max-w-prose text-ink/75">
          Photographies de la salle et des plats.
        </p>
      </header>

      {images.length === 0 ? (
        <section
          className="mt-8 rounded-2xl border border-dashed border-line-strong p-10 text-center"
          data-testid="gallery-empty"
        >
          <h2 className="text-lg font-bold">Les photos arrivent bientôt</h2>
          <p className="mx-auto mt-2 max-w-md text-ink/75">
            Nous n&apos;avons pas encore de photographies de la salle. Elles seront
            ajoutées dès que nous en aurons.
          </p>
          <p className="mx-auto mt-4 max-w-md text-sm text-ink/70">
            En attendant, la page&nbsp;
            <a href="/a-propos#guide-poissons" className="text-marine underline underline-offset-4">
              Nos poissons
            </a>{" "}
            présente les espèces que nous servons.
          </p>
        </section>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {images.map((image) => (
            <li key={image.id}>
              <figure className="overflow-hidden rounded-xl border border-line bg-white/60">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(image.imageKey)}
                  alt={image.altTextFr}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="px-3 py-2 text-xs text-ink/75">
                  {image.altTextFr}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
