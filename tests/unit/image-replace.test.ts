import { describe, expect, it, vi } from "vitest";

import { replaceImageSafely, type ImageReplacementSteps } from "../../src/lib/image-replace";

/**
 * These tests exist because the ordering in `replaceImageSafely` cannot be seen from
 * the outside. A wrong order produces no error: it produces a live dish pointing at a
 * 404, or an object deleted while the database still references it. Asserting on the
 * call log is the only way to pin that down.
 */
function recorder() {
  const calls: string[] = [];
  return {
    calls,
    steps(overrides: Partial<ImageReplacementSteps> = {}): ImageReplacementSteps {
      return {
        newKey: "menu/2026/new.png",
        previousKey: "menu/2026/old.png",
        upload: async () => {
          calls.push("upload");
        },
        commit: async () => {
          calls.push("commit");
        },
        remove: async (key) => {
          calls.push(`remove:${key}`);
        },
        ...overrides,
      };
    },
  };
}

describe("image replacement ordering", () => {
  it("uploads, commits, then removes the previous object", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(steps());

    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/old.png"]);
  });

  it("removes the new object when the commit fails", async () => {
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

    // The new key is cleaned up because nothing ever referenced it.
    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/new.png"]);
  });

  it("never removes the previous object when the commit fails", async () => {
    // The batch rolled back, so the dish still points at the old object. Deleting it
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

  it("does not touch R2 when the upload itself fails", async () => {
    const { calls, steps } = recorder();

    await expect(
      replaceImageSafely(
        steps({
          upload: async () => {
            calls.push("upload");
            throw new Error("R2 rejected the upload");
          },
        }),
      ),
    ).rejects.toThrow("R2 rejected the upload");

    // Committing a key whose object does not exist would be worse than failing.
    expect(calls).toEqual(["upload"]);
  });

  it("has nothing to remove when the dish had no image", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(steps({ previousKey: null }));

    expect(calls).toEqual(["upload", "commit"]);
  });

  it("does not delete an object twice when the key is unchanged", async () => {
    const { calls, steps } = recorder();

    await replaceImageSafely(steps({ newKey: "menu/2026/same.png", previousKey: "menu/2026/same.png" }));

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
          remove: async (key) => {
            calls.push(`remove:${key}`);
            throw new Error("R2 delete failed");
          },
        }),
      ),
    ).rejects.toThrow("D1 batch failed");

    expect(calls).toEqual(["upload", "commit", "remove:menu/2026/new.png"]);
  });

  it("treats a delete of the old object as non-fatal", async () => {
    // The replacement already succeeded and committed. A stale object is a storage
    // cost, not a broken image, so it must not fail the request.
    const remove = vi.fn(async (key: string) => {
      throw new Error(`cannot delete ${key}`);
    });

    await expect(
      replaceImageSafely(recorder().steps({ remove })),
    ).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledExactlyOnceWith("menu/2026/old.png");
  });
});