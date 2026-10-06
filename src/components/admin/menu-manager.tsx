"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ActionMessage, Field, SubmitButton, ToggleField, inputClass, textareaClass } from "@/components/admin/form-parts";
import { DishImageControls } from "@/components/admin/dish-image-controls";
import {
  createCategoryAction,
  createDishAction,
  deleteCategoryAction,
  renameCategoryAction,
  reorderCategoriesAction,
  reorderDishesAction,
  saveDishAction,
  setCategoryVisibilityAction,
  setDishVisibilityAction,
} from "@/app/admin/owner-actions";
import type { MenuCategoryRow, MenuItemRow } from "@/db/schema";
import { FISH_REFERENCE_ORDER, getFishReferenceImage } from "@/lib/fish-images";
import type { ActionResult } from "@/lib/action-result";
import { formatPrice } from "@/lib/format";

/**
 * The menu editor.
 *
 * One screen holding every dish and category, rather than a list of separate pages: the owner
 * is usually reordering and renaming at the same time, and moving between screens to do that
 * is what makes a small change take ten minutes on a phone.
 *
 * Three decisions shape everything here:
 *
 * - **Search is a local filter, never a server query.** It narrows what is on screen while the
 *   owner types. The saved order is the whole list every time, so a half-typed search can
 *   never be saved as a new order with the matches missing from it.
 * - **Order is edited locally and saved as one whole list.** Two arrows plus one save beat a
 *   drag that cannot be done with a keyboard, and one statement cannot half-apply.
 * - **Hiding is the way something leaves the site.** Nothing here deletes a dish, because a
 *   dish that was on the menu yesterday is worth keeping and an accidental hide is one tap to
 *   undo.
 */
/** One category with the dishes under it, as `getAdminMenu` returns it. */
type CategoryWithItems = MenuCategoryRow & { items: MenuItemRow[] };

