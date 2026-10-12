/**
 * `Restaurant` structured data, built from confirmed facts only.
 *
 * Deliberately absent, each for the same reason — nobody has confirmed it, and structured
 * data is read by machines that will happily repeat an invention as a fact:
 *
 * - No `address`. The street address has never been confirmed.
 * - No `aggregateRating`. The 4.9/18 the owner sent was a historical screenshot, not a
 *   live figure this site can vouch for, and a stale rating is worse than none.
 * - No `openingHours`. The confirmed sentence is "tous les jours ouvrables ... fermé le
 *   vendredi", and turning that into a machine-readable day list means deciding which days
 *   "jours ouvrables" covers, which is an inference this codebase does not get to make.
 */
export interface StructuredDataFacts {
  readonly phoneFr: string | null;
  readonly mapsUrl: string | null;
}

export function restaurantJsonLd(facts: StructuredDataFacts, origin: string): string {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: "Resta Pescado",
    url: origin,
    servesCuisine: "Fruits de mer",
    image: `${origin}/media/hero-aquarium-poster.webp`,
  };

  if (facts.phoneFr) {
    data.telephone = facts.phoneFr;
  }
  if (facts.mapsUrl) {
    data.hasMap = facts.mapsUrl;
  }

  return JSON.stringify(data);
}
