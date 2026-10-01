import { test as setup } from "@playwright/test";

import { AUTH_STORAGE_STATE } from "./auth-state";
import { ownerEmail, ownerPassword } from "./helpers";

/**
 * Signs the owner in once for the whole suite and saves the session.
 *
 * Better Auth rate limits `/sign-in/email` to 5 requests per minute per client.
 * With one browser context per test and roughly a dozen authenticated tests, the
 * suite spent its entire budget on logins: the first few tests passed and the rest
 * were rejected with 429, which surfaced as "wrong credentials" because the login
 * form cannot tell the two apart. Signing in once and reusing the cookie keeps the
 * suite inside the limit and is much faster.
 */
setup("authenticate the owner", async ({ context }) => {
  // `context.request`, not the standalone `request` fixture: only the former shares
  // a cookie jar with the browser context, so the Set-Cookie from sign-in actually
  // lands in the saved state.
  const response = await context.request.post("/api/auth/sign-in/email", {
    data: { email: ownerEmail(), password: ownerPassword() },
  });

  if (!response.ok()) {
    throw new Error(
      `Owner sign-in failed with ${response.status()}: ${await response.text()}. ` +
        "Check that .dev.vars holds the same OWNER_PASSWORD the seed used, then rerun `npm run db:seed:local`.",
    );
  }

  const state = await context.storageState({ path: AUTH_STORAGE_STATE });
  if (state.cookies.length === 0) {
    throw new Error("Owner sign-in succeeded but set no cookies.");
  }
});
