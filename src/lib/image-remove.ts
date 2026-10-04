/**
 * Removes a dish image across two systems that cannot share a transaction.
 *
 * The mirror image of `src/lib/image-replace.ts`, and it exists for the same reason:
 * the ordering is the entire correctness argument, so it lives in one reviewable place
 * with the reasoning attached rather than inside a server action.
 *
 * The asymmetry with replacement is the interesting part. When replacing, the object is
 * written before the database and deleted after it. When removing there is nothing to
 * write, so the database goes first and the object goes second — and the failure handling
 * inverts with it.
 */

/** The two storage steps, injected so the ordering can be tested without R2 or D1. */
export interface ImageRemovalSteps {
  /** The key currently attached to the dish, or `null` when it has no image. */
  previousKey: string | null;

  /**
   * Clears the dish's `image_key` and records the audit row, atomically.
   * Rejecting means the dish still points at `previousKey` and no audit row exists.
   */
  commit(): Promise<void>;

  /** Removes the object. Best-effort: a failure here is an orphan, not a broken dish. */
  remove(key: string): Promise<void>;

  /**
   * Called when the object could not be deleted after the database already committed.
   * The dish is already correct in the database at this point, so this is a storage and
   * housekeeping problem rather than a user-facing failure.
   */
  onOrphan?(key: string, error: unknown): void;
}

export type ImageRemovalOutcome =
  /** The database was updated and the object was deleted. */
  | "removed"
  /** The dish had no image. Nothing was written and nothing was deleted. */
  | "nothing-to-remove";

/**
 * Clears the reference first, then deletes the object.
 *
 * - **Commit first.** If the batch rejects, the reference and the audit row both roll
 *   back, so nothing is deleted and the dish keeps serving its image. This is the exact
 *   opposite failure from replacement, where a failed commit had to delete the object it
 *   had just written; here a failed commit must delete nothing at all.
 * - **Delete second, best-effort.** Once the commit resolves, the database no longer
 *   points at the object, so a delete failure leaves an unreferenced object costing
 *   storage. That is reported through `onOrphan` and swallowed deliberately.
 *
 * The commit error is rethrown. Reporting "photo supprimée" for a dish that still has its
 * photo would be a lie, and the retry the owner makes next would be against stale
 * expectations.
 *
 * ## What this cannot do
 *
 * It cannot make the two systems atomic together. If the process dies between the commit
 * and the delete, the object survives as an orphan with nothing pointing at it. There is
 * no way to close that window without a reconciliation job, and this module does not
 * pretend otherwise; `onOrphan` exists so the case is at least visible in the logs.
 */
export async function removeImageSafely(steps: ImageRemovalSteps): Promise<ImageRemovalOutcome> {
  if (!steps.previousKey) {
    return "nothing-to-remove";
  }

  await steps.commit();

  try {
    await steps.remove(steps.previousKey);
  } catch (error) {
    steps.onOrphan?.(steps.previousKey, error);
  }

  return "removed";
}