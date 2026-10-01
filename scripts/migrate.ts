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
