import type { Metadata } from "next";
import { headers } from "next/headers";

import { resolveSiteOrigin } from "@/lib/site-origin";

export interface PublicPageMetadataInput {
  readonly title: string;
  readonly description: string;
  /** Root is `/`; inner pages are their path beginning with `/`. */
  readonly path: "/" | `/${string}`;
}

const SOCIAL_IMAGE = "/media/hero-aquarium-poster.webp";
const SOCIAL_IMAGE_ALT = "Poissons dans un aquarium chez Resta Pescado.";

/**
 * Metadata shared by the five public pages.
 *
 * The root layout resolves the metadata base and robots directive from the request host.
 * This helper supplies the per-page canonical, `og:url`, and matching social title/description.
 * It repeats the root's image/card fields because a child `openGraph` or `twitter` object
 * replaces those objects rather than merging their individual fields. Preview hosts resolve
 * to the preview origin and remain `noindex` through the root layout.
 */
export async function publicPageMetadata({
  title,
  description,
  path,
}: PublicPageMetadataInput): Promise<Metadata> {
  const host = (await headers()).get("host");
  const origin = resolveSiteOrigin(host);
  const url = path === "/" ? `${origin}/` : `${origin}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "fr_DZ",
      siteName: "Resta Pescado",
      title,
      description,
      url,
      images: [
        {
          url: SOCIAL_IMAGE,
          width: 1920,
          height: 1080,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_IMAGE],
    },
  };
}
