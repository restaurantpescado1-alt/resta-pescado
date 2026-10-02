import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import { applyMigrations, markMigrationApplied } from "../../scripts/migrate";
import * as schema from "../../src/db/schema";
import {
  getPublicGalleryImages,
  getPublicMenu,
  getSiteSettings,
} from "../../src/db/repositories/menu";
import { selectHomePreview, telHref } from "../../src/lib/public-site";
import type { MenuItemRow } from "../../src/db/schema";

/**
 * Phase 2 data behaviour: the nullable description, the separate fish reference
 * column, the gallery read, and the neutral home preview selection.
 */

type TestDatabase = ReturnType<typeof createDatabase>;

function createDatabase() {
  const native = new Database(":memory:");
  native.pragma("foreign_keys = ON");
  applyMigrations(native);
  const db = drizzle(native, { schema });
  return { db, native };
}

function seed(db: TestDatabase["db"]) {
  const at = new Date("2026-01-15T10:00:00Z");
  db.insert(schema.menuCategories)
    .values({ id: "cat", nameFr: "Nos Poissons", slug: "poissons", sortOrder: 1, isVisible: true, createdAt: at, updatedAt: at })
    .run();
}

describe("menu items without a description", () => {
  it("stores and reads back a null description", async () => {
    const { db, native } = createDatabase();
    seed(db);
    db.insert(schema.menuItems)
      .values({ id: "i1", categoryId: "cat", nameFr: "Dorade", descriptionFr: null, priceDa: 1200, createdAt: new Date(), updatedAt: new Date() })
      .run();

    const menu = await getPublicMenu(db);
    expect(menu.categories[0]?.items[0]?.descriptionFr).toBeNull();

    // And it is genuinely a SQL NULL, not the empty string Phase 1 used.
    const raw = native
      .prepare("SELECT description_fr, typeof(description_fr) AS t FROM menu_items WHERE id = 'i1'")
      .get() as { description_fr: unknown; t: string };
    expect(raw.description_fr).toBeNull();
    expect(raw.t).toBe("null");

    native.close();
  });

  it("still accepts a description when the owner writes one", async () => {
    const { db, native } = createDatabase();
    seed(db);
    db.insert(schema.menuItems)
      .values({ id: "i1", categoryId: "cat", nameFr: "Dorade", descriptionFr: "Entière.", priceDa: 1200, createdAt: new Date(), updatedAt: new Date() })
      .run();

    const menu = await getPublicMenu(db);
    expect(menu.categories[0]?.items[0]?.descriptionFr).toBe("Entière.");
    native.close();
  });
});

describe("fish reference slug is independent of the dish photo", () => {
  it("keeps both columns separately addressable", async () => {
    const { db, native } = createDatabase();
    seed(db);
    db.insert(schema.menuItems)
      .values({ id: "withBoth", categoryId: "cat", nameFr: "Dorade", priceDa: 1200, imageKey: "menu/2026/a.webp", fishReferenceSlug: "dorade", createdAt: new Date(), updatedAt: new Date() })
      .run();
    db.insert(schema.menuItems)
      .values({ id: "fishOnly", categoryId: "cat", nameFr: "Loup de mer", priceDa: 1400, imageKey: null, fishReferenceSlug: "loup-de-mer", createdAt: new Date(), updatedAt: new Date() })
      .run();
    db.insert(schema.menuItems)
      .values({ id: "neither", categoryId: "cat", nameFr: "Soda", priceDa: 50, imageKey: null, fishReferenceSlug: null, createdAt: new Date(), updatedAt: new Date() })
      .run();

    const items = (await getPublicMenu(db)).categories[0]!.items;
    const byId = Object.fromEntries(items.map((item) => [item.id, item]));

    expect(byId.withBoth?.imageKey).toBe("menu/2026/a.webp");
    expect(byId.withBoth?.fishReferenceSlug).toBe("dorade");
    expect(byId.fishOnly?.imageKey).toBeNull();
    expect(byId.fishOnly?.fishReferenceSlug).toBe("loup-de-mer");
    expect(byId.neither?.imageKey).toBeNull();
    expect(byId.neither?.fishReferenceSlug).toBeNull();

    native.close();
  });
});

