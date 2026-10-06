import { SettingsForm } from "@/components/admin/settings-form";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db";
import { getSiteSettings } from "@/db/repositories/menu";
import { requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * The restaurant's own information.
 *
 * A page of its own rather than a panel on the dashboard, because it is edited rarely and
 * deliberately: every field here is a sentence the public site says about the restaurant, and
 * one careless keystroke is a change of fact rather than a change of presentation.
 */
export default async function AdminSettingsPage() {
  await requireOwner("/admin/informations");
  const settings = await getSiteSettings(getDb());

  return (
    <div>
      <AdminPageHeader
        title="Informations du restaurant"
        description="Ces informations apparaissent sur le site. Laissez un champ vide pour ne rien afficher plutôt que d'écrire un texte de remplacement."
      />

      {settings ? (
        <SettingsForm settings={settings} />
      ) : (
        /*
         * The row is created by the seed or by `scripts/migrate.ts`, so this only appears on a
         * database that has not been initialised. It says so plainly instead of rendering an
         * empty form whose saves would all fail.
         */
        <p className="mt-6 text-sm text-danger" data-testid="settings-missing">
          Les informations du restaurant ne sont pas encore enregistrées. Lancez d&apos;abord la
          migration de la base de données.
        </p>
      )}
    </div>
  );
}