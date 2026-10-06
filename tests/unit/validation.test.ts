import { describe, expect, it } from "vitest";

import { FISH_REFERENCE_ORDER } from "../../src/lib/fish-images";
import {
  MAX_ORDERABLE_ITEMS,
  MAX_PRICE_DA,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  changePasswordInputSchema,
  createCategoryInputSchema,
  createMenuItemInputSchema,
  deleteCategoryInputSchema,
  optionalText,
  reorderBundledGalleryInputSchema,
  reorderCategoriesInputSchema,
  reorderMenuItemsInputSchema,
  siteSettingsInputSchema,
  updateBundledImageInputSchema,
  updateGalleryImageInputSchema,
  updateMenuItemDetailsInputSchema,
  updatePriceInputSchema,
  replaceImageInputSchema,
} from "../../src/lib/validation";

/**
 * Price rules. The negative, decimal, and zero cases are the ones Phase 1
 * explicitly calls out, plus the boundaries either side of the accepted range.
 */
describe("price validation", () => {
  it("accepts a positive whole number of dinars", () => {
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: 1 }).success).toBe(true);
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: 950 }).success).toBe(true);
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: MAX_PRICE_DA }).success).toBe(
      true,
    );
  });

  it("rejects a negative price", () => {
    const result = updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero", () => {
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: 0 }).success).toBe(false);
  });

  it("rejects a decimal price", () => {
    // Dinars have no centimes, so 950.5 is not a price that can be stored.
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: 950.5 }).success).toBe(false);
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: 0.5 }).success).toBe(false);
  });

  it("rejects a non-numeric or NaN price", () => {
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: Number.NaN }).success).toBe(
      false,
    );
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: Infinity }).success).toBe(
      false,
    );
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: "950" }).success).toBe(false);
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: null }).success).toBe(false);
  });

  it("rejects a price above the ceiling", () => {
    expect(updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: MAX_PRICE_DA + 1 }).success).toBe(
      false,
    );
  });

  it("requires a menu item id", () => {
    expect(updatePriceInputSchema.safeParse({ menuItemId: "", priceDa: 900 }).success).toBe(false);
    expect(updatePriceInputSchema.safeParse({ priceDa: 900 }).success).toBe(false);
  });

  it("produces a French message for each rejection", () => {
    const negative = updatePriceInputSchema.safeParse({ menuItemId: "a", priceDa: -1 });
    const message = negative.success ? "" : (negative.error.issues[0]?.message ?? "");
    expect(message).toContain("supérieur à zéro");
  });
});

describe("R2 key validation", () => {
  it("accepts a generated-looking key", () => {
    const key = "menu/2026/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg";
    expect(replaceImageInputSchema.safeParse({ menuItemId: "a", imageKey: key }).success).toBe(true);
  });

  it("rejects a key outside the menu namespace", () => {
    expect(
      replaceImageInputSchema.safeParse({
        menuItemId: "a",
        imageKey: "gallery/2026/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg",
      }).success,
    ).toBe(false);
  });

  it("rejects a key that is not a uuid", () => {
    expect(
      replaceImageInputSchema.safeParse({ menuItemId: "a", imageKey: "menu/2026/not-a-uuid.jpg" })
        .success,
    ).toBe(false);
  });

  it("rejects an unexpected extension", () => {
    expect(
      replaceImageInputSchema.safeParse({
        menuItemId: "a",
        imageKey: "menu/2026/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.svg",
      }).success,
    ).toBe(false);
  });

  it("rejects a traversal attempt", () => {
    expect(
      replaceImageInputSchema.safeParse({
        menuItemId: "a",
        imageKey: "menu/2026/../../secrets.jpg",
      }).success,
    ).toBe(false);
  });
});

/**
 * Phase 3 input rules.
 *
 * These matter as much as the repository guards: they are the layer that decides what the owner
 * is allowed to save at all, and the messages are what the owner sees when they get it wrong.
 */
