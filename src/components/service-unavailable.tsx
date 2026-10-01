import Link from "next/link";

/**
 * Shown when D1 or R2 fails on a public page. A visitor gets an explanation and a
 * retry rather than a Worker exception, per the Phase 1 requirement for a useful
 * public error state.
 */
export function ServiceUnavailable({ detail }: { detail?: string }) {
  return (
    <section
      role="alert"
      className="rounded border border-danger/40 bg-danger/5 p-6 text-danger"
      data-testid="service-unavailable"
    >
      <h1 className="text-lg font-semibold">Service temporairement indisponible</h1>
      <p className="mt-2 text-sm">
        La carte ne peut pas être affichée pour le moment. Merci de réessayer dans un instant.
      </p>
      {detail ? <p className="mt-3 text-xs opacity-80">{detail}</p> : null}
      <div className="mt-4 flex gap-4 text-sm">
        <Link href="/menu" className="underline underline-offset-4">
          Réessayer
        </Link>
        <Link href="/" className="underline underline-offset-4">
          Retour à l&apos;accueil
        </Link>
      </div>
    </section>
  );
}
