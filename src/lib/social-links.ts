/**
 * Owner-confirmed social destinations.
 *
 * Kept as code constants rather than dashboard settings: the owner supplied these exact
 * public profile URLs, so every placement (home highlight, mobile drawer and footer)
 * renders the same addresses. A single source of truth also keeps the `target`/`rel` and
 * accessible names identical everywhere.
 */
export type SocialPlatform = "instagram" | "tiktok" | "facebook";

export interface SocialLink {
  readonly platform: SocialPlatform;
  /** Platform name shown beside the icon. */
  readonly platformLabel: string;
  /** The owner's published handle/name, shown as the link's visible label. */
  readonly label: string;
  readonly href: string;
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    platform: "instagram",
    platformLabel: "Instagram",
    label: "@pescado.seafood",
    href: "https://www.instagram.com/pescado.seafood/",
  },
  {
    platform: "tiktok",
    platformLabel: "TikTok",
    label: "@pescado.seafood",
    href: "https://www.tiktok.com/@pescado.seafood",
  },
  {
    platform: "facebook",
    platformLabel: "Facebook",
    label: "Resta Pescado",
    href: "https://www.facebook.com/p/Resta-pescado-100054168732198/",
  },
] as const;

/** Every social link opens in a new tab without leaking the opener. */
export const SOCIAL_LINK_TARGET = "_blank";
export const SOCIAL_LINK_REL = "noopener noreferrer";

export const SOCIAL_SECTION_TITLE_FR = "Suivez-nous en vidéo";
export const SOCIAL_NAV_TITLE_FR = "Nos réseaux";

/** Names the platform, the handle and the new-tab behaviour for screen readers. */
export function socialLinkAriaLabel(link: SocialLink): string {
  return `${link.platformLabel} : ${link.label} (ouvre dans un nouvel onglet)`;
}
