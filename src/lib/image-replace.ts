/**
 * Replaces a dish image across two systems that cannot share a transaction.
 *
 * R2 and D1 are separate services. D1 can be made atomic across statements (see
 * `runAtomicBatch`); R2 cannot be rolled into a database transaction at all. So the
 * ordering below is the whole correctness argument for image replacement, and it is
 * worth having in one place with the reasoning attached rather than inlined into a
 * server action where nobody would notice it changing.
 */

/** The three storage steps, injected so the ordering can be tested without R2. */
export interface ImageReplacementSteps {
  /** The key just uploaded, which may need cleaning up. */
  newKey: string;
  /** The key being replaced, or `null` when the dish had no image. */
  previousKey: string | null;

  /** Writes the new object. Rejecting here means nothing else has happened yet. */
  upload(): Promise<void>;

  /**
   * Points the dish at the new key and records the audit row, atomically.
   * Rejecting means the database still points at `previousKey` and no audit row
   * exists.
   */
  commit(): Promise<void>;

  /** Removes an object. Best-effort: a delete failure must not fail the request. */
  remove(key: string): Promise<void>;
}

/**
 * Uploads, commits, and cleans up in the only order that cannot lose a live image.
 *
 * - **Upload first.** The alternative is committing the key before the object
 *   exists, which would point a live dish at a key that 404s.
 * - **On commit failure, delete the new object.** The database never adopted it, so
 *   leaving it behind is an orphan that costs storage forever and is invisible in
 *   the UI. The original object is untouched because the batch rolled back, so the
 *   dish still serves it.
 * - **Delete the old object only after the commit resolves.** Deleting earlier would
 *   remove the object the dish is still pointing at if the batch then failed.
 *
 * The commit error is rethrown: the caller has to report the failure, and swallowing
 * it here would return "image updated" for a dish whose image never changed.
 */
export async function replaceImageSafely(steps: ImageReplacementSteps): Promise<void> {
  await steps.upload();

  try {
    await steps.commit();
  } catch (error) {
    await steps.remove(steps.newKey).catch(() => undefined);
    throw error;
  }

  if (steps.previousKey && steps.previousKey !== steps.newKey) {
    await steps.remove(steps.previousKey).catch(() => undefined);
  }
}