import { expect, test } from "@playwright/test";

/**
 * What the deployment itself advertises, as distinct from what any page shows.
 *
 * `robots.txt` and the `robots` meta tag are both keyed off `DEPLOYMENT_MODE`,
 * and the suite runs the production-shaped Worker (`npm run preview`), so both
 * answers below are the production ones: crawlers allowed, pages indexable. The
 * preview and local answers — disallow everything, `noindex, nofollow` — are
 * pinned by `tests/unit/search-indexing.test.ts`, because this harness has no
 * way to start a Worker in another mode.
 */
test.describe("deployment indexing", () => {
  test("robots.txt is served to anyone who asks", async ({ request }) => {
    const response = await request.get("/robots.txt");

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/plain");

    const body = await response.text();
    expect(body).toContain("User-Agent: *");
    expect(body).toContain("Allow: /");
    expect(body).not.toContain("Disallow");
  });

  test("every page carries an explicit robots tag", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
  });
});
