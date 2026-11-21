import type { SocialPlatform } from "@/lib/social-links";

/**
 * Decorative social glyphs.
 *
 * Drawn inline for the same reason as the header icons: three small marks do not justify
 * an icon dependency, and the caller controls size and colour through `className`. Every
 * glyph is hidden from assistive technology because the surrounding link already names
 * the platform and the handle in its visible text and `aria-label`.
 */
export function SocialIcon({
  platform,
  className = "h-5 w-5 shrink-0",
}: {
  platform: SocialPlatform;
  className?: string;
}) {
  if (platform === "instagram") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className={className}
        fill="currentColor"
      >
        <path d="M14.2 2h3.05c.22 1.79 1.32 3.2 3.15 3.55v3.1a9.2 9.2 0 0 1-3.15-1.02v6.17a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6.02.88.07v3.16a2.55 2.55 0 1 0 1.77 2.43V2Z" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="currentColor"
    >
      <path d="M13.4 21v-8.05h2.72l.41-3.16H13.4V7.9c0-.92.26-1.55 1.58-1.55H16.8V3.4a21.8 21.8 0 0 0-2.35-.1c-2.5 0-4.2 1.53-4.2 4.34v2.15H7.5v3.16h2.75V21h3.15Z" />
    </svg>
  );
}
