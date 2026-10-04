import { expect, test } from "@playwright/test";

import { CONFIRMED_MAP_URL, CONFIRMED_PHONE, FISH_LABEL } from "./helpers";

/**
 * Responsive behaviour and accessibility across the five public routes.
 *
 * Two things are being protected here:
 *
 * - The mobile sticky bar exists because ordering happens by phone. If it disappears
 *   at 390px, or if a fixed bar covers the last line of a page, the site's only call
 *   to action is unreachable.
 * - Every public route must be operable by keyboard and expose a sensible structure.
 *   A restaurant site failing this is unusable for a real group of visitors.
 */

const PUBLIC_ROUTES = ["/", "/menu", "/galerie", "/a-propos", "/contact"] as const;

/** iPhone 12-ish. The narrowest layout the design has to survive. */
const PHONE = { width: 390, height: 844 } as const;

test.describe("responsive layout", () => {
  test.use({ viewport: PHONE });

  test("the sticky action bar is visible on a phone and hidden on desktop", async ({ page }) => {
    await page.goto("/");

    const bar = page.getByTestId("mobile-actions");
    await expect(bar).toBeVisible();

    // Its three actions are exactly the ones a phone visitor needs.
    await expect(page.getByTestId("mobile-call")).toBeVisible();
    await expect(page.getByTestId("mobile-menu")).toBeVisible();
    await expect(page.getByTestId("mobile-map")).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(bar).toBeHidden();
  });

  test("the sticky actions point at the confirmed phone, the menu, and the map", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("mobile-call")).toHaveAttribute("href", `tel:${CONFIRMED_PHONE}`);
    await expect(page.getByTestId("mobile-menu")).toHaveAttribute("href", "/menu");
    await expect(page.getByTestId("mobile-map")).toHaveAttribute("href", CONFIRMED_MAP_URL);
  });

  test("the sticky bar does not cover the end of the page", async ({ page }) => {
    await page.goto("/contact");

    // Scroll to the very bottom and confirm the last element is still clickable, i.e.
    // not underneath the fixed bar.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(200);

    const map = page.getByTestId("contact-map");
    if ((await map.count()) > 0) {
      await expect(map).toBeInViewport();
      await map.click({ trial: true });
    }
  });

  test("no page scrolls horizontally at 390px", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      // One pixel of rounding is tolerable; a real overflow means a broken layout.
      expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });

  test("the closed header stays on one row and reveals the navigation on demand", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByTestId("mobile-nav-toggle");
    const panel = page.getByTestId("mobile-nav");

    /*
     * Closed by default. The header is sticky, so a two-row header at 390px permanently
     * occupies a fifth of the screen on the route where the menu matters most.
     */
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();

    /*
     * One row. The identity, the phone action, and the button must share a single
     * horizontal band, so their vertical centres line up and the header stays short.
     * This is what a two-row header looks like in numbers, and it is the thing that used
     * to cost a fifth of a 390px screen on every scrolled page.
     */
    const header = page.getByRole("banner");
    const headerBox = (await header.boundingBox())!;
    expect(headerBox.height).toBeLessThanOrEqual(80);

    const identity = (await page.getByRole("link", { name: "Resta Pescado, accueil" }).boundingBox())!;
    const phone = (await page.getByTestId("header-phone").boundingBox())!;
    const toggleBox = (await toggle.boundingBox())!;

    const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(centre(identity) - centre(phone))).toBeLessThanOrEqual(4);
    expect(Math.abs(centre(phone) - centre(toggleBox))).toBeLessThanOrEqual(4);

    // The phone action stays visible while the menu is closed, because it is the point.
    await expect(page.getByTestId("header-phone")).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("link", { name: "Contact" })).toBeVisible();

    // Escape closes it again.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("the navigation enters and leaves the tab order with the panel", async ({ page }) => {
    await page.goto("/");

    /*
     * The panel is toggled with the `hidden` attribute rather than a class, so its links
     * leave the tab order with it. A menu that stays tabbable while visually closed is
     * focus moving somewhere invisible, which strands keyboard users with no idea where
     * they are.
     */
    const panel = page.getByTestId("mobile-nav");
    const toggle = page.getByTestId("mobile-nav-toggle");
    const firstLink = panel.getByRole("link", { name: "Accueil" });

    await expect(panel).toBeHidden();
    await expect(firstLink).toBeHidden();

    /*
     * Tabbing forward from the toggle must land inside the open panel. Focus stays on the
     * button rather than being pushed to the first item, which is acceptable here: the
     * panel is a short list of links directly after the button, so one Tab reaches it and
     * no focus trap is needed.
     */
    await toggle.focus();
    await toggle.press("Enter");
    await expect(panel).toBeVisible();

    await page.keyboard.press("Tab");
    const landedInPanel = await panel
      .getByRole("link")
      .first()
      .evaluate((node) => node === document.activeElement)
      .catch(() => false);
    expect(landedInPanel).toBe(true);

    // Closed again, the links are unreachable again.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(firstLink).toBeHidden();
  });

  test("choosing a destination closes the menu", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("mobile-nav-toggle").click();
    await page.getByTestId("mobile-nav").getByRole("link", { name: "Galerie" }).click();

    await expect(page).toHaveURL(/\/galerie$/);
    await expect(page.getByTestId("mobile-nav")).toBeHidden();
  });

  test("the desktop navigation replaces the button above the breakpoint", async ({ page }) => {
    await page.goto("/");
    await page.setViewportSize({ width: 1280, height: 900 });

    await expect(page.getByTestId("mobile-nav-toggle")).toBeHidden();
    await expect(page.getByTestId("mobile-nav")).toBeHidden();

    const nav = page.getByTestId("desktop-nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "Contact" })).toBeVisible();
  });

  test("the fish guide is usable on a phone", async ({ page }) => {
    await page.goto("/a-propos");

    const firstImage = page.locator("#guide-poissons img").first();
    await expect(firstImage).toBeVisible();

    // The illustration must not overflow its card.
    const box = await firstImage.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(PHONE.width);
  });
});

