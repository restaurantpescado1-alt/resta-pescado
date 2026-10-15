import Link from "next/link";

import { MapPinIcon, PhoneIcon } from "@/components/icons";
import { MobileNav } from "@/components/mobile-nav";
import type { PublicSettings } from "@/lib/public-site";
import { telHref } from "@/lib/public-site";

/**
 * Site header.
 *
 * Sticky, so the phone number stays reachable while a visitor reads the menu, which
 * matters on a restaurant site where the menu's only call to action is a phone call. The
 * two information strips above it are deliberately not sticky: only the navigation is
 * pinned.
 *
 * Below `lg` the header is one flowing row, unchanged from the approved phone and tablet
 * layout: at `md` the links sit inline and at narrower widths they collapse into
 * `MobileNav`. From `lg` up the header becomes a three-column grid so the restaurant's own
 * logo can sit dead centre on the page, with the navigation on the left and the two
 * actions — call and directions — on the right. The same accessible disclosure the phone
 * uses becomes that left-hand menu control, so a screen reader meets one navigation
 * landmark and one toggle at every width rather than a second pattern to learn.
 *
 * The centred logo is a real, unchanged crop of the owner's artwork (an opaque square), not
 * a re-draw. Its box is square, so it cannot also be the ~240px wide banner a horizontal
 * logo would be; it is sized to the header band instead and the seam against the navy bar
 * is softened with a rounded corner.
 */
const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/menu", label: "La carte" },
  { href: "/galerie", label: "Galerie" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * The call action dials the confirmed number in international form so a visitor ringing
 * from abroad reaches the restaurant without editing the digits.
 */
const CALL_HREF = "tel:+213540559967";

export function SiteHeader({ settings }: { settings: PublicSettings }) {
  return (
    <header className="sticky top-0 z-40 bg-ocean text-on-ocean shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-2 gap-y-0 px-3 py-1.5 sm:px-4 sm:py-2 lg:grid lg:min-h-[104px] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-x-6 lg:px-6 lg:py-2">
        <Link
          href="/"
          className="order-2 flex-1 text-center text-base font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-lg md:order-none md:flex-none md:text-left lg:hidden"
          aria-label="Resta Pescado, accueil"
        >
          Resta&nbsp;Pescado
        </Link>

        {/* Tablet navigation. Inline and CSS-only, so it works before hydration. It gives
            way to the disclosure at `lg`. */}
        <nav
          aria-label="Navigation principale"
          data-testid="desktop-nav"
          className="order-3 ml-auto hidden md:order-none md:block lg:hidden"
        >
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-on-ocean/90 transition-colors hover:bg-white/10 hover:text-on-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          The phone action stays visible at every width below `lg`. It shrinks to 12px
          rather than becoming an icon, because a recognisable number is more useful than
          a symbol and the widest layout still fits on one line with the menu button.
        */}
        {settings.phoneFr ? (
          <a
            href={telHref(settings.phoneFr)}
            className="order-4 inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-2.5 text-[12px] font-bold text-ink transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ocean sm:px-4 sm:text-sm md:order-none lg:hidden"
            data-testid="header-phone"
          >
            {settings.phoneFr}
          </a>
        ) : null}

        {/*
          Centred identity for `lg`. The link carries the accessible name and the image is
          decorative, so a screen reader hears the brand once rather than reading the
          wordmark off the picture as well.
        */}
        <Link
          href="/"
          aria-label="Resta Pescado, accueil"
          data-testid="header-logo"
          className="hidden lg:col-start-2 lg:row-start-1 lg:flex lg:items-center lg:justify-self-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/brand/pescado-logo.webp"
            alt=""
            width={256}
            height={256}
            className="h-[84px] w-auto rounded-xl"
          />
        </Link>

        {/*
          The two actions the header exists to offer. Call is the primary yellow action;
          directions stays outlined so the row reads as one primary and one secondary.
        */}
        <div className="hidden items-center gap-3 lg:col-start-3 lg:row-start-1 lg:flex lg:justify-self-end">
          <a
            href={CALL_HREF}
            data-testid="header-call"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-ink transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ocean"
          >
            <PhoneIcon />
            Appeler
          </a>

          {settings.mapsUrl ? (
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              data-testid="header-directions"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-on-ocean/70 px-5 text-sm font-bold text-on-ocean transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <MapPinIcon />
              Itinéraire
            </a>
          ) : null}
        </div>

        <MobileNav links={NAV_LINKS} />
      </div>
    </header>
  );
}
