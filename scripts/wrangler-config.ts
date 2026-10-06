import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reading the database names out of `wrangler.jsonc`.
 *
 * The remote seeds need the name of the database they are about to write to, and
 * a name typed into a script is a name that silently goes stale when
 * `wrangler.jsonc` is renamed. Reading it from the config means there is one
 * source of truth, and `tests/unit/remote-init.test.ts` fails if the config
 * stops containing what these scripts expect.
 *
 * `wrangler.jsonc` is JSON with comments, which `JSON.parse` rejects, so the
 * comments are stripped first. The stripper is a small state machine rather than
 * a regular expression: `"//"` inside a string has to survive, and a regex that
 * cannot tell the difference would corrupt a URL the moment one appears.
 */

/** Removes `//` line comments and `/* ... *\/` block comments from JSONC text. */
export function stripJsonComments(text: string): string {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === "\\") {
        const escaped = text[index + 1];
        if (escaped !== undefined) {
          out += escaped;
          index += 1;
        }
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    out += char;
  }

  return out;
}

/** The two D1 database names, keyed by the environment that owns them. */
export interface WranglerDatabaseNames {
  production: string;
  preview: string;
}

function databaseNameOf(config: Record<string, unknown>, where: string): string {
  const databases = (config.d1_databases ?? []) as Array<{ database_name?: unknown }>;
  const name = databases[0]?.database_name;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`wrangler.jsonc has no d1_databases[0].database_name for ${where}.`);
  }
  return name;
}

/** Parses `wrangler.jsonc` and returns the database names it declares. */
export function parseWranglerDatabaseNames(configText: string): WranglerDatabaseNames {
  const config = JSON.parse(stripJsonComments(configText)) as Record<string, unknown>;
  const envs = (config.env ?? {}) as Record<string, Record<string, unknown>>;
  const preview = envs.preview;

  if (preview === undefined) {
    throw new Error("wrangler.jsonc has no env.preview to seed.");
  }

  return {
    production: databaseNameOf(config, "the top-level environment"),
    preview: databaseNameOf(preview, "env.preview"),
  };
}

/** Reads `wrangler.jsonc` from disk. The path may be relative to `cwd`. */
export function readWranglerDatabaseNames(
  configPath: string = "wrangler.jsonc",
  cwd: string = process.cwd(),
): WranglerDatabaseNames {
  return parseWranglerDatabaseNames(readFileSync(path.resolve(cwd, configPath), "utf8"));
}
