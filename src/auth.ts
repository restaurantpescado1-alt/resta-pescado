import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { trustedIpHeaders } from "@/lib/auth-ip";

/**
 * Better Auth, email and password only.
 *
 * Two decisions carry the single-owner requirement:
 *
 * 1. `emailAndPassword.disableSignUp` is true. There is no public registration
 *    path, so the only way to obtain an account is the local seed script, which
 *    runs on the owner's machine.
 * 2. The role lives in `profiles.role`, not on the Better Auth user row, and is
 *    created by the local seed. `requireOwner` in `@/lib/authz` is the only
 *    place that reads it, so adding a second role later means changing that one
 *    function rather than scattering checks across the admin surface.
 */
function createAuth() {
  return betterAuth({
    appName: "Resta Pescado",
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",

    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },

    advanced: {
      // Secure HTTP-only SameSite cookies, per docs/SECURITY.md.
      useSecureCookies: process.env.NODE_ENV === "production",
      cookiePrefix: "resta-pescado",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },

      // Without an explicit header list, Better Auth cannot resolve a client IP
      // under the Worker and collapses every caller into one shared rate-limit
      // bucket. The first few requests then succeed and everything after them is
      // 429'd, which made the end-to-end suite fail depending on test order.
      //
      // The list itself comes from `@/lib/auth-ip`: production and preview trust
      // only `CF-Connecting-IP`, which Cloudflare overwrites on every request, so
      // a caller cannot choose the header that decides its own bucket. The choice
      // is driven by `DEPLOYMENT_MODE`, not `NODE_ENV`, because the Worker leaves
      // `NODE_ENV` undefined and the old check therefore picked the local,
      // caller-controlled headers in production.
      ipAddress: {
        ipAddressHeaders: trustedIpHeaders(),
      },
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 60, max: 3 },
      },
    },

    /*
     * Must stay last so its Set-Cookie handling wraps every other plugin, and it is what makes
     * the server actions work at all.
     *
     * `getAuth().api.signOut(...)` and `getAuth().api.changePassword(...)` are called directly,
     * not through a route handler. Those endpoint responses carry `Set-Cookie` headers, and a
     * direct call throws them away — the browser would keep the old session cookie. This plugin's
     * `after` hook is the part that copies them into Next's response. Drop it, or move it off the
     * end of the list, and nothing errors: changing the password silently signs the owner out,
     * because `revokeOtherSessions` has already deleted the session the browser is still holding.
     */
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * The auth instance, built on first use.
 *
 * It has to be lazy. Creating it eagerly at module scope would call
 * `getCloudflareContext()` during `next build`'s page-data collection, which has
 * no request context and throws. Deferring construction to the first request
 * keeps the D1 binding lookup inside a real request.
 */
let instance: Auth | undefined;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}
