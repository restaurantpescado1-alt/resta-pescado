import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getSiteSettings } from "@/db/repositories/menu";
import type { SiteSettingsRow } from "@/db/schema";
import { telHref } from "@/lib/public-site";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contact",
  description: "Appeler le restaurant, commander, réserver une table, livraison et horaires.",
};

type ContactData =
  | { status: "ok"; settings: SiteSettingsRow | null }
  | { status: "error"; detail: string };

async function loadContact(): Promise<ContactData> {
  try {
    return { status: "ok", settings: await getSiteSettings(getDb()) };
  } catch (error) {
    console.error("Contact read failed", error);
    return { status: "error", detail: "La page n'a pas pu être chargée." };
  }
}

/**
 * Contact page.
 *
 * The phone number carries every function this restaurant has: ordering, table
 * reservations, and delivery. There is no online ordering or booking form in this
 * phase, so each use of the number is spelled out rather than left for the visitor to
 * guess.
 *
 * Delivery is explained in the owner's own words from `site_settings`. No fee amount,
 * minimum order, or delivery zone is printed, because none has been confirmed.
 */
export default async function ContactPage() {
  const data = await loadContact();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  const { settings } = data;
  const phone = settings?.phoneFr;

  return (
    <div data-testid="contact">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">Contact</h1>
        <p className="mt-2 max-w-prose text-ink/75">
          Le téléphone est le moyen le plus simple de nous joindre.
        </p>
      </header>

      {phone ? (
        <section className="mt-8 rounded-2xl bg-ocean p-8 text-center text-on-ocean">
          <h2 className="text-lg font-bold uppercase tracking-wide">Par téléphone</h2>
          <a
            href={telHref(phone)}
            className="mt-3 block text-4xl font-bold underline underline-offset-8"
            data-testid="contact-phone"
          >
            {phone}
          </a>
          <p className="mt-3 text-on-ocean-soft">
            Pour commander, réserver une table, ou demander la livraison.
          </p>
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-dashed border-line-strong p-8 text-center">
          <p className="text-ink/75">Le numéro de téléphone sera bientôt disponible.</p>
        </section>
      )}

      {/*
        The three uses of the number, separated. A visitor landing here has one of
        three intentions and this way none of them has to guess.
      */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3" aria-labelledby="usages-titre">
        <h2 id="usages-titre" className="sr-only">
          Ce que vous pouvez faire par téléphone
        </h2>

        <div className="rounded-2xl border border-line bg-white/60 p-5">
          <h3 className="font-bold">Commander</h3>
          <p className="mt-2 text-sm text-ink/75">
            {settings?.pickupTextFr ??
              "Appelez-nous pour commander un plat ou une livraison."}
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white/60 p-5">
          <h3 className="font-bold">Réserver une table</h3>
          <p className="mt-2 text-sm text-ink/75">
            Pour réserver, appelez-nous et nous vous confirmerons la disponibilité.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white/60 p-5">
          <h3 className="font-bold">Livraison</h3>
          <p className="mt-2 text-sm text-ink/75">
            {settings?.deliveryZonesTextFr ??
              "Dites-nous votre adresse et nous confirmons la livraison par téléphone."}
          </p>
        </div>
      </section>

      {settings?.deliveryEnabled ? (
        <section className="mt-10" aria-labelledby="livraison-titre">
          <h2 id="livraison-titre" className="text-xl font-bold">
            Livraison
          </h2>
          <dl className="mt-4 space-y-4">
            {settings.deliveryHoursFr ? (
              <div>
                <dt className="font-semibold">Horaires de livraison</dt>
                <dd className="text-ink/75">{settings.deliveryHoursFr}</dd>
              </div>
            ) : null}
            {settings.deliveryFeeTextFr ? (
              <div>
                <dt className="font-semibold">Frais</dt>
                <dd className="text-ink/75">{settings.deliveryFeeTextFr}</dd>
              </div>
            ) : null}
            {settings.deliveryMinimumOrderTextFr ? (
              <div>
                <dt className="font-semibold">Commande minimum</dt>
                <dd className="text-ink/75">{settings.deliveryMinimumOrderTextFr}</dd>
              </div>
            ) : null}
            {settings.deliveryZonesTextFr ? (
              <div>
                <dt className="font-semibold">Zones</dt>
                <dd className="text-ink/75">{settings.deliveryZonesTextFr}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="mt-10" aria-labelledby="horaires-titre">
        <h2 id="horaires-titre" className="text-xl font-bold">
          Horaires
        </h2>
        {settings?.hoursFr ? (
          <p className="mt-2 text-ink/75" data-testid="contact-hours">
            {settings.hoursFr}
          </p>
        ) : (
          <p className="mt-2 text-ink/75">Horaires à confirmer.</p>
        )}
      </section>

      {/*
        No address block. The address was never confirmed, so printing a guess would
        be inventing a fact; the map link points at the owner's own pin.
      */}
      {settings?.mapsUrl ? (
        <section className="mt-10" aria-labelledby="acces-titre">
          <h2 id="acces-titre" className="text-xl font-bold">
            Nous trouver
          </h2>
          <a
            href={settings.mapsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 inline-block rounded-full bg-marine px-6 py-3 text-sm font-bold text-on-ocean transition-colors hover:bg-ocean"
            data-testid="contact-map"
          >
            Ouvrir l&apos;itinéraire
          </a>
        </section>
      ) : null}
    </div>
  );
}
