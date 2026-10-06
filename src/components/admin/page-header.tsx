import Link from "next/link";

/**
 * The heading every admin section starts with.
 *
 * The way back to the dashboard lives here rather than in each page, because four pages that
 * each wrote their own link is four chances to spell the destination differently, and one of
 * them would end up pointing at the section the owner just left.
 */
export function AdminPageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mt-3">
      <Link
        href="/admin"
        className="text-sm underline underline-offset-4"
        data-testid="back-to-dashboard"
      >
        ← Tableau de bord
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-1 text-sm text-ink-soft">{description}</p> : null}
    </header>
  );
}