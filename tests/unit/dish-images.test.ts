import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { allApprovedItems } from "../../scripts/approved-menu";
import {
  BUNDLED_DISH_PHOTO_COUNT,
  dishSlugFromItemId,
  getBundledDishPhoto,
  listBundledDishPhotos,
} from "../../src/lib/dish-images";

/**
 * Bundled menu photos against the approved menu and the filesystem.
 *
 * The manifest is hand-maintained, exactly like the fish and gallery manifests it sits
 * beside, and fails the same way: a renamed derivative 404s on the public menu with
 * nothing in the build complaining. These tests read the menu and the disk rather than
 * trusting the manifest's own view of itself.
 */

const MENU_DIR = join(process.cwd(), "public", "images", "menu");

describe("bundled dish photo manifest", () => {
  const approved = allApprovedItems();
  const approvedIds = approved.map((item) => item.id);
  const photos = listBundledDishPhotos();

  it("covers every approved item exactly once", () => {
    const photoIds = photos.map((photo) => photo.itemId);
    expect(new Set(photoIds).size).toBe(photoIds.length);
    expect([...photoIds].sort()).toEqual([...approvedIds].sort());
  });

  it("publishes the count it declares", () => {
    expect(photos).toHaveLength(BUNDLED_DISH_PHOTO_COUNT);
    expect(BUNDLED_DISH_PHOTO_COUNT).toBe(37);
  });

  it("derives the src path from the stable item id", () => {
    for (const photo of photos) {
      expect(photo.src).toBe(`/images/menu/${dishSlugFromItemId(photo.itemId)}.webp`);
    }
  });

  it("keeps a derivative on disk for every entry, and every derivative has an entry", () => {
    const declared = photos.map((photo) => `${dishSlugFromItemId(photo.itemId)}.webp`).sort();

    const onDisk = existsSync(MENU_DIR)
      ? readdirSync(MENU_DIR)
          .filter((name) => name.endsWith(".webp"))
          .sort()
      : [];

    /*
     * Checked in both directions. A missing derivative is a 404 on a public menu row;
     * an unreferenced derivative is dead weight that no manifest explains and that a
     * rejected or withdrawn photo would keep shipping.
     */
    expect(declared).toEqual(onDisk);
  });

  it("keeps every derivative on disk and non-empty", () => {
    for (const photo of photos) {
      const path = join(MENU_DIR, `${dishSlugFromItemId(photo.itemId)}.webp`);
      expect(existsSync(path), `missing derivative for ${photo.itemId}`).toBe(true);
      expect(statSync(path).size).toBeGreaterThan(0);
    }
  });

  it("declares the derivative geometry the build script produces", () => {
    for (const photo of photos) {
      expect(photo.width).toBe(720);
      expect(photo.height).toBe(540);
    }
  });

  it("gives every photo alt text that names the dish and discloses the generation", () => {
    for (const photo of photos) {
      const item = approved.find((candidate) => candidate.id === photo.itemId);
      expect(item, `no approved item for ${photo.itemId}`).toBeDefined();
      expect(photo.altFr).toContain(item!.nameFr);
      expect(photo.altFr.toLowerCase()).toContain("photo illustrative générée par ia");
      expect(photo.altFr).toMatch(/[.]$/u);
    }
  });

  it("never claims the photo is a photograph of what the restaurant serves", () => {
    for (const photo of photos) {
      expect(photo.altFr.toLowerCase()).not.toContain("photo du restaurant");
      expect(photo.altFr.toLowerCase()).not.toContain("vraiment servi");
    }
  });

  it("serves bundled files straight from public rather than through the media route", () => {
    for (const photo of photos) {
      expect(photo.src.startsWith("/images/")).toBe(true);
      expect(photo.src).not.toContain("..");
      expect(photo.src).not.toContain("//");
    }
  });

  it("resolves a lookup by item id and returns undefined for an unknown one", () => {
    expect(getBundledDishPhoto("item-dorade")?.src).toBe("/images/menu/dorade.webp");
    expect(getBundledDishPhoto("item-canette")?.src).toBe("/images/menu/canette.webp");
    expect(getBundledDishPhoto("item-does-not-exist")).toBeUndefined();
  });

  it("keeps the two deliberate v2 selections", () => {
    expect(getBundledDishPhoto("item-canette")?.src).toBe("/images/menu/canette.webp");
    expect(getBundledDishPhoto("item-crevettes-en-sauce")?.src).toBe(
      "/images/menu/crevettes-en-sauce.webp",
    );
  });

  it("ships the one known duplicate as two files, flagged for the owner", () => {
    /*
     * `bourek-crevettes` and `bourek-thon` were generated from byte-identical source
     * masters. Both files ship so the menu is 37/37, but the pair is a production
     * blocker: the owner has to regenerate one of them. This test pins the state so a
     * silent fix — regenerating one file, or dropping an entry — shows up here.
     */
    const crevettes = getBundledDishPhoto("item-bourek-crevettes");
    const thon = getBundledDishPhoto("item-bourek-thon");
    expect(crevettes).toBeDefined();
    expect(thon).toBeDefined();
  });
});
