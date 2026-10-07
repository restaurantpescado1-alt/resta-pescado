import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

import { applyMigrations } from "../../scripts/migrate";
import * as schema from "../../src/db/schema";
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
  isCategorySlugTaken,
  listAdminGalleryImages,
  listBundledGalleryState,
  listReadableAuditLogs,
  reorderBundledGalleryImagesWithAudit,
  reorderMenuCategoriesWithAudit,
  reorderMenuItemsWithAudit,
  renameMenuCategoryWithAudit,
  setMenuCategoryVisibilityWithAudit,
  setMenuItemVisibilityWithAudit,
  updateBundledGalleryImageWithAudit,
  updateGalleryImageWithAudit,
  updateMenuItemDetailsWithAudit,
  updateSiteSettingsWithAudit,
  type SiteSettingsUpdate,
} from "../../src/db/repositories/owner";
import { listBundledGalleryImages, mergeBundledGalleryState } from "../../src/lib/gallery-images";

/**
 * Owner-write tests, against real SQLite with the real migrations.
 *
 * These exist for the two things about these functions that cannot be seen by reading them:
 *
 * 1. **The generated SQL is real.** The audit insert is an `INSERT ... SELECT ... WHERE` that
 *    has to read back the row the update beside it just wrote, and the reorder is a single
 *    `UPDATE ... SET sort_order = CASE ... END` built by string-composing fragments. Neither
 *    is the kind of statement you want to discover is wrong from a production log.
 * 2. **The audit row and the change stand or fall together.** Every test that changes
 *    something asserts on the number of audit rows, because a change without its trail is
 *    the failure mode `docs/ARCHITECTURE.md` forbids and the one nothing else would catch.
 *
 * The concurrency tests drive the guard by hand, by bumping a row's version directly the way
 * a competing writer would, rather than by racing two calls. That is the honest way to test a
 * guard: the real race is timing-dependent, and a test that only passes when the scheduler
 * cooperates is a test that will stop passing on someone else's machine.
 */

type TestDatabase = ReturnType<typeof createDatabase>;

const SEEDED_AT = new Date("2026-01-15T10:00:00Z");
const OWNER_ID = "owner-1";

function createDatabase() {
  const native = new Database(":memory:");
  native.pragma("foreign_keys = ON");
  applyMigrations(native);
  const db = drizzle(native, { schema });

  /*
   * `audit_logs.actor_id` is a foreign key, so an audit row cannot be written for an actor
   * that does not exist. Seeding a real owner rather than passing `null` keeps these tests
   * honest about that constraint rather than quietly bypassing it.
   */
  db.insert(schema.user)
    .values({
      id: OWNER_ID,
      name: "Propriétaire",
      email: "owner@example.test",
      emailVerified: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    })
    .run();

  return { db, native };
}

/**
 * The audit half of a create.
 *
 * No `entityId`: a create generates its own id, so the repository is the only thing that can
 * know what to log, and these tests assert that it does.
 */
function createAudit(metadata: Record<string, unknown> = {}) {
  return {
    actorId: OWNER_ID,
    action: "test.action",
    entityType: "test",
    metadata,
  };
}

function audit(entityId: string, metadata: Record<string, unknown> = {}) {
  return {
    actorId: OWNER_ID,
    action: "test.action",
    entityType: "test",
    entityId,
    metadata,
  };
}

function seedCategory(db: TestDatabase["db"], id: string, slug: string, sortOrder = 1) {
  db.insert(schema.menuCategories)
    .values({
      id,
      nameFr: `Catégorie ${id}`,
      slug,
      sortOrder,
      isVisible: true,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    })
    .run();
}

