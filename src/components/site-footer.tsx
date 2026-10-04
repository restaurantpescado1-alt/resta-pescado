import { telHref, type PublicSettings } from "@/lib/public-site";

/**
 * Site footer.
 *
 * Repeats the confirmed facts a visitor needs after scrolling: how to order, when it is
 * open, and where it is. It deliberately prints no address, because none has been
 * confirmed.
 *
 * No navigation list. This footer used to repeat four of the five header links, which on
 * a phone made it a second full-screen block of links that led nowhere new. The header
 * carries the navigation, the sticky bar carries call and directions, and this carries the
 * facts instead: a visitor who reached the bottom has already seen where they are.
 */
export function SiteFooter({ settings }: { settings: PublicSettings }) {
  return (
    <footer className="mt-auto bg-ocean text-on-ocean">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-6 sm:grid-cols-3">
          <div>
            <p className="text-lg font-bold">Resta Pescado</p>
            <p className="mt-1 text-sm text-on-ocean-soft">Poissons et fruits de mer.</p>
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Commander</h2>
            {settings.phoneFr ? (
              <a
                href={telHref(settings.phoneFr)}
                className="mt-1 inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                data-testid="footer-phone"
              >
                {settings.phoneFr}
              </a>
            ) : (
              <p className="mt-1 text-sm text-on-ocean-soft">Numéro à confirmer.</p>
            )}
            {/*
              Delivery is by phone and the address is confirmed on the call, so the footer
              says that rather than repeating the full explanation from `/contact`.
            */}
            {settings.deliveryEnabled ? (
              <p className="text-sm text-on-ocean-soft">
                Livraison par téléphone, sans minimum de commande.
              </p>
            ) : null}
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wide">Horaires</h2>
            {settings.hoursFr ? (
              <p className="mt-1 text-sm text-on-ocean-soft" data-testid="footer-hours">
                {settings.hoursFr}
              </p>
            ) : (
              <p className="mt-1 text-sm text-on-ocean-soft">Horaires à confirmer.</p>
            )}
            {settings.mapsUrl ? (
              <a
                href={settings.mapsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex min-h-11 items-center text-sm underline underline-offset-4 hover:text-on-ocean focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                data-testid="footer-map"
              >
                Voir sur la carte
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}