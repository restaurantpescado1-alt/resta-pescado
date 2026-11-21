/**
 * The canonical origin the public metadata resolves against.
 *
 * The owner confirmed `restapescado.com`. Production metadata — canonical, Open Graph,
 * Twitter, structured data — therefore always uses that origin. A request for any other
 * hostname (the preview Worker, localhost) keeps the preview origin below, so a preview
 * copy never advertises the production domain as an alternative to itself.
 */
export const PRODUCTION_ORIGIN = "https://restapescado.com";

/** Origin kept for non-production requests. */
export const PREVIEW_ORIGIN =
  "https://resta-pescado-preview.restaurantpescado1.workers.dev";

/**
 * Hostnames that identify the live public site. Both the apex and `www` are served by
 * the same Worker. Every other hostname — in particular `*.workers.dev` — is a preview
 * or development copy.
 */
const PRODUCTION_HOSTS = new Set(["restapescado.com", "www.restapescado.com"]);

/**
 * Decide from the request host whether this is the official site.
 *
 * `DEPLOYMENT_MODE` cannot answer this: the custom domain is attached to the same Worker
 * that serves the preview hostname, so both requests carry the same deployment var.
 * Cloudflare sets `Host` to the name the visitor actually used, which does distinguish
 * them. A missing or unknown host is always treated as non-production.
 */
export function isOfficialSiteHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0]?.toLowerCase().replace(/\.$/, "") ?? "";
  return PRODUCTION_HOSTS.has(hostname);
}

/** The origin this request's metadata should resolve against. */
export function resolveSiteOrigin(host: string | null | undefined): string {
  return isOfficialSiteHost(host) ? PRODUCTION_ORIGIN : PREVIEW_ORIGIN;
}

/**
 * Named export kept because the homepage's structured data uses it. The official domain
 * is confirmed, so it now always resolves to production rather than the preview host.
 */
export const SITE_ORIGIN = PRODUCTION_ORIGIN;
