import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPROVED_CATEGORIES,
  APPROVED_MENU,
  allApprovedItems,
  FEATURED_ITEM_IDS,
  HOME_PREVIEW_LIMIT,
} from "../../scripts/approved-menu";
import {
  FISH_REFERENCE_EXPLANATION,
  FISH_REFERENCE_IMAGES,
  FISH_REFERENCE_ORDER,
  getFishReferenceImage,
  listFishReferenceImages,
} from "../../src/lib/fish-images";

/**
 * These assert that what reaches the website is exactly what the owner approved, and
 * that no AI fish illustration is ever presented as a photo of a cooked dish.
 */

const PUBLIC_FISH_DIR = join(process.cwd(), "public", "images", "fish-guide");

describe("approved menu transcription", () => {
  it("has the five approved categories in the owner's order", () => {
    expect(APPROVED_CATEGORIES.map((category) => category.nameFr)).toEqual([
      "Nos Entrées",
      "Soupes",
      "Nos Poissons",
      "Desserts",
      "Boissons",
    ]);
  });

  it("has exactly 34 approved dishes", () => {
    expect(allApprovedItems()).toHaveLength(34);
  });

  it("assigns every dish to a known category", () => {
    const known = new Set(APPROVED_CATEGORIES.map((category) => category.id));
    for (const group of APPROVED_MENU) {
      expect(known.has(group.categoryId)).toBe(true);
    }
  });

  it("never repeats a dish id or a dish name", () => {
    const ids = allApprovedItems().map((item) => item.id);
    const names = allApprovedItems().map((item) => item.nameFr);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses only whole-dinar prices above zero", () => {
    for (const item of allApprovedItems()) {
      expect(Number.isInteger(item.priceDa), `${item.nameFr} price must be an integer`).toBe(true);
      expect(item.priceDa).toBeGreaterThan(0);
    }
  });

  /**
   * Prices are the product. A transcription slip here is a customer being quoted the
   * wrong number, so the full approved price list is pinned.
   */
  it("matches the approved prices exactly", () => {
    const prices = Object.fromEntries(allApprovedItems().map((item) => [item.nameFr, item.priceDa]));
    expect(prices).toEqual({
      "Salade d’Aubergines": 250,
      "Salade de Tomate": 250,
      "Salade de Poulpe": 600,
      "Salade de Pomme de Terre": 300,
      Hmis: 300,
      "Salade Variée": 150,
      "Soupe de Poissons": 300,
      "Soupe Turque": 250,
      "Sardines Friture": 500,
      "Sardines Fritures Garnies": 600,
      "Chtitha Sardines": 600,
      "Sepia en Sauce": 1500,
      "Thon Grillé": 1400,
      Rouget: 1200,
      Merlan: 1200,
      Espadon: 1500,
      "Espadon en Sauce": 1500,
      "Chien de Mer": 1500,
      Calamar: 1500,
      Dorade: 1200,
      "Loup de Mer": 1400,
      "Crevettes en Sauce": 1200,
      "Crevettes Grillées": 1500,
      "Plat Varié de Poissons": 2000,
      "Flan Caramel": 100,
      "Flan Café": 100,
      "Salade de Fruits": 200,
      Soda: 50,
      Jus: 50,
      "Eau Minérale PM": 50,
      Canette: 100,
      "Jus de Citron": 600,
      "Jus d’Orange": 600,
      "Cocktail de Fruits": 800,
    });
  });

  it("keeps the typographic apostrophes the owner used", () => {
    // A straight quote would render as "d'Aubergines" on the menu, which is not the
    // approved text.
    const names = allApprovedItems().map((item) => item.nameFr);
    expect(names).toContain("Salade d’Aubergines");
    expect(names).toContain("Jus d’Orange");
  });
});

describe("no invented content", () => {
  /**
   * `description_fr` is nullable precisely so "not written yet" is representable. No
   * description may be seeded, because inventing ingredients is exactly what
   * `docs/CONTENT_POLICY.md` forbids.
   */
  it("defines no descriptions at all", () => {
    // The approved type has no `descriptionFr` field, so this is a structural
    // guarantee; the assertion documents why.
    expect(allApprovedItems().every((item) => !("descriptionFr" in item))).toBe(true);
  });

  it("defines no cooked-dish photograph keys", () => {
    expect(allApprovedItems().every((item) => !("imageKey" in item))).toBe(true);
  });

  it("features no dishes, because the owner has not chosen any", () => {
    expect(FEATURED_ITEM_IDS).toEqual([]);
  });

  it("keeps the home preview small enough to stay a teaser", () => {
    expect(HOME_PREVIEW_LIMIT).toBeGreaterThan(0);
    expect(HOME_PREVIEW_LIMIT).toBeLessThan(allApprovedItems().length);
  });
});

