import type { MetadataRoute } from "next";

/**
 * The canonical robots policy for the official site.
 *
 * A `Disallow: /` must never be served from restapescado.com, so the rule is fixed here
 * instead of being derived from `DEPLOYMENT_MODE`. It grants every standard crawler
 * access to the public pages, adds OAI-SearchBot explicitly for ChatGPT search, and
 * points Google at the sitemap. Per-page `noindex` metadata remains the mechanism for
 * copies that should not be indexed.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
    ],
    sitemap: "https://restapescado.com/sitemap.xml",
  };
}
