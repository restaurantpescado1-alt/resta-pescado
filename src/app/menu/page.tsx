import Link from "next/link";

import { DishCard } from "@/components/dish";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicMenu, getSiteSettings } from "@/db/repositories/menu";
import type { MenuCategoryRow, MenuItemRow, SiteSettingsRow } from "@/db/schema";

export const dynamic = "force-dynamic";

type MenuData =
  | { status: "ok"; categories: Array<MenuCategoryRow & { items: MenuItemRow[] }>; settings: SiteSettingsRow | null }
  | { status: "error"; detail: string };

/**
 * Read phase, kept out of the component so the JSX below is never constructed
 * inside a `try`. Returning a result object rather than throwing keeps the
 * failure path explicit, which is what the public error state needs.
 */
async function loadMenu(): Promise<MenuData> {
  try {
    const db = getDb();
    const [menu, settings] = await Promise.all([getPublicMenu(db), getSiteSettings(db)]);
    return { status: "ok", categories: menu.categories, settings };
  } catch (error) {
    console.error("Menu read failed", error);
    return { status: "error", detail: "La lecture de la carte a échoué." };
  }
}

export default async function MenuPage() {
  const data = await loadMenu();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  if (data.categories.length === 0) {
    return (
      <section className="rounded border border-line bg-white/60 p-8 text-center" data-testid="menu-empty">
        <h1 className="text-xl font-semibold">La carte arrive bientôt</h1>
        <p className="mt-2 text-ink-soft">Aucun plat n&apos;est encore disponible.</p>
      </section>
    );
  }

  return (
    <div data-testid="menu">
      <h1 className="text-2xl font-semibold tracking-tight">La carte</h1>
      {data.settings?.hoursFr ? <p className="mt-1 text-sm text-ink-soft">{data.settings.hoursFr}</p> : null}

      <div className="mt-6 space-y-8">
        {data.categories.map((category) => (
          <section key={category.id} data-testid="menu-category" data-slug={category.slug}>
            <h2 className="border-b-2 border-sea pb-2 text-lg font-semibold">{category.nameFr}</h2>
            {category.items.length === 0 ? (
              <p className="py-4 text-sm text-ink-soft">Aucun plat dans cette catégorie pour le moment.</p>
            ) : (
              <ul>
                {category.items.map((item) => (
                  <DishCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="mt-8 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
