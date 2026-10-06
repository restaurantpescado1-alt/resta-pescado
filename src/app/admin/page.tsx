import Link from "next/link";

import { listReadableAuditLogs } from "@/db/repositories/owner";
import { getDb } from "@/db";
import { requireOwner } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * What each audit action is called, in the owner's language.
 *
 * A history is only readable if it says "Prix mis à jour" rather than
 * `menu_item.details_updated`. Anything missing from this map falls back to the raw action
 * name, which is ugly but honest: a new action that nobody has labelled yet is visible rather
 * than invisible.
 */
const ACTION_LABELS: Record<string, string> = {
  "menu_item.price_updated": "Prix mis à jour",
  "menu_item.details_updated": "Plat modifié",
  "menu_item.created": "Plat ajouté",
  "menu_item.visibility_updated": "Visibilité d'un plat modifiée",
  "menu_item.reordered": "Ordre des plats modifié",
  "menu_item.featured_updated": "Mise en avant modifiée",
  "menu_item.image_replaced": "Image remplacée",
  "menu_item.image_removed": "Image supprimée",
  "menu_category.created": "Catégorie créée",
  "menu_category.renamed": "Catégorie renommée",
  "menu_category.deleted": "Catégorie supprimée",
  "menu_category.visibility_updated": "Visibilité d'une catégorie modifiée",
  "menu_category.reordered": "Ordre des catégories modifié",
  "site_settings.updated": "Informations du restaurant modifiées",
  "gallery.bundled_updated": "Photographie du restaurant modifiée",
  "gallery.bundled_reordered": "Ordre des photographies modifié",
  "gallery.uploaded_created": "Photographie ajoutée",
  "gallery.uploaded_updated": "Photographie modifiée",
  "gallery.uploaded_deleted": "Photographie supprimée",
  "gallery.uploaded_reordered": "Ordre des photographies ajoutées modifié",
  "auth.login_success": "Connexion réussie",
  "auth.login_failed": "Échec de connexion",
};

/**
 * The four things an owner can change.
 *
 * A dashboard of links rather than a dashboard of controls. Each of these is edited
 * deliberately and rarely, and a screen that offered four sets of forms at once would be four
 * sets of version numbers competing for the same attention.
 */
const SECTIONS = [
  {
    href: "/admin/menu",
    title: "La carte",
    description: "Plats, descriptions, prix, catégories et ordre d'affichage.",
  },
  {
    href: "/admin/galerie",
    title: "La galerie",
    description: "Photographies du restaurant, descriptions, et ordre.",
  },
  {
    href: "/admin/informations",
    title: "Les informations",
    description: "Nom, téléphone, adresse, horaires, livraison et commande.",
  },
  {
    href: "/admin/compte",
    title: "Le compte",
    description: "Mot de passe et déconnexion.",
  },
] as const;

/**
 * The dashboard.
 *
 * The history is read through `listReadableAuditLogs`, which parses each row's metadata back
 * into readable values. The earlier version showed the raw JSON string, which told the owner
 * nothing they could act on.
 */
export default async function AdminPage() {
  const profile = await requireOwner("/admin");
  const logs = await listReadableAuditLogs(getDb(), 20);

  return (
    <div data-testid="admin-dashboard">
      <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
      <p className="mt-1 text-sm text-ink-soft">Connecté en tant que {profile.displayName}.</p>

      <nav className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Sections">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            data-testid={`admin-nav-${section.href.slice("/admin/".length)}`}
            className="rounded border border-line bg-white/60 p-4 transition-colors hover:bg-sand"
          >
            <span className="block font-semibold">{section.title}</span>
            <span className="mt-1 block text-sm text-ink-soft">{section.description}</span>
          </Link>
        ))}
      </nav>

      <p className="mt-6">
        <Link
          href="/menu"
          className="text-sm underline underline-offset-4"
          data-testid="admin-view-public-menu"
        >
          Voir la carte publique
        </Link>
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Activité récente</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Les vingt dernières modifications, de la plus récente à la plus ancienne.
        </p>

        {logs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft" data-testid="audit-empty">
            Aucune activité enregistrée.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line" data-testid="audit-list">
            {logs.map((log) => (
              <li key={log.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</span>
                  <time
                    className="text-xs text-ink-soft"
                    dateTime={log.createdAt.toISOString()}
                    data-testid="audit-time"
                  >
                    {formatTimestamp(log.createdAt)}
                  </time>
                </div>
                {Object.keys(log.metadata).length > 0 ? (
                  <p className="mt-1 break-words text-xs text-ink-soft">
                    {describeMetadata(log.metadata)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The timestamp as the owner reads it.
 *
 * UTC with the zone stated, rather than a locale-dependent rendering. The dashboard is a
 * record: an entry that reads differently depending on the machine displaying it is not a
 * record of when anything happened.
 */
function formatTimestamp(value: Date): string {
  return `${value.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/**
 * A metadata object as one readable line.
 *
 * Only the leaf values are shown. A metadata blob nests `{ from, to }` pairs for every field
 * that changed, and rendering the structure would bury the answer — which value became which —
 * under punctuation.
 */
function describeMetadata(metadata: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [field, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      if ("from" in record || "to" in record) {
        parts.push(`${field} : ${stringify(record.from)} → ${stringify(record.to)}`);
        continue;
      }
      // Lists are shown by length, which is what the owner wants to know about them.
      parts.push(`${field} : ${Array.isArray(value) ? `${value.length} élément(s)` : "…"}`);
      continue;
    }
    if (typeof value === "boolean") {
      if (!value) {
        continue;
      }
      parts.push(`${field}`);
      continue;
    }
    parts.push(`${field} : ${stringify(value)}`);
  }

  return parts.join(" · ");
}

/** One value, without the quotes and braces a raw JSON dump would put around it. */
function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return String(value);
}