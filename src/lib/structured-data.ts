import { SOCIAL_LINKS } from "@/lib/social-links";

/** Shared by the root metadata and the structured-data descriptions. */
export const SITE_DESCRIPTION =
  "Poissons et fruits de mer, préparés à Alger depuis 2018. Carte, horaires et commande par téléphone.";

/**
 * `Restaurant` structured data, built from confirmed facts only.
 *
 * Deliberately absent, each for the same reason — nobody has confirmed it, and structured
 * data is read by machines that will happily repeat an invention as a fact:
 *
 * - A street address unless the owner actually stored one. The fallback in the root layout
 *   stays `null`, so no address is invented when D1 is unavailable.
 * - No `aggregateRating`. The 4.9/18 the owner sent was a historical screenshot, not a
 *   live figure this site can vouch for, and a stale rating is worse than none.
 * - No `openingHours`. The confirmed sentence is "tous les jours ouvrables ... fermé le
 *   vendredi", and turning that into a machine-readable day list means deciding which days
 *   "jours ouvrables" covers, which is an inference this codebase does not get to make.
 * - No `priceRange`. No confirmed range exists in the project.
 */
export interface StructuredDataFacts {
  readonly phoneFr: string | null;
  readonly mapsUrl: string | null;
  readonly addressFr?: string | null;
}

function jsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function restaurantJsonLd(facts: StructuredDataFacts, origin: string): string {
  const url = `${origin}/`;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}#restaurant`,
    name: "Resta Pescado",
    url,
    description: SITE_DESCRIPTION,
    servesCuisine: "Fruits de mer",
    image: [`${url}media/hero-aquarium-poster.webp`],
    logo: `${url}images/brand/pescado-logo.webp`,
    hasMenu: `${url}menu`,
    sameAs: SOCIAL_LINKS.map((link) => link.href),
  };

  if (facts.phoneFr) {
    data.telephone = facts.phoneFr;
  }
  if (facts.mapsUrl) {
    data.hasMap = facts.mapsUrl;
  }
  if (facts.addressFr?.trim()) {
    data.address = { "@type": "PostalAddress", streetAddress: facts.addressFr.trim() };
  }

  return jsonLd(data);
}

/** Site-level node. Emitted once by the root layout. */
export function websiteJsonLd(origin: string): string {
  const url = `${origin}/`;
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}#website`,
    url,
    name: "Resta Pescado",
    description: SITE_DESCRIPTION,
    inLanguage: "fr",
    publisher: { "@type": "Restaurant", "@id": `${url}#restaurant`, name: "Resta Pescado" },
  });
}

export interface WebPageJsonLdInput {
  readonly origin: string;
  readonly path: "/" | `/${string}`;
  readonly name: string;
  readonly description: string;
}

/** One page-level node per public page. */
export function webPageJsonLd({ origin, path, name, description }: WebPageJsonLdInput): string {
  const url = path === "/" ? `${origin}/` : `${origin}${path}`;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name,
    description,
    inLanguage: "fr",
    isPartOf: { "@id": `${origin}/#website` },
    about: { "@id": `${origin}/#restaurant` },
  };

  if (path !== "/") {
    data.breadcrumb = { "@id": `${url}#breadcrumb` };
  }

  return jsonLd(data);
}

export interface BreadcrumbJsonLdInput {
  readonly origin: string;
  readonly path: `/${string}`;
  readonly name: string;
}

/** Home-to-page trail for the four inner public pages. */
export function breadcrumbJsonLd({ origin, path, name }: BreadcrumbJsonLdInput): string {
  const url = `${origin}${path}`;
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Accueil", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name, item: url },
    ],
  });
}
