import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  getCategoryCover,
  listCategoryCovers,
} from "../../src/lib/category-images";

/**
 * Category covers against the filesystem.
 *
 * Like the gallery and fish manifests, this is a hand-maintained list of files that a
 * human put on disk, so the failure mode is a broken tile with nothing in the build
 * complaining. These checks read the filesystem rather than trusting the manifest.
 */

const ROOT = join(process.cwd(), "public", "images");

describe("category cover manifest", () => {
  const covers = listCategoryCovers();

  it("covers exactly the categories the gallery does not", () => {
    // Entrées and Poissons keep their curated gallery photographs, so they must not
    // appear here or the two sources would compete for the same tile.
    expect(covers.map((cover) => cover.slug).sort()).toEqual(["boissons", "desserts", "soupes"]);
  });

  it("has unique slugs and served paths", () => {
    const slugs = covers.map((cover) => cover.slug);
    const paths = covers.map((cover) => cover.src);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps every cover on disk and non-empty", () => {
    for (const cover of covers) {
      const src = join(ROOT, "categories", `${cover.slug}.webp`);
      expect(existsSync(src), `missing cover: ${cover.slug}`).toBe(true);
      expect(statSync(src).size).toBeGreaterThan(0);
    }
  });

  it("serves from public/ with the declared geometry", () => {
    for (const cover of covers) {
      expect(cover.src).toBe(`/images/categories/${cover.slug}.webp`);
      expect(cover.src).not.toContain("..");
      expect(cover.width).toBe(1448);
      expect(cover.height).toBe(1086);
    }
  });

  it("gives every cover French alt text that is a sentence, not a filename", () => {
    for (const cover of covers) {
      expect(cover.altFr.length).toBeGreaterThan(10);
      expect(cover.altFr).toMatch(/[.]$/u);
      expect(cover.altFr).not.toMatch(/\.(png|jpe?g|webp)$/iu);
      // Names the category in words, but is never the bare slug.
      expect(cover.altFr.toLowerCase()).not.toBe(cover.slug);
    }
  });

  it("returns undefined for a slug with no cover", () => {
    expect(getCategoryCover("entrees")).toBeUndefined();
    expect(getCategoryCover("poissons")).toBeUndefined();
    expect(getCategoryCover("soupes")?.slug).toBe("soupes");
  });
});