describe("optional owner text", () => {
  it("keeps a blank field blank rather than storing an empty string", () => {
    /*
     * `descriptionFr` and `captionFr` are nullable to mean "the owner has not written this".
     * Storing `""` instead would make that indistinguishable from a description that reads as
     * nothing, and `docs/CONTENT_POLICY.md` forbids inventing copy to fill the gap.
     */
    expect(optionalText(50, "La description").parse("")).toBeNull();
    expect(optionalText(50, "La description").parse("   ")).toBeNull();
  });

it("trims what the owner typed", () => {
    expect(optionalText(50, "La description").parse("  Salam ")).toBe("Salam");
  });

  it("accepts a field the form did not send at all", () => {
    // `FormData.get` returns null for an absent field, which is not the same as a bad value.
    expect(optionalText(50, "La description").parse(null)).toBeNull();
  });

  it("refuses text that is too long instead of silently dropping it", () => {
    /*
     * The behaviour a `.catch(null)` would have hidden: the owner types a long description, the
     * save reports success, and their text is gone with no warning. Rejecting keeps the form
     * open and shows the limit.
     */
    const schema = optionalText(10, "La description");
    const result = schema.safeParse("x".repeat(11));
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0]?.message).toContain("10");
  });
});

describe("dish input", () => {
  const valid = {
    categoryId: "cat-1",
    nameFr: "Dorade grillée",
    descriptionFr: "Avec salade et citron.",
    priceDa: 1200,
    fishReferenceSlug: "dorade",
  };

  it("accepts a dish the owner filled in completely", () => {
    expect(createMenuItemInputSchema.safeParse(valid).success).toBe(true);
  });

  it("treats a dish without a description or illustration as valid", () => {
    const bare = createMenuItemInputSchema.safeParse({
      categoryId: "cat-1",
      nameFr: "Sardines",
      descriptionFr: "",
      priceDa: 600,
      fishReferenceSlug: null,
    });
    expect(bare.success).toBe(true);
    expect(bare.success && bare.data.descriptionFr).toBeNull();
  });

  it("rejects a dish with no name", () => {
    expect(createMenuItemInputSchema.safeParse({ ...valid, nameFr: "   " }).success).toBe(false);
  });

  it("rejects a dish with no category", () => {
    expect(createMenuItemInputSchema.safeParse({ ...valid, categoryId: "" }).success).toBe(false);
  });

  it("rejects a species that has no illustration", () => {
    // An unknown slug would render a broken image on the public card.
    expect(createMenuItemInputSchema.safeParse({ ...valid, fishReferenceSlug: "requin" }).success).toBe(
      false,
    );
  });

  it("accepts every species the illustration guide actually has", () => {
    /*
     * Derived from the manifest rather than a copied list, so this fails loudly if the two ever
     * drift: adding a fish to the guide must not make it unsaveable.
     */
    for (const slug of FISH_REFERENCE_ORDER) {
      expect(createMenuItemInputSchema.safeParse({ ...valid, fishReferenceSlug: slug }).success).toBe(true);
    }
  });

  it("requires the version the form was looking at", () => {
    const withoutVersion = updateMenuItemDetailsInputSchema.safeParse({
      menuItemId: "item-1",
      categoryId: "cat-1",
      nameFr: "Dorade grillée",
      descriptionFr: null,
      priceDa: 1200,
      fishReferenceSlug: null,
    });
    expect(withoutVersion.success).toBe(false);
  });

  it("accepts a version sent as a form string", () => {
    const fromForm = updateMenuItemDetailsInputSchema.safeParse({
      menuItemId: "item-1",
      expectedVersion: "3",
      categoryId: "cat-1",
      nameFr: "Dorade grillée",
      descriptionFr: null,
      priceDa: 1200,
      fishReferenceSlug: null,
    });
    expect(fromForm.success).toBe(true);
    expect(fromForm.success && fromForm.data.expectedVersion).toBe(3);
  });

  it("refuses a version that is not a whole positive number", () => {
    const base = {
      menuItemId: "item-1",
      categoryId: "cat-1",
      nameFr: "Dorade grillée",
      descriptionFr: null,
      priceDa: 1200,
      fishReferenceSlug: null,
    };
    for (const expectedVersion of [0, -1, 1.5, "abc", null]) {
      expect(updateMenuItemDetailsInputSchema.safeParse({ ...base, expectedVersion }).success).toBe(false);
    }
  });

it("keeps visibility out of the details save, so it cannot be cleared by accident", () => {
    /*
     * Showing and hiding a dish has its own action with its own message. Letting a stray
     * `isVisible` ride along in a details form would mean a checkbox nobody was looking at
     * could hide a dish the owner was only renaming.
     */
    const withFlag = updateMenuItemDetailsInputSchema.parse({
      menuItemId: "item-1",
      expectedVersion: 1,
      categoryId: "cat-1",
      nameFr: "Dorade",
      descriptionFr: null,
      priceDa: 1200,
      fishReferenceSlug: null,
      isVisible: false,
    });
    expect(withFlag).not.toHaveProperty("isVisible");
  });
});

