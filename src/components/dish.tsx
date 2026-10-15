import type { MenuItemRow } from "@/db/schema";
import { getFishReferenceImage } from "@/lib/fish-images";
import { formatPrice, mediaUrl } from "@/lib/format";
import { SafeImage } from "@/components/safe-image";

/**
 * One dish on the menu.
 *
 * Two kinds of image, and the difference matters:
 *
 * - A **photograph** of the cooked dish, served through the media route via
 *   `item.imageKey`. When one exists
 *   it always wins, because it is the only thing that shows what you are served.
 * - An **AI-generated reference illustration** of the fish species, via
 *   `item.fishReferenceSlug`, from `public/`. It answers "which fish is this" and can
 *   never stand in for a photo of the plate; the caller renders the one page-level
 *   sentence (`FISH_REFERENCE_EXPLANATION`) that discloses these images, and the
 *   illustration is drawn `contain` on the warm shell colour so the whole fish
 *   shows rather than being cropped to a square.
 *
 * A dish with neither gets no image box at all. An earlier version rendered a dashed
 * "Sans image" tile, which on a menu with nineteen dishes without a photograph meant
 * nineteen identical grey squares carrying no information. The row is simply a text row,
 * which is what it is.
 */
export function DishCard({ item }: { item: MenuItemRow }) {
  const fish = item.fishReferenceSlug ? getFishReferenceImage(item.fishReferenceSlug) : undefined;
  const photo = item.imageKey ? mediaUrl(item.imageKey) : null;

  /*
   * Image box: one deliberate size at each breakpoint rather than a size the browser
   * negotiates. The narrowest phones get a 112px tile so the *name* still has room; it
   * steps up to 128px from 360px, 144px from 400px, and the wider 4:3 box on desktop.
   * Each step keeps the tile small enough that a long dish name is never squeezed.
   */
  const imageBox =
    "h-20 w-28 shrink-0 min-[360px]:h-24 min-[360px]:w-32 min-[400px]:h-28 min-[400px]:w-36 md:h-36 md:w-48";

  return (
    <li className="flex gap-3 border-b border-line py-4 last:border-b-0 sm:gap-4" data-item-id={item.id}>
      {photo ? (
        <SafeImage
          src={photo}
          alt={item.nameFr}
          width={192}
          height={144}
          loading="lazy"
          className={`${imageBox} rounded-lg border border-line object-cover`}
          fallbackClassName={`${imageBox} text-[0.7rem]`}
        />
      ) : fish ? (
        <figure className={imageBox}>
          <SafeImage
            src={fish.src}
            alt={fish.altFr}
            width={fish.width}
            height={fish.height}
            loading="lazy"
            // `contain` on the shell colour: a 4:3 illustration of a whole fish inside the
            // larger row box would lose its head or tail to a crop, and the shape of the
            // fish is the entire point of the picture.
            className="h-full w-full rounded-lg border border-line bg-warm object-contain"
            fallbackClassName="h-full w-full text-[0.65rem]"
          />
        </figure>
      ) : null}

      <div className="min-w-0 flex-1">
        {/*
          On a phone the name sits on its own line with the price directly beneath it, so
          neither column has to stretch to the right edge and long names are not squeezed
          against a floating price. From `md` the two sit on one baseline-aligned row.
        */}
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-baseline md:justify-between md:gap-x-3">
          <h3 className="text-base font-semibold sm:text-lg">{item.nameFr}</h3>
          <p
            className="mt-1.5 whitespace-nowrap text-base font-semibold text-marine sm:text-lg md:mt-0"
            data-testid="dish-price"
          >
            {formatPrice(item.priceDa)}
          </p>
        </div>

        {/*
          Descriptions are nullable because the owner has not written them. An
          invented description would mean inventing ingredients, so the space is
          simply left empty rather than filled with a placeholder sentence.
        */}
        {item.descriptionFr ? <p className="mt-1 text-sm text-ink/75">{item.descriptionFr}</p> : null}
      </div>
    </li>
  );
}