describe("getPublicGalleryImages", () => {
  it("returns an empty list when there are no photographs", async () => {
    const { db, native } = createDatabase();
    expect(await getPublicGalleryImages(db)).toEqual([]);
    native.close();
  });

  it("returns visible images in manual sort order", async () => {
    const { db, native } = createDatabase();
    const at = new Date();
    db.insert(schema.galleryImages)
      .values([
        { id: "g2", imageKey: "gallery/2026/b.webp", altTextFr: "La salle", sortOrder: 2, isVisible: true, createdAt: at, updatedAt: at },
        { id: "g1", imageKey: "gallery/2026/a.webp", altTextFr: "Le comptoir", sortOrder: 1, isVisible: true, createdAt: at, updatedAt: at },
        { id: "hidden", imageKey: "gallery/2026/c.webp", altTextFr: "Cachée", sortOrder: 0, isVisible: false, createdAt: at, updatedAt: at },
      ])
      .run();

    const images = await getPublicGalleryImages(db);
    expect(images.map((image) => image.id)).toEqual(["g1", "g2"]);
    native.close();
  });

  /**
   * `alt_text_fr` is deliberately NOT NULL, unlike `menu_items.description_fr`. An
   * undescribed photograph helps nobody, and a screen-reader user has no other way to
   * learn what it shows.
   */
  it("refuses a gallery image with no alt text", () => {
    const { db, native } = createDatabase();
    expect(() =>
      db.insert(schema.galleryImages)
        .values({
          id: "g",
          imageKey: "gallery/2026/a.webp",
          altTextFr: null as unknown as string,
          sortOrder: 1,
          isVisible: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run(),
    ).toThrow();
    native.close();
  });
});

/**
 * Migration bookkeeping.
 *
 * The local flow applies migrations through wrangler, but the seed script and these
 * tests drive a raw SQLite handle instead. Both paths share `__drizzle_migrations`, so
 * a database can end up with the Phase 2 schema present and the bookkeeping table
 * missing, or the table present without the row. `markMigrationApplied` is what
 * reconciles that, and it has to actually insert.
 */
describe("markMigrationApplied", () => {
  const migrationsTable = "__drizzle_migrations";

  it("records the migration even when it creates the bookkeeping table itself", () => {
    const native = new Database(":memory:");
    // The schema is already applied but no bookkeeping exists at all, which is exactly
    // the state that used to make this a silent no-op.
    native.exec("CREATE TABLE marker (id INTEGER PRIMARY KEY)");
    applyMigrations(native);

    const rowsBefore = native
      .prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = '${migrationsTable}'`)
      .get() as { n: number };
    expect(rowsBefore.n).toBe(1);

    native.prepare(`DELETE FROM ${migrationsTable}`).run();

    markMigrationApplied(native, "0001_phase2_public_site");

    const recorded = native
      .prepare(`SELECT hash FROM ${migrationsTable}`)
      .all() as Array<{ hash: string }>;
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.hash).toMatch(/^[0-9a-f]{64}$/);

    native.close();
  });

  it("does not duplicate a migration that is already recorded", () => {
    const native = new Database(":memory:");
    applyMigrations(native);

    markMigrationApplied(native, "0001_phase2_public_site");
    const first = native.prepare(`SELECT count(*) AS n FROM ${migrationsTable}`).get() as {
      n: number;
    };

    markMigrationApplied(native, "0001_phase2_public_site");
    const second = native.prepare(`SELECT count(*) AS n FROM ${migrationsTable}`).get() as {
      n: number;
    };

    expect(second.n).toBe(first.n);
    native.close();
  });

  it("stops the phase 2 migration from replaying once it is recorded", () => {
    const native = new Database(":memory:");
    applyMigrations(native);
    markMigrationApplied(native, "0001_phase2_public_site");

    // A replay would fail on the duplicate column, so this passing is the assertion.
    expect(() => applyMigrations(native)).not.toThrow();
    native.close();
  });
});

describe("selectHomePreview", () => {
  const make = (
    id: string,
    sortOrder: number,
    options: { isFeatured?: boolean; fish?: string } = {},
  ): MenuItemRow =>
    ({
      id,
      categoryId: "cat",
      nameFr: id,
      descriptionFr: null,
      priceDa: 100,
      imageKey: null,
      fishReferenceSlug: options.fish ?? null,
      isFeatured: options.isFeatured ?? false,
      isVisible: true,
      sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as MenuItemRow;

  it("returns nothing for an empty menu", () => {
    expect(selectHomePreview([], 6)).toEqual([]);
  });

  it("returns nothing when the limit is zero or negative", () => {
    const items = [make("a", 1, { fish: "dorade" })];
    expect(selectHomePreview(items, 0)).toEqual([]);
    expect(selectHomePreview(items, -1)).toEqual([]);
  });

  /**
   * With no owner selection the preview falls back to dishes that actually have a
   * species illustration, still in manual sort order.
   *
   * The filter is not cosmetic. The approved menu opens with salads and soups that have
   * neither a photo nor a fish reference, so slicing the first six dishes outright put
   * six blank tiles on the home page.
   */
  it("falls back to the first illustrated fish dishes in manual sort order", () => {
    const items = [
      make("salade", 1),
      make("soupe", 2),
      make("sardine", 3, { fish: "sardine" }),
      make("dorade", 4, { fish: "dorade" }),
      make("calamar", 5, { fish: "calamar" }),
    ];
    expect(selectHomePreview(items, 2).map((item) => item.id)).toEqual(["sardine", "dorade"]);
  });

  it("returns fewer than the limit rather than padding with blank dishes", () => {
    const items = [make("salade", 1), make("soupe", 2), make("dorade", 3, { fish: "dorade" })];
    expect(selectHomePreview(items, 6).map((item) => item.id)).toEqual(["dorade"]);
  });

  it("returns nothing when no dish has an illustration and none is featured", () => {
    const items = [make("salade", 1), make("soupe", 2)];
    expect(selectHomePreview(items, 6)).toEqual([]);
  });

  it("prefers the owner's featured selection once they make one", () => {
    const items = [
      make("a", 1, { fish: "dorade" }),
      make("b", 2, { isFeatured: true }),
      make("c", 3, { isFeatured: true }),
      make("d", 4, { fish: "calamar" }),
    ];
    expect(selectHomePreview(items, 5).map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("respects the limit when the owner has featured dishes", () => {
    const items = [
      make("a", 1, { isFeatured: true }),
      make("b", 2, { isFeatured: true }),
      make("c", 3, { isFeatured: true }),
    ];
    expect(selectHomePreview(items, 2).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("telHref", () => {
  it("produces a dialable value from the confirmed number", () => {
    expect(telHref("0540559967")).toBe("tel:0540559967");
  });

  it("strips spacing so a formatted number still dials", () => {
    expect(telHref("05 40 55 99 67")).toBe("tel:0540559967");
  });

  it("strips the punctuation a phone format might include", () => {
    expect(telHref("+213-5.40.55.99.67")).toBe("tel:+213540559967");
  });
});

describe("getSiteSettings", () => {
  it("returns null when no settings row exists", async () => {
    const { db, native } = createDatabase();
    expect(await getSiteSettings(db)).toBeNull();
    native.close();
  });
});
