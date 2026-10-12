import type { Metadata } from "next";

import { InfoStrips } from "@/components/info-strips";
import { MobileActions } from "@/components/mobile-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveDeploymentMode } from "@/lib/auth-ip";
import { loadPublicSettings, type PublicSettings } from "@/lib/public-site";
import { robotsMetadata } from "@/lib/search-indexing";
import { SITE_ORIGIN } from "@/lib/site-origin";

import "./globals.css";

const SITE_DESCRIPTION =
  "Poissons et fruits de mer, préparés à Alger depuis 2018. Carte, horaires et commande par téléphone.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Resta Pescado — Poissons et fruits de mer à Alger",
    template: "%s — Resta Pescado",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Resta Pescado",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "fr_DZ",
    siteName: "Resta Pescado",
    title: "Resta Pescado — Poissons et fruits de mer à Alger",
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/media/hero-aquarium-poster.webp",
        width: 1920,
        height: 1080,
        alt: "Poissons dans un aquarium chez Resta Pescado.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resta Pescado — Poissons et fruits de mer à Alger",
    description: SITE_DESCRIPTION,
    images: ["/media/hero-aquarium-poster.webp"],
  },
  // Relative to `metadataBase` and the current path, so every page canonicals to itself.
  alternates: { canonical: "./" },
  // Read from the environment when this module loads in the Worker, so the same build
  // ships `index, follow` to production and `noindex, nofollow` to the preview host
  // without a second build. Every page renders under this layout.
  robots: robotsMetadata(resolveDeploymentMode()),
};

/**
 * The layout reads `site_settings` for the header, the footer, and the mobile action
 * bar, so it has to be rendered per request.
 *
 * Without this the root layout is treated as static, `getCloudflareContext()` is called
 * in sync mode, and the read throws. That failure is silent from the visitor's point of
 * view: the page still renders, just with the fallback settings and no map link.
 */
export const dynamic = "force-dynamic";

/**
 * Used only when D1 is unreachable, so the header and footer can still show the two
 * facts that appear on every page. Both are owner-confirmed, so they never contradict
 * the database.
 *
 * Everything else is null. That is deliberate: a fallback is for a fact that cannot
 * change without a code deploy, not a place to park values nobody has confirmed. The
 * address in particular stays null here, because it has never been confirmed.
 */
const FALLBACK_SETTINGS: PublicSettings = {
  phoneFr: "0540559967",
  hoursFr: "Ouvert tous les jours ouvrables de 11h15 à 15h15. Fermé le vendredi.",
  addressFr: null,
  mapsUrl: null,
  familyNoteFr: null,
  heroTitleFr: null,
  heroSubtitleFr: null,
  deliveryEnabled: false,
  deliveryZonesTextFr: null,
  deliveryFeeTextFr: null,
  deliveryMinimumOrderTextFr: null,
  deliveryHoursFr: null,
  pickupTextFr: null,
  googleReviewUrl: null,
  facebookUrl: null,
  instagramUrl: null,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const result = await loadPublicSettings();
  const settings = result.ok ? result.settings : FALLBACK_SETTINGS;

  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col">
        {/*
          First focusable element on the page, so a keyboard user can jump past the
          navigation. Hidden until focused.
        */}
        <a href="#contenu" className="skip-link">
          Aller au contenu
        </a>

        <InfoStrips />
        <SiteHeader settings={settings} />

        {/*
          Padding at the bottom clears the mobile action bar, which is fixed. Without
          this the last line of every page sits underneath it.

          There is deliberately no top padding here. It used to add 32px above every
          page, which showed as a warm band between the header and the homepage hero —
          the one section that is meant to start flush against the bar. Each non-home
          page adds its own `pt-8` instead, so its title keeps its breathing room without
          pushing the hero down.
        */}
        <main
          id="contenu"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 md:pb-8"
        >
          {children}
        </main>

        <SiteFooter settings={settings} />
        <MobileActions settings={settings} />
      </body>
    </html>
  );
}
