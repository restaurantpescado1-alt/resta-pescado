/**
 * The canonical origin the public metadata resolves against.
 *
 * The production domain has not been confirmed yet, so this falls back to the preview
 * host: a canonical pointing at a host that exists is better than one that 404s, and the
 * preview is `noindex` regardless. When the owner confirms the real domain it is set once
 * in `NEXT_PUBLIC_SITE_URL` and every canonical, Open Graph URL, sitemap entry and
 * structured-data `url` follows.
 */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://resta-pescado-preview.restaurantpescado1.workers.dev";
