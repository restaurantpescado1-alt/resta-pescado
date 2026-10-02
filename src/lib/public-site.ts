import { getDb } from "@/db";
import { getSiteSettings } from "@/db/repositories/menu";
import type { MenuItemRow, SiteSettingsRow } from "@/db/schema";

/**
 * Shared reads for the public pages.
 *
 * Every public page needs the same handful of confirmed facts, and every public page
 * must survive D1 being unavailable. Centralising that here means the header, the
 * footer, and the mobile action bar cannot each implement a different idea of what to
 * do when the read fails, and no page is tempted to build a `try` around its own JSX.
 */

/**
 * Confirmed facts, with fallbacks.
 *
 * A missing field is not an error: the address was never confirmed, so `addressFr` is
 * expected to be null and the site simply does not print one. A failed read is
 * different, and is reported through `ok: false`.
 */
export interface PublicSettings {
  phoneFr: string | null;
  /** Never invented. Null means the owner has not confirmed an address. */
  addressFr: string | null;
  mapsUrl: string | null;
  hoursFr: string | null;
  familyNoteFr: string | null;
  heroTitleFr: string | null;
  heroSubtitleFr: string | null;
  deliveryEnabled: boolean;
  deliveryZonesTextFr: string | null;
  deliveryFeeTextFr: string | null;
  deliveryMinimumOrderTextFr: string | null;
  deliveryHoursFr: string | null;
  pickupTextFr: string | null;
}

export type PublicSettingsResult =
  | { ok: true; settings: PublicSettings }
  | { ok: false };

function toPublicSettings(row: SiteSettingsRow | null): PublicSettings {
  return {
    phoneFr: row?.phoneFr ?? null,
    addressFr: row?.addressFr ?? null,
    mapsUrl: row?.mapsUrl ?? null,
    hoursFr: row?.hoursFr ?? null,
    familyNoteFr: row?.familyNoteFr ?? null,
    heroTitleFr: row?.heroTitleFr ?? null,
    heroSubtitleFr: row?.heroSubtitleFr ?? null,
    deliveryEnabled: row?.deliveryEnabled ?? false,
    deliveryZonesTextFr: row?.deliveryZonesTextFr ?? null,
    deliveryFeeTextFr: row?.deliveryFeeTextFr ?? null,
    deliveryMinimumOrderTextFr: row?.deliveryMinimumOrderTextFr ?? null,
    deliveryHoursFr: row?.deliveryHoursFr ?? null,
    pickupTextFr: row?.pickupTextFr ?? null,
  };
}

/**
 * Reads the settings row for the header, footer, and sticky bar.
 *
 * Never throws. Those three render on every page including the error pages, so
 * letting a D1 failure escape here would replace a useful message with a Worker
 * exception. The cost of a failure is that the phone number and map link are hidden
 * rather than shown.
 */
export async function loadPublicSettings(): Promise<PublicSettingsResult> {
  try {
    return { ok: true, settings: toPublicSettings(await getSiteSettings(getDb())) };
  } catch (error) {
    console.error("Site settings read failed", error);
    return { ok: false };
  }
}

/** Dials the confirmed number. Strips spacing so `tel:` gets a valid value. */
export function telHref(phoneFr: string): string {
  return `tel:${phoneFr.replace(/[\s.\-()]/g, "")}`;
}

/**
 * The dishes shown in the neutral home page preview.
 *
 * Order is the menu's manual sort order, which `getPublicMenu` already applies, so
 * this preserves the owner's ordering rather than reshuffling it.
 *
 * The fallback has to filter to dishes that have a species illustration. Taking the
 * first six dishes outright would fill the home page with salads and soups, and those
 * render as an empty tile because they have no photo and no fish reference, so the
 * preview would open on six blank cards.
 *
 * Featured dishes are preferred when the owner has selected any, because that is a
 * decision they made. No card is badged either way, so the section never implies an
 * endorsement, and this returns fewer than `limit` rather than padding with dishes that
 * would render blank.
 */
export function selectHomePreview(items: MenuItemRow[], limit: number): MenuItemRow[] {
  if (items.length === 0 || limit <= 0) {
    return [];
  }

  const featured = items.filter((item) => item.isFeatured);
  if (featured.length > 0) {
    return featured.slice(0, limit);
  }

  return items.filter((item) => item.fishReferenceSlug !== null).slice(0, limit);
}
