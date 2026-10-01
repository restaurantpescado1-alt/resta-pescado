import Link from "next/link";

import { MenuEditor } from "@/components/menu-editor";
import { getDb } from "@/db";
import { getAdminMenu } from "@/db/repositories/menu";
import { requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  await requireOwner("/admin/menu");
  const menu = await getAdminMenu(getDb());

  return (
    <div>
      <Link href="/admin" className="text-sm underline underline-offset-4">
        ← Tableau de bord
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Gérer la carte</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Les modifications sont publiées immédiatement et enregistrées dans le journal d&apos;audit.
      </p>

      {menu.categories.length === 0 ? (
        <p className="mt-6 text-sm text-ink-soft">Aucune catégorie.</p>
      ) : (
        <MenuEditor categories={menu.categories} />
      )}
    </div>
  );
}
