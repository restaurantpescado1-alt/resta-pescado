import {
  GOOGLE_REVIEWS,
  GOOGLE_REVIEW_CTA_LABEL_FR,
  GOOGLE_REVIEW_CTA_SUPPORT_FR,
} from "@/lib/google-reviews";

/**
 * The Google reviews/trust section.
 *
 * Renders the owner's snapshot from `src/lib/google-reviews.ts` — never a live API — so
 * the copy is fixed data and the section cannot silently change between requests. The
 * star row is drawn twice and clipped to the rating so 4.9 does not round up to a flat
 * five stars, and the figure carries an attribution rather than standing as an
 * unattributed claim.
 */
function StarRating({ rating, max }: { rating: number; max: number }) {
  const stars = "★".repeat(max);
  const percent = Math.max(0, Math.min(100, (rating / max) * 100));

  return (
    <span
      className="relative inline-block whitespace-nowrap text-xl leading-tight"
      role="img"
      aria-label={`Note de ${rating.toFixed(1).replace(".", ",")} sur ${max}`}
    >
      <span aria-hidden className="text-on-ocean/30">
        {stars}
      </span>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 overflow-hidden text-accent"
        style={{ width: `${percent}%` }}
      >
        {stars}
      </span>
    </span>
  );
}

export function GoogleReviews({ href }: { href: string }) {
  const { rating, maxRating, count, capturedOnFr, excerpts } = GOOGLE_REVIEWS;
  const ratingFr = rating.toFixed(1).replace(".", ",");

  return (
    <section
      className="mt-10 rounded-2xl bg-ocean px-6 py-10 text-on-ocean sm:px-10 md:mt-16"
      aria-labelledby="avis-titre"
      data-testid="google-reviews"
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2 id="avis-titre" className="text-2xl font-bold">
          Ils ont partagé leur expérience
        </h2>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <StarRating rating={rating} max={maxRating} />
          <p className="text-sm font-semibold" data-testid="google-rating">
            {ratingFr}/{maxRating} · {count}&nbsp;avis
          </p>
        </div>

        <p className="mt-1 text-xs text-on-ocean-soft">
          {capturedOnFr ? `Relevé du ${capturedOnFr}.` : "Note communiquée par le restaurant."}
        </p>

        <ul className="mt-6 grid gap-4 text-left sm:grid-cols-2">
          {excerpts.map((excerpt) => (
            <li key={excerpt.quoteFr} className="rounded-2xl bg-white/10 p-5">
              <p className="text-sm italic">«&nbsp;{excerpt.quoteFr}&nbsp;»</p>
              <p className="mt-2 text-xs font-semibold text-on-ocean-soft">
                {excerpt.attributionFr}
              </p>
            </li>
          ))}
        </ul>

        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-6 inline-block rounded-full bg-accent px-6 py-3 text-sm font-bold text-ink transition-transform hover:scale-[1.02]"
          data-testid="google-review"
        >
          {GOOGLE_REVIEW_CTA_LABEL_FR}
        </a>
        <p className="mt-2 text-xs text-on-ocean-soft">{GOOGLE_REVIEW_CTA_SUPPORT_FR}</p>
      </div>
    </section>
  );
}
