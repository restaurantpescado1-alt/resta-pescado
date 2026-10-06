"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  removeDishImageAction,
  replaceDishImageAction,
  setDishFeaturedAction,
} from "@/app/admin/actions";
import type { MenuItemRow } from "@/db/schema";
import type { ActionResult } from "@/lib/action-result";
import { mediaUrl } from "@/lib/format";

/**
 * A dish's photograph and its place on the home page.
 *
 * Its own component rather than part of the dish form because the photograph and the featured
 * flag are each a single write of one column, and they must not be saved by accident as a side
 * effect of editing the name, the description or the price. It is also the only part of the
 * editor that touches R2, so it is the part worth reading on its own when an upload misbehaves.
 *
 * These three controls deliberately do not take an `expectedVersion`. They were written before
 * the version guard existed and each one is idempotent — it writes one column or sets one flag
 * — so a concurrent edit to the *same field* is not a lost update in any meaningful sense. A
 * later pass may add the guard; it is noted rather than pretended away in
 * `docs/ARCHITECTURE.md`.
 */
export function DishImageControls({
  item,
  onMessage,
}: {
  item: MenuItemRow;
  onMessage: (result: ActionResult | null) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isBusy, setIsBusy] = useState(false);

  function submitImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
     * The element is captured here, synchronously, and not read from `event` after the await.
     *
     * React nulls `event.currentTarget` once the handler returns — the event object is not kept
     * alive for an async continuation — so `event.currentTarget.reset()` after an `await`
     * throws `Cannot read properties of null`. That throw happens inside the transition, after
     * the upload has already succeeded, and it takes the whole page down: the browser shows the
     * error boundary instead of the editor, and the owner's file input is gone with it.
     */
    const form = event.currentTarget;
    const formData = new FormData(form);
    setIsBusy(true);
    onMessage(null);

    startTransition(async () => {
      const result = await replaceDishImageAction(formData);
      onMessage(result);
      setIsBusy(false);
      if (result.ok) {
        // Cleared so the same file can be chosen again, which is what an owner does when the
        // first upload was the wrong photograph.
        form.reset();
        router.refresh();
      }
    });
  }

  function submitRemoveImage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    /*
     * Confirmation lives here rather than on the button.
     *
     * A single modal-less `confirm()` is deliberate: there is no undo in this dashboard, and
     * this is the one control here that destroys something. The dialog is the browser's, so it
     * works with a keyboard and a screen reader without any focus management code, and it cannot
     * be styled into looking harmless.
     *
     * Cancelling returns without touching the form, so nothing is submitted.
     */
    if (!window.confirm("Supprimer définitivement la photo de ce plat ?")) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    setIsBusy(true);
    onMessage(null);

    startTransition(async () => {
      const result = await removeDishImageAction(formData);
      onMessage(result);
      setIsBusy(false);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  function submitFeatured() {
    setIsBusy(true);
    onMessage(null);

    startTransition(async () => {
      const result = await setDishFeaturedAction({
        menuItemId: item.id,
        isFeatured: !item.isFeatured,
      });
      onMessage(result);
      setIsBusy(false);
      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
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

      {item.imageKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mediaUrl(item.imageKey)}
          alt={item.nameFr}
          width={80}
          height={80}
          data-testid="dish-thumbnail"
          className="h-20 w-20 shrink-0 rounded border border-line object-cover"
        />
      ) : null}

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
        Removal, in its own form so it cannot be submitted by accident alongside an upload.
        There is no undo in the dashboard, which is why it is a separate control and why it
        asks first.
      */}
      {item.imageKey ? (
        <form
          onSubmit={submitRemoveImage}
          className="rounded border border-line bg-white/60 p-3"
          data-testid="remove-image-form"
        >
          <input type="hidden" name="menuItemId" value={item.id} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink/75">
              {/*
                Stated before the button, not after a failure: what the dish will show
                afterwards is the thing the owner needs to decide, and on a dish whose species is
                mapped it means the illustration comes back, which could otherwise look like the
                removal failed.
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
  );
}