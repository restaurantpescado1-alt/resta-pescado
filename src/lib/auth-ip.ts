/**
 * Which request headers may be used to identify a client for rate limiting.
 *
 * This module is pure on purpose. `@/auth` reads the environment to decide, and the
 * unit suite asserts on that decision without a Worker, Better Auth, or D1.
 */

/**
 * The only header trusted outside local development.
 *
 * Cloudflare sets `CF-Connecting-IP` itself, overwrites any client-supplied value
 * on every request, and does not forward it through nested proxies. So its value
 * is trustworthy no matter what the caller sent. Local miniflare sets it too,
 * from the socket address, which is why local development does not need the
 * headers below to get an address at all.
 */
export const PRODUCTION_IP_HEADER = "CF-Connecting-IP";

/**
 * The headers a local proxy may put the address in.
 *
 * None of these are safe outside a developer's machine. `X-Forwarded-For` in
 * particular is a comma-separated list that any caller can extend by sending its
 * own copy, and `X-Real-IP` is equally caller-controlled. They are accepted only
 * in local mode, where there is no untrusted network in front of the app.
 */
export const LOCAL_IP_HEADERS = ["X-Forwarded-For", "X-Real-IP"] as const;

/**
 * Where the app is serving from, as far as client identification is concerned.
 *
 * `production` and `preview` are both behind Cloudflare and behave identically:
 * only `CF-Connecting-IP` is trusted. They stay separate values so the rest of
 * the app can tell them apart without re-deriving it.
 */
export type DeploymentMode = "production" | "preview" | "local";

/**
 * Decide the deployment mode from the environment.
 *
 * The order matters, and every branch fails closed:
 *
 * 1. `DEPLOYMENT_MODE` is a Wrangler var, so it is present in every Worker
 *    runtime and survives bundling. `NODE_ENV` does not: the old check read
 *    `process.env.NODE_ENV` dynamically, no bundler could constant-fold it, and
 *    the Worker left it undefined — which selected the local headers and made the
 *    rate limit spoofable in production.
 * 2. An explicit value that is not recognised is treated as `production`, since
 *    narrower is the safe direction for a typo.
 * 3. Only when `DEPLOYMENT_MODE` is absent — `next dev`, which has no Wrangler
 *    vars — does `NODE_ENV` decide, and only the exact value `development`
 *    loosens anything.
 */
export function resolveDeploymentMode(env: NodeJS.ProcessEnv = process.env): DeploymentMode {
  // Widened to `string` on purpose. `wrangler types` narrows `DEPLOYMENT_MODE`
  // to the literals `wrangler.jsonc` declares today, which would make the
  // `"local"` comparison below a type error — even though the branch is real:
  // tests set it, and an operator may. This function accepts any string and
  // falls back to the narrow answer for whatever it has not heard of.
  const configured: string | undefined = env.DEPLOYMENT_MODE;
  if (configured) {
    if (configured === "local") return "local";
    if (configured === "preview") return "preview";
    return "production";
  }
  return env.NODE_ENV === "development" ? "local" : "production";
}

/**
 * The headers Better Auth may read the client IP from.
 *
 * Everywhere but local mode this is exactly `[CF-Connecting-IP]`. Trusting
 * anything more would let a caller pick which header decides its rate-limit
 * bucket, so a spoofed `X-Forwarded-For` would mint a fresh bucket per request
 * and defeat the limiter entirely. When none of the trusted headers resolve, Better Auth
 * collapses every caller into one shared bucket, so local mode keeps
 * `CF-Connecting-IP` last as an address that is always present locally.
 */
export function trustedIpHeaders(env: NodeJS.ProcessEnv = process.env): string[] {
  return resolveDeploymentMode(env) === "local"
    ? [...LOCAL_IP_HEADERS, PRODUCTION_IP_HEADER]
    : [PRODUCTION_IP_HEADER];
}
