/**
 * Which request headers may be used to identify a client for rate limiting.
 *
 * This module is pure on purpose. `@/auth` reads the environment to decide, and the
 * unit suite asserts on that decision without a Worker, Better Auth, or D1.
 */

/**
 * The only header trusted in production.
 *
 * Cloudflare sets `CF-Connecting-IP` itself, overwrites any client-supplied value
 * on every request, and does not forward it through nested proxies. So its value
 * is trustworthy no matter what the caller sent.
 */
export const PRODUCTION_IP_HEADER = "CF-Connecting-IP";

/**
 * The headers a local wrangler or OpenNext preview puts the address in.
 *
 * None of these are safe in production. `X-Forwarded-For` in particular is a
 * comma-separated list that any caller can extend by sending its own copy, and
 * `X-Real-IP` is equally caller-controlled. They are accepted only where there is
 * no untrusted network in front of the app, which is to say on a developer's
 * machine, so that rate limiting can be exercised locally without a proxy.
 */
export const LOCAL_IP_HEADERS = ["X-Forwarded-For", "X-Real-IP"] as const;

/**
 * The headers Better Auth may read the client IP from.
 *
 * In production this is exactly `[CF-Connecting-IP]`. Trusting anything more would
 * let a caller pick which header decides its rate-limit bucket, so a spoofed
 * `X-Forwarded-For` would mint a fresh bucket per request and defeat the limiter
 * entirely.
 */
export function trustedIpHeaders(env: NodeJS.ProcessEnv = process.env): string[] {
  return env.NODE_ENV === "production" ? [PRODUCTION_IP_HEADER] : [...LOCAL_IP_HEADERS];
}