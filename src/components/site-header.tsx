import Link from "next/link";

import type { PublicSettings } from "@/lib/public-site";
import { telHref } from "@/lib/public-site";

/**
 * Site header.
 *
 * Sticky, so the phone number stays reachable while a visitor reads the menu, which
 * matters on a restaurant site where the menu's only call to action is a phone call.
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
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold tracking-tight"
          aria-label="Resta Pescado, accueil"
        >
          Resta&nbsp;Pescado
        </Link>

        {/*
          `hidden md:flex` rather than a JS-driven toggle. The mobile equivalent is a
          wrapping row below, which needs no script, cannot get stuck "closed" when
          hydration fails, and is reachable without a pointer.
        */}
        <nav aria-label="Navigation principale" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded-md px-3 py-2 text-sm font-medium text-on-ocean/90 transition-colors hover:bg-white/10 hover:text-on-ocean"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {settings.phoneFr ? (
          <a
            href={telHref(settings.phoneFr)}
            className="ml-auto rounded-full bg-accent px-4 py-2 text-sm font-bold text-ink transition-transform hover:scale-[1.02] md:ml-0"
            data-testid="header-phone"
          >
            {settings.phoneFr}
          </a>
        ) : null}
      </div>

      {/*
        Mobile navigation. Wraps onto its own line rather than hiding behind a
        disclosure button, which would need client-side state to be usable at all.
      */}
      <nav aria-label="Navigation principale" className="border-t border-white/15 md:hidden">
        <ul className="mx-auto flex max-w-6xl flex-wrap gap-x-1 gap-y-0 px-2 py-1">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-on-ocean/90 hover:bg-white/10"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
