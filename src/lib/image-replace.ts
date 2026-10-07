/**
 * Replaces a dish image across two systems that cannot share a transaction.
 *
 * The media store and D1 are separate services. D1 can be made atomic across
 * statements (see `runAtomicBatch`); the media store cannot be rolled into a
 * database transaction at all. So the ordering below is the whole correctness
 * argument for image replacement, and it is worth having in one place with the
 * reasoning attached rather than inlined into a server action where nobody would
 * notice it changing.
 */

import type { MediaAssetRef } from "./media-provider";

/** The storage steps, injected so the ordering can be tested without a store. */
export interface ImageReplacementSteps {
  /** The delivery key just uploaded, which may need cleaning up. */
  newKey: string;
  /** The asset being replaced, or `null` when the dish had no image. */
  previous: MediaAssetRef | null;

  /**
   * Writes the new asset and returns the persisted ref (the provider assigns its
   * own identifier, e.g. the ImageKit `fileId`). Rejecting here means nothing
   * else has happened yet.
   */
  upload(): Promise<MediaAssetRef>;

  /**
   * Points the dish at the uploaded asset and records the audit row, atomically.
   * Rejecting means the database still points at `previous` and no audit row
   * exists.
   */
  commit(uploaded: MediaAssetRef): Promise<void>;

  /** Removes an asset. Best-effort: a delete failure must not fail the request. */
  remove(ref: MediaAssetRef): Promise<void>;
}

/**
 * Uploads, commits, and cleans up in the only order that cannot lose a live image.
 *
 * - **Upload first.** The alternative is committing the key before the object
 *   exists, which would point a live dish at a key that 404s.
 * - **On commit failure, delete the new asset.** The database never adopted it,
 *   so leaving it behind is an orphan that costs storage forever and is
 *   invisible in the UI. The original asset is untouched because the batch
 *   rolled back, so the dish still serves it.
 * - **Delete the old asset only after the commit resolves.** Deleting earlier
 *   would remove the object the dish is still pointing at if the batch then
 *   failed.
 *
 * The commit error is rethrown: the caller has to report the failure, and
 * swallowing it here would return "image updated" for a dish whose image never
 * changed.
 */
export async function replaceImageSafely(steps: ImageReplacementSteps): Promise<void> {
  const uploaded = await steps.upload();

  try {
    await steps.commit(uploaded);
  } catch (error) {
    await steps.remove(uploaded).catch(() => undefined);
    throw error;
  }

  if (steps.previous && steps.previous.key !== steps.newKey) {
    await steps.remove(steps.previous).catch(() => undefined);
  }
}