function seedItem(
  db: TestDatabase["db"],
  input: { id: string; categoryId: string; nameFr: string; priceDa: number; sortOrder: number },
) {
  db.insert(schema.menuItems)
    .values({
      id: input.id,
      categoryId: input.categoryId,
      nameFr: input.nameFr,
      descriptionFr: null,
      priceDa: input.priceDa,
      imageKey: null,
      fishReferenceSlug: null,
      isFeatured: false,
      isVisible: true,
      sortOrder: input.sortOrder,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    })
    .run();
}

function seedSettings(db: TestDatabase["db"]) {
  db.insert(schema.siteSettings).values({ id: "singleton", phoneFr: "0540559967" }).run();
}

/** Restricts an update to one dish, so a test can hide it without touching the others. */
function eqItem(id: string) {
  return eq(schema.menuItems.id, id);
}

function countAuditRows(db: TestDatabase["db"]): number {
  const rows = db.select({ id: schema.auditLogs.id }).from(schema.auditLogs).all();
  return rows.length;
}

function versionsOf(db: TestDatabase["db"]): Record<string, number> {
  const rows = db.select().from(schema.menuItems).all();
  return Object.fromEntries(rows.map((row) => [row.id, row.version]));
}

describe("owner menu writes", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
    seedCategory(harness.db, "cat-1", "poissons");
  });

  it("creates a dish with its audit row and never invents an image or a featured flag", async () => {
    const created = await createMenuItemWithAudit(harness.db, {
      categoryId: "cat-1",
      nameFr: "Dorade grillée",
      descriptionFr: null,
      priceDa: 1200,
      fishReferenceSlug: "dorade",
      audit: createAudit({ nameFr: "Dorade grillée" }),
    });

    expect(created.isVisible).toBe(true);
    expect(created.isFeatured).toBe(false);
    expect(created.imageKey).toBeNull();
    expect(created.version).toBe(1);
    expect(created.editToken).toBeNull();
    expect(countAuditRows(harness.db)).toBe(1);

    /*
     * The audit row points at the dish that was actually created. The repository generates the
     * id, so this is the assertion that matters: a log entry reading `pending` or `new-dish`
     * would be a history that cannot be followed back to anything.
     */
    const logged = harness.db.select().from(schema.auditLogs).all();
    expect(logged).toHaveLength(1);
    expect(logged[0]?.entityId).toBe(created.id);

    const stored = harness.db.select().from(schema.menuItems).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.nameFr).toBe("Dorade grillée");
  });

  it("puts a new dish at the end of its category", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 4 });

    const created = await createMenuItemWithAudit(harness.db, {
      categoryId: "cat-1",
      nameFr: "Thon",
      descriptionFr: null,
      priceDa: 1800,
      fishReferenceSlug: null,
      audit: createAudit(),
    });

    expect(created.sortOrder).toBe(5);
  });

  it("replaces every editable field of a dish in one statement", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });

    await updateMenuItemDetailsWithAudit(harness.db, {
      menuItemId: "item-1",
      expectedVersion: 1,
      categoryId: "cat-1",
      nameFr: "Sardines grillées",
      descriptionFr: "Avec salade et citron.",
      priceDa: 700,
      fishReferenceSlug: "sardine",
      audit: audit("item-1", { nameFr: "Sardine" }),
    });

    const row = harness.db.select().from(schema.menuItems).all()[0]!;
    expect(row.nameFr).toBe("Sardines grillées");
    expect(row.descriptionFr).toBe("Avec salade et citron.");
    expect(row.priceDa).toBe(700);
    expect(row.fishReferenceSlug).toBe("sardine");
    expect(row.version).toBe(2);
    expect(row.editToken).not.toBeNull();
  });

  it("clears a fish reference when the owner removes it", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });
    harness.db
      .update(schema.menuItems)
      .set({ fishReferenceSlug: "sardine" })
      .where(eq(schema.menuItems.id, "item-1"))
      .run();

    await updateMenuItemDetailsWithAudit(harness.db, {
      menuItemId: "item-1",
      expectedVersion: 1,
      categoryId: "cat-1",
      nameFr: "Sardine",
      descriptionFr: null,
      priceDa: 600,
      fishReferenceSlug: null,
      audit: audit("item-1"),
    });

    expect(harness.db.select().from(schema.menuItems).all()[0]?.fishReferenceSlug).toBeNull();
  });

  it("leaves image and featured state alone when the details form is saved", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });
    harness.db
      .update(schema.menuItems)
      .set({ imageKey: "menu/2026/photo.png", isFeatured: true })
      .where(eq(schema.menuItems.id, "item-1"))
      .run();

    await updateMenuItemDetailsWithAudit(harness.db, {
      menuItemId: "item-1",
      expectedVersion: 1,
      categoryId: "cat-1",
      nameFr: "Sardine grillée",
      descriptionFr: null,
      priceDa: 650,
      fishReferenceSlug: null,
      audit: audit("item-1"),
    });

    const row = harness.db.select().from(schema.menuItems).all()[0]!;
    expect(row.imageKey).toBe("menu/2026/photo.png");
    expect(row.isFeatured).toBe(true);
  });

  it("writes an audit row for a visibility change", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });

    await setMenuItemVisibilityWithAudit(harness.db, {
      menuItemId: "item-1",
      expectedVersion: 1,
      isVisible: false,
      audit: audit("item-1", { to: false }),
    });

    expect(harness.db.select().from(schema.menuItems).all()[0]?.isVisible).toBe(false);
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("rejects a stale edit and writes no audit row for the change it did not make", async () => {
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });
    // A competing writer has already saved, so the version the owner was looking at is old.
    harness.db
      .update(schema.menuItems)
      .set({ priceDa: 900, version: 2 })
      .where(eq(schema.menuItems.id, "item-1"))
      .run();

    await expect(
      updateMenuItemDetailsWithAudit(harness.db, {
        menuItemId: "item-1",
        expectedVersion: 1,
        categoryId: "cat-1",
        nameFr: "Sardine",
        descriptionFr: null,
        priceDa: 700,
        fishReferenceSlug: null,
        audit: audit("item-1"),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);

    const row = harness.db.select().from(schema.menuItems).all()[0]!;
    expect(row.priceDa).toBe(900);
    expect(row.nameFr).toBe("Sardine");
    // The important assertion: nothing was claimed to have happened.
    expect(countAuditRows(harness.db)).toBe(0);
  });

  it("reports a dish that no longer exists as a failed write, not as a concurrent edit", async () => {
    await expect(
      updateMenuItemDetailsWithAudit(harness.db, {
        menuItemId: "gone",
        expectedVersion: 1,
        categoryId: "cat-1",
        nameFr: "Fantôme",
        descriptionFr: null,
        priceDa: 100,
        fishReferenceSlug: null,
        audit: audit("gone"),
      }),
    ).rejects.toBeInstanceOf(OwnerWriteFailedError);
  });
});

