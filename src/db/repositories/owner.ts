import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";

import type { Database } from "..";
import { AtomicBatchMismatchError, expectExactlyOne, runAtomicBatch } from "../atomic";
import {
  auditLogs,
  bundledGalleryImages,
  galleryImages,
  menuCategories,
  menuItems,
  siteSettings,
  type GalleryImageRow,
  type MenuCategoryRow,
  type MenuItemRow,
} from "../schema";
import {
  listBundledGalleryImages,
  type BundledGalleryState,
} from "../../lib/gallery-images";
import { buildAuditInsert, SITE_SETTINGS_SINGLETON_ID, toTimestamp, type AuditEntry } from "./menu";

/**
 * Owner-facing writes for the Phase 3 dashboard.
 *
 * Every function here does the same four things, and the repetition is deliberate:
 *
 * 1. **Guard on the version the owner actually saw.** A write carries the `version` that
 *    was on screen when the form was filled in, and the `WHERE` clause demands it. If
 *    something changed the row in between, the update matches nothing and the owner is
 *    told to look again rather than silently overwriting the newer edit. See
 *    `docs/ARCHITECTURE.md` for why `updated_at` alone cannot do this job.
 * 2. **Stamp a fresh `edit_token`.** The token is what the audit row is gated on, which is
 *    what keeps an audit row and the change it describes from ever coming apart.
 * 3. **Write the change and its audit row in one atomic batch.** On D1 that is a
 *    transaction; on `better-sqlite3`, which the unit suite runs against, it is a real
 *    `BEGIN`/`COMMIT` and a mismatch rolls the whole batch back.
 * 4. **Report honestly.** A row count that is not what was required is surfaced as
 *    `StaleEditError` when it means a concurrent edit, and as an exception otherwise. No
 *    function claims a change it cannot prove happened.
 *
 * The pre-Phase-3 actions in `menu.ts` (`updateMenuItemPriceWithAudit` and friends) stay
 * as they are. They are single-field toggles that a stale submission cannot damage much,
 * and the dashboard forms that do damage something use the guarded functions here.
 */

/** Any of the tables a guarded write can target. */
type VersionedTable =
  | typeof menuItems
  | typeof menuCategories
  | typeof galleryImages
  | typeof bundledGalleryImages
  | typeof siteSettings;

/**
 * The owner submitted an edit for a row that has changed since they loaded it.
 *
 * Distinct from a database failure on purpose: the remedy is to reload the form, not to
 * retry blindly or to tell the owner the site is broken. Every guarded write can raise it.
 */
export class StaleEditError extends Error {
  constructor(entityLabel: string) {
    super(
      `Cet élément a été modifié entre-temps. Rechargez la page pour voir la version actuelle avant de réessayer. (${entityLabel})`,
    );
    this.name = "StaleEditError";
  }
}

/**
 * A row-count shortfall that is *not* explained by a concurrent edit.
 *
 * The expectation check cannot tell those two apart by itself: a row deleted underneath an
 * edit and a row edited underneath it both mean "this statement changed nothing". The
 * difference shows up in a follow-up read, so `guardedWrite` does one cheap read of the row
 * before deciding.
 */
export class OwnerWriteFailedError extends Error {
  constructor(entityLabel: string, cause: unknown) {
    super(`L'écriture sur ${entityLabel} n'a pas été appliquée.`, { cause });
    this.name = "OwnerWriteFailedError";
  }
}

/** Index of the guarded write inside every batch in this module. */
const WRITE = 0;

/**
 * Builds the audit insert for a write that has already been gated by its own `WHERE`
 * clause, so the insert needs no gate of its own.
 */
function plainAuditInsert(db: Database, entry: AuditEntry, now: Date) {
  return buildAuditInsert(db, entry, now);
}

/**
 * Builds an audit insert that only happens if the guarded write it belongs to happened.
 *
 * This is the `INSERT ... SELECT ... WHERE` form rather than a plain `INSERT ... VALUES`:
 * a plain insert would write an audit row even when the update beside it matched nothing,
 * which is how a log ends up claiming a change that was never applied. The `WHERE` reads
 * the row back, so the audit row exists if and only if this exact write stamped its token.
 *
 * `token` is what makes the gate exact. Gating on `version = expected + 1` instead would
 * pass for a *different* write that happened to produce that same integer, which is not a
 * hypothetical: two tabs saving the same dish is precisely the case this guards.
 */
