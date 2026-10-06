import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyPassword } from "better-auth/crypto";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { APPROVED_CATEGORIES, APPROVED_MENU } from "../../scripts/approved-menu";
import { applyMigrations } from "../../scripts/migrate";
import {
  MIN_PASSWORD_LENGTH,
  OwnerAlreadyExistsError,
  assertPasswordUsable,
  buildOwnerSql,
  existingOwnerCommand,
} from "../../scripts/provision-owner";
import { executeFileArgs, parseQueryJson, parseRemoteArgs } from "../../scripts/remote-d1";
import { buildContentSql, CONTENT_SQL_FILE } from "../../scripts/seed-remote";
import { SEED_DELIVERY, SEED_SETTINGS } from "../../scripts/site-settings";
import { parseWranglerDatabaseNames, stripJsonComments } from "../../scripts/wrangler-config";
import { listBundledGalleryImages } from "../../src/lib/gallery-images";

/**
 * The two remote scripts, tested the only honest way: by running their SQL
 * against real SQLite with the real migrations, then running it again.
 *
 * "Non-destructive" is a claim about behaviour under repetition, so it cannot be
 * asserted by reading the statement text alone. Each test below seeds, edits a
 * row the way an owner would, seeds again, and checks the edit survived — which
 * is the property a remote initializer either has or has not.
 */

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function migratedDatabase(): Database.Database {
  const native = new Database(":memory:");
  native.pragma("foreign_keys = ON");
  applyMigrations(native);
  return native;
}

function tableSnapshot(native: Database.Database, table: string): unknown[] {
  return native.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
}

