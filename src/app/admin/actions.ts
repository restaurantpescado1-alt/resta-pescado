"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { getMediaProvider } from "@/db/media";
import { consumeRateLimit } from "@/db/repositories/admin";
import {
  getMenuItem,
  updateMenuItemFeaturedWithAudit,
  updateMenuItemImageKeyWithAudit,
  updateMenuItemPriceWithAudit,
} from "@/db/repositories/menu";
import { ADMIN_RATE_LIMITS, NotOwnerError } from "@/lib/admin-access";
import type { ActionResult } from "@/lib/action-result";
import { requireOwnerOrThrow } from "@/lib/authz";
import { removeImageSafely } from "@/lib/image-remove";
import { replaceImageSafely } from "@/lib/image-replace";
import { buildImageKey, validateImageUpload } from "@/lib/images";
import type { MediaAssetRef } from "@/lib/media-provider";
import { updateFeaturedInputSchema, updatePriceInputSchema } from "@/lib/validation";
import type { MediaProvider } from "@/lib/media-provider";

function failure(message: string): ActionResult {
  return { ok: false, message };
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

/** Builds the stored ref for a row that already points at an image. */
function imageRef(existing: { mediaProvider: "r2" | "imagekit"; imageKey: string | null; providerAssetId: string | null }): MediaAssetRef | null {
  return existing.imageKey
    ? { provider: existing.mediaProvider, key: existing.imageKey, assetId: existing.providerAssetId }
    : null;
}

/**
 * Public entry points of the admin surface. Every function follows the same
 * order, and the order is the security property:
 *
 *   1. authorize  (anonymous or wrong role stops here)
 *   2. rate limit (before parsing, so a flood costs nothing)
 *   3. validate   (before any write)
 *   4. write      (media store first, then D1, then cleanup)
 *   5. audit      (always, for success and for a write that failed midway)
 */

export async function updateDishPriceAction(
  rawInput: unknown,
): Promise<ActionResult> {
  let owner;
  try {
    owner = await requireOwnerOrThrow();
  } catch (error) {
    if (error instanceof NotOwnerError) {
      return failure(error.message);
    }
    throw error;
  }

  const db = getDb();

  const limit = await consumeRateLimit(db, owner.id, ADMIN_RATE_LIMITS.updateDishPrice!);
  if (!limit.allowed) {
    return failure("Trop de tentatives. Réessayez dans quelques instants.");
  }

  const parsed = updatePriceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Prix invalide.");
  }

  const { menuItemId, priceDa } = parsed.data;

  const existing = await getMenuItem(db, menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }

  if (existing.priceDa === priceDa) {
    return { ok: true, message: "Prix déjà à cette valeur.", priceDa };
  }

  // The change and its audit row are one atomic batch: a price is never visible
  // without its trail, and the trail never describes a change that did not happen.
  await updateMenuItemPriceWithAudit(db, {
    menuItemId,
    priceDa,
    audit: {
      actorId: owner.id,
      action: "menu_item.price_updated",
      entityType: "menu_item",
      entityId: menuItemId,
      metadata: { from: existing.priceDa, to: priceDa, nameFr: existing.nameFr },
    },
  });

  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/menu");

  return { ok: true, message: "Prix mis à jour.", priceDa };
}

/**
 * Records or withdraws the owner's recommendation for a dish.
 *
 * This is the only thing that puts a dish into the home page preview ahead of the
 * illustrated fish fallback. It changes nothing about how the card reads: the dish is
 * still never badged, so the preview stays neutral either way.
 */
export async function setDishFeaturedAction(rawInput: unknown): Promise<ActionResult> {
  let owner;
  try {
    owner = await requireOwnerOrThrow();
  } catch (error) {
    if (error instanceof NotOwnerError) {
      return failure(error.message);
    }
    throw error;
  }

  const db = getDb();

  const limit = await consumeRateLimit(db, owner.id, ADMIN_RATE_LIMITS.setDishFeatured!);
  if (!limit.allowed) {
    return failure("Trop de tentatives. Réessayez dans quelques instants.");
  }

  const parsed = updateFeaturedInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return failure(parsed.error.issues[0]?.message ?? "Sélection invalide.");
  }

  const { menuItemId, isFeatured } = parsed.data;

  const existing = await getMenuItem(db, menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }

  if (existing.isFeatured === isFeatured) {
    return {
      ok: true,
      message: isFeatured ? "Plat déjà mis en avant." : "Plat retiré de la mise en avant.",
      isFeatured,
    };
  }

  await updateMenuItemFeaturedWithAudit(db, {
    menuItemId,
    isFeatured,
    audit: {
      actorId: owner.id,
      action: "menu_item.featured_updated",
      entityType: "menu_item",
      entityId: menuItemId,
      metadata: { from: existing.isFeatured, to: isFeatured, nameFr: existing.nameFr },
    },
  });

  revalidatePath("/");
  revalidatePath("/admin/menu");

  return {
    ok: true,
    message: isFeatured ? "Plat mis en avant." : "Retiré de la mise en avant.",
    isFeatured,
  };
}