function gatedAuditInsert(
  db: Database,
  entry: AuditEntry,
  now: Date,
  table: VersionedTable,
  condition: SQL,
) {
  /*
   * `createdAt` is bound as Unix seconds rather than as a `Date`. A `Date` in raw SQL
   * binding would reach `better-sqlite3` as a parameter it cannot bind, and the unit suite
   * runs every function here against that driver.
   */
  const createdAt = Math.floor(now.getTime() / 1000);

  return db.insert(auditLogs).select(
    db
      .select({
        /*
         * Each value is aliased to the column it fills. Drizzle requires it here: an
         * unaliased expression cannot be matched to a target column, and it refuses at
         * compile time rather than producing a malformed statement at runtime.
         */
        id: sql<string>`${crypto.randomUUID()}`.as("id"),
        actorId: sql<string | null>`${entry.actorId}`.as("actor_id"),
        action: sql<string>`${entry.action}`.as("action"),
        entityType: sql<string>`${entry.entityType}`.as("entity_type"),
        entityId: sql<string>`${entry.entityId}`.as("entity_id"),
        metadata: sql<string>`${JSON.stringify(entry.metadata ?? {})}`.as("metadata"),
        createdAt: sql<number>`${createdAt}`.as("created_at"),
      })
      .from(table)
      .where(condition)
      /*
       * `LIMIT 1` is required, not an optimisation. A reorder stamps one token across every
       * row it touches, so its gate matches all of them, and without this the insert would
       * produce one audit row per row, every one carrying the same generated id and failing
       * the primary key. The gate only ever needs to answer "did this write happen", which
       * one matching row answers completely.
       */
      .limit(1),
  );
}

/**
 * Runs a guarded write and turns a shortfall into the right error.
 *
 * `rowExists` is a cheap read used only to decide *which* error to raise. Making the caller
 * supply it keeps this function synchronous about its decision: no guessing, and no
 * treating "the row is gone" as "someone else edited it".
 */
async function runGuardedWrite(
  write: () => Promise<unknown>,
  rowExists: () => Promise<boolean>,
  entityLabel: string,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (!(error instanceof AtomicBatchMismatchError) || error.statementIndex !== WRITE) {
      throw error;
    }
    // The guarded write changed nothing. Either the row is gone or it moved on; the read
    // tells the owner which, because "this dish no longer exists" and "someone else edited
    // this dish" call for different responses.
    if (await rowExists()) {
      throw new StaleEditError(entityLabel);
    }
    throw new OwnerWriteFailedError(entityLabel, error);
  }
}

/**
 * Refuses an order that does not list every row in its scope, exactly once.
 *
 * Without this, a client that submits two of three dishes gets exactly what it asked for: the
 * two are renumbered `1..2` and the third keeps its old position, which then collides with
 * one of them. Nothing is corrupted and nothing is lost, but the resulting order is not one
 * anybody chose, and the owner has no way to tell that from the list they see afterwards.
 *
 * Two checks, because a count alone misses one case:
 *
 * - A duplicate id satisfies a row count while renumbering the same row twice, leaving the
 *   list short an entry. Caught here, on the submitted ids.
 * - A row the owner never listed is caught against the table.
 *
 * The table check is a read that happens before the write, so a row added in between still
 * slips through. That is accepted: the consequence is the same partial renumber as above,
 * which is visible and reversible, and closing the window properly would mean a serialisable
 * transaction that D1 does not offer across statements.
 */
async function assertOrderIsComplete(
  countRows: () => Promise<number>,
  submittedIds: readonly string[],
  label: string,
): Promise<void> {
  const distinct = new Set(submittedIds);
  if (distinct.size !== submittedIds.length) {
    throw new OwnerWriteFailedError(
      label,
      new Error(`ordre répété : ${submittedIds.length} élément(s) pour ${distinct.size} distinct(s)`),
    );
  }

  const expected = await countRows();
  if (expected !== submittedIds.length) {
    throw new OwnerWriteFailedError(
      label,
      new Error(`ordre incomplet : ${submittedIds.length} envoyé(s) pour ${expected} élément(s)`),
    );
  }
}

/**
 * Runs a batch that has no version guard, so a row-count shortfall cannot mean a concurrent
 * edit and is reported as a rejected write instead.
 *
 * The reorder functions are the case: their `WHERE` clause is the list of ids and nothing
 * else, so nothing about them can go stale. Routing them through `runGuardedWrite` would turn
 * "you sent the wrong list" into "someone else changed this", which sends the owner looking
 * for a second tab that does not exist.
 */
