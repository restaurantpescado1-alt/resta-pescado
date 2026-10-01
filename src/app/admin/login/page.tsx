import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getOwnerProfile } from "@/lib/authz";
import { DEFAULT_OWNER_REDIRECT, safeRedirectPath } from "@/lib/redirects";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  // An owner who is already signed in has no reason to see the form.
  const profile = await getOwnerProfile();
  if (profile) {
    redirect(DEFAULT_OWNER_REDIRECT);
  }

  const params = await searchParams;
  const requested = Array.isArray(params.redirectTo) ? params.redirectTo[0] : params.redirectTo;
  const redirectTo = safeRedirectPath(requested);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">Espace propriétaire</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Accès réservé. La création de compte est désactivée.
      </p>
      <div className="mt-6 rounded border border-line bg-white/70 p-6">
        <LoginForm redirectTo={redirectTo} />
      </div>
    </div>
  );
}