export function MenuManager({ categories }: { categories: CategoryWithItems[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [query, setQuery] = useState("");

  /*
   * The full order is held locally and passed down. A row filtered out by the search is still
   * in this array, still has its position, and still gets written when the order is saved.
   */
  const [order, setOrder] = useState(() => categories.map((category) => category.id));

  function run(write: () => Promise<ActionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await write();
      setMessage(result);
      if (result.ok || result.stale) {
        router.refresh();
      }
    });
  }

  const normalisedQuery = query.trim().toLowerCase();
  const byId = new Map(categories.map((category) => [category.id, category]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((category): category is CategoryWithItems => category !== undefined);

  const visibleCategories = ordered
    .map((category) => ({
      category,
      items: filterItems(category.items, normalisedQuery),
    }))
    .filter(({ category, items }) => items.length > 0 || matchesCategory(category, normalisedQuery));

  return (
    <div data-testid="menu-manager">
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field
          label="Rechercher"
          htmlFor="menu-search"
          hint="Filtre la liste à l'écran. Il ne change rien sur le site."
        >
          <input
            id="menu-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom d'un plat ou d'une catégorie"
            data-testid="menu-search"
            className={inputClass}
          />
        </Field>

        <p className="text-xs text-ink-soft" data-testid="menu-count">
          {normalisedQuery === ""
            ? `${categories.length} catégorie(s), ${categories.reduce((total, category) => total + category.items.length, 0)} plat(s)`
            : `${visibleCategories.length} catégorie(s) affichée(s)`}
        </p>
      </div>

      {categories.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft" data-testid="menu-empty">
          Aucune catégorie. Créez-en une pour commencer à publier des plats.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded border border-line bg-white/60 p-3">
            <button
              type="button"
              disabled={isPending}
              data-testid="category-order-save"
              onClick={() => run(() => reorderCategoriesAction({ categoryIds: order }))}
              className="rounded border border-line-strong px-3 py-2 text-sm font-semibold text-marine transition-colors hover:bg-sand disabled:opacity-60"
            >
              Enregistrer l&apos;ordre des catégories
            </button>
            <p className="text-xs text-ink-soft">
              Utilisez les flèches pour changer l&apos;ordre, puis enregistrez.
            </p>
          </div>

          {visibleCategories.length === 0 ? (
            <p className="mt-6 text-sm text-ink-soft" data-testid="search-empty">
              Aucun plat ne correspond à «&nbsp;{query.trim()}&nbsp;».
            </p>
          ) : (
            visibleCategories.map(({ category, items }, index) => (
              <CategorySection
                key={category.id}
                category={category}
                items={items}
                categories={categories}
                isFirst={index === 0}
                isLast={index === visibleCategories.length - 1}
                isPending={isPending}
                onMessage={setMessage}
                onRun={run}
                onMove={(direction) => setOrder((previous) => move(previous, order.indexOf(category.id), direction))}
                onItemsMove={(itemIds) =>
                  run(() => reorderDishesAction({ categoryId: category.id, itemIds }))
                }
              />
            ))
          )}
        </>
      )}

      <div className="mt-10 border-t border-line pt-6">
        <h2 className="text-lg font-semibold">Ajouter une catégorie</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Une catégorie regroupe des plats sur la carte publique. Elle apparaît immédiatement,
          vide.
        </p>
        <CategoryCreateForm isPending={isPending} onRun={run} />
      </div>

      <ActionMessage result={message} />
    </div>
  );
}

function matchesCategory(category: MenuCategoryRow, query: string): boolean {
  return query === "" || category.nameFr.toLowerCase().includes(query);
}

function filterItems(items: MenuItemRow[], query: string): MenuItemRow[] {
  if (query === "") {
    return items;
  }
  return items.filter(
    (item) =>
      item.nameFr.toLowerCase().includes(query) ||
      (item.descriptionFr?.toLowerCase().includes(query) ?? false),
  );
}

/**
 * Moves one entry and returns a new array.
 *
 * A new array rather than an in-place mutation, because React compares state by identity: an
 * in-place `splice` would leave the arrows looking like they did nothing.
 */
function move<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  if (index < 0) {
    return [...list];
  }
  const target = index + direction;
  if (target < 0 || target >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

function CategorySection({
  category,
  items,
  categories,
  isFirst,
  isLast,
  isPending,
  onMessage,
  onRun,
  onMove,
  onItemsMove,
}: {
  category: CategoryWithItems;
  items: MenuItemRow[];
  categories: MenuCategoryRow[];
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onMessage: (result: ActionResult | null) => void;
  onRun: (write: () => Promise<ActionResult>) => void;
  onMove: (direction: -1 | 1) => void;
  onItemsMove: (itemIds: string[]) => void;
}) {
  /*
   * The dish order is local to the section, and only the visible rows are in it.
   *
   * That is safe because a search never saves an order: `onItemsMove` is only reachable from
   * the arrows, and the arrows are hidden while a search is active. Sending a filtered list to
   * `reorderDishesAction` would be refused anyway — the repository insists on the complete set
   * — but refusing is a worse experience than not offering the control at all.
   */
  const [itemOrder, setItemOrder] = useState(() => items.map((item) => item.id));

  const isFiltered = items.length !== category.items.length;
  const itemById = new Map(category.items.map((item) => [item.id, item]));
  const orderedItems = isFiltered
    ? items
    : itemOrder
        .map((id) => itemById.get(id))
        .filter((item): item is MenuItemRow => item !== undefined);

  function saveOrder(next: string[]) {
    setItemOrder(next);
    onItemsMove(next);
  }

  return (
    <section
      className="mt-8 rounded-lg border border-line bg-sand/40 p-3"
      data-testid="category-section"
      data-category-id={category.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            {category.nameFr}{" "}
            {!category.isVisible ? (
              <span className="text-sm font-normal text-ink-soft">(masquée)</span>
            ) : null}
          </h2>
          <p className="text-xs text-ink-soft">{category.items.length} plat(s)</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending || (isFiltered ? false : isFirst)}
            onClick={() => onMove(-1)}
            data-testid="category-move-up"
            aria-label={`Monter la catégorie ${category.nameFr}`}
            className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={isPending || (isFiltered ? false : isLast)}
            onClick={() => onMove(1)}
            data-testid="category-move-down"
            aria-label={`Descendre la catégorie ${category.nameFr}`}
            className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
          >
            ↓
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CategoryNameForm
          category={category}
          isPending={isPending}
          onRun={onRun}
        />

        <div className="space-y-3">
          <ToggleField
            id={`category-visible-${category.id}`}
            label="Visible sur le site"
            hint="Décochez pour retirer la catégorie de la carte sans rien supprimer."
            checked={category.isVisible}
            disabled={isPending}
            onChange={(checked) =>
              onRun(() =>
                setCategoryVisibilityAction({
                  categoryId: category.id,
                  expectedVersion: category.version,
                  isVisible: checked,
                }),
              )
            }
          />

          {/*
            Deleting is offered only when the category is empty, and the server refuses
            otherwise. The button is disabled rather than hidden so the owner can see that
            removing a used category is not something this dashboard does.
          */}
          <CategoryDeleteForm category={category} isPending={isPending} onRun={onRun} />
        </div>
      </div>

      <div className="mt-4">
        {orderedItems.length === 0 ? (
          <p className="text-sm text-ink-soft" data-testid="category-empty">
            Aucun plat dans cette catégorie.
          </p>
        ) : (
          <ul className="space-y-3">
            {orderedItems.map((item, index) => (
              <DishRow
                key={item.id}
                item={item}
                categories={categories}
                isFirst={isFiltered ? false : index === 0}
                isLast={isFiltered ? false : index === orderedItems.length - 1}
                showArrows={!isFiltered}
                isPending={isPending}
                onMessage={onMessage}
                onRun={onRun}
                onMove={(direction) => saveOrder(move(itemOrder, itemOrder.indexOf(item.id), direction))}
              />
            ))}
          </ul>
        )}
      </div>

      {!isFiltered ? (
        <div className="mt-4 border-t border-line pt-4">
          <DishCreateForm categoryId={category.id} isPending={isPending} onRun={onRun} />
        </div>
      ) : null}
    </section>
  );
}

function CategoryNameForm({
  category,
  isPending,
  onRun,
}: {
  category: MenuCategoryRow;
  isPending: boolean;
  onRun: (write: () => Promise<ActionResult>) => void;
}) {
  const [name, setName] = useState(category.nameFr);

  return (
    <form
      data-testid={`category-name-form-${category.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        onRun(() =>
          renameCategoryAction({
            categoryId: category.id,
            expectedVersion: category.version,
            nameFr: name,
          }),
        );
      }}
    >
      <Field label="Nom de la catégorie" htmlFor={`category-name-${category.id}`}>
        <input
          id={`category-name-${category.id}`}
          value={name}
          required
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="mt-2">
        <SubmitButton pending={isPending} testId={`category-rename-${category.id}`}>
          Renommer
        </SubmitButton>
      </div>
    </form>
  );
}

function CategoryDeleteForm({
  category,
  isPending,
  onRun,
}: {
  category: CategoryWithItems;
  isPending: boolean;
  onRun: (write: () => Promise<ActionResult>) => void;
}) {
  const isEmpty = category.items.length === 0;

  return (
    <form
      data-testid={`category-delete-form-${category.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        /*
         * Asks before removing something with no undo. The browser's dialog is used for the
         * same reason as everywhere else here: it is operable with a keyboard and a screen
         * reader with no focus management of our own.
         */
        if (!window.confirm(`Supprimer la catégorie « ${category.nameFr} » ?`)) {
          return;
        }
        onRun(() =>
          deleteCategoryAction({ categoryId: category.id, expectedVersion: category.version }),
        );
      }}
    >
      <p className="text-xs text-ink-soft">
        {isEmpty
          ? "Cette catégorie est vide : elle peut être supprimée."
          : "Une catégorie qui contient des plats ne peut pas être supprimée. Masquez-la, ou retirez les plats."}
      </p>
      <div className="mt-2">
        <button
          type="submit"
          disabled={isPending || !isEmpty}
          data-testid={`category-delete-${category.id}`}
          className="rounded border border-danger px-3 py-2 text-sm font-semibold text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Supprimer la catégorie
        </button>
      </div>
    </form>
  );
}

function CategoryCreateForm({
  isPending,
  onRun,
}: {
  isPending: boolean;
  onRun: (write: () => Promise<ActionResult>) => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      className="mt-3 max-w-md space-y-3"
      data-testid="category-create-form"
      onSubmit={(event) => {
        event.preventDefault();
        onRun(async () => {
          const result = await createCategoryAction({ nameFr: name });
          if (result.ok) {
            setName("");
          }
          return result;
        });
      }}
    >
      <Field label="Nom" htmlFor="new-category-name" hint="Les accents sont autorisés.">
        <input
          id="new-category-name"
          value={name}
          required
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
        />
      </Field>
      <SubmitButton pending={isPending} testId="category-create">
        Créer la catégorie
      </SubmitButton>
    </form>
  );
}

function DishRow({
  item,
  categories,
  isFirst,
  isLast,
  showArrows,
  isPending,
  onMessage,
  onRun,
  onMove,
}: {
  item: MenuItemRow;
  categories: MenuCategoryRow[];
  isFirst: boolean;
  isLast: boolean;
  showArrows: boolean;
  isPending: boolean;
  onMessage: (result: ActionResult | null) => void;
  onRun: (write: () => Promise<ActionResult>) => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <li
      className="rounded border border-line bg-white/60 p-3"
      data-testid="dish-row"
      data-dish-id={item.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">
            {item.nameFr}{" "}
            {!item.isVisible ? (
              <span className="text-sm font-normal text-ink-soft">(masqué)</span>
            ) : null}
          </h3>
          <p className="text-sm text-ink-soft" data-testid="dish-current-price">
            {formatPrice(item.priceDa)}
          </p>
        </div>

        {showArrows ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || isFirst}
              onClick={() => onMove(-1)}
              data-testid="dish-move-up"
              aria-label={`Monter le plat ${item.nameFr}`}
              className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={isPending || isLast}
              onClick={() => onMove(1)}
              data-testid="dish-move-down"
              aria-label={`Descendre le plat ${item.nameFr}`}
              className="rounded border border-line px-2 py-1 text-sm disabled:opacity-40"
            >
              ↓
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <DishDetailsForm item={item} categories={categories} isPending={isPending} onRun={onRun} />

        <div className="space-y-3">
          <ToggleField
            id={`dish-visible-${item.id}`}
            label="Visible sur la carte"
            hint="Décochez pour retirer le plat du site sans le supprimer."
            checked={item.isVisible}
            disabled={isPending}
            onChange={(checked) =>
              onRun(() =>
                setDishVisibilityAction({
                  menuItemId: item.id,
                  expectedVersion: item.version,
                  isVisible: checked,
                }),
              )
            }
          />
          <DishImageControls item={item} onMessage={onMessage} />
        </div>
      </div>
    </li>
  );
}

/**
 * A dish's name, description, price, category and species illustration.
 *
 * The species picker is a real `<select>` of the illustrations that exist, because that list
 * comes from `fish-images.ts` and an owner choosing "un poisson" has to choose which one. The
 * empty option is worded as a decision rather than as an absence, because a dish with no
 * illustration is a legitimate choice.
 */
function DishDetailsForm({
  item,
  categories,
  isPending,
  onRun,
}: {
  item: MenuItemRow;
  categories: MenuCategoryRow[];
  isPending: boolean;
  onRun: (write: () => Promise<ActionResult>) => void;
}) {
  const [draft, setDraft] = useState({
    nameFr: item.nameFr,
    descriptionFr: item.descriptionFr ?? "",
    priceDa: String(item.priceDa),
    categoryId: item.categoryId,
    fishReferenceSlug: item.fishReferenceSlug ?? "",
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onRun(() =>
      saveDishAction({
        menuItemId: item.id,
        expectedVersion: item.version,
        nameFr: draft.nameFr,
        descriptionFr: draft.descriptionFr,
        /*
         * `Number`, not `parseInt`: a dish has no centimes, and `parseInt("12.50")` would
         * silently truncate. `NaN` is passed through so the server's schema stays the single
         * source of truth for what a price may be.
         */
        priceDa: Number(draft.priceDa.trim()),
        categoryId: draft.categoryId,
        fishReferenceSlug: draft.fishReferenceSlug === "" ? null : draft.fishReferenceSlug,
      }),
    );
  }

  return (
    <form
      className="space-y-3"
      data-testid={`dish-form-${item.id}`}
      onSubmit={submit}
    >
      <Field label="Nom du plat" htmlFor={`dish-name-${item.id}`}>
        <input
          id={`dish-name-${item.id}`}
          name="nameFr"
          value={draft.nameFr}
          required
          maxLength={120}
          onChange={(event) => setDraft((d) => ({ ...d, nameFr: event.target.value }))}
          className={inputClass}
        />
      </Field>

      <Field
        label="Description"
        htmlFor={`dish-description-${item.id}`}
        hint="Facultatif. Laissez vide pour n'afficher aucune description."
      >
        <textarea
          id={`dish-description-${item.id}`}
          name="descriptionFr"
          rows={3}
          maxLength={600}
          value={draft.descriptionFr}
          onChange={(event) => setDraft((d) => ({ ...d, descriptionFr: event.target.value }))}
          className={textareaClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prix (DA)" htmlFor={`dish-price-${item.id}`}>
          <input
            id={`dish-price-${item.id}`}
            name="priceDa"
            type="text"
            inputMode="numeric"
            required
            value={draft.priceDa}
            onChange={(event) => setDraft((d) => ({ ...d, priceDa: event.target.value }))}
            className={inputClass}
          />
        </Field>

        <Field label="Catégorie" htmlFor={`dish-category-${item.id}`}>
          <select
            id={`dish-category-${item.id}`}
            name="categoryId"
            value={draft.categoryId}
            onChange={(event) => setDraft((d) => ({ ...d, categoryId: event.target.value }))}
            className={inputClass}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameFr}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Illustration de l'espèce"
        htmlFor={`dish-fish-${item.id}`}
        hint="Utilisée à la place d'une photo, sur la carte et sur la page des poissons."
      >
        <select
          id={`dish-fish-${item.id}`}
          name="fishReferenceSlug"
          value={draft.fishReferenceSlug}
          onChange={(event) => setDraft((d) => ({ ...d, fishReferenceSlug: event.target.value }))}
          className={inputClass}
        >
          <option value="">Aucune illustration</option>
          {FISH_REFERENCE_ORDER.map((slug) => (
            <option key={slug} value={slug}>
              {getFishReferenceImage(slug)?.nameFr ?? slug}
            </option>
          ))}
        </select>
      </Field>

      <SubmitButton pending={isPending} testId={`dish-save-${item.id}`}>
        Enregistrer
      </SubmitButton>
    </form>
  );
}

function DishCreateForm({
  categoryId,
  isPending,
  onRun,
}: {
  categoryId: string;
  isPending: boolean;
  onRun: (write: () => Promise<ActionResult>) => void;
}) {
  const [draft, setDraft] = useState({
    nameFr: "",
    descriptionFr: "",
    priceDa: "",
    fishReferenceSlug: "",
  });

  return (
    <form
      className="max-w-md space-y-3"
      data-testid={`dish-create-form-${categoryId}`}
      onSubmit={(event) => {
        event.preventDefault();
        onRun(async () => {
          const result = await createDishAction({
            categoryId,
            nameFr: draft.nameFr,
            descriptionFr: draft.descriptionFr,
            priceDa: Number(draft.priceDa.trim()),
            fishReferenceSlug: draft.fishReferenceSlug === "" ? null : draft.fishReferenceSlug,
          });
          if (result.ok) {
            // Cleared on success only: a rejected save keeps what was typed.
            setDraft({ nameFr: "", descriptionFr: "", priceDa: "", fishReferenceSlug: "" });
          }
          return result;
        });
      }}
    >
      <h3 className="text-sm font-semibold">Ajouter un plat</h3>

      <Field label="Nom du plat" htmlFor={`new-dish-name-${categoryId}`}>
        <input
          id={`new-dish-name-${categoryId}`}
          value={draft.nameFr}
          required
          maxLength={120}
          onChange={(event) => setDraft((d) => ({ ...d, nameFr: event.target.value }))}
          className={inputClass}
        />
      </Field>

      <Field label="Description" htmlFor={`new-dish-description-${categoryId}`} hint="Facultatif.">
        <input
          id={`new-dish-description-${categoryId}`}
          maxLength={600}
          value={draft.descriptionFr}
          onChange={(event) => setDraft((d) => ({ ...d, descriptionFr: event.target.value }))}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Prix (DA)" htmlFor={`new-dish-price-${categoryId}`}>
          <input
            id={`new-dish-price-${categoryId}`}
            type="text"
            inputMode="numeric"
            required
            value={draft.priceDa}
            onChange={(event) => setDraft((d) => ({ ...d, priceDa: event.target.value }))}
            className={inputClass}
          />
        </Field>

        <Field label="Illustration de l'espèce" htmlFor={`new-dish-fish-${categoryId}`} hint="Facultatif.">
          <select
            id={`new-dish-fish-${categoryId}`}
            value={draft.fishReferenceSlug}
            onChange={(event) => setDraft((d) => ({ ...d, fishReferenceSlug: event.target.value }))}
            className={inputClass}
          >
            <option value="">Aucune illustration</option>
            {FISH_REFERENCE_ORDER.map((slug) => (
              <option key={slug} value={slug}>
                {getFishReferenceImage(slug)?.nameFr ?? slug}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <SubmitButton pending={isPending} testId={`dish-create-${categoryId}`}>
        Ajouter le plat
      </SubmitButton>
    </form>
  );
}