describe("fish reference mapping", () => {
  it("maps exactly the confirmed dishes to a species", () => {
    const mapped = Object.fromEntries(
      allApprovedItems()
        .filter((item) => item.fishReferenceSlug !== undefined)
        .map((item) => [item.nameFr, item.fishReferenceSlug]),
    );
    expect(mapped).toEqual({
      "Sardines Friture": "sardine",
      "Sardines Fritures Garnies": "sardine",
      "Chtitha Sardines": "sardine",
      "Sepia en Sauce": "sepia",
      "Thon Grillé": "thon",
      Rouget: "rouget",
      Merlan: "merlan",
      Espadon: "espadon",
      "Espadon en Sauce": "espadon",
      "Chien de Mer": "chien-de-mer",
      Calamar: "calamar",
      Dorade: "dorade",
      "Loup de Mer": "loup-de-mer",
      "Crevettes en Sauce": "crevette",
      "Crevettes Grillées": "crevette",
    });
  });

  /**
   * A mixed-fish platter showing one species would misstate the dish.
   */
  it("leaves the mixed platter without an illustration", () => {
    const plat = allApprovedItems().find((item) => item.nameFr === "Plat Varié de Poissons");
    expect(plat).toBeDefined();
    expect(plat?.fishReferenceSlug).toBeUndefined();
  });

  it("never references a slug the manifest does not define", () => {
    for (const item of allApprovedItems()) {
      if (item.fishReferenceSlug !== undefined) {
        expect(getFishReferenceImage(item.fishReferenceSlug), item.nameFr).toBeDefined();
      }
    }
  });

  it("covers every species in the menu with a generated image", () => {
    const used = new Set(
      allApprovedItems()
        .map((item) => item.fishReferenceSlug)
        .filter((slug): slug is string => slug !== undefined),
    );
    for (const slug of used) {
      expect(getFishReferenceImage(slug), slug).toBeDefined();
    }
  });
});

describe("fish reference manifest", () => {
  it("carries the one concise page-level explanation", () => {
    /*
     * A visible badge under every dish was replaced by a single short sentence per
     * page. The sentence has to stay short and honest: it says the visuals are
     * illustrative and that the served dish may differ — nothing more.
     */
    expect(FISH_REFERENCE_EXPLANATION).toBe(
      "Visuels des poissons à titre illustratif. Présentation des plats variable.",
    );
    expect(FISH_REFERENCE_EXPLANATION).not.toContain("Illustration IA");
  });

  it("keeps every alt text accurate about what kind of image it is", () => {
    for (const image of Object.values(FISH_REFERENCE_IMAGES)) {
      expect(image.altFr.length).toBeGreaterThan(20);
      // Describes the species and names the kind of image.
      expect(image.altFr).toContain("Illustration de référence");
      // Never lets an illustration masquerade as a photograph of a served dish.
      expect(image.altFr.toLowerCase()).not.toContain("photo");
      expect(image.altFr.toLowerCase()).not.toContain("plat servi");
    }
  });

  it("has a generated file for every manifest entry", () => {
    for (const image of Object.values(FISH_REFERENCE_IMAGES)) {
      // `src` is the public URL, which maps to a file under `public/` on disk.
      const onDisk = join(process.cwd(), "public", image.src.replace(/^\//, ""));
      expect(existsSync(onDisk), image.src).toBe(true);
    }
  });

  it("has no stray generated files that the manifest does not describe", () => {
    const onDisk = readdirSync(PUBLIC_FISH_DIR).filter((file) => file.endsWith(".webp"));
    const declared = Object.values(FISH_REFERENCE_IMAGES).map((image) => image.src.split("/").pop());
    expect(onDisk.sort()).toEqual([...declared].sort());
  });

  it("declares the 4:3 output geometry so layout does not shift on load", () => {
    for (const image of Object.values(FISH_REFERENCE_IMAGES)) {
      expect([image.width, image.height]).toEqual([1200, 900]);
    }
  });

  it("gives every illustration alt text that says what the image is", () => {
    for (const image of Object.values(FISH_REFERENCE_IMAGES)) {
      // A screen-reader user has no other way to learn this is a drawing.
      expect(image.altFr).toMatch(/illustration de référence/i);
    }
  });

  it("orders the guide consistently and lists every entry", () => {
    expect(new Set(FISH_REFERENCE_ORDER).size).toBe(FISH_REFERENCE_ORDER.length);
    for (const slug of FISH_REFERENCE_ORDER) {
      expect(getFishReferenceImage(slug), slug).toBeDefined();
    }
    expect(listFishReferenceImages()).toHaveLength(FISH_REFERENCE_ORDER.length);
  });

  it("returns undefined for an unknown slug instead of throwing", () => {
    expect(getFishReferenceImage("dolphin")).toBeUndefined();
  });

  /**
   * The menu references 11 distinct species; the guide must not quietly omit one.
   */
  it("has an illustration for all 11 processed sources", () => {
    expect(Object.keys(FISH_REFERENCE_IMAGES)).toHaveLength(11);
  });
});