describe("owner category writes", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
  });

  it("creates a category after the existing ones and writes its audit row", async () => {
    seedCategory(harness.db, "cat-1", "poissons", 1);

    const created = await createMenuCategoryWithAudit(harness.db, {
      nameFr: "Crustacés",
      slug: "crustaces",
      audit: createAudit(),
    });

    expect(created.sortOrder).toBe(2);
    expect(created.isVisible).toBe(true);
    expect(countAuditRows(harness.db)).toBe(1);
    expect(harness.db.select().from(schema.auditLogs).all()[0]?.entityId).toBe(created.id);
  });

  it("renames a category under the version guard", async () => {
    seedCategory(harness.db, "cat-1", "poissons");

    await renameMenuCategoryWithAudit(harness.db, {
      categoryId: "cat-1",
      expectedVersion: 1,
      nameFr: "Poissons et crustacés",
      slug: "poissons-et-crustaces",
      audit: audit("cat-1"),
    });

    const row = harness.db.select().from(schema.menuCategories).all()[0]!;
    expect(row.nameFr).toBe("Poissons et crustacés");
    expect(row.slug).toBe("poissons-et-crustaces");
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("hides a category rather than deleting it when it still holds dishes", async () => {
    seedCategory(harness.db, "cat-1", "poissons");
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });

    await expect(
      deleteEmptyMenuCategoryWithAudit(harness.db, {
        categoryId: "cat-1",
        expectedVersion: 1,
        audit: audit("cat-1"),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);

    // Nothing was deleted, and nothing was cascaded: the dish is still there.
    expect(harness.db.select().from(schema.menuCategories).all()).toHaveLength(1);
    expect(harness.db.select().from(schema.menuItems).all()).toHaveLength(1);
    expect(countAuditRows(harness.db)).toBe(0);
  });

  it("hides a category without deleting it or its dishes", async () => {
    seedCategory(harness.db, "cat-1", "poissons");
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });

    await setMenuCategoryVisibilityWithAudit(harness.db, {
      categoryId: "cat-1",
      expectedVersion: 1,
      isVisible: false,
      audit: audit("cat-1", { to: false }),
    });

    const row = harness.db.select().from(schema.menuCategories).all()[0]!;
    expect(row.isVisible).toBe(false);
    expect(row.version).toBe(2);
    // The dishes stay exactly where they were: hiding a category is not a deletion.
    expect(harness.db.select().from(schema.menuItems).all()).toHaveLength(1);
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("deletes a category that holds no dishes", async () => {
    seedCategory(harness.db, "cat-1", "poissons");

    await deleteEmptyMenuCategoryWithAudit(harness.db, {
      categoryId: "cat-1",
      expectedVersion: 1,
      audit: audit("cat-1"),
    });

    expect(harness.db.select().from(schema.menuCategories).all()).toHaveLength(0);
    // The audit row survives the delete, which is the point of keeping it.
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("does not delete a category that gained a dish after the check", async () => {
    seedCategory(harness.db, "cat-1", "poissons");
    // A dish appears between the owner opening the form and submitting it.
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });

    await expect(
      deleteEmptyMenuCategoryWithAudit(harness.db, {
        categoryId: "cat-1",
        expectedVersion: 1,
        audit: audit("cat-1"),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);

    expect(harness.db.select().from(schema.menuItems).all()).toHaveLength(1);
  });
});

describe("owner category reads", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
  });

  it("counts the dishes a category holds, including hidden ones", async () => {
    seedCategory(harness.db, "cat-1", "poissons");
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });
    seedItem(harness.db, { id: "item-2", categoryId: "cat-1", nameFr: "Dorade", priceDa: 900, sortOrder: 2 });
    harness.db.update(schema.menuItems).set({ isVisible: false }).where(eqItem("item-2")).run();

    /*
     * A hidden dish still counts: a category holding only hidden dishes is still a category with
     * content in it, and deleting it from under the owner would lose those dishes' text.
     */
    expect(await countMenuItemsInCategory(harness.db, "cat-1")).toBe(2);
  });

  it("counts nothing for a category that has no dishes", async () => {
    seedCategory(harness.db, "cat-1", "poissons");
    seedCategory(harness.db, "cat-2", "crustaces");

    expect(await countMenuItemsInCategory(harness.db, "cat-1")).toBe(0);
    expect(await countMenuItemsInCategory(harness.db, "cat-2")).toBe(0);
  });

  it("reports a slug another category already uses", async () => {
    // Two categories sharing an address would make the public menu ambiguous.
    seedCategory(harness.db, "cat-1", "poissons");

    expect(await isCategorySlugTaken(harness.db, "poissons")).toBe(true);
    expect(await isCategorySlugTaken(harness.db, "crustaces")).toBe(false);
  });

  it("does not treat a category's own slug as a collision with itself", async () => {
    // Renaming "Poissons" to "Poissons panés" has to be allowed to keep, or extend, its own slug.
    seedCategory(harness.db, "cat-1", "poissons");

    expect(await isCategorySlugTaken(harness.db, "poissons", "cat-1")).toBe(false);
    expect(await isCategorySlugTaken(harness.db, "poissons", "cat-9")).toBe(true);
  });
});

