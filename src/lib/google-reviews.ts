/**
 * The restaurant's Google presence: one owner-supplied snapshot, in one place.
 *
 * ## What is here, and what is deliberately not
 *
 * Everything below is data the owner provided and nothing was scraped or invented:
 * the share link, the rating and review count from their screenshot, and the two
 * review excerpts they chose. There is no live Google API here, so the numbers are a
 * snapshot and the UI must present them as one rather than as a figure that updates.
 *
 * The capture date was not supplied, so `capturedOnFr` is `null` and the UI says the
 * figure comes from the restaurant instead of printing a date nobody confirmed.
 *
 * ## Destination
 *
 * `GOOGLE_REVIEW_DESTINATION` is the owner's `maps.app.goo.gl` share link. It
 * resolves to the Google Maps **place profile** for the restaurant, not to the review
 * composer, so `GOOGLE_REVIEWS_ARE_FORM_LINK` is `false` and the call to action
 * invites a visit to the profile instead of promising a review form the link does not
 * open. This constant lives here so the label and the destination can never disagree.
 */

/** The owner's Google share link. The single default destination for the site. */
export const GOOGLE_REVIEW_DESTINATION = "https://maps.app.goo.gl/fWqDCNoy4mkxWU3T6?g_st=ac";

/**
 * Whether the destination opens Google's review form.
 *
 * It does not: the short link resolves to the place profile. Kept as a named constant
 * so the copy below is derived from a fact rather than typed once and left to drift.
 */
export const GOOGLE_REVIEWS_ARE_FORM_LINK = false;

export interface GoogleReviewExcerpt {
  /** The reviewer's words, printed exactly as supplied. */
  readonly quoteFr: string;
  /** How the reviewer is identified without inventing a name. */
  readonly attributionFr: string;
}

export interface GoogleReviewSnapshot {
  readonly rating: number;
  readonly maxRating: number;
  readonly count: number;
  /**
   * When the owner captured the figures, in French. `null` when no date was given,
   * in which case the UI attributes the figures without claiming a date.
   */
  readonly capturedOnFr: string | null;
  readonly excerpts: readonly GoogleReviewExcerpt[];
}

export const GOOGLE_REVIEWS: GoogleReviewSnapshot = {
  rating: 4.9,
  maxRating: 5,
  count: 18,
  capturedOnFr: null,
  excerpts: [
    { quoteFr: "Je recommande vivement ce restaurant 😋", attributionFr: "Client Google" },
    { quoteFr: "Rien à dire, top.", attributionFr: "Client Google" },
  ],
};

/** The call-to-action label, chosen from the destination's actual behaviour. */
export const GOOGLE_REVIEW_CTA_LABEL_FR = GOOGLE_REVIEWS_ARE_FORM_LINK
  ? "Laisser un avis sur Google"
  : "Voir notre fiche Google";

/** The supporting line shown under the label. */
export const GOOGLE_REVIEW_CTA_SUPPORT_FR =
  "Consultez les avis et partagez votre expérience sur Google.";
