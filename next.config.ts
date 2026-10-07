import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/**
 * Must stay above `MAX_IMAGE_BYTES` (2 MiB) in `src/lib/images.ts`.
 *
 * The gap covers the multipart envelope and the base64 expansion Next.js applies
 * to the serialized form data, so an upload the validator should reject with a
 * readable message reaches the validator instead of dying as a body-limit error.
 */
const SERVER_ACTION_BODY_LIMIT = "8mb";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: false,
  serverExternalPackages: [],
  images: {
    // Stored photographs are served through /api/media (which proxies the
    // configured media provider), not through the Next.js image optimizer,
    // so images are used as-is.
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      // Next.js defaults to a 1 MB request body, which rejects any dish photo
      // near the documented 2 MiB ceiling with a generic server error instead of
      // the validation message the admin should see. The allow-list and size
      // checks in `src/lib/images.ts` remain the real gate.
      bodySizeLimit: SERVER_ACTION_BODY_LIMIT,
    },
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
