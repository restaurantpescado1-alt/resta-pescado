import { describe, expect, it } from "vitest";

import {
  MAX_PRICE_DA,
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
