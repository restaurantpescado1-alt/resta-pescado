import { describe, expect, it } from "vitest";

import {
  ALLOWED_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  MIN_IMAGE_DIMENSION,
  buildR2Key,
  detectMimeType,
  isCompleteImage,
  readImageDimensions,
  validateImageUpload,
} from "../../src/lib/images";
import {
  createPng,
  createTruncatedJpeg,
  createTruncatedWebp,
  createWebp,
  createWebpExtended,
  createWebpLossy,
  encodeImage,
} from "../helpers/image-fixtures";

/**
 * The image gate is the one place where the browser's claim about a file is
 * checked against the bytes, so these tests cover the mismatches a browser or a
 * crafted request can produce.
 */
describe("image validation", () => {
  it("accepts a valid PNG", () => {
    const result = validateImageUpload("image/png", createPng({ width: 640, height: 480 }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mimeType).toBe("image/png");
      expect(result.extension).toBe("png");
      expect(result.dimensions).toEqual({ width: 640, height: 480 });
    }
  });

  it("accepts a valid JPEG", async () => {
    const result = validateImageUpload(
      "image/jpeg",
      await encodeImage("jpeg", { width: 800, height: 600 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extension).toBe("jpg");
      expect(result.dimensions).toEqual({ width: 800, height: 600 });
    }
  });

  it("accepts a valid WebP", async () => {
    const result = validateImageUpload(
      "image/webp",
      await encodeImage("webp", { width: 400, height: 400 }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.extension).toBe("webp");
      expect(result.dimensions).toEqual({ width: 400, height: 400 });
    }
  });

  it("rejects a MIME type outside the allow list", () => {
    for (const mimeType of ["image/gif", "image/svg+xml", "image/avif", "text/html", "application/pdf"]) {
      const result = validateImageUpload(mimeType, createPng({ width: 640, height: 480 }));
      expect(result.ok, `${mimeType} must be rejected`).toBe(false);
    }
  });

  it("rejects an oversized file", () => {
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1);
    oversized.set(createPng({ width: 640, height: 480 }));
    const result = validateImageUpload("image/png", oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("trop lourde");
    }
  });

  it("rejects an empty file", () => {
    const result = validateImageUpload("image/png", new Uint8Array(0));
    expect(result.ok).toBe(false);
  });

  it("rejects content that is not an image at all", () => {
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const result = validateImageUpload("image/png", html);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("pas une image valide");
    }
  });

  it("rejects a declared type that does not match the bytes", () => {
    // A PNG announced as a JPEG. The signature check is what catches this.
    const png = createPng({ width: 640, height: 480 });
    const result = validateImageUpload("image/jpeg", png);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("ne correspond pas");
    }
  });

  it("rejects a truncated image whose dimensions cannot be read", () => {
    const png = createPng({ width: 640, height: 480 });
    const result = validateImageUpload("image/png", png.subarray(0, 16));
    expect(result.ok).toBe(false);
  });

  it("rejects dimensions below the minimum", () => {
    const result = validateImageUpload("image/png", createPng({ width: 40, height: 40 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Dimensions");
    }
  });

  it("rejects dimensions above the maximum", () => {
    const result = validateImageUpload("image/png", createPng({ width: MAX_IMAGE_DIMENSION + 1, height: 100 }));
    expect(result.ok).toBe(false);
  });

  it("accepts the dimension boundaries", () => {
    const small = validateImageUpload("image/png", createPng({ width: MIN_IMAGE_DIMENSION, height: MIN_IMAGE_DIMENSION }));
    expect(small.ok).toBe(true);

    const large = validateImageUpload(
      "image/png",
      createPng({ width: MAX_IMAGE_DIMENSION, height: MIN_IMAGE_DIMENSION }),
    );
    expect(large.ok).toBe(true);
  });

  it("honours a custom size limit", () => {
    const png = createPng({ width: 640, height: 480 });
    expect(validateImageUpload("image/png", png, png.byteLength).ok).toBe(true);
    expect(validateImageUpload("image/png", png, png.byteLength - 1).ok).toBe(false);
  });

  it("returns a detached buffer so the caller cannot mutate the source", () => {
    const png = createPng({ width: 640, height: 480 });
    const result = validateImageUpload("image/png", png);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).not.toBe(png.buffer);
    }
  });
});