async function runUnconditionalWrite(write: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await write();
  } catch (error) {
    if (error instanceof AtomicBatchMismatchError && error.statementIndex === WRITE) {
      throw new OwnerWriteFailedError(label, error);
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ categories */

export async function getMenuCategory(db: Database, id: string): Promise<MenuCategoryRow | null> {
  const rows = await db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listMenuCategories(db: Database): Promise<MenuCategoryRow[]> {
  return db
    .select()
    .from(menuCategories)
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.nameFr));
}

/**
 * How many dishes a category holds, hidden ones included.
 *
 * The dashboard needs this to explain two things the database would otherwise refuse silently:
 * why a category cannot be deleted, and why renaming it leaves its address alone. Hidden dishes
 * count, because a category holding only hidden dishes is still a category with content in it
 * and still should not be deleted from under the owner.
 */
export async function countMenuItemsInCategory(db: Database, categoryId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(menuItems)
    .where(eq(menuItems.categoryId, categoryId));
  return rows[0]?.count ?? 0;
}

/**
 * Whether a slug is already taken by another category.
 *
 * Slugs are addresses, so two categories sharing one would make `/menu` ambiguous. Checked by
 * the caller before a create or a rename rather than enforced by a unique index, because the
 * `bundled_gallery_images` pattern of a nullable-by-design key is not what this is: a category
 * slug is always populated, and a collision should reach the owner as a sentence instead of a
 * constraint violation.
 */
export async function isCategorySlugTaken(
  db: Database,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(eq(menuCategories.slug, slug))
    .limit(1);
  const found = rows[0];
  return found !== undefined && found.id !== exceptId;
}

export async function createMenuCategoryWithAudit(
  db: Database,
  input: {
    nameFr: string;
    slug: string;
    audit: CreateAuditEntry;
  },
  now: Date = new Date(),
): Promise<MenuCategoryRow> {
  const id = crypto.randomUUID();
  const row: MenuCategoryRow = {
    id,
    nameFr: input.nameFr,
    slug: input.slug,
    sortOrder: await nextCategorySortOrder(db),
    isVisible: true,
    createdAt: toTimestamp(now),
    updatedAt: toTimestamp(now),
    version: 1,
    editToken: null,
  };

  await runAtomicBatch(
    db,
    [
      db.insert(menuCategories).values(row),
      plainAuditInsert(db, { ...input.audit, entityId: id }, now),
    ],
    [expectExactlyOne(WRITE)],
  );

  return row;
}

async function nextCategorySortOrder(db: Database): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${menuCategories.sortOrder})` })
    .from(menuCategories);
  return (rows[0]?.max ?? 0) + 1;
}

export async function renameMenuCategoryWithAudit(
  db: Database,
  input: {
    categoryId: string;
    expectedVersion: number;
    nameFr: string;
    slug: string;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuCategories)
            .set({
              nameFr: input.nameFr,
              slug: input.slug,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(
              and(eq(menuCategories.id, input.categoryId), eq(menuCategories.version, input.expectedVersion)),
            ),
          gatedAuditInsert(
            db,
            input.audit,
            now,
            menuCategories,
            eq(menuCategories.editToken, token),
          ),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => categoryExists(db, input.categoryId),
    "catégorie",
  );
}

async function categoryExists(db: Database, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: menuCategories.id })
    .from(menuCategories)
    .where(eq(menuCategories.id, id))
    .limit(1);
  return rows.length > 0;
}

export async function setMenuCategoryVisibilityWithAudit(
  db: Database,
  input: {
    categoryId: string;
    expectedVersion: number;
    isVisible: boolean;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuCategories)
            .set({
              isVisible: input.isVisible,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(
              and(eq(menuCategories.id, input.categoryId), eq(menuCategories.version, input.expectedVersion)),
            ),
          gatedAuditInsert(db, input.audit, now, menuCategories, eq(menuCategories.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => categoryExists(db, input.categoryId),
    "catégorie",
  );
}

/**
 * Removes a category, but only once it holds no dishes.
 *
 * Two properties, both deliberate:
 *
 * - The emptiness check is in the `WHERE` clause, not in a read that happened earlier. A
 *   dish added between the read and the delete would otherwise be deleted with the
 *   category by the `onDelete: "cascade"` on `menu_items.category_id`, which is the one
 *   outcome the owner would never accept.
 * - Nothing is hard-deleted from a category that has dishes. The dashboard hides a category
 *   instead, and the owner empties it first. Only an empty category is removed, so the
 *   cascade has nothing to take with it.
 */
export async function deleteEmptyMenuCategoryWithAudit(
  db: Database,
  input: {
    categoryId: string;
    expectedVersion: number;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  /*
   * The audit insert is ungated here, unlike every other write in this module, because there
   * is nothing left to gate on: the row this batch deletes is gone by the time the batch ends,
   * so a gate reading it would never match. The exact row-count expectation takes that role,
   * and on `better-sqlite3` a delete that matched nothing rolls the insert back with it.
   */
  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .delete(menuCategories)
            .where(
              and(
                eq(menuCategories.id, input.categoryId),
                eq(menuCategories.version, input.expectedVersion),
                sql`(SELECT count(*) FROM ${menuItems} WHERE ${menuItems.categoryId} = ${input.categoryId}) = 0`,
              ),
            ),
          db
            .insert(auditLogs)
            .values({
              id: crypto.randomUUID(),
              actorId: input.audit.actorId,
              action: input.audit.action,
              entityType: input.audit.entityType,
              entityId: input.audit.entityId,
              metadata: JSON.stringify(input.audit.metadata ?? {}),
              createdAt: toTimestamp(now),
            }),
        ],
        [expectExactlyOne(WRITE)],
      ),
    async () => {
      /*
       * The row is gone, so "does it still exist" cannot distinguish a stale edit from a
       * successful delete. Whether the category held dishes is the useful question, and it
       * is answerable from the dishes that would have been cascaded.
       */
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(menuItems)
        .where(eq(menuItems.categoryId, input.categoryId));
      return (rows[0]?.count ?? 0) > 0;
    },
    "catégorie",
  );
}

/* ------------------------------------------------------------------ menu items */

export async function createMenuItemWithAudit(
  db: Database,
  input: {
    categoryId: string;
    nameFr: string;
    descriptionFr: string | null;
    priceDa: number;
    fishReferenceSlug: string | null;
    audit: CreateAuditEntry;
  },
  now: Date = new Date(),
): Promise<MenuItemRow> {
  const id = crypto.randomUUID();
  const sortOrder = await nextItemSortOrder(db, input.categoryId);

  const row: MenuItemRow = {
    id,
    categoryId: input.categoryId,
    nameFr: input.nameFr,
    descriptionFr: input.descriptionFr,
    priceDa: input.priceDa,
    /*
     * Never seeded with an image or a featured flag. A new dish has no photograph until the
     * owner uploads one, and nothing on the site should claim the restaurant recommends it
     * just because it was added.
     */
    imageKey: null,
    fishReferenceSlug: input.fishReferenceSlug,
    isFeatured: false,
    isVisible: true,
    sortOrder,
    createdAt: toTimestamp(now),
    updatedAt: toTimestamp(now),
    version: 1,
    editToken: null,
  };

  await runAtomicBatch(
    db,
    [db.insert(menuItems).values(row), plainAuditInsert(db, { ...input.audit, entityId: id }, now)],
    [expectExactlyOne(WRITE)],
  );

  return row;
}

async function nextItemSortOrder(db: Database, categoryId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${menuItems.sortOrder})` })
    .from(menuItems)
    .where(eq(menuItems.categoryId, categoryId));
  return (rows[0]?.max ?? 0) + 1;
}

