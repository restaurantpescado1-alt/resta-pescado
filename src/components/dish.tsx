import type { MenuItemRow } from "@/db/schema";
import { formatPrice, mediaUrl } from "@/lib/format";

export function DishCard({ item }: { item: MenuItemRow }) {
  return (
    <li className="flex gap-4 border-b border-line py-4 last:border-b-0" data-item-id={item.id}>
      {item.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(item.imageKey)}
          alt={item.nameFr}
          width={96}
          height={96}
          loading="lazy"
          className="h-24 w-24 shrink-0 rounded border border-line object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-24 w-24 shrink-0 items-center justify-center rounded border border-dashed border-line text-xs text-ink-soft"
        >
          Sans image
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{item.nameFr}</h3>
          <p className="whitespace-nowrap font-semibold text-sea" data-testid="dish-price">
            {formatPrice(item.priceDa)}
          </p>
        </div>
        {item.descriptionFr ? <p className="mt-1 text-sm text-ink-soft">{item.descriptionFr}</p> : null}
        {item.isFeatured ? (
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-sea">Suggestion du chef</p>
        ) : null}
      </div>
    </li>
  );
}
