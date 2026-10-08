import Link from "next/link";

import { MobileNav } from "@/components/mobile-nav";
import type { PublicSettings } from "@/lib/public-site";
import { telHref } from "@/lib/public-site";

/**
 * Site header.
 *
 * Sticky, so the phone number stays reachable while a visitor reads the menu, which
 * matters on a restaurant site where the menu's only call to action is a phone call.
 *
 * One row at every width. Below `md` the links collapse into `MobileNav`, a disclosure,
 * which keeps the identity, the phone number, and the menu button on a single 390px line.
 * At `md` and up the full list is shown and the button is hidden, so the two navigations
 * never coexist and a screen reader never meets the same landmark twice.
 */
const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/menu", label: "La carte" },
  { href: "/galerie", label: "Galerie" },
  { href: "/a-propos", label: "À propos" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader({ settings }: { settings: PublicSettings }) {
  return (
    <header className="sticky top-0 z-40 bg-ocean text-on-ocean shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-1 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        {/*
          `shrink-0` on the identity and the button, and `truncate` on neither: the name
          is short enough at 390px beside a 13px phone number, and truncating the
          restaurant's name would be the wrong thing to save space.
        */}
        <Link
          href="/"
          className="shrink-0 flex-1 text-center text-base font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:text-lg"
          aria-label="Resta Pescado, accueil"
        >
          Resta&nbsp;Pescado
        </Link>

        {/* Desktop navigation. CSS-only, so it works before hydration. */}
        <nav
          aria-label="Navigation principale"
          data-testid="desktop-nav"
          className="ml-auto hidden md:block"
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
          The phone action stays visible at every width. It shrinks to 13px below `sm`
          rather than becoming an icon, because a recognisable number is more useful than
          a symbol and the widest layout still fits on one line with the menu button.
        */}
      <MobileNav links={NAV_LINKS} />
        {settings.phoneFr ? (
          <a
            href={telHref(settings.phoneFr)}
            className="order-3 inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-2 text-[12px] font-bold text-ink transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ocean sm:px-4 sm:text-sm md:order-none md:ml-0"
            data-testid="header-phone"
          >
            {settings.phoneFr}
          </a>
        ) : null}
      </div>
    </header>
  );
}