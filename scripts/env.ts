import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Minimal `.env` / `.dev.vars` reader.
 *
 * Scripts and Vitest need a handful of values that are not secrets-by-accident
 * but must stay out of Git, so they cannot come from the committed config. The
 * Worker itself reads them through the Cloudflare bindings, not through this.
 *
 * Values already present in `process.env` always win, which is what lets CI pass
 * them inline.
 */

const ENV_FILES = [".dev.vars", ".env.local", ".env"] as const;

/** Parses `KEY=value` lines, honouring quotes and `#` comments. */
function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

export function readEnvFile(cwd: string = process.cwd()): Record<string, string> {
  const loaded: Record<string, string> = {};

  for (const name of ENV_FILES) {
    const path = resolve(cwd, name);
    if (!existsSync(path)) {
      continue;
    }
    Object.assign(loaded, parse(readFileSync(path, "utf8")));
  }

  for (const [key, value] of Object.entries(loaded)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return loaded;
}

/** Fails loudly rather than defaulting a credential to something guessable. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .dev.vars and fill it in.`,
    );
  }
  return value;
}
