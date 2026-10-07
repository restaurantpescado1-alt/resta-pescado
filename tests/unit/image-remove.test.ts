import { describe, expect, it, vi } from "vitest";

import { removeImageSafely, type ImageRemovalSteps } from "../../src/lib/image-remove";
import type { MediaAssetRef } from "../../src/lib/media-provider";

/**
 * The mirror of `image-replace.test.ts`.
 *
 * Removal has one failure mode that is worse than an error message: deleting the asset
 * before the database stops pointing at it. The database is gone by the time the delete
 * runs, so a live dish cannot be left pointing at a 404. That ordering is invisible from
 * the outside, which is why it is pinned by asserting on the call log.
 */
const old = { provider: "r2", key: "menu/2026/old.png", assetId: "menu/2026/old.png" } as const;

function recorder() {
  const calls: string[] = [];
  const orphans: string[] = [];
  return {
    calls,
    orphans,
    steps(overrides: Partial<ImageRemovalSteps> = {}): ImageRemovalSteps {
      return {
        previous: old,
        commit: async () => {
          calls.push("commit");
        },
        remove: async (ref: MediaAssetRef) => {
          calls.push(`remove:${ref.key}`);
        },
        onOrphan: (ref) => {
          orphans.push(ref.key);
        },
        ...overrides,
      };
    },
  };
}

describe("image removal ordering", () => {
  it("commits the database change before deleting the asset", async () => {
    const { calls, steps } = recorder();

    const outcome = await removeImageSafely(steps());

    expect(outcome).toBe("removed");
    expect(calls).toEqual(["commit", "remove:menu/2026/old.png"]);
  });

  it("deletes nothing when the commit fails", async () => {
    const { calls, steps } = recorder();

    await expect(
      removeImageSafely(
        steps({
          commit: async () => {
            calls.push("commit");
            throw new Error("D1 batch failed");
          },
        }),
      ),
    ).rejects.toThrow("D1 batch failed");

    /*
     * The load-bearing assertion. Deleting here would leave the dish pointing at an
     * asset that no longer exists, which is the broken state this ordering exists to
     * prevent.
     */
    expect(calls).toEqual(["commit"]);
  });

  it("reports success and logs an orphan when only the delete fails", async () => {
    const { calls, orphans, steps } = recorder();

    const outcome = await removeImageSafely(
      steps({
        remove: async (ref: MediaAssetRef) => {
          calls.push(`remove:${ref.key}`);
          throw new Error("ImageKit unavailable");
        },
      }),
    );

    /*
     * The dish is already correct in the database, so this is a success. Surfacing an
     * error would tell the owner their removal failed and invite them to retry against
     * a photo that is already gone from their menu.
     */
    expect(outcome).toBe("removed");
    expect(calls).toEqual(["commit", "remove:menu/2026/old.png"]);
    expect(orphans).toEqual(["menu/2026/old.png"]);
  });

  it("still reports success when no orphan handler was supplied", async () => {
    const { steps } = recorder();

    const outcome = await removeImageSafely(
      steps({
        onOrphan: undefined,
        remove: async () => {
          throw new Error("ImageKit unavailable");
        },
      }),
    );

    // `onOrphan` is optional, so a missing handler must not change the outcome.
    expect(outcome).toBe("removed");
  });

  it("does nothing at all when the dish has no image", async () => {
    const { calls, orphans, steps } = recorder();

    const outcome = await removeImageSafely(
      steps({ previous: null, onOrphan: vi.fn() }),
    );

    /*
     * No commit means no audit row for an action that changed nothing, and no delete
     * means a fish illustration, which is bundled in `public/` and never in the media
     * store, cannot be targeted.
     */
    expect(outcome).toBe("nothing-to-remove");
    expect(calls).toEqual([]);
    expect(orphans).toEqual([]);
  });
});