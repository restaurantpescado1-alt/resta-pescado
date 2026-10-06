import { GalleryManager } from "@/components/admin/gallery-manager";
import { AdminPageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db";
import {
  ensureBundledGalleryRows,
  listAdminGalleryImages,
  listBundledGalleryState,
} from "@/db/repositories/owner";
import { requireOwner } from "@/lib/authz";
import { mergeBundledGalleryState } from "@/lib/gallery-images";

export const dynamic = "force-dynamic";

/**
 * The gallery manager.
 *
 * Reads the same merged view `/galerie` renders, through the same `mergeBundledGalleryState`,
 * so the dashboard and the public page cannot disagree about what a photograph is called or
 * where it sits. The difference is that here nothing is filtered: a hidden photograph has to
 * stay visible here, or there would be no way to un-hide it.
 *
 * The missing bundled rows are created *before* the read, not on the first write. A merged
 * photograph with no row reports `version: 0`, and 0 is what the editor would then send back
 * with an edit — against a row that has just been created at version 1, which is refused as a
 * stale write. Creating them here means the owner is shown a real version on their very first
 * visit and the first caption they type is not rejected because of how the row came to exist.
 * It is an insert of the manifest's own defaults, which is the state the row would have had.
 */
export default async function AdminGalleryPage() {
  await requireOwner("/admin/galerie");
  const db = getDb();
  await ensureBundledGalleryRows(db);
  const [bundledState, uploaded] = await Promise.all([
    listBundledGalleryState(db),
    listAdminGalleryImages(db),
  ]);

  return (
    <div>
      <AdminPageHeader
        title="Galerie"
        description="Les photographies affichées sur la page galerie du site."
      />

      <GalleryManager bundled={mergeBundledGalleryState(bundledState)} uploaded={uploaded} />
    </div>
  );
}