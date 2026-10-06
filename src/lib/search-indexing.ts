import type { MetadataRoute } from "next";

import type { DeploymentMode } from "@/lib/auth-ip";

/**
 * Whether a deployment may be indexed by search engines.
 *
 * Only production is a site anyone should find. Preview is a second copy of the
 * site on its own hostname, and local is a developer's machine; neither should
 * ever appear in search results, and neither is allowed to because the answer
 * is "no" for every mode except production. A missing or misspelled
 * `DEPLOYMENT_MODE` therefore ends up here as noindex, which is the direction
 * a mistake should fall.
 */
export function isIndexable(mode: DeploymentMode): boolean {
  return mode === "production";
}

/**
 * The `robots.txt` for a deployment.
 *
 * An indexable deployment allows everything, because the site is meant to be
 * crawled. Any other deployment disallows everything: the preview host is not
 * a site of its own, and a crawler that never arrives cannot index what it
 * never sees. The `<meta name="robots">` tag from `robotsMetadata` says the
 * same thing to whatever reaches a page anyway.
 */
export function robotsFile(mode: DeploymentMode): MetadataRoute.Robots {
  return isIndexable(mode)
    ? { rules: { userAgent: "*", allow: "/" } }
    : { rules: { userAgent: "*", disallow: "/" } };
}

/**
 * The `<meta name="robots">` value every page carries.
 *
 * Taken from the root layout, so it applies to the public pages and to the
 * admin, which sets its own on top. `index, follow` on production is the
 * explicit form rather than an absent tag, so the answer is visible in the
 * HTML instead of inferred from silence.
 */
export function robotsMetadata(mode: DeploymentMode): { index: boolean; follow: boolean } {
  return isIndexable(mode) ? { index: true, follow: true } : { index: false, follow: false };
}
