import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { hashPassword } from "better-auth/crypto";

import { requireEnv } from "./env";
import {
  applyMigrations,
  hasPhase1Schema,
  hasPhase2Schema,
  hasPhase3Schema,
  markMigrationApplied,
} from "./migrate";
import { assertSeedIsSafe, DELETE_OPT_IN_ENV, isDestructiveResetAllowed } from "./local-db-guard";
import { APPROVED_CATEGORIES, APPROVED_MENU, allApprovedItems } from "./approved-menu";
import { SEED_DELIVERY, SEED_SETTINGS } from "./site-settings";
import { listBundledGalleryImages } from "../src/lib/gallery-images";
import * as schema from "../src/db/schema";

/**
 * Local development seed.
 *
 * Creates the single owner account, the owner-approved menu, and the confirmed site
 * settings. Everything written here is transcribed from `scripts/approved-menu.ts` or
 * from a fact the owner stated directly; nothing is invented.
 *
 * Safety: this script refuses to run outside a local Miniflare database and refuses to
 * run under NODE_ENV=production. See `scripts/local-db-guard.ts`. Production data is
 * changed only by migrations applied with `--remote`, which never delete rows.
 *
 * Three deliberate absences:
 *
 * - **No cooked-dish photographs.** Phase 1 seeded a flat grey placeholder so the R2
 *   route had something to serve. `docs/CONTENT_POLICY.md` ranks "no image" above
 *   invented imagery, and a grey rectangle on "Dorade" would be worse than nothing, so
 *   `image_key` stays null for every item. The end-to-end suite uploads its own image
 *   to exercise the media upload and delivery path.
 * - **No uploaded gallery images.** `gallery_images` stays empty and holds only owner
 *   uploads. The photographs that ship with the repository are *not* seeded into it:
 *   they are written to `bundled_gallery_images`, which stores no object key and cannot
 *   be mistaken for an upload. See `seedBundledGallery`.
 * - **No featured dishes.** `is_featured` stays false everywhere until the owner picks
 *   them, so nothing on the site claims the restaurant recommends a dish.
 *
 * Credentials come from the environment. Nothing here is a real secret and nothing
 * here is committed.
 */

const D1_STATE_DIR = ".wrangler/state/v3/d1";

/**
 * The database `npm run db:migrate:local` and `npm run preview` both use: the
 * top-level `d1_databases` entry in `wrangler.jsonc`. `package.json` hardcodes
 * the same name for the migrate script, so this is a repo-wide constant rather
 * than a value parsed out of the JSONC config.
 */
const TOP_LEVEL_DATABASE_NAME = "resta-pescado-db";

const WRANGLER_BIN = "node_modules/wrangler/bin/wrangler.js";

/**
 * Wrangler keys local D1 storage by `database_id`, so every environment block
 * (top-level, `--env preview`, ...) gets its own `.sqlite` file in the same
 * directory and directory order says nothing about which is which. When more
 * than one candidate exists, asking is the only honest option: run the same
 * harmless query `db:migrate:local` would run, and see which file the run
 * touched. Guessing — by name, by schema, by recency — would seed whichever
 * database sorts first, which is how the local suite can end up asserting
 * against a database the seed never wrote to.
 *
 * The single-candidate path is untouched, so CI (which only ever has one local
 * file) never spawns a subprocess here.
 */
