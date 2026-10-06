import { SafeImage } from "@/components/safe-image";
import type { GalleryImageRow } from "@/db/schema";
import { bundledGalleryUrl, type MergedBundledGalleryImage } from "@/lib/gallery-images";
import { mediaUrl } from "@/lib/format";

/**
 * The gallery grid, extracted from the page.
 *
 * Presentational and free of data access, which is the only reason it is separate: the
 * empty state is reachable only when every photograph is removed, and deleting the owner's
 * files to test it is not an option. Rendering this component directly covers both the
 * populated and the empty branch.
 *
 * `bundled` is the *merged* list from `mergeBundledGalleryState`, so the text under each
 * photograph is whatever the owner has written rather than the manifest's original. Visibility
 * and ordering are decided by the caller: a grid that filtered its own inputs would make the
 * same filtering twice, in two places, one of them wrong.
 */
export function GalleryGrid({
  bundled,
  uploaded,
}: {
  bundled: readonly MergedBundledGalleryImage[];
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

  /*
   * The disclosure is shown once, and only when the manifest reports an edit. An entry
   * still marked `unverified` carries no note, so a set nobody has confirmed says nothing
   * about itself rather than borrowing the wording of a set that has been.
   */
  const editNoteFr = bundled.find((image) => image.editNoteFr !== null)?.editNoteFr ?? null;

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
                alt={image.altTextFr}
                width={image.width}
                height={image.height}
                className="aspect-[4/3] w-full object-cover"
                fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
              />
              <figcaption className="px-3 py-2 text-xs leading-snug text-ink/75">
                {/*
                  The owner's caption when they wrote one, and their description otherwise.
                  Falling back to the description rather than to nothing keeps a row of tiles
                  aligned, and it keeps the visible text identical to the alt text, which is
                  what a screen reader announces.
                */}
                {image.captionFr ?? image.altTextFr}
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
        Stated once, because the processing applied to these photographs is a real fact a
        visitor is entitled to and repeating it under every tile would be noise. The text
        comes from the manifest rather than being typed here, so the page cannot claim more
        or less than the data says. See docs/GALLERY.md.
      */}
      {editNoteFr ? (
        <p className="mt-6 max-w-prose text-sm text-ink/70" data-testid="gallery-edit-note">
          {editNoteFr}
        </p>
      ) : null}
    </>
  );
}