describe("category input", () => {
  it("accepts an accented name and folds it in the repository, not here", () => {
    // The slug is derived from the name after validation, so this only has to accept the name.
    expect(createCategoryInputSchema.safeParse({ nameFr: "Crustacés" }).success).toBe(true);
  });

  it("rejects a blank category name", () => {
    expect(createCategoryInputSchema.safeParse({ nameFr: " " }).success).toBe(false);
    expect(createCategoryInputSchema.safeParse({}).success).toBe(false);
  });

  it("requires a version to delete a category", () => {
    expect(deleteCategoryInputSchema.safeParse({ categoryId: "cat-1", expectedVersion: 1 }).success).toBe(
      true,
    );
    expect(deleteCategoryInputSchema.safeParse({ categoryId: "cat-1" }).success).toBe(false);
  });
});

describe("reorder input", () => {
  it("accepts a whole new order", () => {
    expect(
      reorderMenuItemsInputSchema.safeParse({ categoryId: "cat-1", itemIds: ["b", "a", "c"] }).success,
    ).toBe(true);
    expect(reorderCategoriesInputSchema.safeParse({ categoryIds: ["cat-2", "cat-1"] }).success).toBe(true);
    expect(reorderBundledGalleryInputSchema.safeParse({ slugs: ["sardine", "dorade"] }).success).toBe(true);
  });

  it("refuses an order containing the same dish twice", () => {
    /*
     * A duplicate would make the resulting order ambiguous, and the symptom would only show up
     * as a row-count mismatch much later. Refusing it here gives the owner a real message.
     */
    const result = reorderMenuItemsInputSchema.safeParse({
      categoryId: "cat-1",
      itemIds: ["a", "a"],
    });
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0]?.message).toContain("deux fois");
  });

  it("refuses an empty order", () => {
    // Submitting nothing would mean "make every dish disappear from the category".
    expect(reorderMenuItemsInputSchema.safeParse({ categoryId: "cat-1", itemIds: [] }).success).toBe(false);
    expect(reorderCategoriesInputSchema.safeParse({ categoryIds: [] }).success).toBe(false);
  });

  it("bounds the list so a malformed payload cannot become a huge statement", () => {
    const tooMany = Array.from({ length: MAX_ORDERABLE_ITEMS + 1 }, (_, index) => `item-${index}`);
    expect(reorderMenuItemsInputSchema.safeParse({ categoryId: "cat-1", itemIds: tooMany }).success).toBe(
      false,
    );
  });
});

