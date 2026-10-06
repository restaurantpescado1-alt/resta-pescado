import { AccountPanel } from "@/components/admin/account-panel";
import { AdminPageHeader } from "@/components/admin/page-header";
import { requireOwnerSession } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * The account section.
 *
 * The owner email comes from the Better Auth session rather than from a profile column, so
 * this page cannot show an address the session does not actually authenticate with.
 */
export default async function AdminAccountPage() {
  const { profile, email } = await requireOwnerSession("/admin/compte");

  return (
    <div>
      <AdminPageHeader
        title="Compte"
        description={`Votre accès au tableau de bord, au nom de ${profile.displayName}.`}
      />
      <AccountPanel email={email} />
    </div>
  );
}