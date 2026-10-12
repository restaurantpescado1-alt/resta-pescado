import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/site-origin";

/**
 * The public routes. Admin and API routes are deliberately absent: a sitemap lists pages
 * meant to be found, and the dashboard is not one of them.
 */
const ROUTES = ["/", "/menu", "/galerie", "/a-propos", "/contact"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return ROUTES.map((path) => ({
    url: `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
