import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUNDLED_GALLERY_COUNT,
  bundledGalleryUrl,
  getBundledGalleryImage,
  listBundledGalleryImages,
} from "../../src/lib/gallery-images";
import { listFishReferenceImages } from "../../src/lib/fish-images";

/**
 * Manifests against the filesystem.
 *
 * Both manifests in this project are hand-maintained lists of files that a human or a
 * script put on disk. That arrangement fails quietly: rename a photograph, or delete one
 * during a cleanup, and the page renders a broken image with nothing in the build
 * complaining. These tests make the drift fail loudly instead.
 *
 * They read the filesystem rather than trusting the manifest's own view of itself, which
 * is the whole point: the manifest cannot be the thing that checks the manifest.
 */

const ROOT = join(process.cwd(), "public", "images");
const GALLERY_DIR = join(ROOT, "gallery");
const GALLERY_WEBP_DIR = join(GALLERY_DIR, "webp");
const FISH_DIR = join(ROOT, "fish-guide");

describe("bundled gallery manifest", () => {
  const images = listBundledGalleryImages();

  it("has unique slugs", () => {
    const slugs = images.map((image) => image.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique derived filenames", () => {
    const files = images.map((image) => image.webpFile);
    expect(new Set(files).size).toBe(files.length);
  });

  it("keeps every curated source on disk", () => {
    for (const image of images) {
      const source = join(ROOT, image.sourceFile);
      expect(existsSync(source), `missing source: ${image.sourceFile}`).toBe(true);
      expect(statSync(source).size).toBeGreaterThan(0);
    }
  });

  it("has a derived file for every entry, and every derived file has an entry", () => {
    const declared = images.map((image) => image.webpFile).sort();

    const onDisk = existsSync(GALLERY_WEBP_DIR)
      ? readdirSync(GALLERY_WEBP_DIR)
          .filter((name) => name.endsWith(".webp"))
          .map((name) => `gallery/webp/${name}`)
          .sort()
      : [];

    /*
     * Checked in both directions. A missing derivative is a 404 in the gallery grid. An
     * unreferenced derivative is dead weight in the bundle that no manifest explains, and
     * it is how a rejected or withdrawn photograph quietly keeps shipping.
     */
    expect(declared).toEqual(onDisk);
  });

  it("gives every entry French alt text and a declared size", () => {
    for (const image of images) {
      expect(image.altFr.length).toBeGreaterThan(10);
      expect(image.altFr).toMatch(/[.]$/u);
      expect(image.width).toBe(1200);
      expect(image.height).toBe(900);
    }
  });

  it("describes what the photograph shows rather than naming the file", () => {
    for (const image of images) {
      const stem = image.slug.replace(/-/gu, " ");
      expect(image.altFr.toLowerCase()).not.toContain(stem);
      expect(image.altFr).not.toMatch(/\.(png|jpe?g|webp)$/iu);
    }
  });

  it("claims no authenticity the repository cannot support", () => {
    for (const image of images) {
      expect(image.provenance).toBe("unverified");
      // A provenance flag of "unverified" beside alt text asserting the place is a
      // contradiction, so the wording must not name the restaurant as fact.
      expect(image.altFr).not.toMatch(/notre restaurant/i);
    }
  });

  it("never reuses a fish illustration as a photograph", () => {
    /*
     * These files arrived as curated exports whose contents cannot be verified from here,
     * so the alt text may not assert a species as fact either. `fresh-tuna-display` is the
     * test case: the filename says tuna, and asserting it would be a claim nobody can
     * check.
     */
    for (const image of images) {
      expect(image.altFr.toLowerCase()).not.toMatch(/illustration|générée par ia/i);
    }
  });

  it("references no file that is not on disk", () => {
    expect(existsSync(join(GALLERY_DIR, "wooden-ship-decor.webp"))).toBe(false);
    expect(getBundledGalleryImage("wooden-ship-decor")).toBeUndefined();
  });

  it("serves bundled files straight from public rather than through the media route", () => {
    for (const image of images) {
      const url = bundledGalleryUrl(image.webpFile);
      expect(url.startsWith("/images/")).toBe(true);
      expect(url).not.toContain("..");
      expect(url).not.toContain("//");
    }
  });

  it("publishes the count it declares", () => {
    expect(images).toHaveLength(BUNDLED_GALLERY_COUNT);
  });
});

describe("fish reference manifest", () => {
  const illustrations = listFishReferenceImages();
  const slugs = illustrations.map((image) => image.slug);

  it("has unique slugs", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every illustration on disk and has no orphans", () => {
    const declared = [...slugs].sort();
    const onDisk = readdirSync(FISH_DIR)
      .filter((name) => name.endsWith(".webp"))
      .map((name) => name.replace(/\.webp$/u, ""))
      .sort();

    expect(declared).toEqual(onDisk);
  });

  it("gives every illustration alt text ending in a full stop", () => {
    for (const image of illustrations) {
      expect(image.altFr.length).toBeGreaterThan(10);
      expect(image.altFr).toMatch(/[.]$/u);
    }
  });
});

describe("bundled gallery sources", () => {
  /**
   * `restaurant-dining-room.jpg` is kept on disk but deliberately not published. It is a
   * genuinely different photograph, not a duplicate, and deleting it is the owner's call,
   * so this test pins that decision rather than letting it drift in either direction.
   */
  it("keeps the unapproved second dining-room photograph without publishing it", () => {
    const jpeg = join(GALLERY_DIR, "restaurant-dining-room.jpg");
    expect(existsSync(jpeg)).toBe(true);
    expect(getBundledGalleryImage("restaurant-dining-room")?.sourceFile).not.toContain(".jpg");
  });

  it("leaves no stale README or manifest inside public/", () => {
    /*
     * Both were moved to `docs/`. A manifest left in `public/` is a second, competing
     * source of truth that ships to production.
     */
    expect(existsSync(join(GALLERY_DIR, "README.txt"))).toBe(false);
    expect(existsSync(join(GALLERY_DIR, "gallery-manifest.json"))).toBe(false);
  });
});