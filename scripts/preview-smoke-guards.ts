/**
 * The URL rules and access-block detection that keep the live-preview smoke test
 * read-only and pointed at the right host.
 *
 * The smoke test (`scripts/preview-smoke.ts`) opens a browser against a *deployed*
 * Cloudflare preview. Three things are decided here, in one place, so the script and
 * its unit tests (`tests/unit/preview-smoke-guards.test.ts`) exercise the same rules:
 *
 * 1. **The target is explicit.** The URL comes from `--url`, must use `https:`, and
 *    the command refuses to run at all without the flag.
 * 2. **Local and production hosts are refused.** Loopback names are never the output
 *    a preview check should measure, and a host that is not the preview worker is
 *    treated as production until someone passes `--allow-production` on purpose.
 * 3. **Cloudflare Access is detected, not decoded.** A gated preview answers with a
 *    challenge page or a redirect into the Access domain; the smoke test reports that
 *    gate and stops, so the site is never misread as broken. It never stores an Access
 *    cookie or a Playwright storage state.
 */

/** The preview worker's environment name in `wrangler.jsonc`. */
export const PREVIEW_ENV_NAME = "resta-pescado-preview";
export const WORKERS_DEV_SUFFIX = ".workers.dev";

export type HostKind = "loopback" | "preview" | "production";

/** Normalizes a host for comparison: lowercase, no port, brackets and trailing dot removed. */
export function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

/**
 * Whether a hostname names the preview worker.
 *
 * Preview deploys on `${PREVIEW_ENV_NAME}.<account>.workers.dev`. Production has its
 * own name or a future custom domain, so anything else ends up refused by
 * `classifyTarget` until an operator overrides it.
 */
export function isPreviewWorkerHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host.startsWith(`${PREVIEW_ENV_NAME}.`) && host.endsWith(WORKERS_DEV_SUFFIX);
}

export function hostKindOf(hostname: string): HostKind {
  const host = normalizeHostname(hostname);
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    /^127\./.test(host)
  ) {
    return "loopback";
  }
  if (isPreviewWorkerHost(host)) {
    return "preview";
  }
  return "production";
}

export interface PreviewTarget {
  kind: Extract<HostKind, "preview" | "production">;
  url: URL;
  hostname: string;
}

export type ClassifiedTarget = PreviewTarget | { error: string };

export function classifyTarget(
  input: string,
  options: { allowProduction?: boolean } = {},
): ClassifiedTarget {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { error: `"${input}" is not a valid URL.` };
  }

  if (parsed.protocol !== "https:") {
    return {
      error: `The URL must use https:. Refused "${parsed.protocol.slice(0, -1)}://${parsed.host}".`,
    };
  }

  const hostname = normalizeHostname(parsed.hostname);
  const kind = hostKindOf(hostname);

  if (kind === "loopback") {
    return {
      error: `Refused a local address (${parsed.host}). This command checks a deployed Cloudflare preview, never a local server.`,
    };
  }

  if (kind === "production" && !options.allowProduction) {
    return {
      error:
        `"${parsed.host}" does not look like the preview worker (${PREVIEW_ENV_NAME}.<account>.workers.dev), ` +
        `so it is treated as a production target and refused. Pass --allow-production to run it anyway, ` +
        `for example for a custom preview domain Cloudflare routes by name.`,
    };
  }

  return { kind, url: parsed, hostname };
}

export interface PreviewSmokeArgs {
  input: string | null;
  allowProduction: boolean;
  help: boolean;
}

/**
 * Parses `--url <https://...>`, `--url=<https://...>`, `--allow-production` and `--help`.
 *
 * Unknown flags are an error rather than an ignored line: a misspelled `--urll` must
 * not silently run against nothing, and a production host must never be traded for a
 * preview because of a typo.
 */
export function parsePreviewSmokeArgs(argv: string[]): PreviewSmokeArgs {
  let input: string | null = null;
  let allowProduction = false;
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

    if (arg === "--allow-production") {
      allowProduction = true;
      continue;
    }

    let value: string | undefined;
    if (arg === "--url") {
      value = argv[index + 1];
      index += 1;
      if (value === undefined) {
        throw new Error('The "--url" flag needs a value: --url <https://preview-url>.');
      }
    } else if (arg.startsWith("--url=")) {
      value = arg.slice("--url=".length);
    }

    if (value !== undefined) {
      if (input !== null) {
        throw new Error("The URL was given more than once.");
      }
      input = value;
      continue;
    }

    throw new Error(`Unknown argument "${arg}".`);
  }

  return { input, allowProduction, help };
}

export function usageForSmoke(script: string): string {
  return [
    `Usage: ${script} --url <https://...> [--allow-production]`,
    "",
    "  --url                The deployed preview URL to check, for example",
    "                       https://resta-pescado-preview.my-team.workers.dev.",
    "                       Only https: URLs are accepted; loopback hosts are refused.",
    "  --allow-production   Run against a host that is not the preview worker anyway.",
    "  --help, -h           Print this help and exit.",
    "",
    "The command is read-only: it navigates, reads pages, and downloads public media.",
    "It never submits a form, signs in, or opens a stored auth state, and it never",
    "stores an Access cookie.",
  ].join("\n");
}

export interface AccessObservation {
  status: number;
  finalUrl: string;
  /** The first few kilobytes of the page body, used only as text. */
  bodyHead: string;
}

/**
 * Whether a response looks like a Cloudflare Access gate rather than a real page.
 *
 * Access fronts the worker with a challenge when the visitor has no `CF_Authorization`
 * cookie: either an HTTP 403 challenge page served by the edge, or a redirect into the
 * team's `<team>.cloudflareaccess.com` domain. Both are recognizable without ever
 * answering the challenge.
 */
export function looksLikeCloudflareAccess(observation: AccessObservation): boolean {
  const { status, finalUrl, bodyHead } = observation;

  let host = "";
  try {
    host = normalizeHostname(new URL(finalUrl).hostname);
  } catch {
    // finalUrl is not a URL; fall through to the body check.
  }
  if (host === "cloudflareaccess.com" || host.endsWith(".cloudflareaccess.com")) {
    return true;
  }

  if (status !== 401 && status !== 403) {
    return false;
  }

  const head = bodyHead.slice(0, 4096).toLowerCase();
  return (
    head.includes("access denied") ||
    head.includes("blocked by cloudflare") ||
    head.includes("cloudflare access") ||
    head.includes("cf-request-id") ||
    head.includes("cannot verify identity") ||
    head.includes("unable to authenticate")
  );
}

/**
 * Copy the public site must never contain: claims that the menu is updated "daily" or
 * features "today's catch". The V1 site updates content only when the owner edits it in
 * the dashboard, so any such claim is a lie by default.
 *
 * The list is deliberately short and conservative; `docs/CONTENT_POLICY.md`, not this
 * array, is the authority on copy. Asserting these phrases here keeps an accidental
 * "mis à jour chaque jour" from slipping in through a future template.
 */
export const UPDATE_CLAIM_PATTERNS: ReadonlyArray<RegExp> = [
  /\bquotidien(ne|nes|nement)?\b/i,
  /\bchaque\s+jour\b/i,
  /\bdu\s+jour\b/i,
];

/** Whether any phrase in the patterns appears in the given text. Returns the first match. */
export function findUpdateClaim(text: string): string | null {
  for (const pattern of UPDATE_CLAIM_PATTERNS) {
    const match = text.match(pattern);
    if (match !== null) {
      return match[0];
    }
  }
  return null;
}