import { describe, expect, it } from "vitest";

import {
  isAdminLoginUrl,
  isMeaningfulTitle,
  isNavigationCancelledPrefetch,
  parseRobotDirectives,
  robotsForbidAllCrawling,
} from "../../scripts/preview-smoke-rules";

describe("robots directive parsing", () => {
  it("accepts the canonical deny-all body", () => {
    expect(robotsForbidAllCrawling("User-Agent: *\nDisallow: /")).toBe(true);
  });

  it("handles CRLF, comments, case and stray whitespace", () => {
    expect(robotsForbidAllCrawling("user-agent:* # all bots\r\ndisallow : / # everything\r\n")).toBe(
      true,
    );
  });

  it("does not mistake a narrower rule for a deny-all", () => {
    expect(robotsForbidAllCrawling("User-Agent: *\nDisallow: /menu\nAllow: /")).toBe(false);
    expect(robotsForbidAllCrawling("User-Agent: *\nDisallow: /gallery")).toBe(false);
  });

  it("rejects an empty or absent Disallow", () => {
    expect(robotsForbidAllCrawling("User-Agent: *\nDisallow:")).toBe(false);
    expect(robotsForbidAllCrawling("User-Agent: *")).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(robotsForbidAllCrawling("")).toBe(false);
    expect(robotsForbidAllCrawling("\n# only a comment\n")).toBe(false);
  });
});

describe("parseRobotDirectives", () => {
  it("keeps directive names lowercase-insensitive and values trimmed", () => {
    const parsed = parseRobotDirectives("USER-AGENT:Googlebot\nDISALLOW: /admin\n");
    expect(parsed).toEqual([
      { directive: "USER-AGENT", value: "Googlebot" },
      { directive: "DISALLOW", value: "/admin" },
    ]);
  });

  it("strips inline comments", () => {
    expect(parseRobotDirectives("Disallow: / # keep it out")).toEqual([
      { directive: "Disallow", value: "/" },
    ]);
  });
});

describe("isAdminLoginUrl", () => {
  it("accepts the login page whatever query follows", () => {
    expect(isAdminLoginUrl("https://preview.example/admin/login")).toBe(true);
    expect(isAdminLoginUrl("https://preview.example/admin/login?redirectTo=%2Fadmin")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAdminLoginUrl("https://preview.example/admin")).toBe(false);
    expect(isAdminLoginUrl("https://preview.example/admin/menu")).toBe(false);
    expect(isAdminLoginUrl("not a url")).toBe(false);
  });
});

describe("isMeaningfulTitle", () => {
  it("accepts real titles, including owner-edited ones", () => {
    expect(isMeaningfulTitle("Le goût de la mer, à Alger.")).toBe(true);
    expect(isMeaningfulTitle("Mer et soleil")).toBe(true);
    expect(isMeaningfulTitle("2026")).toBe(true);
  });

  it("rejects empty, whitespace-only and punctuation-only text", () => {
    expect(isMeaningfulTitle("")).toBe(false);
    expect(isMeaningfulTitle("   ")).toBe(false);
    expect(isMeaningfulTitle("—")).toBe(false);
    expect(isMeaningfulTitle(null)).toBe(false);
    expect(isMeaningfulTitle(undefined)).toBe(false);
  });
});

describe("isNavigationCancelledPrefetch", () => {
  it("ignores only an RSC prefetch aborted by the browser", () => {
    expect(isNavigationCancelledPrefetch("https://x.example/?_rsc=abc", "net::ERR_ABORTED")).toBe(
      true,
    );
    expect(
      isNavigationCancelledPrefetch("https://x.example/menu?_rsc=abc123", "net::ERR_ABORTED"),
    ).toBe(true);
  });

  it("still reports real failures", () => {
    expect(isNavigationCancelledPrefetch("https://x.example/?_rsc=abc", "net::ERR_CONNECTION_REFUSED")).toBe(
      false,
    );
    expect(isNavigationCancelledPrefetch("https://x.example/?_rsc=abc", null)).toBe(false);
    expect(isNavigationCancelledPrefetch("https://x.example/?_rsc=abc", undefined)).toBe(false);
  });

  it("still reports non-prefetch requests that fail", () => {
    expect(
      isNavigationCancelledPrefetch("https://x.example/image.webp", "net::ERR_ABORTED"),
    ).toBe(false);
    expect(isNavigationCancelledPrefetch("https://x.example/style.css", "net::ERR_ABORTED")).toBe(
      false,
    );
    expect(isNavigationCancelledPrefetch("not a url", "net::ERR_ABORTED")).toBe(false);
  });
});