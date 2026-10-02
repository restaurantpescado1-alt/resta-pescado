import type { MenuItemRow } from "@/db/schema";
import { getFishReferenceImage, FISH_REFERENCE_LABEL } from "@/lib/fish-images";
import { formatPrice, mediaUrl } from "@/lib/format";

/**
 * One dish on the menu.
 *
 * Two kinds of image, and the difference matters:
 *
 * - A **photograph** of the cooked dish, from R2, via `item.imageKey`. When one exists
 *   it always wins, because it is the only thing that shows what you are served.
 * - An **AI-generated reference illustration** of the fish species, via
 *   `item.fishReferenceSlug`, from `public/`. It answers "which fish is this" and can
 *   never stand in for a photo of the plate, so the mandatory AI label is rendered
 *   beside it.
 *
 * A dish with neither shows a neutral placeholder rather than a stand-in image.
 */
export function DishCard({
  item,
  showAiLabel = true,
}: {
  item: MenuItemRow;
  showAiLabel?: boolean;
}) {
  const fish = item.fishReferenceSlug ? getFishReferenceImage(item.fishReferenceSlug) : undefined;
  const photo = item.imageKey ? mediaUrl(item.imageKey) : null;

  return (
    <li className="flex gap-4 border-b border-line py-4 last:border-b-0" data-item-id={item.id}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={item.nameFr}
          width={96}
          height={96}
          loading="lazy"
          className="h-24 w-24 shrink-0 rounded-lg border border-line object-cover"
        />
      ) : fish ? (
        <figure className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fish.src}
            alt={fish.altFr}
            width={fish.width}
            height={fish.height}
            loading="lazy"
            className="h-24 w-32 rounded-lg border border-line object-cover"
          />
        </figure>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink/60"
        >
          Sans image
        </div>
      )}

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

        {/*
          The AI label. Required whenever a reference illustration is shown, so a
          visitor can never mistake a drawing of a fish for a photograph of a dish.
          `showAiLabel` exists for the fish guide, whose caption already names the
          species and carries the label itself.
        */}
        {!photo && fish && showAiLabel ? (
          <p className="mt-2 text-xs leading-snug text-ink/70" data-testid="fish-reference-label">
            {FISH_REFERENCE_LABEL}
          </p>
        ) : null}
      </div>
    </li>
  );
}
