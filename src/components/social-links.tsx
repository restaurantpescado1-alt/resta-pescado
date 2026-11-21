import { SocialIcon } from "@/components/social-icons";
import {
  SOCIAL_LINKS,
  SOCIAL_LINK_REL,
  SOCIAL_LINK_TARGET,
  SOCIAL_NAV_TITLE_FR,
  SOCIAL_SECTION_TITLE_FR,
  socialLinkAriaLabel,
  type SocialLink,
} from "@/lib/social-links";

/**
 * Shared social anchor.
 *
 * Centralises the destination, new-tab behaviour, `rel` and accessible name so the three
 * placements cannot drift apart. Styling stays with each caller because the home pills,
 * the drawer rows and the footer links are deliberately different shapes.
 */
export function SocialAnchor({
  link,
  className,
  children,
  onNavigate,
  testId,
}: {
  link: SocialLink;
  className: string;
  children: React.ReactNode;
  onNavigate?: () => void;
  testId?: string;
}) {
  return (
    <a
      href={link.href}
      target={SOCIAL_LINK_TARGET}
      rel={SOCIAL_LINK_REL}
      aria-label={socialLinkAriaLabel(link)}
      onClick={onNavigate}
      data-testid={testId}
      className={className}
    >
      {children}
    </a>
  );
}

/**
 * High-visibility home-page band, immediately after the hero.
 *
 * Full-bleed navy like the hero and header, with gold pills matching "Voir la carte" and
 * the call actions. `flex-wrap` keeps the three pills on one row on desktop and lets them
 * wrap cleanly instead of overflowing a narrow phone.
 */
export function SocialHighlight() {
  return (
    <section
      className="-mx-4 bg-ocean px-4 py-8 text-on-ocean sm:py-10"
      aria-labelledby="suivez-titre"
      data-testid="social-highlight"
    >
      <div className="mx-auto max-w-7xl text-center">
        <h2 id="suivez-titre" className="text-2xl font-bold tracking-tight">
          {SOCIAL_SECTION_TITLE_FR}
        </h2>

        <ul className="mt-5 flex flex-wrap justify-center gap-3">
          {SOCIAL_LINKS.map((link) => (
            <li key={link.platform}>
              <SocialAnchor
                link={link}
                testId={`social-highlight-${link.platform}`}
                className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-bold text-ink transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ocean sm:px-5"
              >
                <SocialIcon platform={link.platform} className="h-5 w-5 shrink-0" />
                <span>{link.platformLabel}</span>
                <span className="text-xs font-semibold text-ink/75">{link.label}</span>
              </SocialAnchor>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * "Nos réseaux" block inside the hamburger disclosure.
 *
 * Rendered after the page links, separated by the same hairline the header drawer already
 * uses. Rows reuse the drawer's 44px minimum height, so a thumb can hit them as reliably
 * as the navigation links. Clicking one closes the drawer behind the new tab.
 */
export function SocialNavSection({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mt-1 border-t border-white/15 px-1 pt-3">
      <p className="px-3 text-xs font-bold uppercase tracking-wide text-on-ocean-soft">
        {SOCIAL_NAV_TITLE_FR}
      </p>

      <ul className="mt-1">
        {SOCIAL_LINKS.map((link) => (
          <li key={link.platform}>
            <SocialAnchor
              link={link}
              onNavigate={onNavigate}
              testId={`mobile-nav-${link.platform}`}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-on-ocean/90 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <SocialIcon platform={link.platform} className="h-5 w-5 shrink-0" />
              <span>{link.platformLabel}</span>
              <span className="text-on-ocean-soft">{link.label}</span>
            </SocialAnchor>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Footer list items.
 *
 * Returned as `<li>` elements so they drop into the footer's existing social/review row
 * without changing that list's spacing or border.
 */
export function SocialFooterItems() {
  return (
    <>
      {SOCIAL_LINKS.map((link) => (
        <li key={link.platform}>
          <SocialAnchor
            link={link}
            testId={`footer-${link.platform}`}
            className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4 hover:text-on-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <SocialIcon platform={link.platform} className="h-4 w-4 shrink-0" />
            <span>{link.label}</span>
          </SocialAnchor>
        </li>
      ))}
    </>
  );
}
