import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { readWranglerDatabaseNames } from "./wrangler-config";

/**
 * The plumbing both remote scripts share: which database a target names, where
 * the generated SQL is written, and how wrangler is invoked to run it.
 *
 * Nothing here decides *what* to write. The two callers (`scripts/seed-remote.ts`
 * and `scripts/provision-owner.ts`) own their statements and their refusals;
 * this module only ever executes a file that has already been printed for
 * review, against a database named by `wrangler.jsonc` rather than by hand.
 *
 * Two rules are enforced here so neither script can forget them:
 *
 * 1. **The target is explicit.** There is no default environment. A script run
 *    without `--env` stops before anything is generated, so "I forgot which
 *    database this goes to" cannot become "it went to production".
 * 2. **Nothing runs without `--apply`.** The default is to print the SQL and the
 *    exact command that would run it.
 */

/** The environments a remote seed may target. Mirrors `wrangler.jsonc`. */
export type RemoteTarget = "production" | "preview";

export interface RemoteArgs {
  /** Absent when the caller did not pass `--env`; the script must then refuse. */
  target: RemoteTarget | null;
  /** Whether the caller asked to execute rather than only to print. */
  apply: boolean;
  help: boolean;
}

/**
 * Parses `--env <name>`, `--env=<name>`, `--apply` and `--help`.
 *
 * Unknown flags are an error rather than an ignored line: a typo such as
 * `--aply` must not turn a dry run into an apply, and a misspelled `--env
 * producton` must not silently select nothing.
 */
export function parseRemoteArgs(argv: string[]): RemoteArgs {
  let target: RemoteTarget | null = null;
  let apply = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--apply") {
      apply = true;
      continue;
    }

    let value: string | undefined;
    if (arg === "--env") {
      value = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--env=")) {
      value = arg.slice("--env=".length);
    }

    if (value !== undefined) {
      if (value !== "production" && value !== "preview") {
        throw new Error(`Unknown environment "${value}". Use "preview" or "production".`);
      }
      if (target !== null) {
        throw new Error("The environment was given more than once.");
      }
      target = value;
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return { target, apply, help };
}

/** Usage text, printed when a script is run without a usable target. */
export function usageFor(script: string, extra: string[]): string {
  return [
    `Usage: ${script} --env preview|production [--apply]`,
    "",
    "  Without --apply the generated SQL is printed and nothing is executed.",
    "  With --apply it is executed against the remote D1 database named for that",
    "  environment in wrangler.jsonc. Each script's help below says where its",
    "  generated file lives.",
    "",
    ...extra,
  ].join("\n");
}

/** The wrangler arguments that select a target's environment, if it has one. */
function environmentArgs(target: RemoteTarget): string[] {
  return target === "preview" ? ["--env", "preview"] : [];
}

/**
 * Writes generated SQL under `.wrangler/`, which is gitignored, and returns the
 * absolute path.
 *
 * The file stays on disk after an apply on purpose: an operator reviewing what
 * ran, or re-running it by hand with wrangler, needs the exact bytes that were
 * sent.
 */
export function writeSqlFile(fileName: string, sql: string, cwd: string = process.cwd()): string {
  const directory = path.resolve(cwd, ".wrangler");
  mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  writeFileSync(filePath, sql, "utf8");
  return filePath;
}

/** The wrangler entry point, resolved rather than invoked through a shell. */
function wranglerEntryPoint(cwd: string): string {
  const entry = path.resolve(cwd, "node_modules/wrangler/bin/wrangler.js");
  if (!existsSync(entry)) {
    throw new Error(`wrangler is not installed at ${entry}. Run "npm ci" first.`);
  }
  return entry;
}

export interface WranglerRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs wrangler with `node`, never through a shell.
 *
 * `npx` and the `wrangler` shim are `.cmd`/`.ps1` files on Windows, which a
 * shell-free spawn cannot start, and a shell would need quoting that differs by
 * platform. `node <entry> <args>` is one path everywhere.
 */
export function runWrangler(args: string[], cwd: string = process.cwd()): WranglerRun {
  const entry = wranglerEntryPoint(cwd);
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** `wrangler d1 execute --file ...` arguments for a target. */
export function executeFileArgs(options: {
  target: RemoteTarget;
  databaseName: string;
  filePath: string;
}): string[] {
  return [
    "d1",
    "execute",
    options.databaseName,
    ...environmentArgs(options.target),
    "--remote",
    "--file",
    options.filePath,
    // Skips the "Ok to proceed?" prompt so the command is usable from CI and
    // from a script that has already asked for --apply.
    "--yes",
  ];
}

/**
 * Runs a read-only query against a remote database and returns its rows.
 *
 * The only use is the owner pre-flight: "does this account already exist?"
 * cannot be answered from a file of SQL. `--json` output is a one-element array
 * of `{ results, success, meta }`; anything else is treated as a failure rather
 * than as an empty result, because guessing "no owner exists" from unparsable
 * output is how a second owner gets created.
 */
export function queryRemoteRows(options: {
  target: RemoteTarget;
  databaseName: string;
  command: string;
  cwd?: string;
}): Array<Record<string, unknown>> {
  const cwd = options.cwd ?? process.cwd();
  const run = runWrangler(
    [
      "d1",
      "execute",
      options.databaseName,
      ...environmentArgs(options.target),
      "--remote",
      "--command",
      options.command,
      "--json",
      "--yes",
    ],
    cwd,
  );

  if (run.status !== 0) {
    throw new Error(
      `Reading from the ${options.target} database failed:\n${run.stderr || run.stdout}`.trim(),
    );
  }

  const parsed = parseQueryJson(run.stdout);
  if (!parsed.success) {
    throw new Error(`The query against the ${options.target} database did not succeed.`);
  }
  return parsed.rows;
}

/** Wraps `runWrangler` for an apply, failing loudly on a non-zero exit. */
export function executeFile(options: {
  target: RemoteTarget;
  databaseName: string;
  filePath: string;
  cwd?: string;
}): void {
  const cwd = options.cwd ?? process.cwd();
  const run = runWrangler(executeFileArgs(options), cwd);

  if (run.status !== 0) {
    throw new Error(
      [
        `Applying ${options.filePath} to the ${options.target} database failed.`,
        run.stderr.trim() || run.stdout.trim(),
      ].join("\n"),
    );
  }
}

/** Parses wrangler's `--json` output for a query, tolerating log lines before it. */
export function parseQueryJson(stdout: string): {
  success: boolean;
  rows: Array<Record<string, unknown>>;
} {
  const trimmed = stdout.trim();
  const candidates = [trimmed];
  const arrayStart = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  if (arrayStart > 0) candidates.push(trimmed.slice(arrayStart));
  if (objectStart > 0 && objectStart !== arrayStart) candidates.push(trimmed.slice(objectStart));

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }

    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const first = entries[0] as { results?: unknown; success?: unknown } | undefined;
    if (first === undefined || typeof first !== "object") {
      continue;
    }

    const rows = Array.isArray(first.results) ? (first.results as Array<Record<string, unknown>>) : [];
    return { success: first.success !== false, rows };
  }

  throw new Error(`Could not read wrangler's JSON output:\n${stdout}`);
}

/** Reads the database names from `wrangler.jsonc` for the given target. */
export function databaseNameFor(target: RemoteTarget, cwd: string = process.cwd()): string {
  const names = readWranglerDatabaseNames("wrangler.jsonc", cwd);
  return target === "preview" ? names.preview : names.production;
}
