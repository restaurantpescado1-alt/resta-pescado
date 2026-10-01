"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updateDishPriceAction, replaceDishImageAction } from "@/app/admin/actions";
import type { MenuCategoryRow, MenuItemRow } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { formatPrice, mediaUrl } from "@/lib/format";

/**
 * Owner menu editor. Every write goes through a server action, so the browser
 * holds no write credential and the server is free to re-check the session and
 * the owner role on each call.
 */
export function MenuEditor({
  categories,
}: {
  categories: Array<MenuCategoryRow & { items: MenuItemRow[] }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  return (
    <div data-testid="menu-editor">
      {categories.map((category) => (
        <section key={category.id} className="mt-8" data-testid="editor-category" data-slug={category.slug}>
          <h2 className="border-b-2 border-sea pb-2 text-lg font-semibold">{category.nameFr}</h2>

          {category.items.length === 0 ? (
            <p className="py-4 text-sm text-ink-soft">Aucun plat.</p>
          ) : (
            <ul className="divide-y divide-line">
              {category.items.map((item) => (
                <DishEditorRow
                  key={item.id}
                  item={item}
                  isPending={isPending}
                  busyItemId={busyItemId}
                  priceDraft={priceDrafts[item.id] ?? String(item.priceDa)}
                  onPriceDraftChange={(value) =>
                    setPriceDrafts((previous) => ({ ...previous, [item.id]: value }))
                  }
                  setBusyItemId={setBusyItemId}
                  setMessage={setMessage}
                  startTransition={startTransition}
                  routerRefresh={() => router.refresh()}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      <div aria-live="polite" className="mt-6 min-h-6">
        {message ? (
          <p
            className={message.ok ? "text-sm text-ok" : "text-sm text-danger"}
            data-testid="action-message"
          >
            {message.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DishEditorRow({
  item,
  isPending,
  busyItemId,
  priceDraft,
  onPriceDraftChange,
  setBusyItemId,
  setMessage,
  startTransition,
  routerRefresh,
}: {
  item: MenuItemRow;
  isPending: boolean;
  busyItemId: string | null;
  priceDraft: string;
  onPriceDraftChange: (value: string) => void;
  setBusyItemId: (id: string | null) => void;
  setMessage: (result: ActionResult | null) => void;
  startTransition: (callback: () => void) => void;
  routerRefresh: () => void;
}) {
  const isBusy = busyItemId === item.id;

  function submitPrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusyItemId(item.id);
    setMessage(null);

    // `Number`, not `parseInt`: prices are whole dinars, and `parseInt("950.5")`
    // would silently truncate to 950 instead of being rejected. `NaN` is passed
    // through so the server-side Zod schema stays the single source of truth.
    const raw = Number(priceDraft.trim());
    startTransition(async () => {
      const result = await updateDishPriceAction({
        menuItemId: item.id,
        priceDa: Number.isNaN(raw) ? Number.NaN : raw,
      });
      setMessage(result);
      setBusyItemId(null);
      if (result.ok) {
        onPriceDraftChange(String(result.priceDa ?? item.priceDa));
        routerRefresh();
      }
    });
  }

  function submitImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusyItemId(item.id);
    setMessage(null);

    startTransition(async () => {
      const result = await replaceDishImageAction(formData);
      setMessage(result);
      setBusyItemId(null);
      if (result.ok) {
        form.reset();
        routerRefresh();
      }
    });
  }

  return (
    <li className="py-4" data-testid="editor-item" data-item-id={item.id}>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-semibold">{item.nameFr}</h3>
            <p className="whitespace-nowrap text-sm text-ink-soft" data-testid="current-price">
              {formatPrice(item.priceDa)}
            </p>
          </div>
          {item.descriptionFr ? <p className="mt-1 text-sm text-ink-soft">{item.descriptionFr}</p> : null}
        </div>

        {item.imageKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mediaUrl(item.imageKey)}
            alt={item.nameFr}
            width={80}
            height={80}
            className="h-20 w-20 shrink-0 rounded border border-line object-cover"
          />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <form onSubmit={submitPrice} className="rounded border border-line bg-white/60 p-3">
          <label htmlFor={`price-${item.id}`} className="block text-sm font-medium">
            Prix (DA)
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id={`price-${item.id}`}
              name="priceDa"
              type="text"
              inputMode="numeric"
              value={priceDraft}
              onChange={(event) => onPriceDraftChange(event.target.value)}
              className="w-28 rounded border border-line bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-sea px-3 py-2 text-sm font-semibold text-sand transition-colors hover:bg-sea-deep disabled:opacity-60"
            >
              {isBusy ? "…" : "Enregistrer"}
            </button>
          </div>
        </form>

        <form onSubmit={submitImage} className="rounded border border-line bg-white/60 p-3">
          <label htmlFor={`image-${item.id}`} className="block text-sm font-medium">
            Remplacer l&apos;image (JPEG, PNG ou WebP, 2 Mo max.)
          </label>
          <input type="hidden" name="menuItemId" value={item.id} />
          <div className="mt-1 flex gap-2">
            <input
              id={`image-${item.id}`}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              className="min-w-0 flex-1 text-xs"
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded border border-sea px-3 py-2 text-sm font-semibold text-sea transition-colors hover:bg-sand disabled:opacity-60"
            >
              {isBusy ? "…" : "Téléverser"}
            </button>
          </div>
        </form>
      </div>
    </li>
  );
}
