/**
 * Removes a dish image across two systems that cannot share a transaction.
 *
 * The mirror image of `src/lib/image-replace.ts`, and it exists for the same reason:
 * the ordering is the entire correctness argument, so it lives in one reviewable place
 * with the reasoning attached rather than inside a server action.
 *
 * The asymmetry with replacement is the interesting part. When replacing, the asset is
 * written before the database and deleted after it. When removing there is nothing to
 * write, so the database goes first and the asset goes second — and the failure handling
 * inverts with it.
 */

import type { MediaAssetRef } from "./media-provider";

/** The storage steps, injected so the ordering can be tested without a store. */
export interface ImageRemovalSteps {
  /** The asset currently attached to the dish, or `null` when it has no image. */
  previous: MediaAssetRef | null;

  /**
   * Clears the dish's `image_key` and records the audit row, atomically.
   * Rejecting means the dish still points at `previous` and no audit row exists.
   */
  commit(): Promise<void>;

  /** Removes the asset. Best-effort: a failure here is an orphan, not a broken dish. */
  remove(ref: MediaAssetRef): Promise<void>;

  /**
   * Called when the asset could not be deleted after the database already committed.
   * The dish is already correct in the database at this point, so this is a storage and
   * housekeeping problem rather than a user-facing failure.
   */
  onOrphan?(ref: MediaAssetRef, error: unknown): void;
}

export type ImageRemovalOutcome =
  /** The database was updated and the asset was deleted. */
  | "removed"
  /** The dish had no image. Nothing was written and nothing was deleted. */
  | "nothing-to-remove";

/**
 * Clears the reference first, then deletes the asset.
 *
 * - **Commit first.** If the batch rejects, the reference and the audit row both roll
 *   back, so nothing is deleted and the dish keeps serving its image. This is the exact
 *   opposite failure from replacement, where a failed commit had to delete the asset it
 *   had just written; here a failed commit must delete nothing at all.
 * - **Delete second, best-effort.** Once the commit resolves, the database no longer
 *   points at the asset, so a delete failure leaves an unreferenced asset costing
 *   storage. That is reported through `onOrphan` and swallowed deliberately.
 *
 * The commit error is rethrown. Reporting "photo supprimée" for a dish that still has its
 * photo would be a lie, and the retry the owner makes next would be against stale
 * expectations.
 *
 * ## What this cannot do
 *
 * It cannot make the two systems atomic together. If the process dies between the commit
 * and the delete, the asset survives as an orphan with nothing pointing at it. There is
 * no way to close that window without a reconciliation job, and this module does not
 * pretend otherwise; `onOrphan` exists so the case is at least visible in the logs.
 */
export async function removeImageSafely(steps: ImageRemovalSteps): Promise<ImageRemovalOutcome> {
  if (!steps.previous) {
    return "nothing-to-remove";
  }

  await steps.commit();

  try {
    await steps.remove(steps.previous);
  } catch (error) {
    steps.onOrphan?.(steps.previous, error);
  }

  return "removed";
}