test.describe("accessibility", () => {
  test.use({ viewport: PHONE });

  test("every public route has exactly one level-1 heading", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 }), route).toHaveCount(1);
    }
  });

  test("every page declares French and a title", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await expect(page).toHaveTitle(/Resta Pescado/);
    }
  });

  test("the skip link is the first focusable element and jumps to the content", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: "Aller au contenu" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // visible once focused, not permanently

    await page.keyboard.press("Enter");
    await expect(page.locator("#contenu")).toBeVisible();
  });

  test("the main navigation can be traversed and used by keyboard alone", async ({ page }) => {
    await page.goto("/");

    /*
     * At desktop width, where the primary navigation is the visible list. Below `md` the
     * links live behind the disclosure instead, which has its own traversal test above.
     * Two `navigation` landmarks share the name "Navigation principale" by design, so
     * these tests target the one they mean by test id rather than by position.
     */
    await page.setViewportSize({ width: 1280, height: 900 });

    const nav = page.getByTestId("desktop-nav");
    const menuLink = nav.getByRole("link", { name: "La carte" });

    await menuLink.focus();
    await expect(menuLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/menu$/);
  });

  test("every link has a discernible name", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      const links = page.getByRole("link");
      const count = await links.count();
      for (let index = 0; index < count; index += 1) {
        const name = (await links.nth(index).innerText()).trim();
        const label = await links.nth(index).getAttribute("aria-label");
        expect((name || label || "").length, `${route} link ${index} has no name`).toBeGreaterThan(0);
      }
    }
  });

  test("every image carries alt text", async ({ page }) => {
    for (const route of PUBLIC_ROUTES) {
      await page.goto(route);
      const images = page.locator("img");
      const count = await images.count();
      for (let index = 0; index < count; index += 1) {
        const alt = await images.nth(index).getAttribute("alt");
        expect(alt, `${route} image ${index} has no alt attribute`).not.toBeNull();
      }
    }
  });

  /**
   * The AI illustrations are the images where alt text does real work: a screen-reader
   * user has no other way to learn the image is a drawing rather than a photograph.
   */
  test("fish illustrations describe themselves as illustrations", async ({ page }) => {
    await page.goto("/menu");

    const illustrations = page.locator('img[src^="/images/fish-guide/"]');
    const count = await illustrations.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const alt = (await illustrations.nth(index).getAttribute("alt")) ?? "";
      expect(alt.toLowerCase()).toContain("illustration de référence");
    }
  });

  test("the language of the interface is French", async ({ page }) => {
    await page.goto("/menu");
    const text = await page.locator("body").innerText();
    // A stray English UI string would mean an untranslated string slipped in.
    expect(text).toContain("La carte");
    expect(text).toContain("Nos Entrées");
    expect(text).not.toMatch(/\b(Home|About us|Contact us|Our menu|Add to cart)\b/);
  });

  test("the AI label is present on the guide as well as the menu", async ({ page }) => {
    await page.goto("/a-propos");
    await expect(page.getByTestId("guide-ai-label").first()).toHaveText(FISH_LABEL);
  });

  test("reduced motion is honoured", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const seconds = await page.evaluate(() => {
      const element = document.querySelector("a");
      return element ? parseFloat(getComputedStyle(element).transitionDuration) : 0;
    });
    // Effectively instant rather than the usual 150-300ms. The stylesheet clamps to
    // 0.01ms, which is 0.00001s.
    expect(seconds).toBeLessThan(0.001);
  });

  test("focus is visible, not removed", async ({ page }) => {
    await page.goto("/");

    const outline = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>("main a");
      if (!link) return null;
      link.focus();
      const style = getComputedStyle(link);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline).not.toBeNull();
    expect(outline!.style).not.toBe("none");
    expect(parseFloat(outline!.width)).toBeGreaterThan(0);
  });
});
