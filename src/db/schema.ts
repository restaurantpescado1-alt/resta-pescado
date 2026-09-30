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
    descriptionFr: text("description_fr").notNull().default(""),
    /** Algerian dinar, whole units. Stored as an integer, never a float. */
    priceDa: integer("price_da").notNull(),
    /** Randomised R2 object key, or null while no image is set. */
    imageKey: text("image_key"),
    isFeatured: integer("is_featured", { mode: "boolean" }).notNull().default(false),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
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
    ...timestamps,
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
