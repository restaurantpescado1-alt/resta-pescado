import { SafeImage } from "@/components/safe-image";
import type { GalleryImageRow } from "@/db/schema";
import { bundledGalleryUrl, type BundledGalleryImage } from "@/lib/gallery-images";
import { mediaUrl } from "@/lib/format";

/**
 * The gallery grid, extracted from the page.
 *
 * Presentational and free of data access, which is the only reason it is separate: the
 * empty state is reachable only when every photograph is removed, and deleting the owner's
 * files to test it is not an option. Rendering this component directly covers both the
 * populated and the empty branch.
 */
export function GalleryGrid({
  bundled,
  uploaded,
}: {
  bundled: readonly BundledGalleryImage[];
  uploaded: readonly GalleryImageRow[];
}) {
  if (bundled.length + uploaded.length === 0) {
    return (
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
    );
  }

  return (
    <>
      {/*
        Two across on a phone, three once there is room. `items-start` matters: the grid
        has to be allowed to be ragged rather than stretching a row of short captions to
        match its tallest neighbour.
      */}
      <ul className="mt-8 grid grid-cols-2 items-start gap-3 sm:grid-cols-3 sm:gap-4">
        {bundled.map((image) => (
          <li key={`bundled-${image.slug}`}>
            <figure className="overflow-hidden rounded-xl border border-line bg-white/60">
              <SafeImage
                src={bundledGalleryUrl(image.webpFile)}
                alt={image.altFr}
                width={image.width}
                height={image.height}
                className="aspect-[4/3] w-full object-cover"
                fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
              />
              <figcaption className="px-3 py-2 text-xs leading-snug text-ink/75">
                {image.altFr}
              </figcaption>
            </figure>
          </li>
        ))}

        {uploaded.map((image) => (
          <li key={image.id}>
            <figure className="overflow-hidden rounded-xl border border-line bg-white/60">
              <SafeImage
                src={mediaUrl(image.imageKey)}
                alt={image.altTextFr}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover"
                fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
              />
              <figcaption className="px-3 py-2 text-xs leading-snug text-ink/75">
                {image.altTextFr}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      {/*
        Stated once, because the provenance of these photographs is a real limitation and
        repeating it under every tile would be noise. See docs/GALLERY.md.
      */}
      <p className="mt-6 max-w-prose text-sm text-ink/70">
        Ces photographies nous ont été fournies. Leur provenance exacte reste à confirmer.
      </p>
    </>
  );
}