/**
 * Binding types for the Cloudflare Worker, declared by hand rather than generated.
 *
 * `npm run cf-typegen` produces a `cloudflare-env.d.ts` from `wrangler.jsonc`, and
 * that file is gitignored. Committing generated types that depend on a machine's
 * local binding list creates two sources of truth, so the interface is declared
 * here and the generated file is only used when someone wants to inspect the
 * real shape. `getCloudflareContext()` returns `Cloudflare.Env`, which extends
 * this interface, so the two stay compatible.
 */

declare namespace Cloudflare {
  interface Env {
    /** Private R2 bucket holding dish images. */
    MEDIA: R2Bucket;
    /** SQLite database with the menu, profiles, audit log, and rate-limit state. */
    DB: D1Database;
    /** OpenNext static asset binding. */
    ASSETS: Fetcher;
    /** `development` in local dev, `production` otherwise. */
    NEXTJS_ENV: string;
    /** Better Auth signing secret. Never committed. */
    BETTER_AUTH_SECRET: string;
    /** Public origin of the deployment. */
    BETTER_AUTH_URL: string;
    /** Local seed only. */
    OWNER_EMAIL: string;
    /** Local seed only. */
    OWNER_PASSWORD: string;
    /** Local seed only. */
    OWNER_NAME: string;
    /** Playwright base URL. */
    E2E_BASE_URL: string;
  }
}

type CloudflareEnv = Cloudflare.Env;
