import { describe, expect, it } from "vitest";

import { isIndexable, robotsFile, robotsMetadata } from "../../src/lib/search-indexing";

describe("search indexing by deployment mode", () => {
  it("indexes only production", () => {
    expect(isIndexable("production")).toBe(true);
    expect(isIndexable("preview")).toBe(false);
    expect(isIndexable("local")).toBe(false);
  });

  it("lets crawlers into production and only production", () => {
    expect(robotsFile("production")).toEqual({ rules: { userAgent: "*", allow: "/" } });
    expect(robotsFile("preview")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    expect(robotsFile("local")).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });

  it("sends an explicit robots tag from every page", () => {
    expect(robotsMetadata("production")).toEqual({ index: true, follow: true });
    expect(robotsMetadata("preview")).toEqual({ index: false, follow: false });
    expect(robotsMetadata("local")).toEqual({ index: false, follow: false });
  });
});
