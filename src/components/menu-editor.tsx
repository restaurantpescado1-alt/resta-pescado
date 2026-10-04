"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeDishImageAction,
  replaceDishImageAction,
  setDishFeaturedAction,
  updateDishPriceAction,
} from "@/app/admin/actions";
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
          <h2 className="border-b-2 border-bright pb-2 text-lg font-semibold">{category.nameFr}</h2>

          {category.items.length === 0 ? (
            <p className="py-4 text-sm text-ink/70">Aucun plat.</p>
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

  function submitRemoveImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
     * Confirmation lives here rather than on the button.
     *
     * A single modal-less `confirm()` is deliberate: there is no undo in this
     * dashboard, and this is the one control here that destroys something. The dialog is
     * the browser's, so it works with a keyboard and a screen reader without any focus
     * management code, and it cannot be styled into looking harmless.
     *
     * Cancelling returns without touching the form, so nothing is submitted.
     */
    if (!window.confirm("Supprimer définitivement la photo de ce plat ?")) {
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusyItemId(item.id);
    setMessage(null);

    startTransition(async () => {
      const result = await removeDishImageAction(formData);
      setMessage(result);
      setBusyItemId(null);
      if (result.ok) {
        routerRefresh();
      }
    });
  }

  function submitFeatured() {
    setBusyItemId(item.id);
    setMessage(null);

    startTransition(async () => {
      const result = await setDishFeaturedAction({
        menuItemId: item.id,
        isFeatured: !item.isFeatured,
      });
      setMessage(result);
      setBusyItemId(null);
      if (result.ok) {
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
            <p className="whitespace-nowrap text-sm text-ink/70" data-testid="current-price">
              {formatPrice(item.priceDa)}
            </p>
          </div>
          {item.descriptionFr ? <p className="mt-1 text-sm text-ink/70">{item.descriptionFr}</p> : null}

          {/* The owner decides what the home page leads with. It starts unset on every
              seeded dish, and the public card never carries a badge either way, so this
              only changes which dishes appear in the preview. */}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={item.isFeatured}
              disabled={isPending}
              onClick={submitFeatured}
              data-testid="featured-toggle"
              className="rounded border border-line bg-white/60 px-2 py-1 text-xs font-medium text-marine transition-colors hover:bg-white disabled:opacity-60"
            >
              {item.isFeatured ? "Mis en avant" : "Mettre en avant"}
            </button>
            <p className="text-xs text-ink/70">
              Le plat apparaîtra en premier sur la page d&apos;accueil.
            </p>
          </div>
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
              className="rounded bg-marine px-3 py-2 text-sm font-semibold text-on-ocean transition-colors hover:bg-ocean disabled:opacity-60"
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
              className="rounded border border-bright px-3 py-2 text-sm font-semibold text-marine transition-colors hover:bg-warm disabled:opacity-60"
            >
              {isBusy ? "…" : "Téléverser"}
            </button>
          </div>
        </form>

        {/*
          Removal, in its own form so it cannot be submitted by accident alongside an
          upload. There is no undo in the dashboard, which is why it is a separate
          control and why it asks first.
        */}
        {item.imageKey ? (
          <form
            onSubmit={submitRemoveImage}
            className="rounded border border-line bg-white/60 p-3 sm:col-span-2"
            data-testid="remove-image-form"
          >
            <input type="hidden" name="menuItemId" value={item.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink/75">
                {/*
                  Stated before the button, not after a failure: what the dish will show
                  afterwards is the thing the owner needs to decide, and on a dish whose
                  species is mapped it means the AI illustration comes back, which could
                  otherwise look like the removal failed.
                */}
                {item.fishReferenceSlug
                  ? "Le plat affichera son illustration de poisson, et non une photo de plat."
                  : "Le plat s'affichera sans image, en texte seul."}
              </p>
              <button
                type="submit"
                disabled={isPending}
                data-testid="remove-image"
                className="rounded border border-danger px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
              >
                {isBusy ? "…" : "Supprimer la photo"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </li>
  );
}
