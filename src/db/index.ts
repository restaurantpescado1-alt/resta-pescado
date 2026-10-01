import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import * as schema from "./schema";

/**
 * The D1 handle the application uses at runtime.
 *
 * Typed as `BaseSQLiteDatabase` rather than `DrizzleD1Database` on purpose. The
 * repository functions in `./repositories` only need the SQLite query builder, so
 * this wider type lets the Vitest suites pass a `better-sqlite3` instance. That
 * keeps the repository tests on real SQL and real constraints without either
 * driver pretending to be the other; the D1-specific behaviour is covered by the
 * Playwright suite, which runs inside workerd.
 */
export type Database = BaseSQLiteDatabase<
  "sync" | "async",
  unknown,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

let cached: DrizzleD1Database<typeof schema> | undefined;

/**
 * D1 handle for the current request.
 *
 * The binding comes from `getCloudflareContext()`, which works in three places:
 * `next dev` (local simulation installed by `initOpenNextCloudflareForDev`),
 * `opennextjs-cloudflare preview`, and a deployed Worker. The handle is stateless,
 * so one per isolate is enough.
 */
export function getDb(): Database {
  if (cached) {
    return cached;
  }
  const { env } = getCloudflareContext();
  cached = drizzle(env.DB, { schema });
  return cached;
}
