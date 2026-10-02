import Link from "next/link";

import { telHref, type PublicSettings } from "@/lib/public-site";

/**
 * Site footer.
 *
 * Repeats the confirmed facts that a visitor needs after scrolling: how to order, when
 * it is open, and where to find it. It deliberately does not print an address, because
 * none has been confirmed.
 */
export function SiteFooter({ settings }: { settings: PublicSettings }) {
  return (
    <footer className="mt-auto bg-ocean text-on-ocean">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-lg font-bold">Resta Pescado</p>
            <p className="mt-2 text-sm text-on-ocean-soft">Poissons et fruits de mer.</p>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Commander</h2>
            {settings.phoneFr ? (
              <a
                href={telHref(settings.phoneFr)}
                className="mt-2 block font-semibold underline underline-offset-4"
                data-testid="footer-phone"
              >
                {settings.phoneFr}
              </a>
            ) : null}
            {settings.deliveryEnabled ? (
              <p className="mt-2 text-sm text-on-ocean-soft">Livraison disponible.</p>
            ) : null}
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Horaires</h2>
            {settings.hoursFr ? (
              <p className="mt-2 text-sm text-on-ocean-soft" data-testid="footer-hours">
                {settings.hoursFr}
              </p>
            ) : (
              <p className="mt-2 text-sm text-on-ocean-soft">Horaires à confirmer.</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Navigation</h2>
            <ul className="mt-2 flex flex-col text-sm">
              <li>
                <Link href="/menu" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                  La carte
                </Link>
              </li>
              <li>
                <Link href="/galerie" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                  Galerie
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                  À propos
                </Link>
              </li>
              <li>
                <Link href="/contact" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5 text-sm text-on-ocean-soft">
          <p>Resta Pescado</p>
          {settings.mapsUrl ? (
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4 hover:text-on-ocean"
            >
              Voir sur la carte
            </a>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