/**
 * Applies a whole-dish edit.
 *
 * Replaces every editable field rather than patching the ones that were sent, because the
 * form submits the complete dish. Two forms therefore cannot leave the row holding a
 * mixture of both: the last save wins completely, or the guard rejects it.
 *
 * `isVisible` and `isFeatured` are deliberately *not* here. They are one-tap switches the
 * owner uses constantly, and folding them into the full-dish save would mean a typo in the
 * name silently unpublished the dish. Each has its own guarded function.
 */
export async function updateMenuItemDetailsWithAudit(
  db: Database,
  input: {
    menuItemId: string;
    expectedVersion: number;
    categoryId: string;
    nameFr: string;
    descriptionFr: string | null;
    priceDa: number;
    fishReferenceSlug: string | null;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuItems)
            .set({
              categoryId: input.categoryId,
              nameFr: input.nameFr,
              descriptionFr: input.descriptionFr,
              priceDa: input.priceDa,
              /*
               * Clearing the reference illustration is a real edit, so a null here is
               * applied rather than ignored. Leaving it out of the `set` would make "no
               * illustration" impossible to choose.
               */
              fishReferenceSlug: input.fishReferenceSlug,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(and(eq(menuItems.id, input.menuItemId), eq(menuItems.version, input.expectedVersion))),
          gatedAuditInsert(db, input.audit, now, menuItems, eq(menuItems.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => menuItemExists(db, input.menuItemId),
    "plat",
  );
}

async function menuItemExists(db: Database, id: string): Promise<boolean> {
  const rows = await db.select({ id: menuItems.id }).from(menuItems).where(eq(menuItems.id, id)).limit(1);
  return rows.length > 0;
}

export async function setMenuItemVisibilityWithAudit(
  db: Database,
  input: {
    menuItemId: string;
    expectedVersion: number;
    isVisible: boolean;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuItems)
            .set({
              isVisible: input.isVisible,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(and(eq(menuItems.id, input.menuItemId), eq(menuItems.version, input.expectedVersion))),
          gatedAuditInsert(db, input.audit, now, menuItems, eq(menuItems.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => menuItemExists(db, input.menuItemId),
    "plat",
  );
}

/**
 * Applies a new order to every dish of one category in a single statement.
 *
 * Ordering is the one Phase 3 operation that touches several rows at once, and that is what
 * makes it awkward on D1. Two statements, one per dish, would be worse: a batch where one of
 * them matched nothing commits the other anyway, because D1 only rolls back on an error and
 * a statement that matches no rows is not an error.
 *
 * So the whole order is one `UPDATE ... SET sort_order = CASE id WHEN ... END` guarded by
 * the category, which cannot half-apply: the statement either runs or it does not.
 *
 * The count is still checked, and it is checked exactly. If a dish was added or removed
 * while the owner was arranging the list, fewer or more rows change than were submitted,
 * and the owner is told the list moved rather than shown a save that quietly did not do what
 * they asked. Every row in the statement shares one `edit_token`, so the audit row is
 * written when the reorder happened at all.
 *
 * Positions are assigned `1..n` from the submitted order rather than preserving the old
 * numbers, which is what keeps the sequence free of gaps and duplicates after any number of
 * rearrangements.
 */
export async function reorderMenuItemsWithAudit(
  db: Database,
  input: {
    categoryId: string;
    /** Dish ids in the order the owner wants, and nothing else. */
    itemIds: readonly string[];
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  await assertOrderIsComplete(
    async () => {
      const rows = await db
        .select({ id: menuItems.id })
        .from(menuItems)
        .where(eq(menuItems.categoryId, input.categoryId));
      return rows.length;
    },
    input.itemIds,
    "ordre des plats",
  );

  const token = crypto.randomUUID();
  const assignments = input.itemIds
    .map((id, index) => sql`when ${menuItems.id} = ${id} then ${index + 1}`)
    .reduce((left, right) => sql`${left} ${right}`);

  await runUnconditionalWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuItems)
            .set({
              sortOrder: sql`case ${assignments} end`,
              updatedAt: toTimestamp(now),
              version: sql<number>`${menuItems.version} + 1`,
              editToken: token,
            })
            .where(and(eq(menuItems.categoryId, input.categoryId), inArray(menuItems.id, [...input.itemIds]))),
          gatedAuditInsert(db, input.audit, now, menuItems, eq(menuItems.editToken, token)),
        ],
        [{ index: WRITE, changes: input.itemIds.length }],
      ),
    "ordre des plats",
  );
}

/** Applies a new order to every category, on the same terms as `reorderMenuItemsWithAudit`. */
export async function reorderMenuCategoriesWithAudit(
  db: Database,
  input: {
    categoryIds: readonly string[];
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  await assertOrderIsComplete(
    async () => {
      const rows = await db.select({ id: menuCategories.id }).from(menuCategories);
      return rows.length;
    },
    input.categoryIds,
    "ordre des catégories",
  );

  const token = crypto.randomUUID();
  const assignments = input.categoryIds
    .map((id, index) => sql`when ${menuCategories.id} = ${id} then ${index + 1}`)
    .reduce((left, right) => sql`${left} ${right}`);

  await runUnconditionalWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(menuCategories)
            .set({
              sortOrder: sql`case ${assignments} end`,
              updatedAt: toTimestamp(now),
              version: sql<number>`${menuCategories.version} + 1`,
              editToken: token,
            })
            .where(inArray(menuCategories.id, [...input.categoryIds])),
          gatedAuditInsert(db, input.audit, now, menuCategories, eq(menuCategories.editToken, token)),
        ],
        [{ index: WRITE, changes: input.categoryIds.length }],
      ),
    "ordre des catégories",
  );
}

/* ------------------------------------------------------------------ settings */

export interface SiteSettingsUpdate {
  restaurantNameFr: string;
  phoneFr: string | null;
  addressFr: string | null;
  mapsUrl: string | null;
  hoursFr: string | null;
  familyNoteFr: string | null;
  heroTitleFr: string | null;
  heroSubtitleFr: string | null;
  deliveryEnabled: boolean;
  deliveryZonesTextFr: string | null;
  deliveryFeeTextFr: string | null;
  deliveryMinimumOrderTextFr: string | null;
  deliveryHoursFr: string | null;
  pickupTextFr: string | null;
}

/**
 * Saves the whole settings row.
 *
 * One statement rather than a patch, for the same reason as the dish edit: a form that
 * submits every field should either land entirely or not at all, otherwise clearing one
 * field and failing on the next would leave the site in a state nobody chose.
 *
 * The owner confirmed which of these are facts and which are free text, so the caller
 * decides what to send. An optional field the owner has not confirmed stays `null` rather
 * than being filled with a plausible guess: `docs/CONTENT_POLICY.md` forbids stating
 * anything the owner has not confirmed, and `addressFr` is exactly that case.
 */
export async function updateSiteSettingsWithAudit(
  db: Database,
  input: { expectedVersion: number; settings: SiteSettingsUpdate; audit: AuditEntry },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(siteSettings)
            .set({
              ...input.settings,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(
              and(
                eq(siteSettings.id, SITE_SETTINGS_SINGLETON_ID),
                eq(siteSettings.version, input.expectedVersion),
              ),
            ),
          gatedAuditInsert(db, input.audit, now, siteSettings, eq(siteSettings.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => settingsExist(db),
    "informations du restaurant",
  );
}

async function settingsExist(db: Database): Promise<boolean> {
  const rows = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_SINGLETON_ID))
    .limit(1);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ gallery */

/**
 * Rows of `bundled_gallery_images`, as the pure merge function wants them.
 *
 * The read and the merge are separate on purpose: `mergeBundledGalleryState` is the single
 * definition of "what a bundled photograph currently looks like", and it is a pure function
 * over this, so the gallery page, the dashboard and the tests cannot disagree about it.
 */
export async function listBundledGalleryState(db: Database): Promise<BundledGalleryState[]> {
  const rows = await db
    .select({
      slug: bundledGalleryImages.slug,
      altTextFr: bundledGalleryImages.altTextFr,
      captionFr: bundledGalleryImages.captionFr,
      sortOrder: bundledGalleryImages.sortOrder,
      isVisible: bundledGalleryImages.isVisible,
      version: bundledGalleryImages.version,
    })
    .from(bundledGalleryImages);

  return rows;
}

/**
 * Creates the missing rows for photographs that have none.
 *
 * Needed because production applies migrations and never runs the seed: on a freshly
 * deployed database `bundled_gallery_images` is empty, and a guarded edit against a
 * photograph with no row would match nothing and be reported as a failed write. Rather than
 * a migration that seeds rows, which would bake editorial state into a schema change and
 * could never learn about a photograph added later, the rows are created on first write.
 *
 * Only the missing ones are inserted, and an existing row is left completely alone: an
 * owner's caption, alt text or visibility must survive any call to this.
 *
 * Called when the editor loads, not only on the first write, so the versions shown to the owner
 * are the versions their edit will be checked against.
 */
export async function ensureBundledGalleryRows(db: Database): Promise<void> {
  const images = listBundledGalleryImages();
  const existing = new Set((await listBundledGalleryState(db)).map((row) => row.slug));

  const missing = images
    .map((image, manifestIndex) => ({ image, manifestIndex }))
    .filter(({ image }) => !existing.has(image.slug))
    .map(({ image, manifestIndex }) => ({
      slug: image.slug,
      altTextFr: image.altFr,
      captionFr: null,
      /*
       * The position in the *manifest*, not the position among the rows being created. If
       * three photographs already have rows and two do not, numbering the new ones 1 and 2
       * would collide with the existing ones and scramble the order the owner is looking at.
       */
      sortOrder: manifestIndex + 1,
      isVisible: true,
    }));

  if (missing.length === 0) {
    return;
  }

  // `version` is deliberately absent, so the column default of 1 applies. Writing the 0 from
  // `BundledGalleryState.version` would store the one value that means "no row" on a real
  // row, and every later guarded edit against it would be rejected as stale.
  await runAtomicBatch(db, [db.insert(bundledGalleryImages).values(missing)], []);
}

/** Uploaded photographs, owner view. */
export async function listAdminGalleryImages(db: Database): Promise<GalleryImageRow[]> {
  return db
    .select()
    .from(galleryImages)
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.altTextFr));
}

export interface BundledGalleryPatch {
  readonly altTextFr?: string;
  readonly captionFr?: string | null;
  readonly isVisible?: boolean;
}

/**
 * Edits the owner-controlled state of one bundled photograph.
 *
 * Only the three fields the owner is allowed to change. There is no path here to change the
 * file itself, the slug, or anything in R2: these photographs ship with the repository, and
 * a bundled row carries no object key for a deletion to act on.
 */
export async function updateBundledGalleryImageWithAudit(
  db: Database,
  input: {
    slug: string;
    expectedVersion: number;
    patch: BundledGalleryPatch;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(bundledGalleryImages)
            .set({
              ...input.patch,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(
              and(
                eq(bundledGalleryImages.slug, input.slug),
                eq(bundledGalleryImages.version, input.expectedVersion),
              ),
            ),
          gatedAuditInsert(db, input.audit, now, bundledGalleryImages, eq(bundledGalleryImages.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => bundledImageExists(db, input.slug),
    "photographie",
  );
}

async function bundledImageExists(db: Database, slug: string): Promise<boolean> {
  const rows = await db
    .select({ slug: bundledGalleryImages.slug })
    .from(bundledGalleryImages)
    .where(eq(bundledGalleryImages.slug, slug))
    .limit(1);
  return rows.length > 0;
}

/** Applies a new order to the bundled photographs, on the terms of `reorderMenuItemsWithAudit`. */
export async function reorderBundledGalleryImagesWithAudit(
  db: Database,
  input: {
    slugs: readonly string[];
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  await assertOrderIsComplete(
    async () => {
      const rows = await db.select({ slug: bundledGalleryImages.slug }).from(bundledGalleryImages);
      return rows.length;
    },
    input.slugs,
    "ordre des photographies",
  );

  const token = crypto.randomUUID();
  const assignments = input.slugs
    .map((slug, index) => sql`when ${bundledGalleryImages.slug} = ${slug} then ${index + 1}`)
    .reduce((left, right) => sql`${left} ${right}`);

  await runUnconditionalWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(bundledGalleryImages)
            .set({
              sortOrder: sql`case ${assignments} end`,
              updatedAt: toTimestamp(now),
              version: sql<number>`${bundledGalleryImages.version} + 1`,
              editToken: token,
            })
            .where(inArray(bundledGalleryImages.slug, [...input.slugs])),
          gatedAuditInsert(db, input.audit, now, bundledGalleryImages, eq(bundledGalleryImages.editToken, token)),
        ],
        [{ index: WRITE, changes: input.slugs.length }],
      ),
    "ordre des photographies",
  );
}

/** Edits an uploaded photograph's alt text, caption or visibility. */
export async function updateGalleryImageWithAudit(
  db: Database,
  input: {
    galleryImageId: string;
    expectedVersion: number;
    patch: { altTextFr?: string; captionFr?: string | null; isVisible?: boolean };
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  const token = crypto.randomUUID();

  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(galleryImages)
            .set({
              ...input.patch,
              updatedAt: toTimestamp(now),
              version: input.expectedVersion + 1,
              editToken: token,
            })
            .where(
              and(
                eq(galleryImages.id, input.galleryImageId),
                eq(galleryImages.version, input.expectedVersion),
              ),
            ),
          gatedAuditInsert(db, input.audit, now, galleryImages, eq(galleryImages.editToken, token)),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => galleryImageExists(db, input.galleryImageId),
    "photographie",
  );
}

async function galleryImageExists(db: Database, id: string): Promise<boolean> {
  const rows = await db
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(eq(galleryImages.id, id))
    .limit(1);
  return rows.length > 0;
}

/** Applies a new order to the uploaded photographs, on the terms of `reorderMenuItemsWithAudit`. */
export async function reorderGalleryImagesWithAudit(
  db: Database,
  input: {
    galleryImageIds: readonly string[];
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<void> {
  await assertOrderIsComplete(
    async () => {
      const rows = await db.select({ id: galleryImages.id }).from(galleryImages);
      return rows.length;
    },
    input.galleryImageIds,
    "ordre des photographies",
  );

  const token = crypto.randomUUID();
  const assignments = input.galleryImageIds
    .map((id, index) => sql`when ${galleryImages.id} = ${id} then ${index + 1}`)
    .reduce((left, right) => sql`${left} ${right}`);

  await runUnconditionalWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .update(galleryImages)
            .set({
              sortOrder: sql`case ${assignments} end`,
              updatedAt: toTimestamp(now),
              version: sql<number>`${galleryImages.version} + 1`,
              editToken: token,
            })
            .where(inArray(galleryImages.id, [...input.galleryImageIds])),
          gatedAuditInsert(db, input.audit, now, galleryImages, eq(galleryImages.editToken, token)),
        ],
        [{ index: WRITE, changes: input.galleryImageIds.length }],
      ),
    "ordre des photographies",
  );
}

/**
 * Records a newly uploaded photograph and its audit row in one batch.
 *
 * Called only after R2 has accepted the object, so a rejection here leaves the database
 * pointing at nothing it does not have. The reverse ordering problem is the caller's: it
 * deletes the object it just uploaded if this rejects.
 */
export async function createGalleryImageWithAudit(
  db: Database,
  input: {
    imageKey: string;
    altTextFr: string;
    captionFr: string | null;
    audit: CreateAuditEntry;
  },
  now: Date = new Date(),
): Promise<GalleryImageRow> {
  const sortOrder = await nextGallerySortOrder(db);

  const row: GalleryImageRow = {
    id: crypto.randomUUID(),
    imageKey: input.imageKey,
    altTextFr: input.altTextFr,
    captionFr: input.captionFr,
    sortOrder,
    isVisible: true,
    createdAt: toTimestamp(now),
    updatedAt: toTimestamp(now),
    version: 1,
    editToken: null,
  };

  await runAtomicBatch(
    db,
    [
      db.insert(galleryImages).values(row),
      plainAuditInsert(db, { ...input.audit, entityId: row.id }, now),
    ],
    [expectExactlyOne(WRITE)],
  );

  return row;
}

async function nextGallerySortOrder(db: Database): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${galleryImages.sortOrder})` })
    .from(galleryImages);
  return (rows[0]?.max ?? 0) + 1;
}

/**
 * Deletes an uploaded photograph and its audit row in one batch, and returns the R2 key so
 * the caller can remove the object.
 *
 * The row is deleted rather than hidden. `alt_text_fr` is `not null`, so a hidden row would
 * need alt text invented for an image nobody is going to see again, and keeping a row the
 * owner has asked to remove is the kind of thing that resurfaces later as a mystery entry in
 * a list they thought they had cleared. The audit row survives, so the record of what was
 * published and removed is intact; it is the photograph, not the history, that goes.
 *
 * The audit insert is *not* gated on the deleted row, because gating a gate on something the
 * same batch removes cannot work. The batch is the guarantee instead: on D1 the delete and
 * the insert share one transaction, and on `better-sqlite3` the exact row-count check rolls
 * the insert back if the delete matched nothing.
 *
 * A bundled photograph cannot reach this function at all. It has no row in this table and no
 * R2 key, which is the whole reason the two sources are kept apart.
 */
export async function deleteGalleryImageWithAudit(
  db: Database,
  input: {
    galleryImageId: string;
    expectedVersion: number;
    audit: AuditEntry;
  },
  now: Date = new Date(),
): Promise<{ imageKey: string } | null> {
  const existing = await db
    .select({ imageKey: galleryImages.imageKey, version: galleryImages.version })
    .from(galleryImages)
    .where(eq(galleryImages.id, input.galleryImageId))
    .limit(1);
  const row = existing[0];
  if (!row) {
    return null;
  }

  /*
   * Read out before the write, because afterwards there is no row to read from, and the key
   * is the only handle the caller has on the R2 object.
   */
  await runGuardedWrite(
    () =>
      runAtomicBatch(
        db,
        [
          db
            .delete(galleryImages)
            .where(
              and(
                eq(galleryImages.id, input.galleryImageId),
                eq(galleryImages.version, input.expectedVersion),
              ),
            ),
          plainAuditInsert(db, input.audit, now),
        ],
        [expectExactlyOne(WRITE)],
      ),
    () => galleryImageExists(db, input.galleryImageId),
    "photographie",
  );

  return { imageKey: row.imageKey };
}

/* ------------------------------------------------------------------ audit view */

export interface ReadableAuditEntry {
  readonly id: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

/**
 * Audit rows with their metadata parsed back into objects.
 *
 * `audit_logs.metadata` is JSON text, and the owner reading a history should see what
 * changed rather than a wall of escaped quotes. A row whose metadata does not parse is
 * still listed, with an empty object: a corrupt log entry must not hide the rest of the
 * history, and it must not crash the page that shows it.
 */
export async function listReadableAuditLogs(db: Database, limit = 100): Promise<ReadableAuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLogs)
    .orderBy(sql`${auditLogs.createdAt} desc`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    metadata: parseMetadata(row.metadata),
    createdAt: row.createdAt,
  }));
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type { AuditEntry };

/**
 * The audit half of a *create*, where the id is not known yet.
 *
 * A create generates its own id so there is one place that makes one, which means the caller
 * cannot fill in `entityId`. These functions therefore take an entry without it and write the
 * id they generated into the log, so a `menu_item.created` row points at the dish that was
 * just created rather than at whatever placeholder was passed in.
 */
export type CreateAuditEntry = Omit<AuditEntry, "entityId">;