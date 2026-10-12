"use client";

import { useEffect, useState } from "react";

/**
 * The two information strips that sit above the main navigation.
 *
 * They live in normal document flow rather than sticking to the top: the benefit strip
 * is a first impression, not a permanent fixture, and pinning two extra rows to a small
 * screen would eat the space the menu needs.
 *
 * The benefit strip rotates through four confirmed, non-commercial messages. The
 * rotation is made accessible rather than merely animated:
 *
 * - A visible pause control lets anyone stop it (WCAG 2.2.2), with `aria-pressed` and a
 *   label that names the action offered.
 * - Under `prefers-reduced-motion` it does not rotate at all and shows the first
 *   message statically; the pause control is hidden because there is nothing to pause.
 * - The text is a plain, non-live element, so a screen reader is not interrupted every
 *   five seconds by a message that carries no new information.
 */
const BENEFITS = [
  "Commandes par téléphone",
  "Livraison sur appel",
  "Réservation par téléphone",
  "Chaise enfant disponible",
] as const;

const ROTATE_MS = 5000;

export function InfoStrips() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) {
      return;
    }
    const timer = window.setInterval(
      () => setIndex((current) => (current + 1) % BENEFITS.length),
      ROTATE_MS,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const message = reducedMotion ? BENEFITS[0] : BENEFITS[index];

  return (
    <>
      <div
        className="bg-ocean text-center text-[0.72rem] font-medium tracking-wide text-on-ocean-soft"
        data-testid="info-strip-brand"
      >
        <p className="mx-auto max-w-6xl px-4 py-1.5">
          Depuis 2018 <span aria-hidden="true">•</span> Restaurant de poissons et fruits
          de mer
        </p>
      </div>

      <div
        className="bg-marine text-on-ocean"
        data-testid="info-strip-benefits"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-4 py-1.5">
          <p className="text-center text-[0.78rem] font-semibold">{message}</p>
          {reducedMotion ? null : (
            <button
              type="button"
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              data-testid="info-strip-pause"
              className="min-w-11 rounded-full border border-on-ocean/40 px-2 py-0.5 text-[0.66rem] font-semibold text-on-ocean-soft transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {paused ? "Reprendre" : "Pause"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
