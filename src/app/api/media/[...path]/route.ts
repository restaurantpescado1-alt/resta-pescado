import { getDb } from "@/db";
import { getMediaProvider } from "@/db/media";
import { findGalleryImageByKey } from "@/db/repositories/menu";
import { getOwnerProfileFrom } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** `menu/{year}/{uuid}.{ext}` — dish photos, public menu content. */
const MENU_KEY = /^menu\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
/** `gallery/{year}/{uuid}.{ext}` — owner-uploaded photographs, see `buildGalleryKey`. */
const GALLERY_KEY = /^gallery\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const NOT_FOUND = () => new Response("Not found", { status: 404 });

/** A dish photo's bytes at a key never change, so a long cache header is safe. */
const MENU_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * A gallery photograph's *authorization* can change while its bytes cannot:
 * hiding it must stop further views, which a year of browser cache would defeat.
 * Revalidating every time is what routes each view through the visibility check.
 */
const GALLERY_CACHE_CONTROL = "public, max-age=0, must-revalidate";

/**
 * Serves a stored asset through the Worker.
 *
 * This route is the only URL the app ever publishes for a stored image; the
 * provider's own endpoint (ImageKit's CDN, or the R2 bucket in the legacy
 * configuration) is never exposed to a browser. Keeping every fetch in front of
 * this route is what makes the authorization below mean anything. Keys are
 * validated against the two shapes above before any lookup, which stops a
 * crafted key from probing the store.
 *
 * The provider proxies the bytes: `getMediaProvider().read(key)` returns the
 * upstream body for the URL that providers deliver. Any query the client sends
 * (ImageKit transformations, thumbnails, …) is deliberately ignored — see
 * `docs/ARCHITECTURE.md` for why transformations are future work.
 *
 * The two namespaces are authorized differently, and the difference is the point:
 *
 * - `menu/` keys are public menu content. They are content-addressed (a random
 *   uuid that never changes) and the same photo is referenced from the public
 *   menu, so no visibility check applies here.
 * - `gallery/` keys carry an owner-controlled `isVisible` promise: hiding a
 *   photograph is supposed to take it off the site, not merely off the gallery
 *   grid. So an anonymous caller gets the bytes only when a `gallery_images` row
 *   behind the key is visible; a key with no row is a 404 either way. The signed-in
 *   owner bypasses the check, because `/admin/galerie` renders the same URL for
 *   thumbnails the public must not see yet.
 *
 * Session lookup happens only for gallery keys, so the public menu's images never
 * pay for it. A failed lookup throws rather than serving bytes: fail closed.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;

  if (!path || path.length === 0) {
    return NOT_FOUND();
  }

  // `path` arrives already percent-decoded, so re-encode each segment before
  // reassembling the key.
  const key = path.map((segment) => encodeURIComponent(segment)).join("/");

  if (MENU_KEY.test(key)) {
    return serve(key, MENU_CACHE_CONTROL);
  }

  if (GALLERY_KEY.test(key)) {
    return serveGallery(key, request.headers);
  }

  return NOT_FOUND();
}

/** The bytes behind a key, once the caller is allowed to have them. */
async function serve(key: string, cacheControl: string): Promise<Response> {
  const result = await getMediaProvider().read(key);

  if (result.status === "not-found") {
    return NOT_FOUND();
  }

  if (result.status === "unavailable") {
    // The store exists but cannot serve the bytes right now. A 502 tells the CDN not
    // to cache the failure, unlike a 500 which, for a few providers, it will.
    console.error(`Media read unavailable: key=${key}`, result.cause);
    return new Response("Unavailable", { status: 502 });
  }

  return new Response(result.body, {
    headers: {
      "content-type": result.contentType ?? "application/octet-stream",
      "cache-control": cacheControl,
      // The key is a random uuid, so the bytes at a key never change.
      "etag": `"${key}"`,
    },
  });
}

/**
 * Gallery keys are servable to the owner, or to anyone when the photograph is
 * visible. Order matters: the owner check first so `/admin/galerie` works for a
 * photograph that is hidden, and so the public path below is reached by exactly
 * the callers whose request the visibility flag governs.
 */
async function serveGallery(key: string, requestHeaders: Headers): Promise<Response> {
  if (await getOwnerProfileFrom(requestHeaders)) {
    return serve(key, GALLERY_CACHE_CONTROL);
  }

  const image = await findGalleryImageByKey(getDb(), key);
  if (!image || !image.isVisible) {
    return NOT_FOUND();
  }

  return serve(key, GALLERY_CACHE_CONTROL);
}
