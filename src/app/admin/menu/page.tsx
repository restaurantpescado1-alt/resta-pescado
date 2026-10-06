import { MenuManager } from "@/components/admin/menu-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db";
import { getAdminMenu } from "@/db/repositories/menu";
import { requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * The menu editor.
 *
 * `getAdminMenu` returns hidden categories and hidden dishes as well as visible ones, which is
 * the whole point here: the dashboard has to show what is on the site *and* what is not, or a
 * hidden dish would be impossible to find again.
 */
export default async function AdminMenuPage() {
  await requireOwner("/admin/menu");
  const menu = await getAdminMenu(getDb());

  return (
    <div>
      <AdminPageHeader
        title="Gérer la carte"
        description="Les modifications sont publiées immédiatement et enregistrées dans le journal d'activité. Masquer un plat ou une catégorie est réversible ; les supprimer ne l'est pas."
      />

      <MenuManager categories={menu.categories} />
    </div>
  );
}