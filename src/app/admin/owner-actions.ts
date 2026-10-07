"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { getAuth } from "@/auth";
import { getDb } from "@/db";
import { getMediaProvider } from "@/db/media";
import { consumeRateLimit } from "@/db/repositories/admin";
import { getMenuItem, getSiteSettings } from "@/db/repositories/menu";
import {
  OwnerWriteFailedError,
  StaleEditError,
  countMenuItemsInCategory,
  createGalleryImageWithAudit,
  createMenuCategoryWithAudit,
  createMenuItemWithAudit,
  deleteEmptyMenuCategoryWithAudit,
  deleteGalleryImageWithAudit,
  ensureBundledGalleryRows,
  getMenuCategory,
  isCategorySlugTaken,
  renameMenuCategoryWithAudit,
  reorderBundledGalleryImagesWithAudit,
  reorderGalleryImagesWithAudit,
  reorderMenuCategoriesWithAudit,
  reorderMenuItemsWithAudit,
  setMenuCategoryVisibilityWithAudit,
  setMenuItemVisibilityWithAudit,
  updateBundledGalleryImageWithAudit,
  updateGalleryImageWithAudit,
  updateMenuItemDetailsWithAudit,
  updateSiteSettingsWithAudit,
} from "@/db/repositories/owner";
import { ADMIN_RATE_LIMITS, NotOwnerError } from "@/lib/admin-access";
import type { ActionResult } from "@/lib/action-result";
import { requireOwnerOrThrow } from "@/lib/authz";
import { buildGalleryKey, validateImageUpload } from "@/lib/images";
import type { MediaAssetRef, MediaProvider } from "@/lib/media-provider";
import {
  changePasswordInputSchema,
  createCategoryInputSchema,
  createMenuItemInputSchema,
  deleteCategoryInputSchema,
  deleteGalleryImageInputSchema,
  renameCategoryInputSchema,
  reorderBundledGalleryInputSchema,
  reorderCategoriesInputSchema,
  reorderGalleryImagesInputSchema,
  reorderMenuItemsInputSchema,
  setCategoryVisibilityInputSchema,
  setMenuItemVisibilityInputSchema,
  siteSettingsInputSchema,
  updateBundledImageInputSchema,
  updateGalleryImageInputSchema,
  updateMenuItemDetailsInputSchema,
  uploadGalleryImageInputSchema,
  type SiteSettingsInput,
} from "@/lib/validation";

/**
 * Phase 3 owner writes: the menu, the gallery, the settings and the account.
 *
 * Every action runs the same four steps in the same order, and the order is the security
 * property rather than a matter of style:
 *
 *   1. authorize  an anonymous or wrong-role caller stops here, before any input is read
 *   2. rate limit  before parsing, so a flood costs no database work and no media-store traffic
 *   3. validate    before any write, and before the media store is touched
 *   4. write       the store first, then D1, then cleanup, in the order that cannot strand an object
 *
 * `guard` owns the first three. Repeating them by hand across twenty actions is how one of
 * them eventually gets left out of a single action, and the action that forgot would be the one
 * that accepts anything.
 *
 * Nothing here trusts the client beyond what Zod has checked. The `expectedVersion` a form
 * sends decides whether an edit is allowed to land, never *what* it writes.
 */

/** Steps 4 for most writes: run the repository call and translate its refusals. */
async function guard<Schema extends z.ZodType>(
  rateLimitKey: keyof typeof ADMIN_RATE_LIMITS & string,
  schema: Schema,
  rawInput: unknown,
): Promise<{ ok: true; ownerId: string; data: z.output<Schema> } | { ok: false; result: ActionResult }> {
  let owner;
  try {
    owner = await requireOwnerOrThrow();
  } catch (error) {
    if (error instanceof NotOwnerError) {
      return { ok: false, result: failure(error.message) };
    }
    throw error;
  }

  const limit = await consumeRateLimit(getDb(), owner.id, ADMIN_RATE_LIMITS[rateLimitKey]!);
  if (!limit.allowed) {
    return { ok: false, result: failure("Trop de tentatives. Patientez quelques instants avant de réessayer.") };
  }

  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, result: failure(parsed.error.issues[0]?.message ?? "Données invalides.") };
  }

  return { ok: true, ownerId: owner.id, data: parsed.data };
}

