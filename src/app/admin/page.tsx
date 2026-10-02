import Link from "next/link";

import { getDb } from "@/db";
import { listAuditLogs } from "@/db/repositories/menu";
import { requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<string, string> = {
  "menu_item.price_updated": "Prix mis à jour",
  "menu_item.image_replaced": "Image remplacée",
  "menu_item.featured_updated": "Mise en avant modifiée",
  "auth.login_success": "Connexion réussie",
  "auth.login_failed": "Échec de connexion",
};

export default async function AdminPage() {
  const profile = await requireOwner("/admin");
  const db = getDb();
  const logs = await listAuditLogs(db, 20);

  return (
    <div data-testid="admin-dashboard">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
      <p className="mt-1 text-sm text-ink-soft">Connecté en tant que {profile.displayName}.</p>

      <nav className="mt-6 flex gap-3">
        <Link
          href="/admin/menu"
          className="rounded bg-sea px-4 py-2 text-sm font-semibold text-sand transition-colors hover:bg-sea-deep"
        >
          Gérer la carte
        </Link>
        <Link
          href="/menu"
          className="rounded border border-line px-4 py-2 text-sm font-semibold transition-colors hover:bg-sand"
        >
          Voir la carte publique
        </Link>
      </nav>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Journal d&apos;audit</h2>
        {logs.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft" data-testid="audit-empty">
            Aucune activité enregistrée.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line" data-testid="audit-list">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                <span className="text-ink-soft">
                  {log.entityType} <span data-testid="audit-entity-id">{log.entityId}</span>
                </span>
                <time className="text-ink-soft" dateTime={log.createdAt.toISOString()}>
                  {log.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                </time>
                <code className="w-full break-all text-xs text-ink-soft">{log.metadata}</code>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