export async function removeDishImageAction(formData: FormData): Promise<ActionResult> {
  let owner;
  try {
    owner = await requireOwnerOrThrow();
  } catch (error) {
    if (error instanceof NotOwnerError) {
      return failure(error.message);
    }
    throw error;
  }

  const db = getDb();
  const provider = getMediaProvider();

  const limit = await consumeRateLimit(db, owner.id, ADMIN_RATE_LIMITS.removeDishImage!);
  if (!limit.allowed) {
    return failure("Trop de suppressions. Réessayez dans quelques instants.");
  }

  const menuItemId = formData.get("menuItemId");
  if (typeof menuItemId !== "string" || menuItemId.length === 0) {
    return failure("Identifiant de plat manquant.");
  }

  const existing = await getMenuItem(db, menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }

  const previous = imageRef(existing);
  const previousKey = previous?.key ?? null;

  /*
   * The bundled fish illustrations live in `public/` and are served by the Worker
   * directly, never from the media store. `menu_items.image_key` only ever holds stored
   * keys, but the guard is kept explicit anyway: deleting a key that happens to look like
   * a bundled path would turn a tidy-up into broken reference illustrations across the
   * whole site, and the cost of the check is one comparison.
   */
  if (previousKey && previousKey.startsWith("/")) {
    return failure("Cette image fait partie du site et ne peut pas être supprimée ici.");
  }

  // Commit first, then delete. See `removeImageSafely` for why the order is inverted
  // compared with replacement and what each failure costs.
  const outcome = await removeImageSafely({
    previous,
    commit: () =>
      updateMenuItemImageKeyWithAudit(db, {
        menuItemId,
        // `null` clears the reference and the provider columns together, and the batch
        // records the audit row with them, so the two cannot come apart.
        media: null,
        audit: {
          actorId: owner.id,
          action: "menu_item.image_removed",
          entityType: "menu_item",
          entityId: menuItemId,
          metadata: {
            removedKey: previousKey,
            nameFr: existing.nameFr,
            /*
             * Recorded so the audit explains what a visitor sees next: the dish falls
             * back to its species illustration if it has one, and to a text-only row
             * if it does not.
             */
            fallsBackTo: existing.fishReferenceSlug ?? "text-only",
          },
        },
      }),
    remove: (ref) => deleteMediaAsset(provider, ref),
    /*
     * The database already committed by this point, so restoring the old reference is
     * explicitly not an option: it would point a dish the owner deliberately cleared at
     * an object that failed to delete. The orphan is logged instead.
     */
    onOrphan: (ref, error) => {
      console.error(
        `Dish image orphaned: key=${ref.key} provider=${ref.provider} menuItemId=${menuItemId}. ` +
          "The database no longer references it. Delete it manually.",
        error,
      );
    },
  });

  if (outcome === "nothing-to-remove") {
    return { ok: true, message: "Ce plat n'a pas de photo à supprimer.", imageKey: null };
  }

  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/menu");

  return {
    ok: true,
    message: "Photo supprimée.",
    imageKey: null,
    fallback: existing.fishReferenceSlug ?? "text-only",
  };
}

/**
 * Replaces a dish photo.
 *
 * Upload, commit, then clean up, in that order. See `replaceImageSafely` for why
 * neither of the two deletes can happen any earlier than it does.
 */
export async function replaceDishImageAction(formData: FormData): Promise<ActionResult> {
  let owner;
  try {
    owner = await requireOwnerOrThrow();
  } catch (error) {
    if (error instanceof NotOwnerError) {
      return failure(error.message);
    }
    throw error;
  }

  const db = getDb();
  const provider = getMediaProvider();

  const limit = await consumeRateLimit(db, owner.id, ADMIN_RATE_LIMITS.replaceDishImage!);
  if (!limit.allowed) {
    return failure("Trop de téléversements. Réessayez dans quelques instants.");
  }

  const menuItemId = formData.get("menuItemId");
  if (typeof menuItemId !== "string" || menuItemId.length === 0) {
    return failure("Identifiant de plat manquant.");
  }

  const file = formData.get("image");
  if (!(file instanceof File)) {
    return failure("Aucune image fournie.");
  }

  const declaredType = file.type;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const validated = validateImageUpload(declaredType, bytes);
  if (!validated.ok) {
    return failure(validated.reason);
  }

  const existing = await getMenuItem(db, menuItemId);
  if (!existing) {
    return failure("Plat introuvable.");
  }

  const previous = imageRef(existing);
  const previousKey = previous?.key ?? null;
  const newKey = buildImageKey(validated.extension);

  // Upload, commit, then clean up, in that order. See `replaceImageSafely` for why
  // neither of the two deletes can happen any earlier than it does.
  await replaceImageSafely({
    newKey,
    previous,
    upload: () =>
      provider.upload({
        key: newKey,
        bytes,
        contentType: validated.mimeType,
        width: validated.dimensions.width,
        height: validated.dimensions.height,
      }),
    commit: (uploaded) =>
      updateMenuItemImageKeyWithAudit(db, {
        menuItemId,
        media: uploaded,
        audit: {
          actorId: owner.id,
          action: "menu_item.image_replaced",
          entityType: "menu_item",
          entityId: menuItemId,
          metadata: {
            from: previousKey,
            to: uploaded.key,
            provider: uploaded.provider,
            bytes: bytes.byteLength,
            width: validated.dimensions.width,
            height: validated.dimensions.height,
            mimeType: validated.mimeType,
            nameFr: existing.nameFr,
          },
        },
      }),
    remove: (ref) => deleteMediaAsset(provider, ref),
  });

  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/menu");

  return { ok: true, message: "Image mise à jour.", imageKey: newKey };
}
