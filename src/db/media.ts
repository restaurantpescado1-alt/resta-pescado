import { getCloudflareContext } from "@opennextjs/cloudflare";

import { createMediaProvider, type MediaEnvironment, type MediaProvider } from "@/lib/media-provider";

/**
 * Handle on the active media provider for the current request.
 *
 * The provider is chosen by `MEDIA_PROVIDER` from the Worker environment
 * (`imagekit`, or `r2` for the legacy shim). Configuration is read as a loose
 * record rather than through the generated `CloudflareEnv` interface so this
 * module does not churn every time the bindings file changes.
 */
let cached: MediaProvider | null = null;

export function getMediaProvider(): MediaProvider {
  if (cached) {
    return cached;
  }
  const { env } = getCloudflareContext();
  cached = createMediaProvider(env as unknown as MediaEnvironment);
  return cached;
}