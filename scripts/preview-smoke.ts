import { chromium, type Page, type Response } from "@playwright/test";

import { allApprovedItems, APPROVED_CATEGORIES } from "./approved-menu";
import { SEED_DELIVERY, SEED_SETTINGS } from "./site-settings";
import {
  classifyTarget,
  findUpdateClaim,
  looksLikeCloudflareAccess,
  parsePreviewSmokeArgs,
  usageForSmoke,
} from "./preview-smoke-guards";
import {
  isAdminLoginUrl,
  isMeaningfulTitle,
  isNavigationCancelledPrefetch,
  robotsForbidAllCrawling,
} from "./preview-smoke-rules";

/**
 * Read-only live-preview smoke test.
 *
 * Opens a browser against a *deployed* Cloudflare preview and verifies the public site
 * end to end, the same way the end-to-end suite checks the local Worker but without any
 * access to the database or any knowledge of the owner's credentials:
 *
 * - the five public pages respond and carry the confirmed facts (phone, hours, map, the
 *   four delivery sentences, the 34 approved dishes in their 5 categories);
 * - the pages make no unsupported claim and are served with preview `noindex`;
 * - the signed-out admin is protected; every image actually decodes; nothing overflows
 *   a 390px screen; and the run produces no console errors or failed requests.
 *
 * Three boundaries are enforced so the run stays harmless on a real deployment:
 *
 * 1. **Read-only.** Nothing is submitted, signed in, or written. The browser storage
 *    state is fresh and never saved, so not even an Access cookie is persisted.
 * 2. **Explicit target.** `--url` is mandatory, only `https:` is accepted, and loopback
 *    hosts are refused.
 * 3. **No production by accident.** A host that is not the preview worker is treated as
 *    a production target and refused unless `--allow-production` is passed on purpose.
 *
 * A preview behind Cloudflare Access is detected and reported as "blocked at the edge"
 * (exit code 2) rather than as a broken site.
 */

const PUBLIC_ROUTES = ["/", "/menu", "/galerie", "/a-propos", "/contact"] as const;

type CheckStatus = "pass" | "fail";

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

/** Collects browser problems across a run, deduplicated. */
class ProblemLog {
  private seen = new Set<string>();
  private entries: string[] = [];

  add(url: string, reason: string): void {
    const key = `${url} :: ${reason}`;
    if (this.seen.has(key)) {
      return;
    }
    this.seen.add(key);
    this.entries.push(`${url} — ${reason}`);
  }

  get count(): number {
    return this.entries.length;
  }

  list(): string[] {
    return [...this.entries];
  }
}

function trackPage(page: Page, log: ProblemLog): void {
  page.on("console", (message) => {
    if (message.type() === "error") {
      log.add("console", `console error: ${message.text().slice(0, 300)}`);
    }
  });
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown error";
    // Next.js app-router `<Link>` prefetches are cancelled by the browser when the
    // visitor navigates elsewhere before they complete (`_rsc` + `net::ERR_ABORTED`).
    // Those are navigation hints, not broken resources, so exactly that narrow case is
    // ignored; every other failure is reported as before.
    if (isNavigationCancelledPrefetch(request.url(), errorText)) {
      return;
    }
    log.add(request.url(), `request failed: ${errorText}`);
  });
  page.on("response", (response) => {
    const url = response.url();
    // The app ships no favicon, so a 404 for it is the expected state, not a failure.
    if (url.endsWith("/favicon.ico") || response.status() < 400) {
      return;
    }
    // Document failures are already reported by the route check.
    const type = response.request().resourceType();
    if (
      type === "document" ||
      type === "stylesheet" ||
      type === "script" ||
      type === "image" ||
      type === "media" ||
      type === "font" ||
      type === "xhr" ||
      type === "fetch"
    ) {
      log.add(url, `HTTP ${response.status()} (${type})`);
    }
  });
}

