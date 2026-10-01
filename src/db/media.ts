import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Handle on the private R2 bucket holding dish images.
 *
 * The bucket has no public URL. Uploads go through the authenticated server
 * action and downloads go through `/api/media/[...path]`, so the browser never
 * holds a write credential.
 */
export type MediaBucket = R2Bucket;

let cached: MediaBucket | undefined;

/**
 * R2 handle for the current request. The binding comes from
 * `getCloudflareContext()`, which resolves the same way in `next dev`, in
 * `opennextjs-cloudflare preview`, and in a deployed Worker.
 */
export function getMediaBucket(): MediaBucket {
  if (cached) {
    return cached;
  }
  const { env } = getCloudflareContext();
  cached = env.MEDIA;
  return cached;
}
