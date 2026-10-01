import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { hashPassword } from "better-auth/crypto";

import { requireEnv } from "./env";
import { applyMigrations, hasPhase1Schema } from "./migrate";
import * as schema from "../src/db/schema";
import { createPlaceholderPng, putLocalR2Object } from "./r2-local";

/**
 * Local development seed.
 *
 * Creates the single owner account, one visible category, and one visible dish,
 * then places a generated placeholder image in the local R2 simulation so the
 * image pipeline has something real to serve.
 *
 * The placeholder is a flat grey rectangle, not a photo. `docs/CONTENT_POLICY.md`
 * ranks "no image" above invented imagery, and Phase 1 only needs the plumbing to
 * work. Real photos arrive in Milestone 4.
 *
 * Credentials come from the environment. Nothing here is a real secret and
 * nothing here is committed.
 */

const D1_STATE_DIR = ".wrangler/state/v3/d1";

async function findLocalD1File(): Promise<string> {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");

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

  const files = await readdir(join(D1_STATE_DIR, directory));
  const sqlite = files.find((file) => file.endsWith(".sqlite"));
  if (sqlite === undefined) {
    throw new Error(`No .sqlite file found in ${D1_STATE_DIR}/${directory}.`);
  }

  return join(D1_STATE_DIR, directory, sqlite);
}

/**
 * Owner-confirmed delivery settings.
 *
 * Delivery is arranged and paid for by phone rather than online, so each field is
 * the owner's own statement. Every string below is a confirmed fact and nothing
 * more: no zone list, no fee amount, and no opening hours are invented, because
 * `docs/CONTENT_POLICY.md` rules out stating anything the owner has not confirmed.
 */
const SEED_DELIVERY = {
  enabled: true,
  zones:
    "La zone de livraison est confirmée par téléphone après avoir communiqué votre adresse.",
  fee: "Les frais de livraison sont communiqués par téléphone.",
  minimumOrder: "Il n'y a pas de commande minimum.",
  hours: "Les heures de livraison sont les mêmes que les heures d'ouverture du restaurant.",
  ordering: "Commande et livraison par téléphone au 0540559967. La livraison est payante.",
} as const;

const SEED_CATEGORY_ID = "dev-category-poissons";
const SEED_ITEM_ID = "dev-item-dorade";
/**
 * A fixed v4-shaped uuid so the seed is idempotent.
 *
 * It has to satisfy `R2_KEY_PATTERN` in `src/lib/validation.ts`, which the media
 * route and the price/image schemas both enforce. A readable name like
 * `dev-placeholder-dorade` would pass D1 but 404 through `/api/media`, so the
 * key is a valid uuid in every field.
 */
const SEED_IMAGE_UUID = "d0e7a1c4-8f3b-4c2a-9e5d-6b1f2a3c4d5e";
const SEED_IMAGE_KEY = `menu/${new Date().getUTCFullYear()}/${SEED_IMAGE_UUID}.png`;

export async function seed(): Promise<void> {
  const ownerEmail = requireEnv("OWNER_EMAIL");
  const ownerPassword = requireEnv("OWNER_PASSWORD");
  const ownerName = process.env.OWNER_NAME ?? "Propriétaire";

  const sqlitePath = await findLocalD1File();
  const native = new Database(sqlitePath);
  native.pragma("journal_mode = WAL");

  // Drizzle is instantiated so the schema module is loaded and validated the same
  // way the app loads it, but the writes below are prepared statements because
  // they have to be idempotent.
  const _db = drizzle(native, { schema });
  void _db;

  // Only migrate when the schema is missing. `db:migrate:local` may have
  // already run through wrangler, which keeps its own bookkeeping table.
  if (!hasPhase1Schema(native)) {
    applyMigrations(native);
  }

  const existingUser = native
    .prepare("SELECT id FROM user WHERE email = ?")
    .get(ownerEmail) as { id: string } | undefined;
  const userId = existingUser?.id ?? crypto.randomUUID();

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

    // `DO UPDATE` so re-seeding restores the confirmed delivery statements. There
    // is no settings UI yet, so the seed is the only writer of these columns and
    // nothing here can clobber an owner edit.
    native
      .prepare(
        "INSERT INTO site_settings (id, restaurant_name_fr, hero_title_fr, hero_subtitle_fr, delivery_enabled, delivery_zones_text_fr, delivery_fee_text_fr, delivery_minimum_order_text_fr, delivery_hours_fr, pickup_text_fr, created_at, updated_at) VALUES ('singleton', 'Resta Pescado', ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET hero_title_fr = excluded.hero_title_fr, hero_subtitle_fr = excluded.hero_subtitle_fr, delivery_enabled = excluded.delivery_enabled, delivery_zones_text_fr = excluded.delivery_zones_text_fr, delivery_fee_text_fr = excluded.delivery_fee_text_fr, delivery_minimum_order_text_fr = excluded.delivery_minimum_order_text_fr, delivery_hours_fr = excluded.delivery_hours_fr, pickup_text_fr = excluded.pickup_text_fr, updated_at = unixepoch()",
      )
      .run(
        "Poissons et fruits de mer, préparés à Alger.",
        "Une carte courte, révisée chaque jour.",
        SEED_DELIVERY.enabled ? 1 : 0,
        SEED_DELIVERY.zones,
        SEED_DELIVERY.fee,
        SEED_DELIVERY.minimumOrder,
        SEED_DELIVERY.hours,
        SEED_DELIVERY.ordering,
      );

    native
      .prepare(
        "INSERT INTO menu_categories (id, name_fr, slug, sort_order, is_visible, created_at, updated_at) VALUES (?, 'Poissons', 'poissons', 1, 1, unixepoch(), unixepoch()) ON CONFLICT(id) DO NOTHING",
      )
      .run(SEED_CATEGORY_ID);

    // `DO UPDATE` rather than `DO NOTHING` on the mutable fields, so re-running
    // the seed resets the price and image. The end-to-end suite asserts against
    // the seeded 900 DA dish, and without this a previous run that changed the
    // price would leak into the next one.
    native
      .prepare(
        "INSERT INTO menu_items (id, category_id, name_fr, description_fr, price_da, image_key, is_featured, is_visible, sort_order, created_at, updated_at) VALUES (?, ?, 'Dorade grillée', ?, 900, ?, 1, 1, 1, unixepoch(), unixepoch()) ON CONFLICT(id) DO UPDATE SET price_da = excluded.price_da, image_key = excluded.image_key, is_visible = excluded.is_visible, updated_at = unixepoch()",
      )
      .run(SEED_ITEM_ID, SEED_CATEGORY_ID, "Entière, distinguishable.", SEED_IMAGE_KEY);

    native.exec("COMMIT");
  } catch (error) {
    native.exec("ROLLBACK");
    native.close();
    throw error;
  }

  await putLocalR2Object(SEED_IMAGE_KEY, createPlaceholderPng(320, 240), "image/png");

  native.close();

  console.log("Local seed complete:");
  console.log(`  owner    : ${ownerEmail}`);
  console.log(`  category : Poissons (${SEED_CATEGORY_ID})`);
  console.log(`  dish     : Dorade grillée, 900 DA (${SEED_ITEM_ID})`);
  console.log(`  image    : ${SEED_IMAGE_KEY}`);
  console.log(`  database : ${sqlitePath}`);
}

const invokedDirectly =
  process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/seed-local.ts") === true;

if (invokedDirectly) {
  void (async () => {
    const { readEnvFile } = await import("./env");
    readEnvFile();
    await seed();
  })().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