describe("site settings input", () => {
  const complete = {
    expectedVersion: 1,
    restaurantNameFr: "Resta Pescado",
    phoneFr: "0540559967",
    addressFr: null,
    mapsUrl: "https://maps.app.goo.gl/n3cMmMpeXeLDsQtY6",
    hoursFr: "Ouvert tous les jours ouvrables de 11h15 à 15h15. Fermé le vendredi.",
    familyNoteFr: null,
    heroTitleFr: null,
    heroSubtitleFr: null,
    deliveryEnabled: true,
    deliveryZonesTextFr: null,
    deliveryFeeTextFr: null,
    deliveryMinimumOrderTextFr: null,
    deliveryHoursFr: null,
    pickupTextFr: null,
  };

  it("accepts the restaurant's own confirmed values", () => {
    expect(siteSettingsInputSchema.safeParse(complete).success).toBe(true);
  });

  it("accepts a blank phone number, because the owner may have none to publish", () => {
    const blank = siteSettingsInputSchema.safeParse({ ...complete, phoneFr: "" });
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.phoneFr).toBeNull();
  });

  it("accepts a blank address rather than a placeholder", () => {
    // The address is deliberately empty until the owner confirms it.
    const blank = siteSettingsInputSchema.safeParse({ ...complete, addressFr: "" });
    expect(blank.success && blank.data.addressFr).toBeNull();
  });

  it("refuses a links that is not http or https", () => {
    // A `javascript:` URL here would end up in an href on the public site.
    for (const mapsUrl of ["javascript:alert(1)", "data:text/html,x", "maps.app.goo.gl/abc"]) {
      expect(siteSettingsInputSchema.safeParse({ ...complete, mapsUrl }).success).toBe(false);
    }
  });

  it("refuses a phone number with letters in it", () => {
    expect(siteSettingsInputSchema.safeParse({ ...complete, phoneFr: "appelez-moi" }).success).toBe(false);
  });

  it("refuses a save with no version", () => {
    const { expectedVersion: _expectedVersion, ...noVersion } = complete;
    expect(siteSettingsInputSchema.safeParse(noVersion).success).toBe(false);
  });

  it("refuses to guess delivery settings from a blank form", () => {
    const withoutFlag = siteSettingsInputSchema.safeParse({ ...complete, deliveryEnabled: undefined });
    expect(withoutFlag.success).toBe(false);
  });
});

describe("gallery input", () => {
  it("requires a description for every photograph", () => {
    // The one place the dashboard refuses silence, because an undescribed image is unusable to
    // a screen-reader visitor.
    expect(
      updateBundledImageInputSchema.safeParse({
        slug: "sardine",
        expectedVersion: 1,
        altTextFr: "Un poisson servi dans une assiette.",
        captionFr: null,
        isVisible: true,
      }).success,
    ).toBe(true);
    expect(
      updateBundledImageInputSchema.safeParse({
        slug: "sardine",
        expectedVersion: 1,
        altTextFr: "  ",
        captionFr: null,
        isVisible: true,
      }).success,
    ).toBe(false);
  });

  it("keeps a blank caption blank", () => {
    const blank = updateGalleryImageInputSchema.safeParse({
      galleryImageId: "image-1",
      expectedVersion: 2,
      altTextFr: "Le comptoir.",
      captionFr: "",
      isVisible: false,
    });
    expect(blank.success).toBe(true);
    expect(blank.success && blank.data.captionFr).toBeNull();
  });
});

describe("password change input", () => {
  it("accepts a new password at Better Auth's minimum length", () => {
    const input = {
      currentPassword: "ancien-mot-de-passe",
      newPassword: "x".repeat(MIN_PASSWORD_LENGTH),
    };
    expect(changePasswordInputSchema.safeParse(input).success).toBe(true);
  });

  it("refuses a shorter new password with the length in the message", () => {
    const result = changePasswordInputSchema.safeParse({
      currentPassword: "ancien-mot-de-passe",
      newPassword: "x".repeat(MIN_PASSWORD_LENGTH - 1),
    });
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0]?.message).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("refuses a password longer than Better Auth accepts", () => {
    expect(
      changePasswordInputSchema.safeParse({
        currentPassword: "ancien-mot-de-passe",
        newPassword: "x".repeat(MAX_PASSWORD_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("refuses a new password with a leading or trailing space", () => {
    // Trimmed by an intermediary at one end or the other, and then not the password the owner
    // thinks they set.
    expect(
      changePasswordInputSchema.safeParse({
        currentPassword: "ancien-mot-de-passe",
        newPassword: ` ${"x".repeat(MIN_PASSWORD_LENGTH)}`,
      }).success,
    ).toBe(false);
  });

  it("requires the current password, so an open session cannot take the account over", () => {
    expect(
      changePasswordInputSchema.safeParse({ newPassword: "x".repeat(MIN_PASSWORD_LENGTH) }).success,
    ).toBe(false);
  });
});
