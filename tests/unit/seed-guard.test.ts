import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertLocalDatabasePath,
  assertNotProductionEnvironment,
  assertSeedIsSafe,
  DELETE_OPT_IN_ENV,
  isDestructiveResetAllowed,
  LOCAL_STATE_DIR,
  ProductionDatabaseGuardError,
} from "../../scripts/local-db-guard";

/**
 * The seed deletes menu rows, so "can this ever touch a real database" is a
 * data-loss question and is tested rather than assumed.
 */

let root: string;

function makeLocalDb(relativePath = join(LOCAL_STATE_DIR, "v3", "d1", "local.sqlite")): string {
  const full = join(root, relativePath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, "");
  return full;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "seed-guard-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("assertLocalDatabasePath", () => {
  it("accepts a database inside the local Miniflare state directory", () => {
    const path = makeLocalDb();
    expect(assertLocalDatabasePath(path, root)).toBe(path);
  });

  it("rejects a database anywhere else in the project", () => {
    const path = join(root, "data", "production.sqlite");
    mkdirSync(join(root, "data"), { recursive: true });
    writeFileSync(path, "");

    expect(() => assertLocalDatabasePath(path, root)).toThrow(ProductionDatabaseGuardError);
  });

  it("rejects a database outside the project entirely", () => {
    const outside = mkdtempSync(join(tmpdir(), "elsewhere-"));
    try {
      const path = join(outside, "prod.sqlite");
      writeFileSync(path, "");

      expect(() => assertLocalDatabasePath(path, root)).toThrow(ProductionDatabaseGuardError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  /**
   * The bypass that matters: something parked in the allowed directory whose real
   * location is outside it. Resolving the realpath first means the *target* is judged,
   * not the apparent location.
   *
   * A directory junction is used rather than a file symlink because Windows refuses to
   * create symlinks without Developer Mode or elevation, and `realpathSync` resolves
   * junctions just as it resolves symlinks. If the platform refuses even that, the test
   * skips instead of reporting a false failure.
   */
  it("rejects a path inside the state directory whose real location is outside it", () => {
    const outside = mkdtempSync(join(tmpdir(), "target-"));
    try {
      writeFileSync(join(outside, "production.sqlite"), "");

      const stateRoot = join(root, LOCAL_STATE_DIR, "v3");
      mkdirSync(stateRoot, { recursive: true });
      try {
        // `junction` is ignored on POSIX, where a plain symlink to a directory works.
        symlinkSync(outside, join(stateRoot, "d1"), "junction");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EPERM" || code === "ENOSYS" || code === "EACCES") {
          return; // platform cannot create links; nothing to assert here
        }
        throw error;
      }

      const link = join(stateRoot, "d1", "production.sqlite");
      expect(() => assertLocalDatabasePath(link, root)).toThrow(ProductionDatabaseGuardError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("rejects a relative path, which could resolve anywhere", () => {
    expect(() => assertLocalDatabasePath(`${LOCAL_STATE_DIR}/v3/d1/local.sqlite`, root)).toThrow(
      ProductionDatabaseGuardError,
    );
  });

  it("rejects a path that does not exist, since it cannot be proven local", () => {
    expect(() => assertLocalDatabasePath(join(root, LOCAL_STATE_DIR, "ghost.sqlite"), root)).toThrow(
      ProductionDatabaseGuardError,
    );
  });

  it("names the guard in the error so the failure is self-explanatory", () => {
    const path = join(root, "production.sqlite");
    writeFileSync(path, "");

    expect(() => assertLocalDatabasePath(path, root)).toThrow(/Refusing to seed/);
    expect(() => assertLocalDatabasePath(path, root)).toThrow(new RegExp(LOCAL_STATE_DIR));
  });
});

describe("assertNotProductionEnvironment", () => {
  it("rejects NODE_ENV=production", () => {
    expect(() => assertNotProductionEnvironment({ NODE_ENV: "production" })).toThrow(
      ProductionDatabaseGuardError,
    );
  });

  it.each(["development", "test", undefined])("allows NODE_ENV=%s", (value) => {
    expect(() => assertNotProductionEnvironment({ NODE_ENV: value })).not.toThrow();
  });
});

describe("isDestructiveResetAllowed", () => {
  it("defaults to refusing deletion", () => {
    expect(isDestructiveResetAllowed({})).toBe(false);
  });

  it("allows deletion only for exactly '1'", () => {
    expect(isDestructiveResetAllowed({ [DELETE_OPT_IN_ENV]: "1" })).toBe(true);
  });

  /**
   * A near-miss like "true" must not enable deletion. Defaulting to "off" on anything
   * unrecognised means a typo is harmless, which is the only safe direction.
   */
  it.each(["true", "yes", "TRUE", "0", "", "on"])(
    'treats %j as not consenting',
    (value) => {
      expect(isDestructiveResetAllowed({ [DELETE_OPT_IN_ENV]: value })).toBe(false);
    },
  );
});

describe("assertSeedIsSafe", () => {
  it("returns the resolved path for a local database in development", () => {
    const path = makeLocalDb();
    expect(assertSeedIsSafe({ sqlitePath: path, cwd: root, env: { NODE_ENV: "development" } })).toBe(
      path,
    );
  });

  it("checks the environment before anything else", () => {
    // A local path that would otherwise pass, but production must be refused.
    const path = makeLocalDb();
    expect(() =>
      assertSeedIsSafe({ sqlitePath: path, cwd: root, env: { NODE_ENV: "production" } }),
    ).toThrow(ProductionDatabaseGuardError);
  });
});