function failure(message: string, extra: Partial<ActionResult> = {}): ActionResult {
  return { ok: false, message, ...extra };
}

/**
 * Best-effort delete for the flows that treat "the object is already gone" as
 * success. A `not-performed` outcome is the legacy R2 shim reporting that no
 * binding exists to act on: log it so the operator knows an orphan could not be
 * cleaned up, but do not fail the request.
 */
async function deleteMediaAsset(provider: MediaProvider, ref: MediaAssetRef): Promise<void> {
  const result = await provider.delete(ref);
  if (result.status === "not-performed") {
    console.error(
      `Media delete not performed: key=${ref.key} provider=${ref.provider} reason=${result.reason}`,
    );
  }
}

/**
 * Runs a repository write and turns its two expected refusals into French.
 *
 * `StaleEditError` is an outcome the owner can do something about, so it is reported rather
 * than thrown and marked `stale`, which is what tells the dashboard to reload instead of
 * keeping the form open. `OwnerWriteFailedError` is unexpected enough to log with detail while
 * still telling the owner only what they can act on. Anything else propagates: a real bug
 * should surface as a 500 rather than as a tidy sentence claiming something the code does not
 * know.
 */
async function ownerWrite(write: () => Promise<void>): Promise<ActionResult | null> {
  try {
    await write();
    return null;
  } catch (error) {
    if (error instanceof StaleEditError) {
      return failure(error.message, { stale: true });
    }
    if (error instanceof OwnerWriteFailedError) {
      console.error("Owner write rejected", error);
      return failure(
        "La modification n'a pas pu être appliquée. Vérifiez que l'élément existe encore, puis réessayez.",
      );
    }
    throw error;
  }
}

/**
 * Invalidates every page that reads owner-editable content.
 *
 * All of these pages are dynamic, so a server render is never cached and the next request
 * already sees the new value. The calls are still made: the client-side router keeps its own
 * cache, and a stale `/menu` left in a tab is exactly what makes an owner think their save
 * failed.
 */
function revalidateOwnerContent(): void {
  for (const path of ["/", "/menu", "/galerie", "/a-propos", "/contact", "/admin", "/admin/menu"]) {
    revalidatePath(path);
  }
}

/* ------------------------------------------------------------------ dishes */

/**
 * Creates a dish.
 *
 * A dish is created visible, unfeatured and without a photograph, and the repository decides
 * that rather than the form: hidden would mean adding something invisible on purpose, and
 * featured would mean claiming the restaurant recommends a dish nobody chose.
 */
export async function createDishAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("createDish", createMenuItemInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryId, nameFr, descriptionFr, priceDa, fishReferenceSlug } = guardResult.data;

  const db = getDb();
  if (!(await getMenuCategory(db, categoryId))) {
    return failure("Catégorie introuvable.");
  }

  const created = await createMenuItemWithAudit(db, {
    categoryId,
    nameFr,
    descriptionFr,
    priceDa,
    fishReferenceSlug,
    audit: {
      actorId: guardResult.ownerId,
      action: "menu_item.created",
      entityType: "menu_item",
      metadata: { nameFr, priceDa, categoryId, fishReferenceSlug },
    },
  });

  revalidateOwnerContent();
  return { ok: true, message: `« ${nameFr} » a été ajouté à la carte.`, id: created.id };
}

/**
 * Saves a dish's name, description, price, category and species illustration.
 *
 * Everything travels together because the repository replaces every field in one statement: a
 * dish with a new price and the old name is a state the owner cannot have meant.
 */
