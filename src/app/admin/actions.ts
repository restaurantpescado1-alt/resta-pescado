"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { getMediaBucket } from "@/db/media";
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
import { replaceImageSafely } from "@/lib/image-replace";
import { buildR2Key, validateImageUpload } from "@/lib/images";
import { updateFeaturedInputSchema, updatePriceInputSchema } from "@/lib/validation";

function failure(message: string): ActionResult {
  return { ok: false, message };
}

/**
 * Public entry points of the admin surface. Every function follows the same
 * order, and the order is the security property:
 *
 *   1. authorize  (anonymous or wrong role stops here)
 *   2. rate limit (before parsing, so a flood costs nothing)
 *   3. validate   (before any write)
 *   4. write      (R2 first, then D1, then cleanup)
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
  const media = getMediaBucket();

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

  const previousKey = existing.imageKey;
  const newKey = buildR2Key(validated.extension);

  // Upload, commit, then clean up, in that order. See `replaceImageSafely` for why
  // neither of the two deletes can happen any earlier than it does.
  await replaceImageSafely({
    newKey,
    previousKey,
    upload: async () => {
      await media.put(newKey, validated.bytes, {
        httpMetadata: {
          contentType: validated.mimeType,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    },
    commit: () =>
      updateMenuItemImageKeyWithAudit(db, {
        menuItemId,
        imageKey: newKey,
        audit: {
          actorId: owner.id,
          action: "menu_item.image_replaced",
          entityType: "menu_item",
          entityId: menuItemId,
          metadata: {
            from: previousKey,
            to: newKey,
            bytes: bytes.byteLength,
            width: validated.dimensions.width,
            height: validated.dimensions.height,
            mimeType: validated.mimeType,
            nameFr: existing.nameFr,
          },
        },
      }),
    remove: (key) => media.delete(key),
  });

  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/menu");

  return { ok: true, message: "Image mise à jour.", imageKey: newKey };
}
