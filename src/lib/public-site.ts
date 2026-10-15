import { getDb } from "@/db";
import { getSiteSettings } from "@/db/repositories/menu";
import type { MenuItemRow, SiteSettingsRow } from "@/db/schema";
import { GOOGLE_REVIEW_DESTINATION } from "@/lib/google-reviews";

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
  /**
   * The Google destination, confirmed by the owner.
   *
   * Never null: the owner supplied one share link, so it is the site-wide default and
   * a dashboard value (if the owner later saves a different one) overrides it. Keeping
   * the default here means the header-less components all resolve the same URL instead
   * of each carrying its own copy.
   */
  googleReviewUrl: string;
  /** Confirmed public links. Null means the UI renders nothing rather than a guess. */
  facebookUrl: string | null;
  instagramUrl: string | null;
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
    googleReviewUrl: row?.googleReviewUrl ?? GOOGLE_REVIEW_DESTINATION,
    facebookUrl: row?.facebookUrl ?? null,
    instagramUrl: row?.instagramUrl ?? null,
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
 * The dishes shown in the neutral home page preview, in the order they should appear.
 *
 * These four were chosen for the teaser because each is a different kind of fish or
 * seafood (sardines, dorade, thon, crevettes) and each carries a species illustration, so
 * the preview reads as a range rather than as one fish four times. The list holds ids
 * only: names, prices and images are always read from the database row, never copied
 * here, so a price change in the dashboard is reflected without touching this file.
 *
 * If one of these is hidden or missing, the slot is filled deterministically (see below)
 * rather than left as a dead card.
 */
export const HOME_PREVIEW_ITEM_IDS = [
  "item-sardines-friture",
  "item-dorade",
  "item-thon-grille",
  "item-crevettes-en-sauce",
] as const;

/**
 * The dishes shown in the neutral home page preview.
 *
 * Order is the menu's manual sort order, which `getPublicMenu` already applies, so
 * this preserves the owner's ordering rather than reshuffling it.
 *
 * Selection, in priority order:
 *
 * 1. **The owner's featured dishes, if any.** Featuring is a decision they made, so it
 *    wins outright. No card is badged either way, so the section never implies an
 *    endorsement.
 * 2. **The curated `HOME_PREVIEW_ITEM_IDS`, in that order.**
 * 3. **Any remaining illustrated dish, in manual sort order**, to fill a slot whose
 *    curated dish is hidden or unavailable. A dish is skipped if its species is already
 *    on screen, so the fallback cannot turn the teaser into the same fish several times.
 *
 * Only dishes with an image are eligible for the fallback: the approved menu opens with
 * salads and soups that have neither a photo nor a species, and those render as an empty
 * tile, so the preview would otherwise open on blank cards. This returns fewer than
 * `limit` rather than padding with dishes that would render blank.
 */
export function selectHomePreview(items: MenuItemRow[], limit: number): MenuItemRow[] {
  if (items.length === 0 || limit <= 0) {
    return [];
  }

  const featured = items.filter((item) => item.isFeatured);
  if (featured.length > 0) {
    return featured.slice(0, limit);
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const chosen: MenuItemRow[] = [];
  const chosenIds = new Set<string>();
  const species = new Set<string>();

  const accept = (item: MenuItemRow): void => {
    if (chosen.length >= limit) {
      return;
    }
    if (chosenIds.has(item.id)) {
      return;
    }
    if (item.fishReferenceSlug !== null && species.has(item.fishReferenceSlug)) {
      return;
    }
    chosen.push(item);
    chosenIds.add(item.id);
    if (item.fishReferenceSlug !== null) {
      species.add(item.fishReferenceSlug);
    }
  };

  for (const id of HOME_PREVIEW_ITEM_IDS) {
    const item = byId.get(id);
    if (item) {
      accept(item);
    }
    if (chosen.length >= limit) {
      return chosen;
    }
  }

  for (const item of items) {
    if (chosen.length >= limit) {
      break;
    }
    if (item.fishReferenceSlug !== null) {
      accept(item);
    }
  }

  return chosen;
}