export async function saveDishAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("updateDishDetails", updateMenuItemDetailsInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const input = guardResult.data;

  const db = getDb();
  const existing = await getMenuItem(db, input.menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }
  if (!(await getMenuCategory(db, input.categoryId))) {
    return failure("Catégorie introuvable.");
  }

  const unchanged =
    existing.nameFr === input.nameFr &&
    existing.descriptionFr === input.descriptionFr &&
    existing.priceDa === input.priceDa &&
    existing.fishReferenceSlug === input.fishReferenceSlug &&
    existing.categoryId === input.categoryId;
  if (unchanged) {
    return { ok: true, message: "Aucune modification à enregistrer." };
  }

  const problem = await ownerWrite(() =>
    updateMenuItemDetailsWithAudit(db, {
      menuItemId: input.menuItemId,
      expectedVersion: input.expectedVersion,
      categoryId: input.categoryId,
      nameFr: input.nameFr,
      descriptionFr: input.descriptionFr,
      priceDa: input.priceDa,
      fishReferenceSlug: input.fishReferenceSlug,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_item.details_updated",
        entityType: "menu_item",
        entityId: input.menuItemId,
        metadata: {
          nameFr: { from: existing.nameFr, to: input.nameFr },
          priceDa: { from: existing.priceDa, to: input.priceDa },
          descriptionChanged: existing.descriptionFr !== input.descriptionFr,
          fishReferenceSlug: { from: existing.fishReferenceSlug, to: input.fishReferenceSlug },
          categoryId: { from: existing.categoryId, to: input.categoryId },
        },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: `« ${input.nameFr} » a été enregistré.` };
}

/**
 * Shows or hides a dish.
 *
 * Hiding is how a dish leaves the public menu. Nothing is deleted, so an accidental hide is one
 * tap to undo and a dish that was on the menu yesterday is still in the database today.
 */
export async function setDishVisibilityAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("setDishVisibility", setMenuItemVisibilityInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { menuItemId, expectedVersion, isVisible } = guardResult.data;

  const db = getDb();
  const existing = await getMenuItem(db, menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }
  if (existing.isVisible === isVisible) {
    return { ok: true, message: isVisible ? "Ce plat est déjà visible." : "Ce plat est déjà masqué." };
  }

  const problem = await ownerWrite(() =>
    setMenuItemVisibilityWithAudit(db, {
      menuItemId,
      expectedVersion,
      isVisible,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_item.visibility_updated",
        entityType: "menu_item",
        entityId: menuItemId,
        metadata: { from: existing.isVisible, to: isVisible, nameFr: existing.nameFr },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return {
    ok: true,
    message: isVisible ? `« ${existing.nameFr} » est visible sur le site.` : `« ${existing.nameFr} » est masqué.`,
    isVisible,
  };
}

/**
 * Saves the order of the dishes in one category.
 *
 * The form sends the whole order rather than "move this one up": dragging is awkward on a
 * phone, and a whole-order write lands in one statement that cannot half-succeed. See
 * `reorderMenuItemsWithAudit`.
 */
export async function reorderDishesAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("reorderDishes", reorderMenuItemsInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryId, itemIds } = guardResult.data;

  const db = getDb();
  const category = await getMenuCategory(db, categoryId);
  if (!category) {
    return failure("Catégorie introuvable.");
  }

  const problem = await ownerWrite(() =>
    reorderMenuItemsWithAudit(db, {
      categoryId,
      itemIds,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_item.reordered",
        entityType: "menu_category",
        entityId: categoryId,
        metadata: { nameFr: category.nameFr, count: itemIds.length, order: itemIds },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "L'ordre des plats a été enregistré." };
}

/* ------------------------------------------------------------------ categories */

/**
 * Turns a category name into a URL slug.
 *
 * Derived rather than asked for, because a slug is a URL concern the owner does not think in,
 * and asking for one adds a field they would have to invent. Accents are folded the French way,
 * so `Crustacés` becomes `crustaces` rather than something a URL has to escape.
 */
function slugify(nameFr: string): string {
  return (
    nameFr
      .normalize("NFD")
      // NFD splits `é` into `e` plus a combining accent; the marks are what gets removed here.
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .slice(0, 60) || "categorie"
  );
}

/**
 * A slug for this name that no other category is using.
 *
 * Two categories can perfectly well share a first word — "Poissons" and "Poissons panés" — so a
 * collision gets a numeric suffix rather than an error. The alternative, refusing the save, would
 * ask the owner to invent a URL to satisfy a detail of how the site stores categories.
 */
async function uniqueCategorySlug(nameFr: string, exceptId?: string): Promise<string> {
  const db = getDb();
  const base = slugify(nameFr);

  if (!(await isCategorySlugTaken(db, base, exceptId))) {
    return base;
  }
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!(await isCategorySlugTaken(db, candidate, exceptId))) {
      return candidate;
    }
  }
  /* Unreachable in practice: a hundred categories whose slugs all start with the same word. */
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function createCategoryAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("createCategory", createCategoryInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { nameFr } = guardResult.data;

  const db = getDb();
  const slug = await uniqueCategorySlug(nameFr);

  const created = await createMenuCategoryWithAudit(db, {
    nameFr,
    slug,
    audit: {
      actorId: guardResult.ownerId,
      action: "menu_category.created",
      entityType: "menu_category",
      metadata: { nameFr, slug },
    },
  });

  revalidateOwnerContent();
  return { ok: true, message: `Catégorie « ${nameFr} » créée.`, id: created.id };
}

export async function renameCategoryAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("renameCategory", renameCategoryInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryId, expectedVersion, nameFr } = guardResult.data;

  const db = getDb();
  const existing = await getMenuCategory(db, categoryId);
  if (!existing) {
    return failure("Catégorie introuvable.");
  }
  if (existing.nameFr === nameFr) {
    return { ok: true, message: "Aucune modification à enregistrer." };
  }

  /*
   * The slug follows the name so the two cannot drift apart, but only while the category is
   * empty. A category with dishes may already be linked to from somewhere, and moving its
   * address is not a decision this form should make on the owner's behalf.
   */
  const itemCount = await countMenuItemsInCategory(db, categoryId);
  const slug = itemCount === 0 ? await uniqueCategorySlug(nameFr, categoryId) : existing.slug;

  const problem = await ownerWrite(() =>
    renameMenuCategoryWithAudit(db, {
      categoryId,
      expectedVersion,
      nameFr,
      slug,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_category.renamed",
        entityType: "menu_category",
        entityId: categoryId,
        metadata: { from: existing.nameFr, to: nameFr, slugChanged: slug !== existing.slug },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return {
    ok: true,
    message:
      itemCount === 0
        ? `Catégorie renommée en « ${nameFr} ».`
        : `Catégorie renommée en « ${nameFr} ». Son adresse est restée la même car elle contient des plats.`,
  };
}

export async function setCategoryVisibilityAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("setCategoryVisibility", setCategoryVisibilityInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryId, expectedVersion, isVisible } = guardResult.data;

  const db = getDb();
  const existing = await getMenuCategory(db, categoryId);
  if (!existing) {
    return failure("Catégorie introuvable.");
  }
  if (existing.isVisible === isVisible) {
    return { ok: true, message: isVisible ? "Cette catégorie est déjà visible." : "Cette catégorie est déjà masquée." };
  }

  const problem = await ownerWrite(() =>
    setMenuCategoryVisibilityWithAudit(db, {
      categoryId,
      expectedVersion,
      isVisible,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_category.visibility_updated",
        entityType: "menu_category",
        entityId: categoryId,
        metadata: { from: existing.isVisible, to: isVisible, nameFr: existing.nameFr },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return {
    ok: true,
    message: isVisible ? "Catégorie visible sur le site." : "Catégorie masquée.",
    isVisible,
  };
}

/**
 * Removes a category that holds no dishes.
 *
 * A category with dishes is refused here with a sentence rather than a cryptic failure: the
 * owner hides it, or removes the dishes first. Nothing cascades, so a mistake cannot take a
 * whole section of the menu with it.
 */
export async function deleteCategoryAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("deleteCategory", deleteCategoryInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryId, expectedVersion } = guardResult.data;

  const db = getDb();
  const existing = await getMenuCategory(db, categoryId);
  if (!existing) {
    return failure("Catégorie introuvable.");
  }

  const itemCount = await countMenuItemsInCategory(db, categoryId);
  if (itemCount > 0) {
    return failure(
      `Cette catégorie contient encore ${itemCount} plat(s). Masquez-la, ou retirez les plats, avant de la supprimer.`,
    );
  }

  const problem = await ownerWrite(() =>
    deleteEmptyMenuCategoryWithAudit(db, {
      categoryId,
      expectedVersion,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_category.deleted",
        entityType: "menu_category",
        entityId: categoryId,
        metadata: { nameFr: existing.nameFr, slug: existing.slug },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: `Catégorie « ${existing.nameFr} » supprimée.` };
}

export async function reorderCategoriesAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("reorderCategories", reorderCategoriesInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { categoryIds } = guardResult.data;

  const problem = await ownerWrite(() =>
    reorderMenuCategoriesWithAudit(getDb(), {
      categoryIds,
      audit: {
        actorId: guardResult.ownerId,
        action: "menu_category.reordered",
        entityType: "menu_category",
        entityId: "all",
        metadata: { count: categoryIds.length, order: categoryIds },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "L'ordre des catégories a été enregistré." };
}

/* ------------------------------------------------------------------ settings */

/**
 * Saves the restaurant settings.
 *
 * Every field is written every time, including the ones left blank. A patch that only touched
 * what changed could never clear a field, and clearing one has to be possible: the address is
 * deliberately empty until it is confirmed, and a phone number the owner stops publishing has to
 * be removable.
 */
export async function saveSettingsAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("updateSettings", siteSettingsInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const input = guardResult.data;

  const db = getDb();
  const existing = await getSiteSettings(db);
  if (!existing) {
    return failure(
      "Les informations du restaurant ne sont pas encore enregistrées. Lancez d'abord la migration de la base de données.",
    );
  }

  const problem = await ownerWrite(() =>
    updateSiteSettingsWithAudit(db, {
      expectedVersion: input.expectedVersion,
      settings: settingsFromInput(input),
      audit: {
        actorId: guardResult.ownerId,
        action: "site_settings.updated",
        entityType: "site_settings",
        entityId: "singleton",
        metadata: { changedFields: changedFieldNames(input, existing) },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "Les informations du restaurant ont été enregistrées." };
}

/**
 * Drops the guard field out of the parsed input.
 *
 * The settings row is written as one object and `expectedVersion` is not a column. Handing the
 * repository the parsed object as-is would pass it a key it does not know, which Drizzle would
 * reject at runtime rather than at compile time.
 */
function settingsFromInput(input: SiteSettingsInput) {
  const { expectedVersion: _expectedVersion, ...settings } = input;
  return settings;
}

/**
 * The names of the fields this save actually changed.
 *
 * Recorded so the history answers "what did I change?" without anyone diffing two JSON blobs.
 * Only the names: the values are already on the row, and a log that repeats every field on
 * every save is a log nobody reads.
 */
function changedFieldNames(
  input: SiteSettingsInput,
  existing: Record<string, unknown>,
): string[] {
  const settings = settingsFromInput(input) as Record<string, unknown>;
  return Object.entries(settings)
    .filter(([field, value]) => existing[field] !== value)
    .map(([field]) => field);
}

/* ------------------------------------------------------------------ gallery */

/**
 * Saves a bundled photograph's description, caption and visibility.
 *
 * The rows are created first if this photograph has never been edited: production applies
 * migrations and never runs the local seed, so on a freshly deployed database no bundled
 * photograph has a row yet.
 *
 * An `expectedVersion` of 0 is still refused as stale. It means the page in front of the owner
 * showed a photograph with no row, and the row that now exists may have been edited by somebody
 * else since — asking them to reload is honest, whereas quietly substituting the current version
 * would defeat the guard for exactly the photograph most likely to have one. The editor creates
 * the rows when it loads, so 0 only reaches here from a tab that predates that.
 */
export async function saveBundledImageAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("updateBundledImage", updateBundledImageInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { slug, expectedVersion, altTextFr, captionFr, isVisible } = guardResult.data;

  const db = getDb();
  await ensureBundledGalleryRows(db);

  const problem = await ownerWrite(() =>
    updateBundledGalleryImageWithAudit(db, {
      slug,
      expectedVersion,
      patch: { altTextFr, captionFr, isVisible },
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.bundled_updated",
        entityType: "bundled_gallery_image",
        entityId: slug,
        metadata: { altTextFr, captionFr, isVisible },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return {
    ok: true,
    message: isVisible ? "Photographie enregistrée." : "Photographie enregistrée et masquée.",
    isVisible,
  };
}

export async function reorderBundledGalleryAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("reorderBundledGallery", reorderBundledGalleryInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }

  const db = getDb();
  await ensureBundledGalleryRows(db);

  const problem = await ownerWrite(() =>
    reorderBundledGalleryImagesWithAudit(db, {
      slugs: guardResult.data.slugs,
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.bundled_reordered",
        entityType: "bundled_gallery",
        entityId: "all",
        metadata: { count: guardResult.data.slugs.length, order: guardResult.data.slugs },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "L'ordre des photographies a été enregistré." };
}

export async function saveGalleryImageAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("updateGalleryImage", updateGalleryImageInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { galleryImageId, expectedVersion, altTextFr, captionFr, isVisible } = guardResult.data;

  const problem = await ownerWrite(() =>
    updateGalleryImageWithAudit(getDb(), {
      galleryImageId,
      expectedVersion,
      patch: { altTextFr, captionFr, isVisible },
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.uploaded_updated",
        entityType: "gallery_image",
        entityId: galleryImageId,
        metadata: { altTextFr, captionFr, isVisible },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "Photographie enregistrée.", isVisible };
}

/**
 * Uploads a gallery photograph.
 *
 * The media store first, then the database. If the database write fails, the asset it just
 * accepted is deleted, so a failed upload leaves nothing behind: an asset no row points at is
 * invisible to the site *and* to the owner, which is the worst kind of leftover.
 */
export async function uploadGalleryImageAction(formData: FormData): Promise<ActionResult> {
  const guardResult = await guard("uploadGalleryImage", uploadGalleryImageInputSchema, {
    altTextFr: formData.get("altTextFr"),
    captionFr: formData.get("captionFr"),
  });
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { altTextFr, captionFr } = guardResult.data;

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return failure("Aucune image fournie.");
  }

  const declaredBytes = new Uint8Array(await file.arrayBuffer());
  const validated = validateImageUpload(file.type, declaredBytes);
  if (!validated.ok) {
    return failure(validated.reason);
  }

  const db = getDb();
  const provider = getMediaProvider();
  const newKey = buildGalleryKey(validated.extension);

  let uploaded: MediaAssetRef;
  try {
    uploaded = await provider.upload({
      key: newKey,
      bytes: new Uint8Array(validated.bytes),
      contentType: validated.mimeType,
      width: validated.dimensions.width,
      height: validated.dimensions.height,
    });
  } catch (error) {
    console.error("Gallery upload to the media store failed", error);
    return failure("La photographie n'a pas pu être envoyée. Réessayez.");
  }

  try {
    await createGalleryImageWithAudit(db, {
      imageKey: uploaded.key,
      provider: uploaded.provider,
      providerAssetId: uploaded.assetId,
      altTextFr,
      captionFr,
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.uploaded_created",
        entityType: "gallery_image",
        metadata: {
          imageKey: uploaded.key,
          provider: uploaded.provider,
          altTextFr,
          captionFr,
          bytes: declaredBytes.byteLength,
          width: validated.dimensions.width,
          height: validated.dimensions.height,
          mimeType: validated.mimeType,
        },
      },
    });
  } catch (error) {
    /*
     * The row was not written, so nothing points at the asset. Remove it rather than leaving an
     * orphan in the store: it would cost storage and there would be no screen anywhere in the
     * dashboard that could show it to the owner.
     */
    await deleteMediaAsset(provider, uploaded).catch((cleanupError: unknown) => {
      console.error(`Gallery upload orphaned: key=${uploaded.key} provider=${uploaded.provider}`, cleanupError);
    });
    console.error("Gallery upload could not be recorded", error);
    return failure("La photographie a été envoyée mais n'a pas pu être enregistrée.");
  }

  revalidateOwnerContent();
  return { ok: true, message: "Photographie ajoutée à la galerie." };
}

/**
 * Removes an uploaded photograph for good.
 *
 * The database stops referring to it first, then the asset is deleted. The reverse order would
 * leave a published page pointing at an asset that no longer exists, which is the one outcome
 * worse than a leftover file. If the delete fails afterwards the row is already gone, so the
 * asset is logged as an orphan to remove by hand rather than restored: putting the row back
 * would resurrect a photograph the owner deliberately removed.
 */
export async function deleteGalleryImageAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("deleteGalleryImage", deleteGalleryImageInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { galleryImageId, expectedVersion } = guardResult.data;

  const db = getDb();
  const provider = getMediaProvider();

  let removed: MediaAssetRef | null;
  try {
    removed = await deleteGalleryImageWithAudit(db, {
      galleryImageId,
      expectedVersion,
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.uploaded_deleted",
        entityType: "gallery_image",
        entityId: galleryImageId,
        metadata: { imageKeyRemoved: true },
      },
    });
  } catch (error) {
    if (error instanceof StaleEditError) {
      return failure(error.message, { stale: true });
    }
    if (error instanceof OwnerWriteFailedError) {
      console.error("Gallery image delete refused", error);
      return failure("La photographie n'a pas pu être supprimée.");
    }
    throw error;
  }

  if (!removed) {
    return failure("Photographie introuvable.");
  }

  await deleteMediaAsset(provider, removed).catch((error: unknown) => {
    console.error(
      `Gallery image orphaned: key=${removed.key} provider=${removed.provider}. No database row ` +
        "references it any more; delete it by hand.",
      error,
    );
  });

  revalidateOwnerContent();
  return { ok: true, message: "Photographie supprimée." };
}

export async function reorderGalleryAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("reorderGallery", reorderGalleryImagesInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }

  const problem = await ownerWrite(() =>
    reorderGalleryImagesWithAudit(getDb(), {
      galleryImageIds: guardResult.data.galleryImageIds,
      audit: {
        actorId: guardResult.ownerId,
        action: "gallery.uploaded_reordered",
        entityType: "gallery_image",
        entityId: "all",
        metadata: { count: guardResult.data.galleryImageIds.length },
      },
    }),
  );
  if (problem) {
    return problem;
  }

  revalidateOwnerContent();
  return { ok: true, message: "L'ordre des photographies a été enregistré." };
}

/* ------------------------------------------------------------------ account */

/**
 * Changes the owner's password.
 *
 * Better Auth verifies the current one, which is what stops anyone who reached an unlocked
 * session from taking the account over. `revokeOtherSessions` is on, so a password change also
 * ends any session that is still open somewhere else — the point of changing a password is
 * usually that somebody else had it.
 *
 * The rate limit is deliberately the tightest in the dashboard, and there is no recovery route
 * to fall back on: `docs/SECURITY.md` records that email delivery is not configured, so this
 * form is the only way back into the dashboard. A locked-out owner cannot be helped from here,
 * and the alternative — a generous budget — would make guessing the current password
 * practical.
 */
export async function changePasswordAction(rawInput: unknown): Promise<ActionResult> {
  const guardResult = await guard("changePassword", changePasswordInputSchema, rawInput);
  if (!guardResult.ok) {
    return guardResult.result;
  }
  const { currentPassword, newPassword } = guardResult.data;

  if (currentPassword === newPassword) {
    return failure("Le nouveau mot de passe doit être différent de l'actuel.");
  }

  try {
    await getAuth().api.changePassword({
      body: { currentPassword, newPassword, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    /*
     * Better Auth's own error text is never shown: it is English, and it can name internals.
     * The two failures an owner can cause are "wrong current password" and "new password
     * rejected", and the rest is reported as a generic failure.
     */
    console.error("Password change refused", error);
    return failure(
      "Le mot de passe actuel est incorrect, ou le nouveau mot de passe a été refusé. Aucun mot de passe n'a été changé.",
    );
  }

  return { ok: true, message: "Mot de passe modifié. Les autres sessions ont été déconnectées." };
}

/**
 * Ends the owner's session.
 *
 * A server action rather than a client call so the session cookie is cleared by the same
 * origin that set it. The redirect is hard-coded rather than taken from a parameter: this
 * endpoint is reachable by any signed-in owner, and a redirect target chosen by the caller
 * would be an open redirect dressed up as a convenience.
 */
export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/admin/login");
}

/* ------------------------------------------------------------------ helpers */