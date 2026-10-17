import Link from "next/link";

import { CategoryIcon } from "@/components/category-icon";
import { DishCard } from "@/components/dish";
import { GoogleReviews } from "@/components/google-reviews";
import { HeroVideo } from "@/components/hero-video";
import { ChildChairIcon, PhoneIcon } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { SafeImage } from "@/components/safe-image";
import { ServiceUnavailable } from "@/components/service-unavailable";

import { getDb } from "@/db";
import { getPublicMenu, getSiteSettings } from "@/db/repositories/menu";
import type { MenuCategoryRow, MenuItemRow, SiteSettingsRow } from "@/db/schema";
import { getCategoryCover } from "@/lib/category-images";
import { MENU_PHOTO_EXPLANATION_FR } from "@/lib/dish-images";
import {
  FISH_REFERENCE_IMAGES,
  FISH_REFERENCE_EXPLANATION,
  listFishReferenceImages,
} from "@/lib/fish-images";
import { bundledGalleryUrl, getBundledGalleryImage } from "@/lib/gallery-images";
import { GOOGLE_REVIEW_DESTINATION } from "@/lib/google-reviews";
import { resolveHeroMedia } from "@/lib/hero-media";
import { selectHomePreview, telHref } from "@/lib/public-site";
import { SITE_ORIGIN } from "@/lib/site-origin";
import { restaurantJsonLd } from "@/lib/structured-data";

export const dynamic = "force-dynamic";

/**
 * The desktop family section's reservation action dials the confirmed number in
 * international form, matching the header's call action.
 */
const CALL_HREF = "tel:+213540559967";

/**
 * How many dishes the neutral preview shows. A teaser, not the menu: the whole card is
 * 37 dishes long and the section exists to invite a click through to `/menu`. Four is two
 * balanced rows on desktop and a short look on a phone.
 */
const PREVIEW_LIMIT = 4;

/**
 * Category tiles for "Nos catégories".
 *
 * A photograph is used only where the bundled set actually shows that category. Two
 * sources supply the pictures: the curated gallery photographs for the categories they
 * cover (`CATEGORY_IMAGE_SLUGS` below), and the owner-supplied category covers in
 * `src/lib/category-images.ts` for the rest. Any category with neither falls back to a
 * line-art icon drawn for that category (see `CategoryIcon`) rather than borrowing a
 * picture of something else — a plate of fish labelled "Desserts" would be a lie the
 * visitor can see, and one shared fish icon made every fallback tile look identical.
 */
const CATEGORY_IMAGE_SLUGS: Record<string, string> = {
  entrees: "starters-and-salads",
  poissons: "fresh-seafood-counter",
};

/**
 * The dining-room photograph, read from the gallery manifest rather than hardcoded so the
 * page cannot point at a file the gallery does not publish.
 */
const DINING_ROOM_IMAGE = getBundledGalleryImage("restaurant-dining-room");

/** The photographs shown in the home page gallery preview, curated order. */
const GALLERY_PREVIEW_SLUGS = [
  "full-seafood-display",
  "fresh-seafood-counter",
  "starters-and-salads",
  "restaurant-dining-room",
] as const;

type HomeCategory = Pick<MenuCategoryRow, "id" | "slug" | "nameFr">;