async function gotoOrigin(
  page: Page,
  origin: string,
  route: string,
  options: { timeout?: number } = {},
): Promise<Response | null> {
  try {
    return await page.goto(`${origin}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: options.timeout ?? 60_000,
    });
  } catch {
    return null;
  }
}

async function pageLooksAccessGated(page: Page, response: Response | null): Promise<boolean> {
  if (response === null) {
    return false;
  }
  const bodyHead = await page
    .evaluate(() => (document.body?.innerText ?? "").slice(0, 4096))
    .catch(() => "");
  return looksLikeCloudflareAccess({ status: response.status(), finalUrl: page.url(), bodyHead });
}

async function bodyText(page: Page): Promise<string> {
  return page.evaluate(() => document.body?.innerText ?? "");
}

function checkRoutes(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const failures: string[] = [];
    for (const route of PUBLIC_ROUTES) {
      const response = await gotoOrigin(page, origin, route);
      const status = response?.status() ?? 0;
      if (status < 200 || status >= 300) {
        failures.push(`${route} → HTTP ${status}`);
      }
    }
    return failures;
  }, "The five public routes respond");
}

function checkMenu(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const response = await gotoOrigin(page, origin, "/menu");
    if (response === null) {
      return ["/menu did not load"];
    }

    const approved = allApprovedItems();
    const categories = APPROVED_CATEGORIES;
    const rowCount = await page.locator("[data-item-id]").count();
    const categoryCount = await page.locator('[data-testid="menu-category"]').count();

    const failures: string[] = [];
    if (rowCount !== approved.length) {
      failures.push(`plats affichés sur la carte publique: ${rowCount} au lieu de ${approved.length}`);
    }
    if (categoryCount !== categories.length) {
      failures.push(
        `rubrique(s) de carte: ${categoryCount} présente(s), ${categories.length} attendues`,
      );
    }

    const missing: string[] = [];
    for (const item of approved) {
      if ((await page.locator(`[data-item-id="${item.id}"]`).count()) === 0) {
        missing.push(item.nameFr);
      }
    }
    if (missing.length > 0) {
      failures.push(`plats absents de la carte publique: ${missing.join(", ")}`);
    }

    return failures;
  }, "The menu shows the approved dishes in their categories");
}

function checkHomeFacts(page: Page, origin: string): Promise<Check> {
  let heroTitle = "";
  const check = run(async () => {
    const response = await gotoOrigin(page, origin, "/");
    if (response === null) {
      return ["/ did not load"];
    }

    const failures: string[] = [];
    /*
     * The home title is the owner's `heroTitleFr` in D1, so it is editable and cannot be
     * compared to the seeded default. The smoke verifies that a meaningful title exists
     * and reports whatever text is actually being served.
     */
    const headings = page.locator("h1");
    if ((await headings.count()) !== 1) {
      failures.push(`titre d'accueil absent: ${await headings.count()} <h1> trouvé(s)`);
    } else {
      heroTitle = (await headings.first().innerText()).trim();
      if (!isMeaningfulTitle(heroTitle)) {
        failures.push(`titre d'accueil vide ou non significatif: « ${heroTitle} »`);
      }
    }

    const phone = page.getByTestId("home-phone");
    if ((await phone.count()) !== 1) {
      failures.push("lien téléphone de l'accueil (home-phone) absent");
    } else {
      const text = await phone.innerText();
      const href = await phone.getAttribute("href");
      if (text !== SEED_SETTINGS.phoneFr) {
        failures.push(`téléphone affiché « ${text} » au lieu de ${SEED_SETTINGS.phoneFr}`);
      }
      if (href !== `tel:${SEED_SETTINGS.phoneFr}`) {
        failures.push(`lien téléphone « ${href} » au lieu de tel:${SEED_SETTINGS.phoneFr}`);
      }
    }

    const hours = await page.getByTestId("home-hours").innerText().catch(() => "");
    if (hours !== SEED_SETTINGS.hoursFr) {
      failures.push("horaires de l'accueil différents des horaires confirmés");
    }

    if (SEED_DELIVERY.enabled && (await page.getByTestId("home-delivery").count()) !== 1) {
      failures.push("le bloc livraison de l'accueil est absent alors que la livraison est activée");
    }

    const mapLinks = await page.locator(`a[href="${SEED_SETTINGS.mapsUrl}"]`).count();
    if (mapLinks === 0) {
      failures.push("lien vers la carte Google Maps absent");
    }

    return failures;
  }, "Home carries the confirmed phone, hours, delivery and map link");
  return check.then((result) =>
    result.status === "pass" ? { ...result, detail: `ok — titre d'accueil : « ${heroTitle} »` } : result,
  );
}

