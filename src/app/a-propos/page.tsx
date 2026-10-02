import Link from "next/link";

import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getSiteSettings } from "@/db/repositories/menu";
import type { SiteSettingsRow } from "@/db/schema";
import { FISH_REFERENCE_LABEL, listFishReferenceImages } from "@/lib/fish-images";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "À propos",
  description: "Le restaurant et les poissons que nous servons.",
};

type AboutData =
  | { status: "ok"; settings: SiteSettingsRow | null }
  | { status: "error"; detail: string };

async function loadAbout(): Promise<AboutData> {
  try {
    return { status: "ok", settings: await getSiteSettings(getDb()) };
  } catch (error) {
    console.error("About read failed", error);
    return { status: "error", detail: "La page n'a pas pu être chargée." };
  }
}

/**
 * About page and fish guide.
 *
 * The guide exists because "Chien de mer" and "Loup de mer" are not obvious to most
 * people, and an order is easier to place when the customer knows what they are
 * asking for.
 *
 * Every image on this page is an AI-generated species illustration, never a photograph
 * of a cooked dish, so the required label appears on every single one. A visitor must
 * not be able to conclude that the drawing shows a plated dish.
 */
export default async function AboutPage() {
  const data = await loadAbout();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  const { settings } = data;
  const fish = listFishReferenceImages();

  return (
    <div data-testid="about">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">À propos</h1>
      </header>

      <section className="mt-6 max-w-prose space-y-4 text-ink/80" aria-labelledby="restaurant-titre">
        <h2 id="restaurant-titre" className="text-xl font-bold text-ink">
          Le restaurant
        </h2>
        <p>
          Resta Pescado est un restaurant de poissons et de fruits de mer. Pour commander
          ou connaître les plats disponibles, appelez-nous&nbsp;: c&apos;est le plus sûr.
        </p>
        {/*
          Kept to what the owner actually stated: that this is a fish and seafood
          restaurant, and that availability is settled by phone.

          No claim about the landings, the chef, the suppliers, the catch, or how often
          the menu is revised appears here, because none of it has been confirmed. An
          earlier draft did say the card "suit les arrivages", which described an
          operational practice nobody had actually stated, so it was removed rather than
          kept as plausible-sounding decoration.
        */}
        {settings?.familyNoteFr ? (
          <p className="rounded-xl border-l-4 border-bright bg-white/60 px-4 py-3 font-medium text-ink">
            {settings.familyNoteFr}
          </p>
        ) : null}
        {settings?.hoursFr ? <p>{settings.hoursFr}</p> : null}
        {settings?.phoneFr ? (
          <p>
            <Link
              href={`tel:${settings.phoneFr.replace(/[\s.\-()]/g, "")}`}
              className="font-semibold text-marine underline underline-offset-4"
            >
              {settings.phoneFr}
            </Link>
          </p>
        ) : null}
      </section>

      {/*
        Fish guide. Each caption carries the species name and the mandatory AI label.
      */}
      <section id="guide-poissons" className="mt-14 scroll-mt-32" aria-labelledby="guide-titre">
        <h2 id="guide-titre" className="text-2xl font-bold tracking-tight">
          Guide des poissons
        </h2>
        <p className="mt-2 max-w-prose text-ink/75">
          Voici les espèces que nous pouvons servir. Les illustrations ci-dessous
          représentent le poisson, pas le plat préparé.
        </p>

        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {fish.map((image) => (
            <li key={image.slug} className="overflow-hidden rounded-2xl border border-line bg-white/60">
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.src}
                  alt={image.altFr}
                  width={image.width}
                  height={image.height}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="px-4 py-3">
                  <span className="block font-bold">{image.nameFr}</span>
                  <span className="mt-1 block text-xs leading-snug text-ink/70" data-testid="guide-ai-label">
                    {FISH_REFERENCE_LABEL}
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-12 text-sm">
        <Link href="/menu" className="text-marine underline underline-offset-4">
          Voir la carte
        </Link>
      </p>
    </div>
  );
}
