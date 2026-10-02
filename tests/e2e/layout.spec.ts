import { expect, test, type Page } from "@playwright/test";

/**
 * Layout invariants that can be checked without eyes.
 *
 * The screenshots in `docs/screenshots/phase-2/` are for a human to look at. These are
 * the parts of that review a machine can settle, and they guard two classes of defect
 * that a passing functional suite happily walks past: content spilling off a phone
 * screen, and something too small to tap.
 *
 * Two false positives were removed after the first run, both worth recording:
 *
 * - The skip link is parked around -9999px until focused. That is the correct pattern,
 *   so only the right edge counts as an overflow.
 * - Screen-reader-only text is `overflow: hidden` on a 1px box, so its scrollHeight
 *   always exceeds its clientHeight. Text is only judged hidden when the box is big
 *   enough to be visible in the first place.
 */

const ROUTES = ["/", "/menu", "/galerie", "/a-propos", "/contact"];

const VIEWPORTS: Array<[string, { width: number; height: number }]> = [
  ["phone", { width: 390, height: 844 }],
  ["tablet", { width: 768, height: 1024 }],
  ["desktop", { width: 1440, height: 900 }],
];

interface OverflowResult {
  scrollWidth: number;
  clientWidth: number;
  offenders: string[];
}

function overflowingElements(): OverflowResult {
  const doc = document.documentElement;
  const offenders: string[] = [];
  const all = document.body.querySelectorAll<HTMLElement>("*");

  for (const element of Array.from(all)) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }

    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") {
      continue;
    }

    // The off-screen skip link lies entirely left of the viewport.
    if (rect.right < 0) {
      continue;
    }

    // 1px of slack absorbs sub-pixel rounding.
    if (rect.right > doc.clientWidth + 1) {
      const id = element.dataset.itemId ?? element.dataset.testid ?? element.tagName;
      offenders.push(element.tagName + "[" + id + "] right=" + Math.round(rect.right));
    }
  }

  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    offenders: offenders.slice(0, 6),
  };
}

function smallTapTargets(): string[] {
  const offenders: string[] = [];
  const seen = new Set<string>();
  const targets = document.querySelectorAll<HTMLElement>("a[href], button");

  for (const element of Array.from(targets)) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      continue;
    }

    // Either dimension at 44px is enough: a wide short link is easy to hit.
    if (rect.height >= 44 || rect.width >= 44) {
      continue;
    }

    const label = (element.textContent ?? element.getAttribute("aria-label") ?? "")
      .trim()
      .slice(0, 30);
    const size = Math.round(rect.width) + "x" + Math.round(rect.height);
    const key = element.tagName + ":" + label + ":" + size;

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    offenders.push(key + " (" + size + ")");
  }

  return offenders;
}

function textHiddenByClipping(): string[] {
  const offenders: string[] = [];
  const selector = "p, h1, h2, h3, li, a, span, button, label";
  const candidates = document.querySelectorAll<HTMLElement>(selector);

  for (const element of Array.from(candidates)) {
    if (element.children.length > 0) {
      continue;
    }

    const style = getComputedStyle(element);
    const clipping = ["hidden", "clip", "auto", "scroll"];
    if (!clipping.includes(style.overflowY)) {
      continue;
    }
    if (style.textOverflow === "ellipsis") {
      // A deliberate truncation, not an accident.
      continue;
    }
    // Visually hidden text: a 1px box meant for screen readers only.
    if (element.clientWidth <= 1 || element.clientHeight <= 1) {
      continue;
    }
    if (element.scrollHeight > element.clientHeight + 2) {
      const text = (element.textContent ?? "").trim().slice(0, 40);
      offenders.push('"' + text + '" scrollH=' + element.scrollHeight);
    }
  }

  return offenders.slice(0, 6);
}

function undecodedImages(): string[] {
  const broken: string[] = [];

  for (const image of Array.from(document.images)) {
    if (!image.complete || image.naturalWidth === 0) {
      broken.push(image.getAttribute("src") ?? "(no src)");
    }
  }

  return broken;
}

/**
 * Eager-loads every image and waits for it to settle.
 *
 * Most dish images are `loading="lazy"`, so a page that is only scrolled to the top
 * never requests them. Without this step `naturalWidth` is 0 for images that were never
 * asked for, which looks identical to an image that failed to decode.
 */
async function loadEveryImage(page: Page) {
  await page.evaluate(async () => {
    const images = Array.from(document.images);

    for (const image of images) {
      image.loading = "eager";
    }

    await Promise.all(
      images.map((image) =>
        image.complete ? Promise.resolve() : image.decode().catch(() => undefined),
      ),
    );
  });
}

test.describe("layout", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const [label, viewport] of VIEWPORTS) {
    test("no page scrolls sideways at " + label + " width", async ({ page }) => {
      await page.setViewportSize(viewport);

      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: "networkidle" });

        const result = await page.evaluate(overflowingElements);

        expect(
          result.offenders.join(" | "),
          route + " at " + label + " has elements past the right edge",
        ).toBe("");

        expect(
          result.scrollWidth,
          route + " at " + label + " scrolls sideways",
        ).toBeLessThanOrEqual(result.clientWidth + 1);
      }
    });
  }

  test("phone tap targets are large enough to hit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      expect(
        (await page.evaluate(smallTapTargets)).join(" | "),
        "tap targets under 44px on " + route,
      ).toBe("");
    }
  });

  test("no text is hidden by a clipping box", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      expect(
        (await page.evaluate(textHiddenByClipping)).join(" | "),
        "text hidden on " + route,
      ).toBe("");
    }
  });

  test("every image decodes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: "networkidle" });
      await loadEveryImage(page);
      expect(
        (await page.evaluate(undecodedImages)).join(" | "),
        "undecoded images on " + route,
      ).toBe("");
    }
  });

  test("the confirmed palette is actually in the served stylesheet", async ({ page }) => {
    const palette = ["#063f79", "#075c9e", "#079ed0", "#19b8de", "#f8f5ec", "#f2c230", "#132433"];

    await page.goto("/", { waitUntil: "networkidle" });

    const css = await page.evaluate(async () => {
      const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
      );
      const sheets = await Promise.all(links.map(async (link) => (await fetch(link.href)).text()));
      return sheets.join("\n");
    });

    const missing = palette.filter((colour) => !css.toLowerCase().includes(colour));
    expect(missing.join(", "), "palette colours absent from the compiled CSS").toBe("");
  });
});