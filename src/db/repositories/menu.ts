import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "..";
import type { MediaAssetRef } from "../../lib/media-provider";
import { expectExactlyOne, runAtomicBatch } from "../atomic";
import {
  auditLogs,
  galleryImages,
  menuCategories,
  menuItems,
  siteSettings,
  type AuditLogRow,
  type GalleryImageRow,
  type MenuCategoryRow,
  type MenuItemRow,
  type SiteSettingsRow,
} from "../schema";

export const SITE_SETTINGS_SINGLETON_ID = "singleton";

/**
 * `timestamp` columns are stored as whole Unix seconds, so a `Date` carrying
 * milliseconds would be truncated inconsistently. Truncating here keeps the
 * written value identical to what `unixepoch()` would have produced.
 */
export function toTimestamp(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 1000) * 1000);
}

export interface MenuView {
  categories: Array<MenuCategoryRow & { items: MenuItemRow[] }>;
}

/**
 * The public menu: visible categories, visible items, ordered by the sort columns
 * then by name so the order is stable even when two items share a sort value.
 */
export async function getPublicMenu(db: Database): Promise<MenuView> {
  const categoryRows = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.isVisible, true))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.nameFr));

  if (categoryRows.length === 0) {
    return { categories: [] };
  }

  const itemRows = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.isVisible, true))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.nameFr));

  const byCategory = new Map<string, MenuItemRow[]>();
  for (const item of itemRows) {
    const bucket = byCategory.get(item.categoryId);
    if (bucket) {
      bucket.push(item);
    } else {
      byCategory.set(item.categoryId, [item]);
    }
  }

  return {
    categories: categoryRows.map((category) => ({
      ...category,
      items: byCategory.get(category.id) ?? [],
    })),
  };
}

/** Every category and item regardless of visibility. Owner-only view. */
export async function getAdminMenu(db: Database): Promise<MenuView> {
  const categoryRows = await db
    .select()
    .from(menuCategories)
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.nameFr));

  const itemRows = await db.select().from(menuItems).orderBy(asc(menuItems.sortOrder), asc(menuItems.nameFr));

  const byCategory = new Map<string, MenuItemRow[]>();
  for (const item of itemRows) {
    const bucket = byCategory.get(item.categoryId);
    if (bucket) {
      bucket.push(item);
    } else {
      byCategory.set(item.categoryId, [item]);
    }
  }

  return {
    categories: categoryRows.map((category) => ({ ...category, items: byCategory.get(category.id) ?? [] })),
  };
}

export async function getMenuItem(db: Database, id: string): Promise<MenuItemRow | null> {
  const rows = await db.select().from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Writes a new price and bumps `updated_at` in the same statement, so the row can
 * never carry a new price with a stale timestamp. Returns null when the id is
 * unknown, which is how the caller distinguishes 404 from success.
 *
 * Prefer `updateMenuItemPriceWithAudit`. This stays available for the rare write that
 * genuinely needs no audit trail.
 */
export async function updateMenuItemPrice(
  db: Database,
  menuItemId: string,
  priceDa: number,
  now: Date = new Date(),
): Promise<MenuItemRow | null> {
  const rows = await db
    .update(menuItems)
    .set({ priceDa, updatedAt: toTimestamp(now) })
    .where(eq(menuItems.id, menuItemId))
    .returning();

  return rows[0] ?? null;
}

/**
 * Points a dish at an image by its delivery key. Prefer `updateMenuItemImageKeyWithAudit`.
 *
 * Legacy helper that predates the provider columns. It treats the key purely as an R2
 * object key — the only store that existed when this was written — and mirrors the
 * migration backfill (`provider_asset_id = image_key`). It is kept for the callers that
 * genuinely need no audit trail.
 */
export async function updateMenuItemImageKey(
  db: Database,
  menuItemId: string,
  imageKey: string | null,
  now: Date = new Date(),
): Promise<MenuItemRow | null> {
  const rows = await db
    .update(menuItems)
    .set({
      imageKey,
      mediaProvider: "r2",
      providerAssetId: imageKey ?? null,
      updatedAt: toTimestamp(now),
    })
    .where(eq(menuItems.id, menuItemId))
    .returning();

  return rows[0] ?? null;
}

/**
 * The update has to land on exactly one row for these writes to count as applied; see
 * `runAtomicBatch`.
 */
const UPDATE_MUST_MATCH = [expectExactlyOne(0)];

/**
 * Builds the audit insert, without executing it.
 *
 * Shared by `recordAuditLog` and the atomic variants so there is exactly one
 * definition of what an audit row looks like.
 */
export function buildAuditInsert(db: Database, entry: AuditEntry, now: Date) {
  return db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    metadata: JSON.stringify(entry.metadata ?? {}),
    createdAt: toTimestamp(now),
  });
}

/**
 * Changes a price and records the audit entry in one atomic batch.
 *
 * The two writes used to be separate statements. That left two bad states: a price
 * change with no audit row if the insert failed, and an audit row claiming a change
 * that was rolled back if the update failed. Batching them means a price is never
 * visible without its trail, and a trail never describes a change that did not
 * happen.
 *
 * Rejects if the batch fails, and the caller must let that propagate: a partially
 * applied batch is not a state this function can report as success.
 *
 * Throws when the dish id is unknown rather than returning null, because the audit
 * insert is in the same batch: there is no "the dish was missing" outcome that also
 * leaves a row claiming a change. Callers check existence first, so this is a guard.
 */