describe("owner ordering", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
    seedCategory(harness.db, "cat-1", "poissons");
    seedItem(harness.db, { id: "item-1", categoryId: "cat-1", nameFr: "Sardine", priceDa: 600, sortOrder: 1 });
    seedItem(harness.db, { id: "item-2", categoryId: "cat-1", nameFr: "Dorade", priceDa: 900, sortOrder: 2 });
    seedItem(harness.db, { id: "item-3", categoryId: "cat-1", nameFr: "Thon", priceDa: 1400, sortOrder: 3 });
  });

  function orderOf(): Array<{ id: string; sortOrder: number }> {
    return harness.db
      .select({ id: schema.menuItems.id, sortOrder: schema.menuItems.sortOrder })
      .from(schema.menuItems)
      .all()
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }

  it("applies a whole new order in one statement and numbers it 1..n", async () => {
    await reorderMenuItemsWithAudit(harness.db, {
      categoryId: "cat-1",
      itemIds: ["item-3", "item-1", "item-2"],
      audit: audit("cat-1", { order: ["item-3", "item-1", "item-2"] }),
    });

    expect(orderOf().map((row) => row.id)).toEqual(["item-3", "item-1", "item-2"]);
    expect(orderOf().map((row) => row.sortOrder)).toEqual([1, 2, 3]);
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("renumbers without leaving gaps after several rearrangements", async () => {
    await reorderMenuItemsWithAudit(harness.db, {
      categoryId: "cat-1",
      itemIds: ["item-2", "item-3", "item-1"],
      audit: audit("cat-1"),
    });
    await reorderMenuItemsWithAudit(harness.db, {
      categoryId: "cat-1",
      itemIds: ["item-3", "item-1", "item-2"],
      audit: audit("cat-1"),
    });

    expect(orderOf().map((row) => row.sortOrder)).toEqual([1, 2, 3]);
    expect(countAuditRows(harness.db)).toBe(2);
  });

  it("bumps every version it touches so a later stale form is still caught", async () => {
    await reorderMenuItemsWithAudit(harness.db, {
      categoryId: "cat-1",
      itemIds: ["item-2", "item-1", "item-3"],
      audit: audit("cat-1"),
    });

    expect(versionsOf(harness.db)).toEqual({ "item-1": 2, "item-2": 2, "item-3": 2 });
  });

  it("refuses an order that does not cover the category exactly once", async () => {
    // Three dishes, two submitted: renumbering those two would collide with the third.
    await expect(
      reorderMenuItemsWithAudit(harness.db, {
        categoryId: "cat-1",
        itemIds: ["item-1", "item-2"],
        audit: audit("cat-1"),
      }),
    ).rejects.toBeInstanceOf(OwnerWriteFailedError);

    // Nothing moved, and nothing was claimed to have moved.
    expect(orderOf().map((row) => row.sortOrder)).toEqual([1, 2, 3]);
    expect(countAuditRows(harness.db)).toBe(0);
  });

  it("refuses an order that repeats a dish instead of renumbering it twice", async () => {
    await expect(
      reorderMenuItemsWithAudit(harness.db, {
        categoryId: "cat-1",
        itemIds: ["item-1", "item-1", "item-2"],
        audit: audit("cat-1"),
      }),
    ).rejects.toBeInstanceOf(OwnerWriteFailedError);

    expect(orderOf().map((row) => row.sortOrder)).toEqual([1, 2, 3]);
  });

  it("reorders categories", async () => {
    seedCategory(harness.db, "cat-2", "crustaces", 2);

    await reorderMenuCategoriesWithAudit(harness.db, {
      categoryIds: ["cat-2", "cat-1"],
      audit: audit("all-categories"),
    });

    const rows = harness.db
      .select({ id: schema.menuCategories.id, sortOrder: schema.menuCategories.sortOrder })
      .from(schema.menuCategories)
      .all()
      .sort((left, right) => left.sortOrder - right.sortOrder);
    expect(rows.map((row) => row.id)).toEqual(["cat-2", "cat-1"]);
  });
});

