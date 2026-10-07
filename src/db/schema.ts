import { relations, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

/**
 * Integer revision counter, bumped by every owner-facing edit, plus the token that
 * identifies one specific write.
 *
 * `updated_at` cannot play the guard role on its own. It is stored as whole Unix
 * seconds, so two edits inside the same second are indistinguishable, and a stale form
 * submitted after a newer edit would be accepted and silently overwrite it. A monotonic
 * counter is exact regardless of clock resolution, which is what makes the "someone else
 * already changed this" check in the owner dashboard trustworthy.
 *
 * `version` alone is still not quite enough, and the reason is specific. The audit row for
 * an edit is inserted in the same atomic batch as the edit, gated on the row now carrying
 * the version that edit was supposed to produce. Two owners' tabs, or one tab saved twice,
 * can collide exactly there: the stale write's target version is the same integer the
 * fresher write already produced, so the gate would pass and the audit log would claim a
 * change that was never applied.
 *
 * `edit_token` closes that. Each accepted write stamps a fresh random token, and the audit
 * insert is gated on *that* token, which no other write can produce. The audit row and the
 * change it describes therefore stand or fall together, which is the property
 * `docs/ARCHITECTURE.md` requires of every owner write.
 *
 * Null rather than a default: a row that has never been edited through the dashboard has no
 * token, and there is nothing to compare against.
 */
const revision = {
  version: integer("version").notNull().default(1),
  editToken: text("edit_token"),
};

/**
 * Better Auth core tables. Column names are dictated by the Better Auth Drizzle
 * adapter and must not be renamed.
 */
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [uniqueIndex("session_token_idx").on(table.token), index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/** One row per Better Auth user. V1 has a single row with role `owner`. */
export const profiles = sqliteTable("profiles", {
  id: text("id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Closed set. V1 ships `owner` only. */
  role: text("role", { enum: ["owner"] })
    .notNull()
    .default("owner"),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const menuCategories = sqliteTable(
  "menu_categories",
  {
    id: text("id").primaryKey(),
    nameFr: text("name_fr").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
    ...revision,
  },
  (table) => [uniqueIndex("menu_categories_slug_idx").on(table.slug)],
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "cascade" }),
    nameFr: text("name_fr").notNull(),
    /**
     * Optional. Deliberately nullable rather than an empty string, so "the owner
     * has not written a description" is representable and distinguishable from a
     * written one. Most of the confirmed Phase 2 menu has no description, and
     * `docs/CONTENT_POLICY.md` forbids inventing one.
     */
    descriptionFr: text("description_fr"),
    /** Algerian dinar, whole units. Stored as an integer, never a float. */
    priceDa: integer("price_da").notNull(),
    /**
     * Randomised delivery path of the dish photograph, or null while no image is
     * set. Shape `menu/{year}/{uuid}.{ext}` whichever provider hosts the bytes:
     * it is the key `/api/media` serves, the R2 object key historically, and the
     * ImageKit `filePath` today.
     */
    imageKey: text("image_key"),
    /**
     * Which provider stores the row's image. The migration default is `r2` (the
     * historical store); every new upload records the active provider's name so a
     * deletion knows which handle to call. Values only ever come from our code.
     */
    mediaProvider: text("media_provider", { enum: ["r2", "imagekit"] }).notNull().default("r2"),
    /**
     * Provider-specific identifier for the stored asset: the ImageKit `fileId`
     * used by its delete API. Legacy R2 rows have no such id — the object key is
     * the identifier — so it is null there and the delete acts on `imageKey`.
     */
    providerAssetId: text("provider_asset_id"),
    /**
     * Key into `src/lib/fish-images.ts`, pointing at an AI-generated *reference
     * illustration* of the fish species.
     *
     * Kept separate from `imageKey` on purpose. `imageKey` is a real photograph of
     * the cooked dish in the media store; this is a drawing of the animal, in
     * `public/`, that
     * answers "which fish is this" and must never be shown as "what the dish looks
     * like". Collapsing them into one column would make that distinction
     * unrenderable, and it would put a static asset behind the authenticated media
     * route. A real photo always wins over the illustration.
     */
    fishReferenceSlug: text("fish_reference_slug"),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
    ...revision,
  },
  (table) => [
    index("menu_items_category_id_idx").on(table.categoryId),
    index("menu_items_price_da_idx").on(table.priceDa),
    // Defence in depth. The Zod schema rejects these first; the database refuses
    // them even if a future write path forgets to validate.
    check("menu_items_price_da_positive", sql`${table.priceDa} > 0`),
  ],
);

/**
 * Restaurant photographs for the public gallery.
 *
 * Declared in `docs/ARCHITECTURE.md` and built now that `/galerie` reads it. The
 * table is deliberately empty on arrival: there is no restaurant photography yet,
 * and `docs/CONTENT_POLICY.md` ranks "no image" above invented imagery, so seeding
 * it with the AI fish illustrations or stock photos would be the wrong trade. The
 * page renders an honest empty state until real photographs are uploaded through
 * the owner dashboard.
 *
 * Note these are *photographs of the place*. Fish illustrations deliberately do not
 * live here, so a gallery visitor never confuses a reference drawing for a photo.
 */
export const galleryImages = sqliteTable(
  "gallery_images",
  {
    id: text("id").primaryKey(),
    /**
     * Randomised delivery path of the owner-uploaded photograph, following
     * `gallery/{year}/{uuid}.webp`. As with dish photos the shape is the same
     * whichever provider holds the bytes (R2 object key historically, ImageKit
     * `filePath` today) — `/api/media` is the only way a browser reaches it.
     */
    imageKey: text("image_key").notNull(),
    mediaProvider: text("media_provider", { enum: ["r2", "imagekit"] }).notNull().default("r2"),
    providerAssetId: text("provider_asset_id"),
    /**
     * Required. An image with no description is unusable to a screen-reader user, so
     * this is not nullable the way `menu_items.descriptionFr` is.
     */
    altTextFr: text("alt_text_fr").notNull(),
    /**
     * Optional French caption shown under the photograph, in the public grid.
     *
     * Separate from `altTextFr` on purpose. Alt text describes the photograph for someone
     * who cannot see it, and duplicating the caption there would be noise for a screen
     * reader. A caption is extra editorial text the owner may simply not want, so it is
     * nullable and blank stays blank: `docs/CONTENT_POLICY.md` forbids inventing menu
     * copy, and a caption is menu copy.
     */
    captionFr: text("caption_fr"),
    /** Manual order, like categories and items. Never alphabetical-by-locale. */
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
    ...revision,
  },
  (table) => [index("gallery_images_sort_order_idx").on(table.sortOrder)],
);

/**
 * Owner-managed state for the photographs bundled in `public/images/gallery/`.
 *
 * These files ship with the repository and are served by the Worker straight from
 * `public/`. They are listed in `src/lib/gallery-images.ts` and nothing can delete them,
 * which is what makes them different from an uploaded photograph. This table stores only
 * what the owner is allowed to change about them, and it is seeded from the manifest so a
 * fresh database has one row per bundled photograph.
 *
 * **Why not one table.** `gallery_images` holds provider-hosted photographs: `imageKey` is
 * `not null` and every path that serves or deletes an uploaded photograph goes through it. A
 * bundled photograph has no stored key at all, so putting both in one table would mean either
 * a nullable key on the uploaded side or a fake key on the bundled side. The fake key is the
 * dangerous one: it would let a `/images/gallery/webp/...` public path reach `provider.delete`
 * and quietly break the shipped asset. Two tables make that unrepresentable rather than
 * merely discouraged, and it is why `listBundledGalleryState` and `getAdminGallery` are
 * separate reads joined only when a page wants both.
 *
 * `slug` is the primary key and is the manifest key, so the rows and the files cannot be
 * ordered independently of each other and a photograph removed from the manifest simply
 * stops having a row.
 */
export const bundledGalleryImages = sqliteTable("bundled_gallery_images", {
  /** `BundledGalleryImage.slug` in `src/lib/gallery-images.ts`. */
  slug: text("slug").primaryKey(),
  /**
   * Owner-editable French alt text. Starts as the manifest's curated text, and may be
   * edited because the owner is the one who knows what the photograph shows. Never
   * blank: an image with no description is unusable to a screen-reader user.
   */
  altTextFr: text("alt_text_fr").notNull(),
  /** Owner-editable caption, or null when the owner has not written one. */
  captionFr: text("caption_fr"),
  /** Manual order. The manifest's curated order is the seed value, not the runtime order. */
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * Hides the photograph without touching the file.
   *
   * Defaults to published because these are the photographs already on the site: hiding
   * them is something the owner has to ask for, not something a missing row should imply.
   * A `false` default would blank `/galerie` on a database that was merely seeded and
   * never touched, which is a much worse failure than the reverse.
   */
  isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
  ...revision,
});

/**
 * Single row. The check constraint pins `id` so a second settings row cannot
 * appear by accident.
 */
export const siteSettings = sqliteTable(
  "site_settings",
  {
    id: text("id").primaryKey(),
    restaurantNameFr: text("restaurant_name_fr").notNull().default("Resta Pescado"),
    phoneFr: text("phone_fr"),
    addressFr: text("address_fr"),
    mapsUrl: text("maps_url"),
    hoursFr: text("hours_fr"),
    deliveryNoteFr: text("delivery_note_fr"),
    familyNoteFr: text("family_note_fr"),
    heroTitleFr: text("hero_title_fr"),
    heroSubtitleFr: text("hero_subtitle_fr"),

    // Delivery, as confirmed by the owner. Delivery is arranged and paid for by
    // phone rather than online, which is why these are free-text owner statements
    // rather than a structured delivery table with zones and fees: nothing is
    // computed from them in Phase 1, and inventing a zone list or a fee schedule
    // would be inventing facts. See docs/CONTENT_POLICY.md.
    deliveryEnabled: integer("delivery_enabled", { mode: "boolean" }).notNull().default(true),
    /** Where delivery reaches, in the owner's own words. */
    deliveryZonesTextFr: text("delivery_zones_text_fr"),
    /** Whether delivery costs anything, stated by the owner. */
    deliveryFeeTextFr: text("delivery_fee_text_fr"),
    deliveryMinimumOrderTextFr: text("delivery_minimum_order_text_fr"),
    deliveryHoursFr: text("delivery_hours_fr"),
    /** How to order, including the phone number or ordering channel. */
    pickupTextFr: text("pickup_text_fr"),

    ...timestamps,
    ...revision,
  },
  (table) => [check("site_settings_singleton", sql`${table.id} = 'singleton'`)],
);

/** Append-only. One row per audited action. */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    /** Better Auth user id, or null for a failed pre-auth attempt. */
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Dotted action name, e.g. `menu_item.price_updated`. */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    /** JSON-encoded detail, e.g. `{ "from": 900, "to": 950 }`. */
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

/**
 * Fixed-window counters for rate limiting. Keyed by actor plus action so one
 * noisy client cannot lock the owner out of unrelated operations.
 */
export const rateLimitCounters = sqliteTable(
  "rate_limit_counters",
  {
    key: text("key").primaryKey(),
    /** Unix seconds at which the current window started. */
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [index("rate_limit_window_idx").on(table.windowStart)],
);

export const menuCategoriesRelations = relations(menuCategories, ({ many }) => ({
  items: many(menuItems),
}));

export const menuItemsRelations = relations(menuItems, ({ one }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(user, {
    fields: [profiles.id],
    references: [user.id],
  }),
}));

export type MenuCategoryRow = typeof menuCategories.$inferSelect;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type SiteSettingsRow = typeof siteSettings.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
export type UserRow = typeof user.$inferSelect;
export type GalleryImageRow = typeof galleryImages.$inferSelect;
export type BundledGalleryImageRow = typeof bundledGalleryImages.$inferSelect;

/** Insert shapes, for the repositories that create rows. */
export type NewMenuCategory = typeof menuCategories.$inferInsert;
export type NewMenuItem = typeof menuItems.$inferInsert;
export type NewGalleryImage = typeof galleryImages.$inferInsert;
