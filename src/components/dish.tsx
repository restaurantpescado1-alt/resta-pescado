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

  return (
    <li
      className={`flex gap-4 border-b border-line py-4 last:border-b-0 ${photo || fish ? "" : "pl-0"}`}
      data-item-id={item.id}
    >
      {photo ? (
        <SafeImage
          src={photo}
          alt={item.nameFr}
          width={96}
          height={96}
          loading="lazy"
          className="h-24 w-24 shrink-0 rounded-lg border border-line object-cover"
          fallbackClassName="h-24 w-24 shrink-0 text-[0.7rem]"
        />
      ) : fish ? (
        <figure className="h-24 w-32 shrink-0">
          <SafeImage
            src={fish.src}
            alt={fish.altFr}
            width={fish.width}
            height={fish.height}
            loading="lazy"
            // `contain` on the shell colour: a 4:3 illustration of a whole fish inside a
            // 96x128 box would lose its head or tail to a crop, and the shape of the fish
            // is the entire point of the picture.
            className="h-24 w-32 rounded-lg border border-line bg-warm object-contain"
            fallbackClassName="h-24 w-32 text-[0.65rem]"
          />
        </figure>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{item.nameFr}</h3>
          <p className="whitespace-nowrap font-semibold text-marine" data-testid="dish-price">
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