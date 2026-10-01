/**
 * Redirect-target sanitising.
 *
 * The login page echoes a `redirectTo` value back into a client-side
 * `router.push`. That makes it an open-redirect vector unless it is constrained
 * to a same-site absolute path, so the value is validated rather than trusted.
 */

/** Path used when no valid destination was supplied. */
export const DEFAULT_OWNER_REDIRECT = "/admin";

const SAFE_PATH = /^\/[^/\\]/;

/**
 * Returns `value` when it is a same-site absolute path, otherwise the default.
 *
 * Rejects protocol-relative (`//evil.com`) and backslash (`/\evil.com`) forms,
 * plus anything carrying a scheme or an authority component.
 */
export function safeRedirectPath(value: unknown, fallback: string = DEFAULT_OWNER_REDIRECT): string {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }
  if (value.includes("\\") || !SAFE_PATH.test(value)) {
    return fallback;
  }
  // Anything that survives the above but still names a host is rejected too.
  if (/^\/\//.test(value) || value.includes("://")) {
    return fallback;
  }
  return value;
}

/** Builds the login URL for an unauthenticated visitor, keeping their destination. */
export function loginUrlFor(pathname: string, search?: string): string {
  const target = safeRedirectPath(`${pathname}${search ?? ""}`);
  return `/admin/login?redirectTo=${encodeURIComponent(target)}`;
}
