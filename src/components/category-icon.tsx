import type { ReactNode } from "react";

/**
 * Line-art icon for a menu category's fallback tile.
 *
 * The homepage category strip uses a photograph where the bundled gallery actually shows
 * that category, and this drawing where it does not. One generic fish for every category
 * was the earlier state, and it made "Nos Soupes" and "Nos Boissons" look like the same
 * tile twice, so each category now gets a shape that reads as itself.
 *
 * These are line drawings, not photographs: they make no claim about the food, which is
 * why they are drawn as icons rather than as generated pictures of a plate. The paths use
 * `currentColor` so the tile controls the colour, and share one stroke weight so the set
 * looks like one family.
 */
function iconPaths(slug: string): ReactNode {
  switch (slug) {
    case "entrees":
      // A bowl with two leaves: a light starter, distinct from the fish shape.
      return (
        <>
          <path d="M9 25h30c0 8.5-6.7 15-15 15S9 33.5 9 25z" />
          <path d="M17 21c-3-4-1-8 2.5-9-.5 4 1.5 6.5 4 7.5" />
          <path d="M24 21c-1-5 2-9 6-8-1.5 3.5-1 7 1.5 8.5" />
        </>
      );
    case "soupes":
      // A bowl with two curls of steam.
      return (
        <>
          <path d="M9 23h30c0 9-6.7 16-15 16S9 32 9 23z" />
          <path d="M18 16c-2.5-3 2.5-4.5 0-8" />
          <path d="M27 16c-2.5-3 2.5-4.5 0-8" />
        </>
      );
    case "poissons":
      // The fish silhouette, kept as the fallback where the counter photo is unavailable.
      return (
        <>
          <path d="M7 24c7-8 18-8 25 0-7 8-18 8-25 0z" />
          <path d="M32 24l9-6v12z" />
        </>
      );
    case "desserts":
      // A dessert cup with a swirl and a cherry.
      return (
        <>
          <path d="M16 22h16l-1.6 15a3 3 0 0 1-3 2.6h-6.8a3 3 0 0 1-3-2.6z" />
          <path d="M15 22c0-6 4-11 9-11s9 5 9 11" />
          <circle cx="24" cy="8" r="2" />
        </>
      );
    case "boissons":
      // A bottle beside a short glass with a straw.
      return (
        <>
          <path d="M13.5 19h8v17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
          <path d="M15.5 19v-3h4v3" />
          <path d="M15.5 16V9h4v7" />
          <path d="M31 21h9v8a4.5 4.5 0 0 1-9 0z" />
          <path d="M39 12l-4 9" />
        </>
      );
    default:
      return (
        <>
          <path d="M7 24c7-8 18-8 25 0-7 8-18 8-25 0z" />
          <path d="M32 24l9-6v12z" />
        </>
      );
  }
}

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {iconPaths(slug)}
    </svg>
  );
}