function checkContactFacts(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const response = await gotoOrigin(page, origin, "/contact");
    if (response === null) {
      return ["/contact did not load"];
    }

    const failures: string[] = [];
    const phone = page.getByTestId("contact-phone");
    if ((await phone.count()) !== 1) {
      failures.push("lien téléphone du contact (contact-phone) absent");
    } else {
      const text = await phone.innerText();
      const href = await phone.getAttribute("href");
      if (text !== SEED_SETTINGS.phoneFr) {
        failures.push(`téléphone affiché « ${text} » au lieu de ${SEED_SETTINGS.phoneFr}`);
      }
      if (href !== `tel:${SEED_SETTINGS.phoneFr}`) {
        failures.push(`lien téléphone « ${href} » au lieu de tel:${SEED_SETTINGS.phoneFr}`);
      }
    }

    const hours = await page.getByTestId("contact-hours").innerText().catch(() => "");
    if (hours !== SEED_SETTINGS.hoursFr) {
      failures.push("horaires du contact différents des horaires confirmés");
    }

    const mapHref = await page.getByTestId("contact-map").getAttribute("href").catch(() => null);
    if (mapHref !== SEED_SETTINGS.mapsUrl) {
      failures.push(`lien « ouvrir l'itinéraire » vers ${mapHref} au lieu de ${SEED_SETTINGS.mapsUrl}`);
    }

    const confirmedTexts = Object.values(SEED_DELIVERY).filter(
      (value) => typeof value === "string",
    ) as string[];
    for (const sentence of confirmedTexts) {
      const found = await page.getByText(sentence, { exact: true }).count();
      if (found === 0) {
        failures.push(`phrase livraison absente: ${sentence}`);
      }
    }

    const text = await bodyText(page);
    if (/\d+\s*da\s*(de|par)?\s*livraison/i.test(text)) {
      failures.push("un montant de livraison est affiché alors qu'aucun n'est confirmé");
    }
    if (/\blivraison\s+(gratuite|offerte)\b/i.test(text)) {
      failures.push("la livraison est dite « gratuite » ou « offerte » sans confirmation");
    }

    return failures;
  }, "Contact carries the confirmed phone, hours, map and the four delivery sentences");
}

function checkNoUpdateClaims(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const hits: string[] = [];
    for (const route of PUBLIC_ROUTES) {
      const response = await gotoOrigin(page, origin, route);
      if (response === null) {
        continue;
      }
      const claim = findUpdateClaim(await bodyText(page));
      if (claim !== null) {
        hits.push(`${route}: « ${claim} »`);
      }
    }
    return hits.map((hit) => `recommandation de mise à jour quotidienne non prise en charge: ${hit}`);
  }, "No unsupported daily-update claims on any page");
}

async function fetchRobots(origin: string): Promise<{ status: number; body: string } | null> {
  // A plain Node fetch, deliberately independent of the browser contexts: the check
  // reads what an off-site crawler would read, and a browser-bound APIRequestContext
  // was the mechanism implicated in a transiently empty body during a degraded edge.
  // Two attempts rather than one, because the run retries nothing else.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${origin}/robots.txt`, {
        headers: { accept: "text/plain" },
        signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.text() };
    } catch {
      if (attempt === 1) {
        return null;
      }
    }
  }
  return null;
}