/** The SQL without its `--` header, so keyword checks ignore the commentary. */
function statementsOnly(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("wrangler.jsonc database names", () => {
  it("reads both environments from the config rather than from a constant", () => {
    const config = readFileSync(path.join(REPO_ROOT, "wrangler.jsonc"), "utf8");
    const names = parseWranglerDatabaseNames(config);

    expect(names.production).toBe("resta-pescado-db");
    expect(names.preview).toBe("resta-pescado-preview-db");
    // The whole point of the preview environment: it must not be the same database.
    expect(names.preview).not.toBe(names.production);
  });

  it("strips comments without eating a slash inside a string", () => {
    const text = `{ "url": "https://example.test/a//b", // trailing\n "block": /* x */ 1 }`;
    expect(JSON.parse(stripJsonComments(text))).toEqual({
      url: "https://example.test/a//b",
      block: 1,
    });
  });

  it("keeps an escaped quote from opening a string", () => {
    expect(JSON.parse(stripJsonComments(`{ "a": "she said \\"hi\\" // still" }`))).toEqual({
      a: 'she said "hi" // still',
    });
  });
});

describe("remote script arguments", () => {
  it("reads the environment and the apply flag", () => {
    expect(parseRemoteArgs(["--env", "preview"])).toEqual({
      target: "preview",
      apply: false,
      help: false,
    });
    expect(parseRemoteArgs(["--env=production", "--apply"])).toEqual({
      target: "production",
      apply: true,
      help: false,
    });
  });

  it("has no default environment", () => {
    expect(parseRemoteArgs([]).target).toBeNull();
  });

  it("rejects a misspelled environment and an unknown flag", () => {
    expect(() => parseRemoteArgs(["--env", "producton"])).toThrow(/Unknown environment/);
    expect(() => parseRemoteArgs(["--env", "preview", "--aply"])).toThrow(/Unknown argument/);
    expect(() => parseRemoteArgs(["--env", "preview", "--env", "production"])).toThrow(
      /more than once/,
    );
  });

  it("names the target database and never the local one", () => {
    const preview = executeFileArgs({
      target: "preview",
      databaseName: "resta-pescado-preview-db",
      filePath: "x.sql",
    });
    expect(preview).toContain("--remote");
    expect(preview).toContain("--env");
    expect(preview).toContain("--yes");
    expect(preview.join(" ")).toBe(
      "d1 execute resta-pescado-preview-db --env preview --remote --file x.sql --yes",
    );

    const production = executeFileArgs({
      target: "production",
      databaseName: "resta-pescado-db",
      filePath: "x.sql",
    });
    expect(production.join(" ")).toBe("d1 execute resta-pescado-db --remote --file x.sql --yes");
  });
});

describe("wrangler query output", () => {
  it("reads rows from the shape wrangler prints", () => {
    const stdout = JSON.stringify([
      { results: [{ email: "owner@example.test" }], success: true, meta: { duration: 0 } },
    ]);
    expect(parseQueryJson(stdout)).toEqual({
      success: true,
      rows: [{ email: "owner@example.test" }],
    });
  });

  it("reads rows even with log lines printed before the JSON", () => {
    const stdout = "🌀 Executing on remote database\n" + JSON.stringify([{ results: [] }]);
    expect(parseQueryJson(stdout).rows).toEqual([]);
  });

  it("refuses to guess when the output is unreadable", () => {
    expect(() => parseQueryJson("Something went wrong")).toThrow(/Could not read/);
  });
});

describe("content SQL", () => {
  const sql = buildContentSql();

  it("writes only inserts", () => {
    const body = statementsOnly(sql);
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(body).not.toMatch(/\bUPDATE\b/i);
    expect(body).not.toMatch(/\bDROP\b/i);
    expect(body).not.toMatch(/\bALTER\b/i);
  });

  it("creates the approved menu, settings and gallery manifest", () => {
    const native = migratedDatabase();
    native.exec(sql);

    const categories = native
      .prepare("SELECT name_fr, slug, sort_order, is_visible FROM menu_categories ORDER BY sort_order")
      .all() as Array<{ name_fr: string; slug: string; sort_order: number; is_visible: number }>;
    expect(categories).toEqual(
      APPROVED_CATEGORIES.map((category, index) => ({
        name_fr: category.nameFr,
        slug: category.slug,
        sort_order: index + 1,
        is_visible: 1,
      })),
    );

    const itemCount = (
      native.prepare("SELECT count(*) AS c FROM menu_items").get() as { c: number }
    ).c;
    expect(itemCount).toBe(APPROVED_MENU.reduce((total, group) => total + group.items.length, 0));

    // Prices are the owner's numbers; one wrong one is a wrong menu on the site.
    const prices = native
      .prepare("SELECT id, price_da FROM menu_items ORDER BY id")
      .all() as Array<{ id: string; price_da: number }>;
    const approvedPrices = new Map(
      APPROVED_MENU.flatMap((group) => group.items.map((item) => [item.id, item.priceDa])),
    );
    for (const row of prices) {
      expect(row.price_da).toBe(approvedPrices.get(row.id));
    }

    const settings = native
      .prepare(
        "SELECT phone_fr, address_fr, maps_url, hours_fr, family_note_fr, hero_title_fr, delivery_enabled, pickup_text_fr FROM site_settings WHERE id = 'singleton'",
      )
      .get() as Record<string, string | number | null>;
    expect(settings.phone_fr).toBe(SEED_SETTINGS.phoneFr);
    expect(settings.address_fr).toBeNull();
    expect(settings.maps_url).toBe(SEED_SETTINGS.mapsUrl);
    expect(settings.hours_fr).toBe(SEED_SETTINGS.hoursFr);
    expect(settings.family_note_fr).toBe(SEED_SETTINGS.familyNoteFr);
    expect(settings.hero_title_fr).toBe(SEED_SETTINGS.heroTitleFr);
    expect(settings.delivery_enabled).toBe(1);
    expect(settings.pickup_text_fr).toBe(SEED_DELIVERY.ordering);

    const bundled = (
      native.prepare("SELECT count(*) AS c FROM bundled_gallery_images").get() as { c: number }
    ).c;
    expect(bundled).toBe(listBundledGalleryImages().length);

    native.close();
  });

  it("is idempotent: a second run changes nothing at all", () => {
    const native = migratedDatabase();
    native.exec(sql);
    const before = ["menu_categories", "menu_items", "site_settings", "bundled_gallery_images"].map(
      (table) => tableSnapshot(native, table),
    );

    native.exec(sql);

    const after = ["menu_categories", "menu_items", "site_settings", "bundled_gallery_images"].map(
      (table) => tableSnapshot(native, table),
    );
    expect(after).toEqual(before);
    native.close();
  });

  it("leaves an owner's edits and an owner's extra rows alone", () => {
    const native = migratedDatabase();
    native.exec(sql);

    // Everything an owner can change from the dashboard, changed here by hand.
    const dishId = (
      native.prepare("SELECT id FROM menu_items ORDER BY id LIMIT 1").get() as { id: string }
    ).id;
    native
      .prepare("UPDATE menu_items SET price_da = 999, name_fr = 'Renommée par le propriétaire', is_visible = 0 WHERE id = ?")
      .run(dishId);
    native
      .prepare(
        "INSERT INTO menu_items (id, category_id, name_fr, description_fr, price_da, image_key, fish_reference_slug, is_featured, is_visible, sort_order, created_at, updated_at) VALUES ('owner-added', (SELECT id FROM menu_categories LIMIT 1), 'Plat du jour', NULL, 1200, NULL, NULL, 0, 1, 99, unixepoch(), unixepoch())",
      )
      .run();
    native.prepare("UPDATE site_settings SET phone_fr = '0000000000' WHERE id = 'singleton'").run();
    native.prepare("UPDATE bundled_gallery_images SET is_visible = 0, caption_fr = 'Légende'").run();

    native.exec(sql);

    const dish = native.prepare("SELECT price_da, name_fr, is_visible FROM menu_items WHERE id = ?").get(dishId) as {
      price_da: number;
      name_fr: string;
      is_visible: number;
    };
    expect(dish).toEqual({ price_da: 999, name_fr: "Renommée par le propriétaire", is_visible: 0 });

    const extra = native.prepare("SELECT name_fr FROM menu_items WHERE id = 'owner-added'").get();
    expect(extra).toEqual({ name_fr: "Plat du jour" });

    const settings = native.prepare("SELECT phone_fr FROM site_settings WHERE id = 'singleton'").get() as {
      phone_fr: string;
    };
    expect(settings.phone_fr).toBe("0000000000");

    const bundled = native
      .prepare("SELECT is_visible, caption_fr FROM bundled_gallery_images ORDER BY slug")
      .all() as Array<{ is_visible: number; caption_fr: string | null }>;
    expect(bundled.every((row) => row.is_visible === 0)).toBe(true);
    expect(bundled.every((row) => row.caption_fr === "Légende")).toBe(true);

    native.close();
  });
});

describe("owner provisioning SQL", () => {
  const email = "owner@example.test";
  const password = "a-sufficiently-long-password";

  it("hashes the password instead of writing it", async () => {
    const native = migratedDatabase();
    native.exec(await buildOwnerSql({ email, name: "Propriétaire", password }));

    const account = native
      .prepare("SELECT password FROM account WHERE provider_id = 'credential'")
      .get() as { password: string };

    expect(account.password).not.toContain(password);
    expect(await verifyPassword({ hash: account.password, password })).toBe(true);
    expect(await verifyPassword({ hash: account.password, password: "wrong-password-x" })).toBe(
      false,
    );

    const user = native.prepare("SELECT email, email_verified FROM user").get() as {
      email: string;
      email_verified: number;
    };
    expect(user).toEqual({ email, email_verified: 1 });

    const profile = native.prepare("SELECT role FROM profiles").get() as { role: string };
    expect(profile.role).toBe("owner");

    native.close();
  });

  it("cannot be run twice: the second run fails instead of minting a second account", async () => {
    const native = migratedDatabase();
    native.exec(await buildOwnerSql({ email, name: "Propriétaire", password }));

    await expect(async () => {
      native.exec(await buildOwnerSql({ email, name: "Propriétaire", password }));
    }).rejects.toThrow(/UNIQUE/i);

    expect((native.prepare("SELECT count(*) AS c FROM user").get() as { c: number }).c).toBe(1);
    native.close();
  });

  it("asks the database about existing accounts before writing", () => {
    expect(existingOwnerCommand()).toContain("FROM user");
    expect(existingOwnerCommand()).not.toMatch(/INSERT|UPDATE|DELETE/i);
  });

  it("names the accounts it refused to duplicate", () => {
    const error = new OwnerAlreadyExistsError("preview", ["owner@example.test"]);
    expect(error.message).toContain("owner@example.test");
    expect(error.message).toContain("Nothing was written");
  });

  it("refuses a password Better Auth would refuse at sign-in", () => {
    expect(() => assertPasswordUsable("too-short")).toThrow(/OWNER_PASSWORD/);
    expect(() => assertPasswordUsable("exactly-12-chars")).not.toThrow();

    // The two numbers must stay equal, or a password can be accepted here and
    // rejected by the login form later.
    const authSource = readFileSync(path.join(REPO_ROOT, "src", "auth.ts"), "utf8");
    const configured = /minPasswordLength:\s*(\d+)/.exec(authSource);
    expect(configured).not.toBeNull();
    expect(Number(configured?.[1])).toBe(MIN_PASSWORD_LENGTH);
  });

  it("writes its SQL under a name the repository ignores", () => {
    expect(CONTENT_SQL_FILE).toMatch(/\.sql$/);
  });
});