export async function updateMenuItemPriceWithAudit(
  db: Database,
  input: { menuItemId: string; priceDa: number; audit: AuditEntry },
  now: Date = new Date(),
): Promise<void> {
  await runAtomicBatch(
    db,
    [
      db
        .update(menuItems)
        .set({ priceDa: input.priceDa, updatedAt: toTimestamp(now) })
        .where(eq(menuItems.id, input.menuItemId)),
      buildAuditInsert(db, input.audit, now),
    ],
    // Statement 0 must have matched. If it did not, the batch is not applied, so
    // there is no audit row describing a change that never happened.
    UPDATE_MUST_MATCH,
  );
}

/**
 * Points a dish at a stored media asset and records the audit entry in one atomic batch.
 *
 * Same reasoning as `updateMenuItemPriceWithAudit`, and the reason the caller can
 * treat a rejection as "the store holds a new asset and D1 still points at the old one":
 * the batch is all-or-nothing, so no audit row is written either.
 *
 * Passing `media: null` clears `image_key` and the provider columns together, which is
 * what image removal commits. If the caller uploads to the store first, calls this, and
 * only deletes the previous asset once it resolves; on rejection the caller deletes the
 * asset it just uploaded.
 */
export async function updateMenuItemImageKeyWithAudit(
  db: Database,
  input: { menuItemId: string; media: MediaAssetRef | null; audit: AuditEntry },
  now: Date = new Date(),
): Promise<void> {
  await runAtomicBatch(
    db,
    [
      db
        .update(menuItems)
        .set({
          imageKey: input.media?.key ?? null,
          mediaProvider: input.media?.provider ?? "r2",
          providerAssetId: input.media?.assetId ?? null,
          updatedAt: toTimestamp(now),
        })
        .where(eq(menuItems.id, input.menuItemId)),
      buildAuditInsert(db, input.audit, now),
    ],
    UPDATE_MUST_MATCH,
  );
}

/**
 * Marks or unmarks a dish as owner-featured, with its audit entry, in one batch.
 *
 * This is the switch behind the home page preview. It is deliberately a boolean the
 * owner controls rather than something derived from the menu order, because "which
 * dishes are we recommending right now" is an editorial decision that changes with
 * what the boat brought in.
 *
 * Nothing seeds this true, so an untouched database falls back to the illustrated
 * fish dishes rather than implying a recommendation.
 */
export async function updateMenuItemFeaturedWithAudit(
  db: Database,
  input: { menuItemId: string; isFeatured: boolean; audit: AuditEntry },
  now: Date = new Date(),
): Promise<void> {
  await runAtomicBatch(
    db,
    [
      db
        .update(menuItems)
        .set({ isFeatured: input.isFeatured, updatedAt: toTimestamp(now) })
        .where(eq(menuItems.id, input.menuItemId)),
      buildAuditInsert(db, input.audit, now),
    ],
    UPDATE_MUST_MATCH,
  );
}

export async function getSiteSettings(db: Database): Promise<SiteSettingsRow | null> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_SINGLETON_ID))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Visible gallery photographs in manual order.
 *
 * Returns an empty array until the owner uploads photographs. `/galerie` renders an
 * honest empty state for that case rather than filling the page with the AI fish
 * illustrations, which illustrate species and are not photographs of the restaurant.
 */
export async function getPublicGalleryImages(db: Database): Promise<GalleryImageRow[]> {
  return db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.isVisible, true))
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.altTextFr));
}

/**
 * The gallery row an object key points at, whatever its visibility.
 *
 * `/api/media` needs this for an authorization decision, not for rendering:
 * a key is servable to an anonymous caller only when the row behind it says
 * `isVisible`. Returning the row rather than a boolean keeps the caller in
 * charge of the policy, and returning null for a key with no row is what makes
 * an orphaned or guessed key a 404 instead of a lookup miss that still serves
 * bytes.
 */
export async function findGalleryImageByKey(db: Database, imageKey: string): Promise<GalleryImageRow | null> {
  const rows = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.imageKey, imageKey))
    .limit(1);
  return rows[0] ?? null;
}

/** Most recent first. Owner-only view. */
export async function listAuditLogs(db: Database, limit = 50): Promise<AuditLogRow[]> {
  return db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} desc`).limit(limit);
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only. Never updated, never deleted.
 *
 * Standalone inserts are for callers that have no accompanying write to make atomic
 * with it. A change to a menu item should go through
 * `updateMenuItemPriceWithAudit` or `updateMenuItemImageKeyWithAudit` instead, so
 * the change and its audit row cannot come apart.
 */
export async function recordAuditLog(
  db: Database,
  entry: AuditEntry,
  now: Date = new Date(),
): Promise<AuditLogRow> {
  const rows = await buildAuditInsert(db, entry, now).returning();

  const row = rows[0];
  if (!row) {
    throw new Error("Audit log insert returned no row");
  }
  return row;
}

export async function findAuditLogs(
  db: Database,
  entityType: string,
  entityId: string,
): Promise<AuditLogRow[]> {
  return db
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(sql`${auditLogs.createdAt} desc`);
}
