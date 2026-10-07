import { describe, expect, it, vi } from "vitest";

import { replaceImageSafely, type ImageReplacementSteps } from "../../src/lib/image-replace";
import type { MediaAssetRef } from "../../src/lib/media-provider";

/**
 * These tests exist because the ordering in `replaceImageSafely` cannot be seen from
 * the outside. A wrong order produces no error: it produces a live dish pointing at a
 * 404, or an object deleted while the database still references it. Asserting on the
 * call log is the only way to pin that down.
 */
const old = { provider: "r2", key: "menu/2026/old.png", assetId: "menu/2026/old.png" } as const;
const fresh = { provider: "imagekit", key: "menu/2026/new.png", assetId: "fileId-new" } as const;

function recorder() {
  const calls: string[] = [];
  return {
    calls,
    steps(overrides: Partial<ImageReplacementSteps> = {}): ImageReplacementSteps {
      return {
        newKey: fresh.key,
        previous: old,
        upload: async () => {
          calls.push("upload");
          return fresh;
        },
        commit: async () => {
          calls.push("commit");
        },
        remove: async (ref: MediaAssetRef) => {
          calls.push(`remove:${ref.key}`);
        },
        ...overrides,
      };
    },
  };
}

describe("image replacement ordering", () => {
  it("uploads, commits, then removes the previous asset", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(steps());

    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/old.png"]);
  });

  it("removes the new asset when the commit fails", async () => {
    const { calls, steps } = recorder();

    await expect(
      replaceImageSafely(
        steps({
          commit: async () => {
            calls.push("commit");
            throw new Error("D1 batch failed");
          },
        }),
      ),
    ).rejects.toThrow("D1 batch failed");

    // The new asset is cleaned up because nothing ever referenced it.
    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/new.png"]);
  });

  it("never removes the previous asset when the commit fails", async () => {
    // The batch rolled back, so the dish still points at the old asset. Deleting it
    // here would break a live image in order to clean up an orphan.
    const { calls, steps } = recorder();

    await expect(
      replaceImageSafely(
        steps({
          commit: async () => {
            calls.push("commit");
            throw new Error("D1 batch failed");
          },
        }),
      ),
    ).rejects.toThrow();

    expect(calls).not.toContain("remove:menu/2026/old.png");
  });

  it("rethrows the commit error rather than reporting success", async () => {
    // Swallowing this would tell the owner the image was updated when it was not.
    const { steps } = recorder();
    const failure = new Error("D1 batch failed");

    await expect(replaceImageSafely(steps({ commit: async () => Promise.reject(failure) }))).rejects.toThrow(
      failure,
    );
  });

  it("touches nothing when the upload itself fails", async () => {
    const { calls, steps } = recorder();

    await expect(
      replaceImageSafely(
        steps({
          upload: async () => {
            calls.push("upload");
            throw new Error("ImageKit rejected the upload");
          },
        }),
      ),
    ).rejects.toThrow("ImageKit rejected the upload");

    // Committing a key whose object does not exist would be worse than failing.
    expect(calls).toEqual(["upload"]);
  });

  it("has nothing to remove when the dish had no image", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(steps({ previous: null }));

    expect(calls).toEqual(["upload", "commit"]);
  });

  it("does not delete an asset twice when the key is unchanged", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(
      steps({ newKey: "menu/2026/same.png", previous: { ...old, key: "menu/2026/same.png" } }),
    );

    expect(calls).toEqual(["upload", "commit"]);
  });

  it("still reports the failure when deleting the orphan also fails", async () => {
    // The cleanup is best-effort. Letting its error replace the commit error would
    // hide the real cause, which is the database write.
    const { calls, steps } = recorder();

    await expect(
      replaceImageSafely(
        steps({
          commit: async () => {
            calls.push("commit");
            throw new Error("D1 batch failed");
          },
          remove: async (ref: MediaAssetRef) => {
            calls.push(`remove:${ref.key}`);
            throw new Error("ImageKit delete failed");
          },
        }),
      ),
    ).rejects.toThrow("D1 batch failed");

    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/new.png"]);
  });

  it("treats a delete of the old asset as non-fatal", async () => {
    // The replacement already succeeded and committed. A stale asset is a storage
    // cost, not a broken image, so it must not fail the request.
    const remove = vi.fn(async (ref: MediaAssetRef) => {
      throw new Error(`cannot delete ${ref.key}`);
    });

    await expect(
      replaceImageSafely(recorder().steps({ remove })),
    ).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledExactlyOnceWith(old);
  });
});