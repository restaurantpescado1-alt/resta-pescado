import type { Metadata } from "next";

import { MobileActions } from "@/components/mobile-actions";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadPublicSettings, type PublicSettings } from "@/lib/public-site";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Resta Pescado — Poissons et fruits de mer",
    template: "%s — Resta Pescado",
  },
  description: "Poissons et fruits de mer, préparés à Alger.",
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

        <SiteHeader settings={settings} />

        {/*
          Padding at the bottom clears the mobile action bar, which is fixed. Without
          this the last line of every page sits underneath it.
        */}
        <main
          id="contenu"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24 md:pb-8"
        >
          {children}
        </main>

        <SiteFooter settings={settings} />
        <MobileActions settings={settings} />
      </body>
    </html>
  );
}
