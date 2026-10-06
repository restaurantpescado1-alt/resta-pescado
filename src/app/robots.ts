import type { MetadataRoute } from "next";

import { resolveDeploymentMode } from "@/lib/auth-ip";
import { robotsFile } from "@/lib/search-indexing";

/**
 * Evaluated per request, not once at build time.
 *
 * `DEPLOYMENT_MODE` is a Wrangler var: it is present in the Worker runtime and
 * the same build artifact is what `deploy` and `deploy:preview` both ship. A
 * `robots.txt` cached at build time would record whatever the build machine
 * happened to have and then tell crawlers the same thing on both hosts, which
 * is exactly the failure this file exists to prevent.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return robotsFile(resolveDeploymentMode());
}