function checkPreviewNoindex(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const failures: string[] = [];

    /*
     * Direct HTTP request, then directive parsing: the guarantee is "Disallow: /", and
     * the status and raw body are reported on any miss so a future failure carries its
     * own evidence instead of a bare assertion.
     */
    const robots = await fetchRobots(origin);
    if (robots === null) {
      failures.push("robots.txt → requête impossible (aucune réponse en 15 s)");
    } else if (robots.status !== 200) {
      failures.push(`robots.txt → HTTP ${robots.status}`);
    } else if (!robotsForbidAllCrawling(robots.body)) {
      failures.push(
        `robots.txt ne demande pas Disallow: / (texte reçu : ${JSON.stringify(
          robots.body.slice(0, 120),
        )})`,
      );
    }

    const response = await gotoOrigin(page, origin, "/");
    if (response !== null) {
      const robotsMeta = await page
        .locator('meta[name="robots"]')
        .getAttribute("content")
        .catch(() => null);
      if (
        typeof robotsMeta !== "string" ||
        !robotsMeta.includes("noindex") ||
        !robotsMeta.includes("nofollow")
      ) {
        failures.push(`meta robots « ${robotsMeta ?? "absente"} » au lieu de noindex, nofollow`);
      }
    }

    return failures;
  }, "Preview is served noindex (robots.txt + meta)");
}

function checkSignedOutAdmin(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const failures: string[] = [];
    for (const path of ["/admin", "/admin/menu"]) {
      const response = await gotoOrigin(page, origin, path);
      if (response === null) {
        failures.push(`${path} did not load`);
        continue;
      }
      if (!isAdminLoginUrl(page.url())) {
        failures.push(`${path} wasn't redirected to /admin/login (${page.url()})`);
      }
      if ((await page.getByTestId("login-form").count()) !== 1) {
        failures.push(`${path} shows no login form`);
      }
      if ((await page.getByTestId("menu-manager").count()) !== 0) {
        failures.push(`${path} leaks the menu editor to a signed-out visitor`);
      }
    }
    return failures;
  }, "A signed-out visitor is sent to the login page");
}

function checkImages(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const failures: string[] = [];
    for (const route of PUBLIC_ROUTES) {
      const response = await gotoOrigin(page, origin, route);
      if (response === null) {
        failures.push(`${route} did not load`);
        continue;
      }
      // A lazy image below the fold is never even fetched until the visitor scrolls, so
      // force every image eager before measuring: a broken object key or a missing
      // bundled asset then surfaces instead of hiding behind `loading=lazy`.
      await page.evaluate(() => {
        for (const img of Array.from(document.images)) {
          img.loading = "eager";
          img.decoding = "auto";
        }
      });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      const report = await page.evaluate(() => {
        const broken: string[] = [];
        for (const img of Array.from(document.images)) {
          if (img.complete && (img.naturalWidth === 0 || img.naturalHeight === 0)) {
            broken.push(img.currentSrc || img.src);
          }
        }
        const degraded = document.querySelectorAll('[data-testid="image-fallback"]').length;
        return { broken, degraded };
      });

      if (report.broken.length > 0) {
        failures.push(`${route}: ${report.broken.length} image(s) déclarée(s) chargée(s) mais non décodée(s)`);
      }
      if (report.degraded > 0) {
        failures.push(
          `${route}: ${report.degraded} illustration(s) remplacée(s) par le texte de secours`,
        );
      }
    }
    return failures;
  }, "Public images load and decode (no broken or fallback-replaced picture)");
}