async function findLocalD1File(): Promise<string> {
  const { readdir, stat } = await import("node:fs/promises");

  const missing = new Error(
    `No local D1 state under ${D1_STATE_DIR}. Run "npm run db:migrate:local" first.`,
  );

  let directories: string[];
  try {
    directories = (await readdir(D1_STATE_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    throw missing;
  }

  const directory = directories[0];
  if (directory === undefined) {
    throw missing;
  }

  const stateDir = path.join(D1_STATE_DIR, directory);
  const files = (await readdir(stateDir))
    .filter((file) => file.endsWith(".sqlite") && file !== "metadata.sqlite")
    .sort();
  if (files.length === 0) {
    throw new Error(`No .sqlite file found in ${stateDir}.`);
  }

  // Absolute, deliberately: `assertLocalDatabasePath` rejects a relative path
  // because a relative path means different files depending on the working
  // directory, so resolving here is what lets the guard prove the file is
  // inside `.wrangler/state`.
  const candidates = files.map((file) => path.resolve(path.join(stateDir, file)));
  const [only, ...restOfCandidates] = candidates;
  if (only !== undefined && restOfCandidates.length === 0) {
    return only;
  }

  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);

  const tracked = (candidate: string) => [candidate, `${candidate}-shm`, `${candidate}-wal`];
  const snapshot = async (): Promise<Map<string, number | null>> => {
    const entries = new Map<string, number | null>();
    for (const candidate of candidates) {
      for (const file of tracked(candidate)) {
        try {
          entries.set(file, (await stat(file)).mtimeMs);
        } catch {
          entries.set(file, null);
        }
      }
    }
    return entries;
  };

  const before = await snapshot();
  try {
    await run(
      process.execPath,
      [WRANGLER_BIN, "d1", "execute", TOP_LEVEL_DATABASE_NAME, "--local", "--command", "SELECT 1"],
      { timeout: 60_000, windowsHide: true },
    );
  } catch (error) {
    throw new Error(
      `Could not ask wrangler which local file holds "${TOP_LEVEL_DATABASE_NAME}" ` +
        `(is node_modules/wrangler installed?): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const after = await snapshot();

  const touched = candidates.filter((candidate) =>
    tracked(candidate).some((file) => before.get(file) !== after.get(file)),
  );
  const [hit, ...restOfHits] = touched;
  if (hit !== undefined && restOfHits.length === 0) {
    return hit;
  }

  throw new Error(
    `Several local D1 files exist under ${D1_STATE_DIR}, and none of them belongs to ` +
      `"${TOP_LEVEL_DATABASE_NAME}" as far as a probe of wrangler could tell:\n` +
      candidates.map((candidate) => `  - ${candidate}`).join("\n") +
      "\nRemove the files that belong to wrangler configs you no longer use, then run " +
      '"npm run db:migrate:local" followed by "npm run db:seed:local" again.',
  );
}

/**
 * Owner-confirmed delivery and site settings live in `scripts/site-settings.ts`,
 * shared with the remote seed so the two cannot drift apart.
 */

export async function seed(): Promise<void> {
  const ownerEmail = requireEnv("OWNER_EMAIL");
  const ownerPassword = requireEnv("OWNER_PASSWORD");
  const ownerName = process.env.OWNER_NAME ?? "Propriétaire";

  const sqlitePath = assertSeedIsSafe({ sqlitePath: await findLocalD1File() });
  const native = new Database(sqlitePath);
  native.pragma("journal_mode = WAL");

  // Drizzle is instantiated so the schema module is loaded and validated the same
  // way the app loads it, but the writes below are prepared statements because
  // they have to be idempotent.
  const _db = drizzle(native, { schema });
  void _db;

  // Only migrate when the schema is missing. `db:migrate:local` may have
  // already run through wrangler, which keeps its own bookkeeping table. A
  // Phase-1-only database still needs `0001` and `0002`, so the check is for the
  // newest schema, not for "some migration ran".
  if (!hasPhase3Schema(native)) {
    if (hasPhase1Schema(native) && !hasPhase2Schema(native)) {
      // Phase 1 landed via wrangler, which left `__drizzle_migrations` empty.
      // Record it so `applyMigrations` does not re-run `0000`.
      markMigrationApplied(native, "0000_phase1_foundation");
    }
    applyMigrations(native);
  }

  const existingUser = native
    .prepare("SELECT id FROM user WHERE email = ?")
    .get(ownerEmail) as { id: string } | undefined;
  const userId = existingUser?.id ?? crypto.randomUUID();

  // Read once, outside the transaction: the manifest is a module, so this cannot change
  // mid-write, and the summary below needs the count as well.
  const bundledImages = listBundledGalleryImages();

  native.exec("BEGIN");
  try {
    if (existingUser) {
      native.prepare("UPDATE user SET name = ? WHERE id = ?").run(ownerName, userId);
    } else {
      native
        .prepare(
          "INSERT INTO user (id, name, email, email_verified, image, created_at, updated_at) VALUES (?, ?, ?, 1, NULL, unixepoch(), unixepoch())",
        )
        .run(userId, ownerName, ownerEmail);

      const password = await hashPassword(ownerPassword);
      native
        .prepare(
          "INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (?, ?, ?, 'credential', ?, unixepoch(), unixepoch())",
        )
        .run(crypto.randomUUID(), userId, userId, password);
    }

    native
      .prepare(
        "INSERT INTO profiles (id, role, display_name, created_at, updated_at) VALUES (?, 'owner', ?, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name",
      )
      .run(userId, ownerName);

    // `DO UPDATE` so re-seeding restores the confirmed facts. There is no
    // settings UI yet, so the seed is the only writer of these columns and
    // nothing here can clobber an owner edit.
    native
      .prepare(
        "INSERT INTO site_settings (id, restaurant_name_fr, phone_fr, address_fr, maps_url, hours_fr, family_note_fr, hero_title_fr, hero_subtitle_fr, delivery_enabled, delivery_zones_text_fr, delivery_fee_text_fr, delivery_minimum_order_text_fr, delivery_hours_fr, pickup_text_fr, created_at, updated_at) VALUES ('singleton', 'Resta Pescado', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET phone_fr = excluded.phone_fr, address_fr = excluded.address_fr, maps_url = excluded.maps_url, hours_fr = excluded.hours_fr, family_note_fr = excluded.family_note_fr, hero_title_fr = excluded.hero_title_fr, hero_subtitle_fr = excluded.hero_subtitle_fr, delivery_enabled = excluded.delivery_enabled, delivery_zones_text_fr = excluded.delivery_zones_text_fr, delivery_fee_text_fr = excluded.delivery_fee_text_fr, delivery_minimum_order_text_fr = excluded.delivery_minimum_order_text_fr, delivery_hours_fr = excluded.delivery_hours_fr, pickup_text_fr = excluded.pickup_text_fr, updated_at = unixepoch()",
      )
      .run(
        SEED_SETTINGS.phoneFr,
        SEED_SETTINGS.addressFr,
        SEED_SETTINGS.mapsUrl,
        SEED_SETTINGS.hoursFr,
        SEED_SETTINGS.familyNoteFr,
        SEED_SETTINGS.heroTitleFr,
        SEED_SETTINGS.heroSubtitleFr,
        SEED_DELIVERY.enabled ? 1 : 0,
        SEED_DELIVERY.zones,
        SEED_DELIVERY.fee,
        SEED_DELIVERY.minimumOrder,
        SEED_DELIVERY.hours,
        SEED_DELIVERY.ordering,
      );

    // Categories, in the owner's order.
    const insertCategory = native.prepare(
      "INSERT INTO menu_categories (id, name_fr, slug, sort_order, is_visible, created_at, updated_at) VALUES (?, ?, ?, ?, 1, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET name_fr = excluded.name_fr, slug = excluded.slug, sort_order = excluded.sort_order, is_visible = 1, updated_at = unixepoch()",
    );
    for (const [index, category] of APPROVED_CATEGORIES.entries()) {
      insertCategory.run(category.id, category.nameFr, category.slug, index + 1);
    }

    // Items. `DO UPDATE` on every mutable field so a re-seed resets prices and fish
    // references to the approved values. `description_fr`, `image_key` and
    // `is_featured` are deliberately reset: the seed must not inherit an invented
    // description, never seeds a photo, and never claims the restaurant recommends a
    // dish. Featured selection belongs to the owner via the dashboard.
    const insertItem = native.prepare(
      "INSERT INTO menu_items (id, category_id, name_fr, description_fr, price_da, image_key, fish_reference_slug, is_featured, is_visible, sort_order, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, NULL, ?, 0, 1, ?, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET category_id = excluded.category_id, name_fr = excluded.name_fr, description_fr = NULL, price_da = excluded.price_da, image_key = NULL, fish_reference_slug = excluded.fish_reference_slug, is_featured = 0, is_visible = 1, sort_order = excluded.sort_order, updated_at = unixepoch()",
    );
    for (const group of APPROVED_MENU) {
      for (const [index, item] of group.items.entries()) {
        insertItem.run(
          item.id,
          group.categoryId,
          item.nameFr,
          item.priceDa,
          item.fishReferenceSlug ?? null,
          index + 1,
        );
      }
    }

    // Bundled photographs, one row per manifest entry, in the curated order.
    //
    // `sort_order` is restored from the manifest on every seed, because the manifest is
    // the curated baseline. `caption_fr` and `is_visible` are *not* touched, and
    // `alt_text_fr` is only inserted: those are owner decisions made through the
    // dashboard, and a re-seed that un-hid a photograph or dropped a caption would
    // silently undo them.
    //
    // Insert-only, so this is safe to run against a database that already has the rows.
    const bundledImages = listBundledGalleryImages();
    const insertBundled = native.prepare(
      "INSERT INTO bundled_gallery_images (slug, alt_text_fr, caption_fr, sort_order, is_visible, created_at, updated_at, version) VALUES (?, ?, NULL, ?, 1, unixepoch(), unixepoch(), 1) ON CONFLICT(slug) DO UPDATE SET sort_order = excluded.sort_order",
    );
    for (const [index, image] of bundledImages.entries()) {
      insertBundled.run(image.slug, image.altFr, index + 1);
    }

    // Remove anything the owner has not approved.
    //
    // This is a *local reset* convenience, gated behind SEED_ALLOW_DELETE=1, because
    // deleting a dish is exactly what must never happen to a real database. In
    // production the equivalent action is the owner using the dashboard, which is
    // deliberate and audited; migrations applied with `--remote` never delete rows.
    //
    // Upserting alone is not enough locally: a dish or category that used to exist, or
    // a row left by an earlier seed, would survive and then be served on the public
    // menu. Opting in makes the approved menu the whole truth for a dev database.
    if (isDestructiveResetAllowed()) {
      const approvedItemIds = allApprovedItems().map((item) => item.id);
      const approvedCategoryIds = APPROVED_CATEGORIES.map((category) => category.id);
      const { changes: removedItems } = native
        .prepare(
          `DELETE FROM menu_items WHERE id NOT IN (${approvedItemIds.map(() => "?").join(",")})`,
        )
        .run(...approvedItemIds);
      // Deleting a category cascades to its items via the foreign key.
      const { changes: removedCategories } = native
        .prepare(
          `DELETE FROM menu_categories WHERE id NOT IN (${approvedCategoryIds.map(() => "?").join(",")})`,
        )
        .run(...approvedCategoryIds);

      if (removedItems > 0 || removedCategories > 0) {
        console.log(`  removed   : ${removedItems} unapproved item(s), ${removedCategories} unapproved category(ies)`);
      }
    }

    native.exec("COMMIT");
  } catch (error) {
    native.exec("ROLLBACK");
    native.close();
    throw error;
  }

  native.close();

  const categoryCount = APPROVED_CATEGORIES.length;
  const allItems = APPROVED_MENU.flatMap((group) => group.items);
  const illustrationCount = allItems.filter((item) => item.fishReferenceSlug !== undefined).length;

  console.log("Local seed complete:");
  console.log(`  owner      : ${ownerEmail}`);
  console.log(`  database   : ${sqlitePath}`);
  console.log(`  categories : ${categoryCount}`);
  console.log(`  items      : ${allItems.length}`);
  console.log(`  fish refs  : ${illustrationCount} items with a reference illustration`);
  console.log(`  featured   : 0 (owner selects these from the dashboard)`);
  console.log(`  bundled    : ${bundledImages.length} photographs (owner edits preserved)`);
  console.log(`  uploads    : 0 images (gallery_images is for owner uploads only)`);
  console.log(`  photos     : 0 seeded (image_key null on every item)`);
  console.log(
    `  stale rows : ${isDestructiveResetAllowed() ? "removal enabled (SEED_ALLOW_DELETE=1)" : "left untouched (set SEED_ALLOW_DELETE=1 to reset)"}`,
  );
}

const invokedDirectly =
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-local.ts") === true;

if (invokedDirectly) {
  // `--reset` opts in to deleting menu rows that are not in the approved list. It is
  // a flag rather than an inline env assignment so `npm run db:reset:local` works the
  // same on Windows and POSIX without a `cross-env` dependency. The guard in
  // `scripts/local-db-guard.ts` has already established this is a local database by
  // the time any deletion is possible.
  if (process.argv.includes("--reset")) {
    process.env[DELETE_OPT_IN_ENV] = "1";
  }

  void (async () => {
    const { readEnvFile } = await import("./env");
    readEnvFile();
    await seed();
  })().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