describe("signature detection", () => {
  it("identifies the three supported formats", () => {
    expect(detectMimeType(createPng({ width: 10, height: 10 }))).toBe("image/png");
    expect(detectMimeType(createTruncatedJpeg({ width: 10, height: 10 }))).toBe("image/jpeg");
    expect(detectMimeType(createWebp({ width: 10, height: 10 }))).toBe("image/webp");
  });

  it("returns null for anything else", () => {
    expect(detectMimeType(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBeNull();
    expect(detectMimeType(new Uint8Array(0))).toBeNull();
  });
});

describe("dimension parsing", () => {
  it("returns null for a format it cannot parse", () => {
    expect(readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBeNull();
  });

  it("returns null for a WebP with an unknown chunk", () => {
    const webp = createWebp({ width: 100, height: 100 });
    // Overwrite the chunk tag with something unrecognised.
    webp[12] = "X".charCodeAt(0);
    expect(readImageDimensions(webp, "image/webp")).toBeNull();
  });

  it("reads lossy WebP dimensions from the VP8 sync code", () => {
    // The VP8 branch is the only one that can be fooled by a wrong byte offset,
    // so it gets an explicit round-trip rather than being covered incidentally.
    const webp = createWebpLossy({ width: 1024, height: 768 });
    expect(readImageDimensions(webp, "image/webp")).toEqual({ width: 1024, height: 768 });
  });

  it("rejects a lossy WebP whose sync code is wrong", () => {
    const webp = createWebpLossy({ width: 640, height: 640 });
    webp[23] = 0x00;
    expect(readImageDimensions(webp, "image/webp")).toBeNull();
  });

  it("reads extended WebP dimensions from the VP8X canvas size", () => {
    const webp = createWebpExtended({ width: 1200, height: 900 });
    expect(readImageDimensions(webp, "image/webp")).toEqual({ width: 1200, height: 900 });
  });

  /**
   * The three WebP container shapes are all recognised and their dimensions read.
   *
   * Deliberately not run through the full gate: `createWebpLossy` and
   * `createWebpExtended` are header-only fixtures, so they are incomplete by
   * construction. Probing them with the full gate would be asserting that a truncated
   * file is a valid upload, which is the opposite of what the completeness check is for.
   */
  it("recognises every WebP container shape", () => {
    for (const bytes of [
      createWebp({ width: 400, height: 400 }),
      createWebpLossy({ width: 400, height: 400 }),
      createWebpExtended({ width: 400, height: 400 }),
    ]) {
      expect(detectMimeType(bytes)).toBe("image/webp");
      expect(readImageDimensions(bytes, "image/webp")).toEqual({ width: 400, height: 400 });
    }
  });

  it("accepts a real WebP of each container shape the encoder produces", async () => {
    const result = validateImageUpload(
      "image/webp",
      await encodeImage("webp", { width: 400, height: 400 }),
    );
    expect(result.ok).toBe(true);
  });
});

/**
 * A file that stops after its header passes every check that reads the front of the
 * file: the magic number matches, and the dimension fields parse.
 *
 * Accepting one is not cosmetic. There is no control for removing a dish photo, so a
 * truncated upload cannot be undone from the dashboard and would render as a broken
 * image on the live menu.
 */
describe("completeness", () => {
  it("accepts a whole PNG", async () => {
    expect(isCompleteImage(await encodeImage("png", { width: 200, height: 200 }), "image/png")).toBe(
      true,
    );
  });

  it("accepts a whole JPEG", async () => {
    expect(
      isCompleteImage(await encodeImage("jpeg", { width: 200, height: 200 }), "image/jpeg"),
    ).toBe(true);
  });

  it("accepts a whole WebP", async () => {
    expect(
      isCompleteImage(await encodeImage("webp", { width: 200, height: 200 }), "image/webp"),
    ).toBe(true);
  });

  it("rejects a JPEG that stops after its header", () => {
    expect(isCompleteImage(createTruncatedJpeg({ width: 720, height: 540 }), "image/jpeg")).toBe(false);
  });

  it("rejects a WebP that stops after its header", () => {
    expect(isCompleteImage(createTruncatedWebp({ width: 640, height: 640 }), "image/webp")).toBe(false);
  });

  it("rejects a PNG whose IEND chunk is missing", async () => {
    const png = createPng({ width: 200, height: 200 });
    const withoutEnd = png.subarray(0, png.byteLength - 12);
    expect(isCompleteImage(withoutEnd, "image/png")).toBe(false);
  });

  it("rejects a WebP whose declared RIFF length does not match the file", async () => {
    const webp = await encodeImage("webp", { width: 200, height: 200 });
    const padded = new Uint8Array(webp.byteLength + 4);
    padded.set(webp, 0);
    expect(isCompleteImage(padded, "image/webp")).toBe(false);
  });

  it("rejects a truncated file through the full gate, not just the helper", () => {
    const result = validateImageUpload("image/jpeg", createTruncatedJpeg({ width: 720, height: 540 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/incomplète|corrompue/i);
    }
  });
});

describe("R2 key generation", () => {
  it("uses the menu namespace, the year, a uuid, and the right extension", () => {
    const key = buildR2Key("webp", new Date("2026-03-04T00:00:00Z"));
    expect(key).toMatch(
      /^menu\/2026\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/,
    );
  });

  it("is unique across calls", () => {
    const keys = new Set(Array.from({ length: 200 }, () => buildR2Key("jpg")));
    expect(keys.size).toBe(200);
  });

  it("maps each format to the documented extension", () => {
    expect(buildR2Key("jpg").endsWith(".jpg")).toBe(true);
    expect(buildR2Key("png").endsWith(".png")).toBe(true);
    expect(buildR2Key("webp").endsWith(".webp")).toBe(true);
  });
});

describe("allow list", () => {
  it("is exactly the three formats named in docs/SECURITY.md", () => {
    expect([...ALLOWED_MIME_TYPES]).toEqual(["image/jpeg", "image/png", "image/webp"]);
  });
});
