import Link from "next/link";

import { DishCard } from "@/components/dish";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicMenu, getSiteSettings } from "@/db/repositories/menu";
import type { MenuCategoryRow, MenuItemRow, SiteSettingsRow } from "@/db/schema";

export const dynamic = "force-dynamic";

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

    const all = menu.categories.flatMap((category: MenuCategoryRow & { items: MenuItemRow[] }) => category.items);
    const featured = all.filter((item) => item.isFeatured);
    const shown = featured.length > 0 ? featured.slice(0, 3) : all.slice(0, 3);

    return { status: "ok", items: shown, settings };
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

  return (
    <div data-testid="home">
      <section className="rounded border border-line bg-white/60 p-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          {settings?.heroTitleFr ?? "Poissons et fruits de mer, préparés à Alger."}
        </h1>
        {/* No sourcing claim in the fallback: docs/CONTENT_POLICY.md forbids
            inventing provenance, and nothing in the database states it. */}
        <p className="mt-3 max-w-prose text-ink-soft">
          {settings?.heroSubtitleFr ?? "Une carte courte, mise à jour par le propriétaire."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/menu"
            className="rounded bg-sea px-5 py-2.5 text-sm font-semibold text-sand transition-colors hover:bg-sea-deep"
          >
            Voir la carte
          </Link>
          {settings?.phoneFr ? (
            <a
              href={`tel:${settings.phoneFr.replace(/\s+/g, "")}`}
              className="rounded border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-sand"
            >
              Appeler
            </a>
          ) : null}
        </div>
      </section>

      {items.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">En ce moment</h2>
          <ul className="mt-2">
            {items.map((item) => (
              <DishCard key={item.id} item={item} />
            ))}
          </ul>
          <p className="mt-4 text-sm">
            <Link href="/menu" className="underline underline-offset-4">
              Toute la carte
            </Link>
          </p>
        </section>
      ) : null}
    </div>
  );
}
