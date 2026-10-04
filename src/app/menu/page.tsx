import Link from "next/link";

import { DishCard } from "@/components/dish";
import { ServiceUnavailable } from "@/components/service-unavailable";
import { getDb } from "@/db";
import { getPublicMenu, getSiteSettings } from "@/db/repositories/menu";
import type { MenuCategoryRow, MenuItemRow, SiteSettingsRow } from "@/db/schema";
import { FISH_REFERENCE_EXPLANATION } from "@/lib/fish-images";
import { telHref } from "@/lib/public-site";

export const dynamic = "force-dynamic";

type MenuData =
  | {
      status: "ok";
      categories: Array<MenuCategoryRow & { items: MenuItemRow[] }>;
      settings: SiteSettingsRow | null;
    }
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

export const metadata = {
  title: "La carte",
  description: "Les plats du restaurant et leurs prix en dinars algériens.",
};

export default async function MenuPage() {
  const data = await loadMenu();

  if (data.status === "error") {
    return <ServiceUnavailable detail={data.detail} />;
  }

  if (data.categories.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-line-strong p-10 text-center" data-testid="menu-empty">
        <h1 className="text-xl font-bold">La carte arrive bientôt</h1>
        <p className="mt-2 max-w-prose text-ink/75">
          Aucun plat n&apos;est encore disponible.
        </p>
        <p className="mt-4 text-sm text-ink/75">
          Merci de nous appeler pour connaître les plats que nous proposons.
        </p>
      </section>
    );
  }

  const total = data.categories.reduce((sum, category) => sum + category.items.length, 0);

  return (
    <div data-testid="menu">
      <header className="pb-2">
        <h1 className="text-3xl font-bold tracking-tight">La carte</h1>
        <p className="mt-2 max-w-prose text-ink/75">
          {total} plats, avec les prix en dinars algériens. Pour commander, appelez-nous.
        </p>
        {data.settings?.hoursFr ? (
          <p className="mt-1 text-sm text-ink/70">{data.settings.hoursFr}</p>
        ) : null}
      </header>

      <nav aria-label="Catégories" className="mt-6 flex flex-wrap gap-2">
        {data.categories.map((category) => (
          <a
            key={category.id}
            href={`#${category.slug}`}
            className="rounded-full border border-line-strong px-3 py-1.5 text-sm font-medium text-marine transition-colors hover:bg-marine hover:text-on-ocean"
          >
            {category.nameFr}
          </a>
        ))}
      </nav>

      {/*
        Stated once for the whole page rather than under each of the fifteen illustrated
        dishes. The illustrations are scattered across categories, so a per-category note
        would repeat itself several times over.
      */}
      <p
        className="mt-6 max-w-prose rounded-xl border border-line bg-warm/60 px-4 py-3 text-sm leading-snug text-ink/75"
        data-testid="fish-reference-explanation"
      >
        {FISH_REFERENCE_EXPLANATION}
      </p>

      <div className="mt-10 space-y-12">
        {data.categories.map((category) => (
          <section
            key={category.id}
            id={category.slug}
            data-testid="menu-category"
            data-slug={category.slug}
            aria-labelledby={`${category.slug}-titre`}
            className="scroll-mt-32"
          >
            <h2
              id={`${category.slug}-titre`}
              className="border-b-2 border-bright pb-2 text-xl font-bold"
            >
              {category.nameFr}
            </h2>
            {category.items.length === 0 ? (
              <p className="py-4 text-sm text-ink/70">
                Aucun plat dans cette catégorie pour le moment.
              </p>
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

      {/*
        Ordering is by phone. There is no cart in this phase, so the page ends with the
        action that is actually available.
      */}
      {data.settings?.phoneFr ? (
        <section className="mt-12 rounded-2xl bg-ocean p-8 text-center text-on-ocean">
          <h2 className="text-xl font-bold">Commander par téléphone</h2>
          <p className="mt-2 text-on-ocean-soft">
            Pour commander ou réserver une table, appelez-nous.
          </p>
          <a
            href={telHref(data.settings.phoneFr)}
            className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-lg font-bold text-ink"
            data-testid="menu-phone"
          >
            {data.settings.phoneFr}
          </a>
        </section>
      ) : null}

      <p className="mt-8 text-sm">
        <Link href="/" className="text-marine underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </p>
    </div>
  );
}
