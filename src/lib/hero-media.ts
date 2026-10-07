/**
 * Where the homepage hero video and poster are loaded from.
 *
 * The defaults are the three files committed under `public/media/`, encoded from the
 * licensed stock clip recorded in `docs/HERO_VIDEO.md`. They are served as ordinary
 * same-origin static assets, which the platform documentation puts outside any metered
 * service (free, unlimited asset requests, 25 MiB per file — our largest is 2.98 MiB).
 *
 * The environment variables exist so the media can be pointed at another host later
 * without a code change. Unlike the media provider configuration this fails *open*:
 * an unset variable simply keeps the bundled file, which is valid, so there is nothing
 * to guard against. `resolveHeroMedia` is pure over its environment record so the
 * precedence rules are unit-testable without a Worker.
 */

export interface HeroMediaSource {
  /** Full-size loop for viewports at `md` and wider. */
  readonly desktopSrc: string;
  /** Smaller loop for viewports below `md`, where a phone pays for every byte. */
  readonly mobileSrc: string;
  /** Shown before the video attaches, and instead of it in poster-only modes. */
  readonly posterSrc: string;
}

/** The committed files under `public/media/`. See `docs/HERO_VIDEO.md`. */
export const BUNDLED_HERO_MEDIA: HeroMediaSource = Object.freeze({
  desktopSrc: "/media/hero-aquarium-1080.mp4",
  mobileSrc: "/media/hero-aquarium-480.mp4",
  posterSrc: "/media/hero-aquarium-poster.webp",
});

type HeroMediaEnvironment = Record<string, string | undefined>;

function override(
  env: HeroMediaEnvironment,
  name: string,
  fallback: string,
): string {
  const value = env[name]?.trim();
  return value ? value : fallback;
}

/**
 * Resolves the hero media, letting the Worker environment override each file
 * individually. Whitespace-only values count as unset rather than replacing a
 * working default with a broken URL.
 */
export function resolveHeroMedia(
  env: HeroMediaEnvironment = process.env,
): HeroMediaSource {
  return {
    desktopSrc: override(env, "HERO_VIDEO_DESKTOP_URL", BUNDLED_HERO_MEDIA.desktopSrc),
    mobileSrc: override(env, "HERO_VIDEO_MOBILE_URL", BUNDLED_HERO_MEDIA.mobileSrc),
    posterSrc: override(env, "HERO_POSTER_URL", BUNDLED_HERO_MEDIA.posterSrc),
  };
}
