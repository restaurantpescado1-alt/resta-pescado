import Link from "next/link";

import { telHref, type PublicSettings } from "@/lib/public-site";

/**
 * Mobile sticky action bar.
 *
 * The three things a visitor on a phone actually needs: call, see the menu, get
 * directions. It sits above the bottom edge on small screens only and is hidden from
 * the desktop layout, where the header and footer already carry the same actions.
 *
 * `env(safe-area-inset-bottom)` keeps it clear of the iOS home indicator.
 *
 * The bar always renders, even without a confirmed phone number: the map and menu
 * actions are still useful, and a bar that appears and disappears as settings load
 * would shift the page under the visitor's thumb.
 */
export function MobileActions({ settings }: { settings: PublicSettings }) {
  const phone = settings.phoneFr;

  return (
    <nav
      aria-label="Actions rapides"
      data-testid="mobile-actions"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-warm/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        <li>
          {phone ? (
            <a
              href={telHref(phone)}
              className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-marine"
              data-testid="mobile-call"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ☎
              </span>
              Appeler
            </a>
          ) : (
            <span
              className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-ink/40"
              aria-disabled="true"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ☎
              </span>
              Appeler
            </span>
          )}
        </li>

        <li className="border-x border-line">
          <Link
            href="/menu"
            className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-marine"
            data-testid="mobile-menu"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ≡
            </span>
            Menu
          </Link>
        </li>

        <li>
          {settings.mapsUrl ? (
            <a
              href={settings.mapsUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-marine"
              data-testid="mobile-map"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ⌖
              </span>
              Itinéraire
            </a>
          ) : (
            <span
              className="flex flex-col items-center gap-0.5 py-2.5 text-xs font-semibold text-ink/40"
              aria-disabled="true"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ⌖
              </span>
              Itinéraire
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