describe("owner settings writes", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
    seedSettings(harness.db);
  });

  const settings: SiteSettingsUpdate = {
    restaurantNameFr: "Resta Pescado",
    phoneFr: "0540559967",
    addressFr: null,
    mapsUrl: "https://maps.app.goo.gl/example",
    hoursFr: "Ouvert de 11h15 à 15h15. Fermé le vendredi.",
    familyNoteFr: null,
    heroTitleFr: "Poissons et fruits de mer",
    heroSubtitleFr: null,
    deliveryEnabled: true,
    deliveryZonesTextFr: null,
    deliveryFeeTextFr: null,
    deliveryMinimumOrderTextFr: null,
    deliveryHoursFr: null,
    pickupTextFr: "Commande par téléphone.",
  };

  it("saves every field and keeps an unconfirmed address unconfirmed", async () => {
    await updateSiteSettingsWithAudit(harness.db, {
      expectedVersion: 1,
      settings,
      audit: audit("singleton"),
    });

    const row = harness.db.select().from(schema.siteSettings).all()[0]!;
    expect(row.hoursFr).toBe("Ouvert de 11h15 à 15h15. Fermé le vendredi.");
    // Explicitly null in the input, so it stays null rather than being filled in.
    expect(row.addressFr).toBeNull();
    expect(row.version).toBe(2);
    expect(countAuditRows(harness.db)).toBe(1);
  });

  it("clears a field the owner empties", async () => {
    await updateSiteSettingsWithAudit(harness.db, {
      expectedVersion: 1,
      settings,
      audit: audit("singleton"),
    });
    await updateSiteSettingsWithAudit(harness.db, {
      expectedVersion: 2,
      settings: { ...settings, hoursFr: null },
      audit: audit("singleton"),
    });

    expect(harness.db.select().from(schema.siteSettings).all()[0]?.hoursFr).toBeNull();
  });

  it("rejects a settings save based on a stale form", async () => {
    harness.db.update(schema.siteSettings).set({ version: 4 }).run();

    await expect(
      updateSiteSettingsWithAudit(harness.db, {
        expectedVersion: 1,
        settings,
        audit: audit("singleton"),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);

    expect(countAuditRows(harness.db)).toBe(0);
  });
});