type HomeData =
  | { status: "ok"; items: MenuItemRow[]; categories: HomeCategory[]; settings: SiteSettingsRow | null }
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
    const categories = menu.categories.map((category: MenuCategoryRow) => ({
      id: category.id,
      slug: category.slug,
      nameFr: category.nameFr,
    }));

    return { status: "ok", items: selectHomePreview(all, PREVIEW_LIMIT), categories, settings };
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

  const { items, categories, settings } = data;
  const guide = listFishReferenceImages().slice(0, 4);
  const heroMedia = resolveHeroMedia(process.env);
  const galleryPreview = GALLERY_PREVIEW_SLUGS.map((slug) => getBundledGalleryImage(slug)).filter(
    (image): image is NonNullable<typeof image> => Boolean(image),
  );

  return (
    <div data-testid="home">
      {/*
        Structured data from confirmed facts only. See `src/lib/structured-data.ts` for what
        is deliberately absent and why.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: restaurantJsonLd(
            { phoneFr: settings?.phoneFr ?? null, mapsUrl: settings?.mapsUrl ?? null },
            SITE_ORIGIN,
          ),
        }}
      />

      {/*
        Hero. The footage is the picture; the copy sits on a localised scrim at the bottom
        so the fish stay visible. The negative margin pulls the hero out to the edge of the
        content container; it is exactly `main`'s own `px-4` and nothing more.
      */}
      <section className="wave-hero relative -mx-4 flex min-h-[clamp(480px,68svh,640px)] flex-col justify-end overflow-hidden px-4 pb-8 pt-10 text-on-ocean sm:pb-10">
        <HeroVideo
          desktopSrc={heroMedia.desktopSrc}
          mobileSrc={heroMedia.mobileSrc}
          posterSrc={heroMedia.posterSrc}
        />

        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              {settings?.heroTitleFr ?? "Le goût de la mer, à Alger."}
            </h1>
            <p className="mt-2 text-sm font-medium text-on-ocean-soft">Depuis 2018</p>

            <div className="mt-5 flex flex-wrap gap-3 sm:mt-6">
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
                  Appeler
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/*
        The description, moved out of the hero overlay so it sits on the page's own
        background and stays readable over any frame of the footage.
      */}
      <section className="mx-auto max-w-3xl px-1 pt-8 text-center" data-testid="hero-intro">
        <p className="text-ink/80">
          {settings?.heroSubtitleFr ?? "Restaurant de poissons et fruits de mer, à Alger."}
        </p>
      </section>

      {/*
        Category browsing. Tiles link to the real anchors on `/menu`, one per category, with
        a photograph where the bundled set shows that category and a category-specific
        line-art tile where it does not. On a phone the row scrolls horizontally; on desktop
        it is a grid.

        Every section below uses the same `mt-10 md:mt-16` instead of its own vertical
        padding, so the gaps between them are the intended 40px on a phone and 64px on
        desktop rather than two paddings meeting and doubling.
      */}
      <section className="mt-10 md:mt-16" aria-labelledby="explorer-titre">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="explorer-titre" className="text-2xl font-bold tracking-tight">
              Nos catégories
            </h2>
            <Link href="/menu" className="text-sm font-semibold text-marine underline underline-offset-4">
              Voir toute la carte
            </Link>
          </div>

          <ul className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
            {categories.map((category) => {
              const gallerySlug = CATEGORY_IMAGE_SLUGS[category.slug];
              const galleryImage = gallerySlug ? getBundledGalleryImage(gallerySlug) : undefined;
              const cover = galleryImage ? undefined : getCategoryCover(category.slug);
              const image = galleryImage
                ? {
                    src: bundledGalleryUrl(galleryImage.webpFile),
                    altFr: galleryImage.altFr,
                    width: galleryImage.width,
                    height: galleryImage.height,
                  }
                : cover
                  ? {
                      src: cover.src,
                      altFr: cover.altFr,
                      width: cover.width,
                      height: cover.height,
                    }
                  : undefined;
              return (
                <li key={category.id} className="w-60 shrink-0 snap-start md:w-auto">
                  <Link
                    href={`/menu#${category.slug}`}
                    className="group block overflow-hidden rounded-2xl border border-line bg-white/70 transition-shadow hover:shadow-md"
                  >
                    {image ? (
                      <SafeImage
                        src={image.src}
                        alt={image.altFr}
                        width={image.width}
                        height={image.height}
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
                      />
                    ) : (
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-ocean text-on-ocean">
                        <CategoryIcon slug={category.slug} className="h-16 w-16" />
                      </div>
                    )}
                    <p className="px-3 py-2 text-sm font-semibold">{category.nameFr}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </section>

      {/*
        Neutral menu preview. No badge and no endorsement wording: the owner has not
        selected any dishes, so the section is titled as an invitation rather than a
        recommendation.
      */}
      <section className="mt-10 md:mt-16" aria-labelledby="carte-titre">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="carte-titre" className="text-2xl font-bold tracking-tight" data-testid="preview-title">
            À découvrir à la carte
          </h2>
          <Link href="/menu" className="text-sm font-semibold text-marine underline underline-offset-4">
            Voir toute la carte
          </Link>
        </div>

        {/*
          Stated once for the section rather than under each dish. These pictures are
          generated, so a visitor has to be told before they read them as plates the
          restaurant served. The fish guide further down keeps its own sentence: those
          are species illustrations, a different claim again.
        */}
        {items.length > 0 ? (
          <p
            className="mt-3 max-w-prose text-[13px] leading-snug text-ink/70"
            data-testid="dish-photo-explanation"
          >
            {MENU_PHOTO_EXPLANATION_FR}
          </p>
        ) : null}

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
        Trust / review section, moved up so the owner's Google snapshot follows the menu
        teaser. It renders the owner's fixed snapshot (rating, count, two chosen excerpts)
        and links to the owner's fiche. See `src/lib/google-reviews.ts` for why the button
        says "Voir notre fiche Google" rather than promising a review form.
      */}
      <GoogleReviews href={settings?.googleReviewUrl ?? GOOGLE_REVIEW_DESTINATION} />

      {/*
        Gallery preview. A short look at the room and the counter, with the full set one
        click away. Bundled photographs only, so nothing here depends on the media provider.
      */}
      {galleryPreview.length > 0 ? (
        <section className="mt-10 md:mt-16" aria-labelledby="galerie-apercu-titre">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 id="galerie-apercu-titre" className="text-2xl font-bold tracking-tight">
                En images
              </h2>
              <Link
                href="/galerie"
                className="text-sm font-semibold text-marine underline underline-offset-4"
              >
                Toute la galerie
              </Link>
            </div>

            <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {galleryPreview.map((image) => (
                <li key={image.slug} className="overflow-hidden rounded-xl border border-line">
                  <Link href="/galerie" className="block" aria-label={image.altFr}>
                    <SafeImage
                      src={bundledGalleryUrl(image.webpFile)}
                      alt={image.altFr}
                      width={image.width}
                      height={image.height}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-300 hover:scale-105"
                      fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>
      ) : null}

      {/*
        Fish guide preview. These are AI-generated species illustrations, so the
        mandatory label travels with them.
      */}
      <section className="mt-10 md:mt-16" aria-labelledby="poissons-titre">
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

        <p
          className="mt-3 max-w-prose text-[13px] leading-snug text-ink/70"
          data-testid="fish-reference-explanation"
        >
          {FISH_REFERENCE_EXPLANATION}
        </p>

        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {guide.map((fish) => (
            <li key={fish.slug} className="overflow-hidden rounded-xl border border-line bg-white/60">
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
        Family section, moved down so it closes the narrative after the fish guide. It
        carries the owner's own sentence about the high chair and the dining-room
        photograph, because this is the section about visiting in person.

        Below `lg` the presentation is unchanged: the same navy card with the same
        two-column stack. Only its position on the page has moved. From `lg` up it becomes
        an editorial two-column band — photograph left, text right — on the warm page
        background, with the confirmed high-chair fact called out and a phone reservation
        action.
      */}
      {settings?.familyNoteFr ? (
        <section
          className="mt-10 rounded-2xl bg-marine px-6 py-8 text-on-ocean sm:px-8 md:mt-16 lg:border lg:border-line lg:bg-warm lg:px-10 lg:py-12 lg:text-ink"
          aria-labelledby="famille-titre"
          data-testid="family"
        >
          <Reveal>
            {/*
              One reflowing grid rather than two copies of the section: the photograph is
              second on phones and tablets and first on desktop, and the owner's sentence
              is rendered once so it is only restyled at `lg`, never duplicated in the DOM.
            */}
            <div className="grid gap-6 sm:grid-cols-2 sm:items-center lg:grid-cols-[3fr_2fr] lg:gap-10">
              {DINING_ROOM_IMAGE ? (
                <figure className="order-2 overflow-hidden rounded-xl border border-on-ocean/25 bg-warm lg:order-1 lg:rounded-2xl lg:border-line">
                  <SafeImage
                    src={bundledGalleryUrl(DINING_ROOM_IMAGE.webpFile)}
                    alt="Photographie de la salle du restaurant Resta Pescado."
                    width={DINING_ROOM_IMAGE.width}
                    height={DINING_ROOM_IMAGE.height}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-contain lg:object-cover"
                    fallbackClassName="aspect-[4/3] w-full rounded-none border-0"
                  />
                </figure>
              ) : null}

              <div className="order-1 lg:order-2">
                <p className="hidden text-sm font-semibold uppercase tracking-[0.2em] text-marine lg:block">
                  En famille
                </p>
                <h2 id="famille-titre" className="text-xl font-bold lg:hidden">
                  En famille
                </h2>
                <h2 className="mt-2 hidden text-3xl font-bold tracking-tight lg:block">
                  Un moment à partager en famille
                </h2>
                <p className="mt-2 max-w-prose text-on-ocean-soft lg:mt-4 lg:text-ink/75">
                  {settings.familyNoteFr}
                </p>
                <p className="mt-4 hidden items-center gap-2 rounded-full border border-marine/25 bg-white px-3 py-1.5 text-sm font-semibold text-marine lg:inline-flex">
                  <ChildChairIcon />
                  Chaise haute à disposition
                </p>
                <div className="mt-6 hidden lg:block">
                  <a
                    href={CALL_HREF}
                    data-testid="family-call"
                    className="inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-6 text-sm font-bold text-ink transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                  >
                    <PhoneIcon />
                    Réserver par téléphone
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      ) : null}

      {/*
        Practical facts, all owner-confirmed. The address is omitted entirely because it
        has never been confirmed; the map link needs no address.
      */}
      <section className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-16" aria-labelledby="infos-titre">
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
