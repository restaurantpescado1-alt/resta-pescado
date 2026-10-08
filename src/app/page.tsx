import Link from "next/link";

import { DishCard } from "@/components/dish";
import { HeroVideo } from "@/components/hero-video";
import { SafeImage } from "@/components/safe-image";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { Reveal } from "@/components/reveal";
import { getDb } from "@/db";
import { getPublicMenu, getSiteSettings } from "@/db/repositories/menu";
import type { MenuCategoryRow, MenuItemRow, SiteSettingsRow } from "@/db/schema";
import { bundledGalleryUrl, getBundledGalleryImage } from "@/lib/gallery-images";
import {
  FISH_REFERENCE_IMAGES,
  FISH_REFERENCE_EXPLANATION,
  listFishReferenceImages,
} from "@/lib/fish-images";
import { resolveHeroMedia } from "@/lib/hero-media";
import { selectHomePreview, telHref } from "@/lib/public-site";

export const dynamic = "force-dynamic";

/**
 * How many dishes the neutral preview shows. A teaser, not the menu: the whole card is
 * 34 dishes long and the section exists to invite a click through to `/menu`.
 */
const PREVIEW_LIMIT = 6;

/**
 * The dining-room photograph.
 *
 * Read from the gallery manifest rather than hardcoded, so the page cannot end up
 * pointing at a file the gallery does not publish. A missing entry would be a manifest
 * bug, and `getBundledGalleryImage` returning nothing is handled by simply not
 * rendering the picture.
 *
 * It used to be the hero's visual; the hero now plays licensed stock footage instead
 * (see `docs/HERO_VIDEO.md`), and footage of an aquarium must not sit where the
 * restaurant's own room used to be without explanation. The photograph belongs with
 * the family section now, where dining in is what is being described.
 */
const DINING_ROOM_IMAGE = getBundledGalleryImage("restaurant-dining-room");

type HomeData =
  | { status: "ok"; items: MenuItemRow[]; settings: SiteSettingsRow | null }
  | { status: "error"; detail: string };

/**
 * Read phase, kept out of the component so the JSX below is never constructed
 * inside a `try`. A failure returns the error state rather than propagating a
 * Worker exception to the visitor.
 */
async function loadHome(): Promise<HomeData> {
  try {
    const db = getDb();
    const [menu, settings] = await Promise.all([getPublicMenu(db), getSiteSettings(db)]);

    const all = menu.categories.flatMap(
      (category: MenuCategoryRow & { items: MenuItemRow[] }) => category.items,
    );

    return { status: "ok", items: selectHomePreview(all, PREVIEW_LIMIT), settings };
  } catch (error) {
    console.error("Home read failed", error);
    return { status: "error", detail: "Le contenu n'a pas pu être chargé." };
  }
}

