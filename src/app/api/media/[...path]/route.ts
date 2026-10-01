import { getMediaBucket } from "@/db/media";

export const dynamic = "force-dynamic";

/**
 * Serves an object from the private R2 bucket.
 *
 * The bucket has no public URL, so this route is the only way an image reaches a
 * browser. Keys are validated against the `menu/{year}/{uuid}.{ext}` shape before
 * any lookup, which stops a crafted key from probing the bucket. Dish photos are
 * public menu content, so this route is intentionally unauthenticated.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await context.params;

  if (!path || path.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  // `path` arrives already percent-decoded, so re-encode each segment before
  // reassembling the key.
  const key = path.map((segment) => encodeURIComponent(segment)).join("/");

  if (!/^menu\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  const media = getMediaBucket();
  const object = await media.get(key);

  if (!object || !object.body) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": object.httpMetadata?.cacheControl ?? "public, max-age=31536000, immutable",
      // The key is a random uuid, so the bytes at a key never change.
      "etag": `"${key}"`,
    },
  });
}