function checkMobile(page: Page, origin: string): Promise<Check> {
  return run(async () => {
    const failures: string[] = [];

    const response = await gotoOrigin(page, origin, "/");
    if (response !== null) {
      for (const testId of ["mobile-actions", "mobile-call", "mobile-menu", "mobile-map"] as const) {
        const element = page.getByTestId(testId);
        if (!(await element.isVisible().catch(() => false))) {
          failures.push(`barre mobile: ${testId} non visible`);
        }
      }
      const callHref = await page.getByTestId("mobile-call").getAttribute("href").catch(() => null);
      const mapHref = await page.getByTestId("mobile-map").getAttribute("href").catch(() => null);
      const menuHref = await page.getByTestId("mobile-menu").getAttribute("href").catch(() => null);
      if (callHref !== `tel:${SEED_SETTINGS.phoneFr}`) {
        failures.push(`appel mobile vers « ${callHref} » au lieu de tel:${SEED_SETTINGS.phoneFr}`);
      }
      if (menuHref !== "/menu") {
        failures.push(`lien mobile « menu » vers « ${menuHref} » au lieu de /menu`);
      }
      if (mapHref !== SEED_SETTINGS.mapsUrl) {
        failures.push(`itinéraire mobile vers « ${mapHref} » au lieu de ${SEED_SETTINGS.mapsUrl}`);
      }
    }

    for (const route of PUBLIC_ROUTES) {
      await gotoOrigin(page, origin, route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      if (overflow > 1) {
        failures.push(`${route}: débordement horizontal de ${overflow}px à 390px`);
      }
    }

    return failures;
  }, "Mobile bar works and nothing overflows at 390 px");
}

async function run(runCheck: () => Promise<string[]>, name: string): Promise<Check> {
  const failures = await runCheck();
  return {
    name,
    status: failures.length === 0 ? "pass" : "fail",
    detail: failures.length === 0 ? "ok" : failures.join(" ; "),
  };
}

function print(checks: Check[]): void {
  for (const check of checks) {
    const marker = check.status === "pass" ? "PASS" : "FAIL";
    const indent = check.detail === "ok" ? "" : `\n        ${check.detail}`;
    console.log(`${marker}  ${check.name}${indent}`);
  }
  console.log("");
}

async function main(): Promise<number> {
  const scriptName = "npm run smoke:preview --";

  let args;
  try {
    args = parsePreviewSmokeArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error as Error).message);
    console.error(usageForSmoke(scriptName));
    return 1;
  }

  if (args.help) {
    console.log(usageForSmoke(scriptName));
    return 0;
  }

  if (args.input === null) {
    console.error("A preview URL is required. Use --url <https://...>.");
    console.error(usageForSmoke(scriptName));
    return 1;
  }

  const classified = classifyTarget(args.input, { allowProduction: args.allowProduction });
  if ("error" in classified) {
    console.error(classified.error);
    return 1;
  }

  const { url } = classified;
  const origin = url.origin;

  console.log(`Preview smoke: ${origin} (${classified.kind})`);
  console.log("Read-only run: nothing is submitted, signed in, or stored.");
  console.log("");

  const browser = await chromium.launch();
  try {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await desktop.newPage();
    const mobilePage = await mobile.newPage();
    const problems = new ProblemLog();
    trackPage(page, problems);
    trackPage(mobilePage, problems);

    const checks: Check[] = [];

    const firstResponse = await gotoOrigin(page, origin, "/");
    if (await pageLooksAccessGated(page, firstResponse)) {
      console.error(
        "Cloudflare Access protects this preview and blocked the smoke test at the edge.",
      );
      console.error(
        "This is the expected behaviour of a gated preview, not a defect of the site.",
      );
      return 2;
    }

    checks.push(await checkRoutes(page, origin));
    checks.push(await checkMenu(page, origin));
    checks.push(await checkHomeFacts(page, origin));
    checks.push(await checkContactFacts(page, origin));
    checks.push(await checkNoUpdateClaims(page, origin));
    checks.push(await checkPreviewNoindex(page, origin));
    checks.push(await checkSignedOutAdmin(page, origin));
    checks.push(await checkImages(page, origin));
    checks.push(await checkMobile(mobilePage, origin));
    checks.push({
      name: "No console errors or failed requests",
      status: problems.count === 0 ? "pass" : "fail",
      detail:
        problems.count === 0
          ? "ok"
          : [...problems.list(), ...(problems.count > 20 ? [`(+${problems.count - 20} more)`] : [])]
              .slice(0, 20)
              .join(" ; "),
    });

    print(checks);

    const failed = checks.some((check) => check.status === "fail");
    return failed ? 1 : 0;
  } finally {
    await browser.close();
  }
}

const exitCode = await main();
process.exitCode = exitCode;