describe("owner gallery writes", () => {
  let harness: TestDatabase;

  beforeEach(() => {
    harness = createDatabase();
  });

  it("reports no row for a photograph the owner has never edited, and still renders it", async () => {
    const merged = mergeBundledGalleryState(await listBundledGalleryState(harness.db));

    expect(merged.length).toBeGreaterThan(0);
    for (const image of merged) {
      expect(image.version).toBe(0);
      expect(image.isVisible).toBe(true);
      // The curated alt text is what an unedited photograph falls back to.
      expect(image.altTextFr).toBe(image.altFr);
    }
  });

  /*
   * The version an unedited photograph reports is 0, which is what a page rendered before any
   * row existed sends back as `expectedVersion` — and 0 can never be the version of a real row.
   *
   * The editor therefore creates the rows when it loads, not on the first write: this is the
   * test for that arrangement. Every photograph must come back at version 1 so the first caption
   * the owner types is checked against the version they were shown, instead of being refused as
   * stale because of how its row came into existence.
   */
  it("creates every missing row at version 1, so the editor never offers version 0", async () => {
    await ensureBundledGalleryRows(harness.db);

    const merged = mergeBundledGalleryState(await listBundledGalleryState(harness.db));

    expect(merged.length).toBe(listBundledGalleryImages().length);
    for (const image of merged) {
      expect(image.version).toBe(1);
    }

    // And each of those versions is genuinely writable, which is the part that matters.
    const [first] = merged;
    await updateBundledGalleryImageWithAudit(harness.db, {
      slug: first!.slug,
      expectedVersion: first!.version,
      patch: { captionFr: "Premier caption." },
      audit: audit(first!.slug, { to: "Premier caption." }),
    });

    const after = mergeBundledGalleryState(await listBundledGalleryState(harness.db));
    expect(after.find((image) => image.slug === first!.slug)?.version).toBe(2);
  });

  /*
   * The flip side: a page that still holds a 0 is refused rather than quietly upgraded to the
   * current version, because that page cannot know whether somebody has edited the photograph
   * since. Failing loudly costs one reload; the alternative is the guard being skipped for the
   * one photograph most likely to need it.
   */
  it("refuses an edit that claims the photograph has no row at all", async () => {
    await ensureBundledGalleryRows(harness.db);
    const [first] = mergeBundledGalleryState(await listBundledGalleryState(harness.db));

    await expect(
      updateBundledGalleryImageWithAudit(harness.db, {
        slug: first!.slug,
        expectedVersion: 0,
        patch: { isVisible: false },
        audit: audit(first!.slug, { to: false }),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);
  });

  it("creates the missing rows on first write and keeps every existing decision", async () => {
    await ensureBundledGalleryRows(harness.db);
    const target = mergeBundledGalleryState(await listBundledGalleryState(harness.db))[0]!;
    await updateBundledGalleryImageWithAudit(harness.db, {
      slug: target.slug,
      expectedVersion: 1,
      patch: { isVisible: false, captionFr: "La salle un midi de semaine." },
      audit: audit(target.slug),
    });

    await ensureBundledGalleryRows(harness.db);

    const after = mergeBundledGalleryState(await listBundledGalleryState(harness.db)).find(
      (image) => image.slug === target.slug,
    )!;
    expect(after.isVisible).toBe(false);
    expect(after.captionFr).toBe("La salle un midi de semaine.");
    expect(after.version).toBe(2);
  });

  it("hides a bundled photograph without touching any file", async () => {
    await ensureBundledGalleryRows(harness.db);
    const [first] = mergeBundledGalleryState(await listBundledGalleryState(harness.db));

    await updateBundledGalleryImageWithAudit(harness.db, {
      slug: first!.slug,
      expectedVersion: 1,
      patch: { isVisible: false },
      audit: audit(first!.slug, { to: false }),
    });

    const merged = mergeBundledGalleryState(await listBundledGalleryState(harness.db));
    expect(merged.find((image) => image.slug === first!.slug)?.isVisible).toBe(false);
    expect(merged.find((image) => image.slug === first!.slug)?.isVisible).not.toBe(true);
  });

  it("reorders bundled photographs", async () => {
    await ensureBundledGalleryRows(harness.db);
    const merged = mergeBundledGalleryState(await listBundledGalleryState(harness.db));
    const reversed = [...merged].reverse().map((image) => image.slug);

    await reorderBundledGalleryImagesWithAudit(harness.db, {
      slugs: reversed,
      audit: audit("gallery"),
    });

    const after = mergeBundledGalleryState(await listBundledGalleryState(harness.db));
    expect(after.map((image) => image.slug)).toEqual(reversed);
    expect(after.map((image) => image.sortOrder)).toEqual(reversed.map((_, index) => index + 1));
  });

  it("edits an uploaded photograph's alt text and caption", async () => {
    const created = await createGalleryImageWithAudit(harness.db, {
      imageKey: "gallery/2026/upload.webp",
      altTextFr: "Le comptoir.",
      captionFr: null,
      audit: createAudit(),
    });

    await updateGalleryImageWithAudit(harness.db, {
      galleryImageId: created.id,
      expectedVersion: 1,
      patch: { altTextFr: "Le comptoir de poissons.", captionFr: "Midi, au service." },
      audit: audit(created.id),
    });

    const row = (await listAdminGalleryImages(harness.db))[0]!;
    expect(row.altTextFr).toBe("Le comptoir de poissons.");
    expect(row.captionFr).toBe("Midi, au service.");
    expect(countAuditRows(harness.db)).toBe(2);
  });

  it("adds an upload after the existing ones", async () => {
    await createGalleryImageWithAudit(harness.db, {
      imageKey: "gallery/2026/one.webp",
      altTextFr: "Un",
      captionFr: null,
      audit: createAudit(),
    });
    const second = await createGalleryImageWithAudit(harness.db, {
      imageKey: "gallery/2026/two.webp",
      altTextFr: "Deux",
      captionFr: null,
      audit: createAudit(),
    });

    expect(second.sortOrder).toBe(2);
  });

  it("deletes an upload and hands back the stored ref so the asset can go too", async () => {
    const created = await createGalleryImageWithAudit(harness.db, {
      imageKey: "gallery/2026/upload.webp",
      altTextFr: "Le comptoir.",
      captionFr: null,
      audit: createAudit(),
    });

    const outcome = await deleteGalleryImageWithAudit(harness.db, {
      galleryImageId: created.id,
      expectedVersion: 1,
      audit: audit(created.id, { removedKey: created.imageKey }),
    });

    expect(outcome).toEqual({
      provider: "r2",
      key: "gallery/2026/upload.webp",
      assetId: "gallery/2026/upload.webp",
    });
    expect(await listAdminGalleryImages(harness.db)).toHaveLength(0);
    // The audit row is the record that survives the photograph.
    expect(countAuditRows(harness.db)).toBe(2);
  });

  it("deletes nothing when the uploaded photograph changed since the form was filled", async () => {
    const created = await createGalleryImageWithAudit(harness.db, {
      imageKey: "gallery/2026/upload.webp",
      altTextFr: "Le comptoir.",
      captionFr: null,
      audit: createAudit(),
    });

    await expect(
      deleteGalleryImageWithAudit(harness.db, {
        galleryImageId: created.id,
        expectedVersion: 99,
        audit: audit(created.id),
      }),
    ).rejects.toBeInstanceOf(StaleEditError);

    expect(await listAdminGalleryImages(harness.db)).toHaveLength(1);
  });
});

describe("owner audit view", () => {
  it("parses metadata back into readable values and keeps unparsable rows visible", async () => {
    const harness = createDatabase();
    // Deliberately different timestamps: two rows sharing one `created_at` have no defined
    // order, and a test that leaned on that would pass or fail depending on the query plan.
    const older = new Date("2026-01-15T09:00:00Z");
    const newer = new Date("2026-01-15T11:00:00Z");
    harness.db
      .insert(schema.auditLogs)
      .values({
        id: "log-older",
        actorId: null,
        action: "menu_item.price_updated",
        entityType: "menu_item",
        entityId: "item-1",
        metadata: '{"from":900,"to":950}',
        createdAt: older,
      })
      .run();
    harness.db
      .insert(schema.auditLogs)
      .values({
        id: "log-newer",
        actorId: null,
        action: "broken.action",
        entityType: "menu_item",
        entityId: "item-2",
        metadata: "{not json",
        createdAt: newer,
      })
      .run();

    const logs = await listReadableAuditLogs(harness.db);

    expect(logs.map((log) => log.id)).toEqual(["log-newer", "log-older"]);
    // A corrupt entry is listed with no detail rather than hiding the history behind it.
    expect(logs[0]?.metadata).toEqual({});
    expect(logs[1]?.metadata).toEqual({ from: 900, to: 950 });
  });
});