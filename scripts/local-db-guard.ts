import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Guard rails that keep the local seed away from a real database.
 *
 * The seed performs two things that would be genuinely destructive if they ever ran
 * against production: it rewrites `site_settings`, and it *deletes* menu rows that are
 * not in the approved list. Deleting a dish the owner added through the dashboard is
 * data loss, so the destructive part has to be impossible to trigger by accident.
 *
 * Two independent checks, because either one alone leaves a gap:
 *
 * 1. **Location.** The seed opens a SQLite file directly. A Cloudflare D1 database is
 *    only ever reachable over HTTP through the worker's binding, never as a local file,
 *    so requiring the file to sit inside Miniflare's `.wrangler/state` directory is a
 *    structural guarantee, not a heuristic: there is no production database that this
 *    script can open at all, whatever environment variables it is handed.
 * 2. **Explicit opt-in.** Even locally, the row deletion only runs when
 *    `SEED_ALLOW_DELETE=1` is set, so an ordinary `npm run db:seed` can never drop a
 *    dish. Resetting to the approved menu is a deliberate act.
 */

/** Where Miniflare keeps local D1 state, relative to the project root. */
export const LOCAL_STATE_DIR = ".wrangler/state";

/** Environment variable that opts in to deleting unapproved rows. */
export const DELETE_OPT_IN_ENV = "SEED_ALLOW_DELETE";

export class ProductionDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionDatabaseGuardError";
  }
}

/**
 * Throws unless `sqlitePath` is a local Miniflare database inside this project.
 *
 * Symlinks are resolved first, so a link planted inside `.wrangler/state` that points
 * at a real database elsewhere is rejected on its resolved target rather than passing
 * on its apparent location.
 */
export function assertLocalDatabasePath(sqlitePath: string, cwd: string = process.cwd()): string {
  const stateRoot = resolve(cwd, LOCAL_STATE_DIR);

  if (!isAbsolute(sqlitePath)) {
    throw new ProductionDatabaseGuardError(
      `Refusing to seed "${sqlitePath}": expected an absolute path.`,
    );
  }

  // `realpathSync` throws if the file does not exist. The caller has just listed the
  // directory, so treat a vanished file as "not provably local" rather than crashing
  // with an opaque ENOENT.
  let resolved: string;
  try {
    resolved = realpathSync(sqlitePath);
  } catch {
    throw new ProductionDatabaseGuardError(
      `Refusing to seed "${sqlitePath}": the file does not exist, so it cannot be confirmed to be a local development database.`,
    );
  }

  let inside: string;
  try {
    inside = relative(stateRoot, resolved);
  } catch {
    inside = "";
  }

  // `relative` returns a path starting with ".." when the target is outside the root,
  // and an absolute path when it is on a different drive entirely.
  const isOutside =
    inside === "" || inside.startsWith("..") || isAbsolute(inside) || inside.split(sep)[0] === "..";

  if (isOutside) {
    throw new ProductionDatabaseGuardError(
      [
        `Refusing to seed "${resolved}".`,
        `The local seed may only touch a database under ${LOCAL_STATE_DIR}.`,
        "A production D1 database is remote and is never a local file, so this check",
        "cannot be satisfied by one. Seeding production is done with",
        '"wrangler d1 migrations apply --remote", which never deletes rows.',
      ].join(" "),
    );
  }

  return resolved;
}

/**
 * The environment, read as a loose record.
 *
 * Deliberately not `NodeJS.ProcessEnv`: the project augments that interface with
 * required `NEXTJS_ENV`, auth, and owner variables, which would force every test to
 * construct a full environment to check one flag. A guard only ever reads the two
 * keys it cares about.
 */
export type GuardEnvironment = Record<string, string | undefined>;

/**
 * Throws when running under NODE_ENV=production.
 *
 * Belt and braces alongside {@link assertLocalDatabasePath}: even if a future change
 * pointed the seed at a different kind of database, a production environment still
 * refuses to run it.
 */
export function assertNotProductionEnvironment(env: GuardEnvironment = process.env): void {
  if (env.NODE_ENV === "production") {
    throw new ProductionDatabaseGuardError(
      "Refusing to seed with NODE_ENV=production. The local seed is a development tool.",
    );
  }
}

/**
 * Whether the caller has opted in to deleting unapproved rows.
 *
 * Defaults to false. Anything other than exactly "1" is not consent, so a typo like
 * "true" or "yes" leaves the deletion switched off rather than silently enabling it.
 */
export function isDestructiveResetAllowed(env: GuardEnvironment = process.env): boolean {
  return env[DELETE_OPT_IN_ENV] === "1";
}

/** Convenience wrapper running every check the seed needs. */
export function assertSeedIsSafe(options: {
  sqlitePath: string;
  cwd?: string;
  env?: GuardEnvironment;
}): string {
  assertNotProductionEnvironment(options.env);
  return assertLocalDatabasePath(options.sqlitePath, options.cwd);
}
