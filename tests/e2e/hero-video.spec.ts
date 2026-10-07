import { expect, test, type Page } from "@playwright/test";

/**
 * The homepage hero video, end to end, inside the real Worker.
 *
 * The unit suite (`tests/unit/hero-video.test.tsx`) owns the decision rules and the
 * server markup guarantee; this file owns the wiring: bytes actually requested,
 * playback actually starting, the control actually pausing it, and each poster-only
 * mode actually staying poster-only. Requests are tracked rather than assumed — the
 * point of Save-Data and reduced motion is not "the video is paused", it is "the
 * megabytes were never spent".
 */

/** iPhone-ish, matching the narrow layout the design has to survive. */
const PHONE = { width: 390, height: 844 } as const;

/** Every URL the page requested, captured from the moment the test starts. */
function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    urls.push(request.url());
  });
  return urls;
}

const video = (page: Page) => page.getByTestId("hero-video");
const toggle = (page: Page) => page.getByTestId("hero-video-toggle");

/** The video element has reached a settled state (its `data-state` attribute). */
async function waitForState(page: Page, state: string) {
  await expect(video(page)).toHaveAttribute("data-state", state, { timeout: 15_000 });
}

test.describe("hero video", () => {
  test("the server-rendered page ships the poster but requests no video bytes", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const html = await response.text();
    const videoTags = html.match(/<video[^>]*>/g) ?? [];
    expect(videoTags.length).toBe(1);

    for (const tag of videoTags) {
      expect(tag, "the server HTML must not carry a video src").not.toContain("src=");
      expect(tag).toContain("poster=");
    }
    expect(html).not.toContain("<source");
  });

  test("attaches, autoplays muted inline, and can be paused and resumed", async ({ page }) => {
    const urls = trackRequests(page);

    const mp4Responses: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes(".mp4")) {
        mp4Responses.push(response.headers()["content-type"] ?? "");
      }
    });

    await page.goto("/");
    await waitForState(page, "playing");

    const element = video(page);
    await expect(element).toHaveAttribute("poster", /\/media\/hero-aquarium-poster\.webp$/);
    await expect(element).toHaveJSProperty("muted", true);
    await expect(element).toHaveJSProperty("loop", true);
    await expect(element).toHaveJSProperty("playsInline", true);

    // The desktop encode was chosen, and the Worker served it as video/mp4.
    expect(urls.some((url) => url.includes("hero-aquarium-1080.mp4"))).toBe(true);
    expect(mp4Responses.length).toBeGreaterThan(0);
    for (const contentType of mp4Responses) {
      expect(contentType).toContain("video/mp4");
    }

    // The poster was on screen first — it is requested before the source attaches.
    expect(urls.some((url) => url.includes("hero-aquarium-poster.webp"))).toBe(true);

    // The control pauses playback...
    const control = toggle(page);
    await expect(control).toBeVisible();
    await expect(control).toHaveText("Mettre la vidéo en pause");
    await control.click();
    await waitForState(page, "paused");
    expect(await element.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);

    // ...and resumes it, by keyboard as by pointer (it is a native button).
    await expect(control).toHaveText("Reprendre la vidéo");
    await control.focus();
    await control.press("Enter");
    await waitForState(page, "playing");
  });

  test("a phone is served the small encode", async ({ page }) => {
    const urls = trackRequests(page);
    await page.setViewportSize(PHONE);

    await page.goto("/");
    await waitForState(page, "playing");

    expect(urls.some((url) => url.includes("hero-aquarium-480.mp4"))).toBe(true);
    expect(urls.some((url) => url.includes("hero-aquarium-1080.mp4"))).toBe(false);
  });

  test("reduced motion keeps the poster and never downloads the video", async ({ page }) => {
    const urls = trackRequests(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    // Hydration has to have had its chance to (not) attach a source.
    await page.waitForTimeout(1_200);

    await expect(video(page)).toHaveAttribute("data-state", "poster");
    await expect(video(page)).not.toHaveAttribute("src");
    await expect(toggle(page)).toHaveCount(0);
    expect(urls.filter((url) => url.includes(".mp4"))).toHaveLength(0);
    expect(urls.some((url) => url.includes("hero-aquarium-poster.webp"))).toBe(true);
  });

  test("Save-Data keeps the poster and never downloads the video", async ({ page }) => {
    const urls = trackRequests(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        configurable: true,
        get: () => ({ saveData: true }),
      });
    });

    await page.goto("/");
    await page.waitForTimeout(1_200);

    await expect(video(page)).toHaveAttribute("data-state", "poster");
    await expect(video(page)).not.toHaveAttribute("src");
    await expect(toggle(page)).toHaveCount(0);
    expect(urls.filter((url) => url.includes(".mp4"))).toHaveLength(0);
  });

  test("pauses while the hero is scrolled away or the tab is hidden, and resumes", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForState(page, "playing");

    // Scrolled out of view.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await waitForState(page, "paused");

    // Back on screen: it resumes, because the visitor never asked to stop.
    await page.evaluate(() => window.scrollTo(0, 0));
    await waitForState(page, "playing");

    // Tab hidden (the state is overridden because a real tab switch cannot be faked
    // from inside the page under test).
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitForState(page, "paused");

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitForState(page, "playing");
  });

  test("a failed download degrades to the poster with the hero fully usable", async ({
    page,
  }) => {
    await page.route("**/*.mp4", (route) => route.abort());
    const urls = trackRequests(page);

    await page.goto("/");
    await waitForState(page, "failed");

    // Nothing to pause, and no retry loop: the control is gone for this page load.
    await expect(toggle(page)).toHaveCount(0);
    await expect(video(page)).toHaveAttribute("poster", /hero-aquarium-poster\.webp$/);

    // The poster still rendered, and the hero's purpose — headline and actions — works.
    expect(urls.some((url) => url.includes("hero-aquarium-poster.webp"))).toBe(true);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voir la carte" })).toBeVisible();
  });

  test("the pause control is an ordinary focusable button", async ({ page }) => {
    await page.goto("/");
    await waitForState(page, "playing");

    const control = toggle(page);
    await control.focus();
    await expect(control).toBeFocused();

    // Its name always says what pressing it will do next.
    await expect(control).toHaveText(/^(Mettre la vidéo en pause|Reprendre la vidéo)$/);
  });
});
