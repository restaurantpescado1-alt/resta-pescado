import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * The slice of the `better-sqlite3` API that `applyMigrations` needs. Declared
 * structurally so the function is not tied to one driver and can be pointed at a
 * `:memory:` database in the tests or at a wrangler-managed file in the seed.
 */
export interface MigrationTarget {
  exec(sql: string): unknown;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

/**
 * Whether the Phase 1 schema is already present.
 *
 * `wrangler d1 migrations apply` records its bookkeeping in `d1_migrations`,
 * not in the `__drizzle_migrations` table this module writes. So a database
 * migrated through wrangler looks unapplied to `applyMigrations` and would be
 * migrated a second time, failing on the first `CREATE TABLE`. The seed checks
 * this first and only applies the raw files when the schema is genuinely absent.
 */
export function hasPhase1Schema(native: MigrationTarget): boolean {
  const rows = native
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all("menu_items") as unknown[];
  return rows.length > 0;
}

/**
 * Whether the Phase 2 columns and tables are present.
 *
 * The seed needs a *newest* schema check rather than a "any migration ran" check:
 * a database can be Phase 1 only, and then the seed must still apply `0001` before
 * it can write `fish_reference_slug`.
 */
export function hasPhase2Schema(native: MigrationTarget): boolean {
  const columns = native.prepare("PRAGMA table_info(menu_items)").all() as unknown[];
  const hasFishColumn = columns.some((column) => {
    const name = (column as { name?: unknown }).name;
    return name === "fish_reference_slug";
  });
  const tables = native
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all("gallery_images") as unknown[];
  return hasFishColumn && tables.length > 0;
}

/**
 * Whether the Phase 3 tables and columns are present.
 *
 * Same reasoning as `hasPhase2Schema`: the seed needs to know it can write
 * `bundled_gallery_images` and read `gallery_images.caption_fr` before it tries,
 * rather than failing halfway through with a missing-column error. The table alone is
 * enough to identify the migration, because no earlier one creates it.
 */
export function hasPhase3Schema(native: MigrationTarget): boolean {
  const tables = native
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all("bundled_gallery_images") as unknown[];
  return tables.length > 0;
}

function hashMigration(cwd: string, tag: string): string {
  return createHash("sha256").update(readFileSync(join(resolve(cwd, "drizzle"), `${tag}.sql`), "utf8")).digest("hex");
}

/**
 * Records a migration as applied without running it.
 *
 * Needed for the mixed-provenance case: `db:migrate:local` applies Phase 1 through
 * wrangler, which bookskeeps in `d1_migrations` and leaves `__drizzle_migrations`
 * empty. `applyMigrations` therefore still considers `0000` pending and would fail on
 * its first `CREATE TABLE`. Marking it applied by hash lets `applyMigrations` pick up
 * exactly the migrations that are genuinely missing, including `0001`.
 *
 * Must only be called when the migration's effects are already observable in the
 * database.
 */
export function markMigrationApplied(
  native: MigrationTarget,
  tag: string,
  cwd: string = process.cwd(),
): void {
  native.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `);
// Two separate problems with the obvious `INSERT OR IGNORE ... SELECT`:
  //
  // 1. `SELECT ... FROM __drizzle_migrations` produces no rows when the table was just
  //    created empty by the statement above, so the insert silently did nothing and the
  //    migration looked unapplied on the next run.
  // 2. `OR IGNORE` cannot deduplicate here anyway. Drizzle's bookkeeping table has no
  //    unique index on `hash`, so every call appended another row.
  //
  // The guard is therefore explicit: one row when the hash is absent, none when it is
  // already recorded. The subquery still inherits the newest timestamp when rows exist.
  const hash = hashMigration(cwd, tag);
  native
    .prepare(
      "INSERT INTO __drizzle_migrations (hash, created_at) SELECT ?, coalesce((SELECT max(created_at) FROM __drizzle_migrations), 0) WHERE NOT EXISTS (SELECT 1 FROM __drizzle_migrations WHERE hash = ?)",
    )
    .run(hash, hash);
}

/**
 * Applies the Drizzle migration files in `drizzle/` to a plain SQLite file.
 *
 * The normal local flow applies migrations through wrangler
 * (`npm run db:migrate:local`), which writes the same `__drizzle_migrations`
 * bookkeeping table with the same sha256 hashes. This reader exists for the two
 * places that need a raw SQLite handle instead: the seed script, and the Vitest
 * suites that exercise the repository functions. Because both paths share the
 * bookkeeping table, a database seeded here and one migrated by wrangler are
 * indistinguishable, and re-running either is a no-op.
 */
export function applyMigrations(
  native: MigrationTarget,
  cwd: string = process.cwd(),
): string[] {
  const dir = resolve(cwd, "drizzle");
  const journalPath = join(dir, "meta", "_journal.json");

  if (!existsSync(journalPath)) {
    throw new Error('No drizzle/meta/_journal.json. Run "npm run db:generate".');
  }

  native.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    );
  `);

  const applied = new Set(
    (native.prepare("SELECT hash FROM __drizzle_migrations").all() as { hash: string }[]).map(
      (row) => row.hash,
    ),
  );

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string; when: number }[];
  };

  const newlyApplied: string[] = [];

  for (const entry of [...journal.entries].sort((a, b) => a.when - b.when)) {
    const path = join(dir, `${entry.tag}.sql`);
    const sql = readFileSync(path, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");

    if (applied.has(hash)) {
      continue;
    }

    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    native.exec("BEGIN");
    try {
      for (const statement of statements) {
        native.exec(statement);
      }
      native
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(hash, entry.when);
      native.exec("COMMIT");
    } catch (error) {
      native.exec("ROLLBACK");
      throw new Error(`Migration ${entry.tag} failed: ${(error as Error).message}`);
    }

    newlyApplied.push(entry.tag);
  }

  return newlyApplied;
}
