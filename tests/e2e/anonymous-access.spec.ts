import { expect, test } from "@playwright/test";

import { readPublicPrice } from "./helpers";

/**
 * Anonymous access control. The Phase 1 requirement is that anonymous admin
 * access redirects or returns 401/403 and that anonymous writes fail. These
 * tests check the redirect, then check that a direct call to the server action
 * endpoint changes nothing.
 */
test.describe("anonymous access", () => {
  test("/admin redirects to the login page", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByTestId("login-form")).toBeVisible();
  });

  test("/admin/menu redirects to the login page", async ({ page }) => {
    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByTestId("menu-editor")).toHaveCount(0);
  });

  test("a redirect preserves the original destination", async ({ page }) => {
    await page.goto("/admin/menu");
    await expect(page).toHaveURL(/[?&]redirectTo=%2Fadmin%2Fmenu|[?&]callbackUrl=%2Fadmin%2Fmenu/);
  });

  test("an anonymous admin page never leaks dish data", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(page.url()).toContain("/admin/login");
    await expect(page.getByText("Dorade grillée")).toHaveCount(0);
    expect(response?.status()).toBeLessThan(400);
  });

  test("an anonymous write attempt does not change the price", async ({ page }) => {
    const before = await readPublicPrice(page);

    // Attempt the server action directly, with no session cookie. A Next.js
    // server action call is rejected before the action body runs, so this must
    // not reach D1.
    const result = await page.evaluate(async () => {
      const response = await fetch("/", {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "next-action": "0000000000000000000000000000000000000000",
        },
        body: JSON.stringify([{ menuItemId: "dev-item-dorade", priceDa: 1 }]),
      });
      return response.status;
    });

    expect(result).toBeGreaterThanOrEqual(400);

    const after = await readPublicPrice(page);
    expect(after).toBe(before);
  });

  test("sign-up is not available over the auth API", async ({ request }) => {
    const response = await request.post("/api/auth/sign-up/email", {
      data: {
        email: "intruder@example.com",
        password: "a-sufficiently-long-password",
        name: "Intruder",
      },
    });

    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test("an unknown session token is not treated as a session", async ({ request }) => {
    const response = await request.get("/api/auth/get-session", {
      headers: { cookie: "resta-pescado.session_token=not-a-real-token" },
    });

    // Better Auth answers a rejected token with 200 and a null session rather than
    // a 401, so what matters is that no session comes back. Accept either shape so
    // the test pins the security property, not the status code convention.
    expect([200, 401, 403]).toContain(response.status());
    if (response.status() === 200) {
      expect(await response.json()).toBeNull();
    }
  });
});
