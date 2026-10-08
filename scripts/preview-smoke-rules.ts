/**
 * Decision rules shared between the live-preview smoke test (`preview-smoke.ts`)
 * and its unit tests.
 *
 * Kept as pure functions so the behaviour can be pinned without opening a browser
 * or hitting the deployed Worker, and so the smoke's assertions cannot drift from
 * what its regression tests check.
 */

/**
 * Lenient robots.txt tokeniser.
 *
 * Handles comment lines and trailing comments, case-insensitive directive names,
 * stray whitespace, and CRLF line endings. Unknown directives are kept, not
 * dropped, so callers can inspect them.
 */
export function parseRobotDirectives(text: string): Array<{ directive: string; value: string }> {
  const directives: Array<{ directive: string; value: string }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const withoutComment = rawLine.split("#")[0] ?? "";
    const line = withoutComment.trim();
    if (line === "") {
      continue;
    }
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (match === null) {
      continue;
    }
    directives.push({ directive: (match[1] ?? "").trim(), value: (match[2] ?? "").trim() });
  }
  return directives;
}

/**
 * Whether a robots.txt body forbids crawling of the whole site.
 *
 * The preview must never be indexed, so the smoke needs to recognise one specific
 * guarantee: a `Disallow: /` directive. It is matched by value, not by regex over
 * the whole file, and tolerates comments, case, and whitespace.
 */
export function robotsForbidAllCrawling(text: string): boolean {
  return parseRobotDirectives(text).some(
    (entry) => entry.directive.toLowerCase() === "disallow" && entry.value === "/",
  );
}

/**
 * Whether a page URL is the admin login page, however much query string follows.
 *
 * The site replies to signed-out `/admin` requests with a redirect to
 * `/admin/login?redirectTo=...`, so judging the redirect by the full URL with an
 * `endsWith` would fail on the documented query string. This reads only the
 * pathname.
 */
export function isAdminLoginUrl(pageUrl: string): boolean {
  try {
    return new URL(pageUrl).pathname.endsWith("/admin/login");
  } catch {
    return false;
  }
}

/**
 * Whether text is a meaningful, non-empty title.
 *
 * The home page title comes from the owner's `heroTitleFr` in D1, so the smoke
 * cannot require the seeded default. It still has to reject an absent heading and
 * whitespace-only or punctuation-only text.
 */
export function isMeaningfulTitle(text: string | null | undefined): boolean {
  if (text === null || text === undefined) {
    return false;
  }
  const trimmed = text.trim();
  return /[A-Za-zÀ-ÿ0-9]/.test(trimmed);
}

/**
 * Whether a failed browser request is exactly a navigation-cancelled RSC prefetch.
 *
 * Next.js app-router `<Link>` prefetches raise `_rsc` requests; when the visitor
 * navigates elsewhere before the prefetch completes, the browser cancels the
 * request and Playwright reports `net::ERR_ABORTED`. Those are hints, not broken
 * resources, so the smoke ignores the narrow intersection of "_rsc query present"
 * and "aborted by the browser". Anything else — a real failure, a non-_rsc
 * request, or any other error code — is reported.
 */
export function isNavigationCancelledPrefetch(
  url: string,
  errorText: string | null | undefined,
): boolean {
  if ((errorText ?? "").trim() !== "net::ERR_ABORTED") {
    return false;
  }
  try {
    return new URL(url).searchParams.has("_rsc");
  } catch {
    return false;
  }
}