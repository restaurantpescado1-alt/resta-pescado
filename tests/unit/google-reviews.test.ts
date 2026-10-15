import { describe, expect, it } from "vitest";

import {
  GOOGLE_REVIEWS,
  GOOGLE_REVIEW_CTA_LABEL_FR,
  GOOGLE_REVIEW_CTA_SUPPORT_FR,
  GOOGLE_REVIEW_DESTINATION,
  GOOGLE_REVIEWS_ARE_FORM_LINK,
} from "../../src/lib/google-reviews";

/**
 * The Google review snapshot and its labels.
 *
 * These pin two things that are easy to get subtly wrong: that no figure is fabricated
 * (the capture date in particular), and that the call-to-action label matches what the
 * link actually opens.
 */
describe("google review snapshot", () => {
  it("keeps the rating within its own scale", () => {
    expect(GOOGLE_REVIEWS.rating).toBeGreaterThan(0);
    expect(GOOGLE_REVIEWS.rating).toBeLessThanOrEqual(GOOGLE_REVIEWS.maxRating);
    expect(GOOGLE_REVIEWS.count).toBeGreaterThan(0);
    expect(Number.isInteger(GOOGLE_REVIEWS.count)).toBe(true);
  });

  it("carries exactly the owner's two excerpts, attributed without a name", () => {
    expect(GOOGLE_REVIEWS.excerpts.map((excerpt) => excerpt.quoteFr)).toEqual([
      "Je recommande vivement ce restaurant 😋",
      "Rien à dire, top.",
    ]);
    for (const excerpt of GOOGLE_REVIEWS.excerpts) {
      expect(excerpt.attributionFr).toBe("Client Google");
    }
  });

  it("does not fabricate a capture date", () => {
    // The owner never supplied one, so the UI must attribute the figure without a date.
    expect(GOOGLE_REVIEWS.capturedOnFr).toBeNull();
  });

  it("labels the call to action from the destination it actually opens", () => {
    expect(GOOGLE_REVIEW_CTA_LABEL_FR).toBe(
      GOOGLE_REVIEWS_ARE_FORM_LINK ? "Laisser un avis sur Google" : "Voir notre fiche Google",
    );
    expect(GOOGLE_REVIEW_CTA_SUPPORT_FR).toContain("Google");
  });

  it("points at the owner's Google share link", () => {
    expect(GOOGLE_REVIEW_DESTINATION).toMatch(/^https:\/\/maps\.app\.goo\.gl\//);
  });
});