export default async function HomePage() {
  const data = await loadHome();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  const { items, settings } = data;
  const guide = listFishReferenceImages().slice(0, 4);
  const heroMedia = resolveHeroMedia(process.env);

  return (
    <div data-testid="home">
      {/*
        Hero. The subtitle is the owner's own sentence from `site_settings`; the
        fallback makes no sourcing or provenance claim, because
        `docs/CONTENT_POLICY.md` forbids inventing one and nothing in the database
        states it.

        The negative margin pulls the hero out to the edge of the content container so
        the wave runs the full width. It is exactly `main`'s own `px-4` and nothing
        more.

        Wider values here (`sm:-mx-6 lg:-mx-8`) overflowed the viewport instead,
        because `main`'s padding never grew at those breakpoints: at 768px the hero
        measured 784px wide against a 768px viewport and the page scrolled sideways.

        `relative overflow-hidden` frames the licensed aquarium footage behind the
        copy (`docs/HERO_VIDEO.md`): the video fills the section, the scrim keeps the
        headline readable over any frame, and the section clips both so nothing spills
        into the page's horizontal scroll width.
      */}
      <section className="wave-hero relative -mx-4 overflow-hidden px-4 py-14 text-on-ocean">
        <HeroVideo
          desktopSrc={heroMedia.desktopSrc}
          mobileSrc={heroMedia.mobileSrc}
          posterSrc={heroMedia.posterSrc}
        />

        <div className="relative z-10 mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
          {/*
            Text only. The right-hand column is deliberately left empty: it used to
            hold the dining-room photograph, and now the footage shows through — that
            half of the hero is the picture.
          */}
          <div>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
              {settings?.heroTitleFr ?? "Le goût de la mer, à Alger."}
            </h1>
            <p className="mt-2 text-sm font-medium text-on-ocean-soft/90">
              Depuis 2018
            </p>
            <p className="mt-4 max-w-xl text-lg text-on-ocean-soft">
              {/*
                No "revised every day" and no "fish of the day". Both promise a
                freshness the restaurant cannot guarantee and neither was confirmed,
                so the fallback points at the phone, which is what actually works.
              */}
              {settings?.heroSubtitleFr ??
                "Poissons et fruits de mer à déguster sur place. Commande, réservation et livraison par téléphone."}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/menu"
                className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-ink transition-transform hover:scale-[1.02]"
              >
                Voir la carte
              </Link>
              {settings?.phoneFr ? (
                <a
                  href={telHref(settings.phoneFr)}
                  className="rounded-full border-2 border-on-ocean px-6 py-3 text-sm font-bold transition-colors hover:bg-white/10"
                  data-testid="hero-call"
                >
                  Appeler {settings.phoneFr}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <hr className="wave-divider my-0" />

      {/*
        Neutral menu preview. No badge and no endorsement wording: the owner has not
        selected any dishes, so the section is titled as an invitation rather than a
        recommendation.
      */}
      <section className="py-12" aria-labelledby="carte-titre">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="carte-titre" className="text-2xl font-bold tracking-tight" data-testid="preview-title">
            Découvrez notre carte
          </h2>
          <Link href="/menu" className="text-sm font-semibold text-marine underline underline-offset-4">
            Toute la carte
          </Link>
        </div>

        {items.length > 0 ? (
          <ul className="mt-6 grid gap-x-8 md:grid-cols-2">
            {items.map((item) => (
              <DishCard key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <p className="mt-6 rounded-lg border border-dashed border-line-strong p-6 text-ink/75">
            La carte est en cours de mise à jour. Merci de nous appeler pour connaître
            les plats que nous proposons.
          </p>
        )}
      </section>

      {/*
        Family section. `family_note_fr` is the owner's own sentence about the high
        chair, printed as written.

        The dining-room photograph lives here since the hero gave up its spot to the
        video: this is the section about visiting in person, which is what a picture
        of the room is evidence of.

        Alt text names the room and says it is a photograph, because the failure mode
        here is a visitor reading a restaurant interior as a picture of what the fish
        looks like. `contain` keeps the whole frame on the warm colour so the picture
        is never cropped to a shape it was not taken in.
      */}
      {settings?.familyNoteFr ? (
        <section
          className="rounded-2xl bg-marine px-6 py-8 text-on-ocean sm:px-8"
          aria-labelledby="famille-titre"
        >
          <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
            <div>
              <h2 id="famille-titre" className="text-xl font-bold">
                En famille
              </h2>
              <p className="mt-2 max-w-prose text-on-ocean-soft">{settings.familyNoteFr}</p>
            </div>
            {DINING_ROOM_IMAGE ? (
              <figure className="overflow-hidden rounded-xl border border-on-ocean/25 bg-warm">
                <SafeImage
                  src={bundledGalleryUrl(DINING_ROOM_IMAGE.webpFile)}
                  alt="Photographie de la salle du restaurant Resta Pescado."
                  width={DINING_ROOM_IMAGE.width}
                  height={DINING_ROOM_IMAGE.height}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-contain"
                  fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
                />
              </figure>
            ) : null}
          </div>
        </section>
      ) : null}

      {/*
        Fish guide preview. These are AI-generated species illustrations, so the
        mandatory label travels with them.
      */}
      <section className="py-12" aria-labelledby="poissons-titre">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="poissons-titre" className="text-2xl font-bold tracking-tight">
            Nos poissons
          </h2>
          <Link
            href="/a-propos#guide-poissons"
            className="text-sm font-semibold text-marine underline underline-offset-4"
          >
            Tout voir
          </Link>
        </div>

        <p className="mt-4 max-w-prose rounded-xl border border-line bg-warm/60 px-4 py-3 text-sm leading-snug text-ink/75" data-testid="fish-reference-explanation">
          {FISH_REFERENCE_EXPLANATION}
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {guide.map((fish) => (
            <li key={fish.slug} className="overflow-hidden rounded-xl border border-line bg-white/60">
              {/*
                `contain` on the warm colour, matching the menu: these are whole-fish
                illustrations, and cropping one to a square would cut the head or tail
                off the very shape the picture exists to show.
              */}
              <SafeImage
                src={fish.src}
                alt={fish.altFr}
                width={fish.width}
                height={fish.height}
                loading="lazy"
                className="aspect-[4/3] w-full bg-warm object-contain"
                fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
              />
              <div className="px-3 py-2">
                <p className="text-sm font-semibold">{fish.nameFr}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/*
        Practical facts, all owner-confirmed. The address is omitted entirely because it
        has never been confirmed; the map link needs no address.
      */}
      <section className="grid gap-4 pb-12 sm:grid-cols-2" aria-labelledby="infos-titre">
        <h2 id="infos-titre" className="sr-only">
          Informations pratiques
        </h2>

        <div className="rounded-2xl border border-line bg-white/60 p-6">
          <h3 className="text-lg font-bold">Horaires</h3>
          {settings?.hoursFr ? (
            <p className="mt-2 text-ink/75" data-testid="home-hours">
              {settings.hoursFr}
            </p>
          ) : (
            <p className="mt-2 text-ink/75">Horaires à confirmer.</p>
          )}
        </div>

        {settings?.deliveryEnabled ? (
          <div className="rounded-2xl border border-line bg-white/60 p-6">
            <h3 className="text-lg font-bold">Livraison</h3>
            {/*
              The confirmed delivery facts, in the order a customer needs them: how to
              order, that we confirm the address, that there is no minimum, and that the
              fee is quoted on the call. The full detail lives on `/contact`.
            */}
            {settings.pickupTextFr ? (
              <p className="mt-2 text-ink/75" data-testid="home-delivery">
                {settings.pickupTextFr}
              </p>
            ) : null}
            {settings.deliveryFeeTextFr ? (
              <p className="mt-2 text-sm text-ink/70">{settings.deliveryFeeTextFr}</p>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl bg-ocean p-6 text-on-ocean sm:col-span-2">
          <h3 className="text-lg font-bold">Nous appeler</h3>
          {settings?.phoneFr ? (
            <a
              href={telHref(settings.phoneFr)}
              className="mt-2 block text-2xl font-bold underline underline-offset-4"
              data-testid="home-phone"
            >
              {settings.phoneFr}
            </a>
          ) : (
            <p className="mt-2">Numéro à confirmer.</p>
          )}
          {settings?.mapsUrl ? (
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-3 inline-block rounded-full border border-on-ocean/60 px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Voir sur la carte
            </a>
          ) : null}
        </div>
      </section>

      {/*
        Kept referenced so a typo in the manifest surfaces as a test failure rather
        than an illustration quietly disappearing from the guide.
      */}
      <p className="sr-only">{Object.keys(FISH_REFERENCE_IMAGES).length} illustrations de référence.</p>
    </div>
  );
}
