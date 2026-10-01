import { describe, expect, it } from "vitest";

import { ADMIN_RATE_LIMITS, NotOwnerError } from "../../src/lib/admin-access";
import { LOCAL_IP_HEADERS, PRODUCTION_IP_HEADER, trustedIpHeaders } from "../../src/lib/auth-ip";
import { DEFAULT_OWNER_REDIRECT, loginUrlFor, safeRedirectPath } from "../../src/lib/redirects";
import { formatPrice, mediaUrl } from "../../src/lib/format";
import { R2_KEY_PATTERN } from "../../src/lib/validation";

describe("price formatting", () => {
  it("renders whole dinars with the DA suffix", () => {
    expect(formatPrice(900)).toContain("900");
    expect(formatPrice(900)).toContain("DA");
  });

  it("groups thousands", () => {
    expect(formatPrice(12_500).replace(/\s| | /g, "")).toBe("12500DA");
  });
});

describe("media URL", () => {
  it("encodes each key segment and preserves the slashes", () => {
    const key = "menu/2026/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg";
    expect(mediaUrl(key)).toBe(`/api/media/menu/2026/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.jpg`);
  });

  it("escapes a segment that needs it", () => {
    expect(mediaUrl("menu/2026/a b.jpg")).toBe("/api/media/menu/2026/a%20b.jpg");
  });

  it("produces a URL the media route accepts", () => {
    const key = buildKey();
    expect(mediaUrl(key)).toMatch(/^\/api\/media\/menu\/\d{4}\/[0-9a-f-]{36}\.(jpg|png|webp)$/);
    expect(R2_KEY_PATTERN.test(key)).toBe(true);
  });
});

function buildKey(): string {
  return `menu/2026/${crypto.randomUUID()}.jpg`;
}

describe("NotOwnerError", () => {
  it("is distinguishable so actions can fail without redirecting", () => {
    const error = new NotOwnerError();
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("NOT_OWNER");
  });
});

describe("redirect sanitising", () => {
  it("keeps a same-site absolute path", () => {
    expect(safeRedirectPath("/admin/menu")).toBe("/admin/menu");
    expect(safeRedirectPath("/admin/menu?tab=drafts")).toBe("/admin/menu?tab=drafts");
  });

  it("falls back for an off-site target", () => {
    // These are the shapes that turn a redirect into an open redirect.
    for (const hostile of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "/\\evil.example/steal",
      "http://evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeRedirectPath(hostile), `${hostile} must be rejected`).toBe(DEFAULT_OWNER_REDIRECT);
    }
  });

  it("falls back for missing or non-string input", () => {
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_OWNER_REDIRECT);
    expect(safeRedirectPath("")).toBe(DEFAULT_OWNER_REDIRECT);
    expect(safeRedirectPath(["/admin", "/admin/menu"])).toBe(DEFAULT_OWNER_REDIRECT);
  });

  it("encodes the destination into the login URL", () => {
    expect(loginUrlFor("/admin/menu")).toBe("/admin/login?redirectTo=%2Fadmin%2Fmenu");
  });
});

describe("admin rate limits", () => {
  it("limits image replacement more tightly than price updates", () => {
    const price = ADMIN_RATE_LIMITS.updateDishPrice;
    const image = ADMIN_RATE_LIMITS.replaceDishImage;
    expect(price).toBeDefined();
    expect(image).toBeDefined();
    expect(image!.limit).toBeLessThan(price!.limit);
  });
});

describe("trusted client IP headers", () => {
  const production = { NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv;
  const local = { NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv;

  it("trusts only CF-Connecting-IP in production", () => {
    expect(trustedIpHeaders(production)).toEqual([PRODUCTION_IP_HEADER]);
  });

  it("never trusts X-Forwarded-For or X-Real-IP in production", () => {
    // These are attacker-controlled unless something upstream guarantees them, so
    // trusting them in production would let anyone sidestep a rate limit by
    // setting a header.
    expect(trustedIpHeaders(production)).not.toContain("X-Forwarded-For");
    expect(trustedIpHeaders(production)).not.toContain("X-Real-IP");
  });

  it("trusts the local proxy headers outside production", () => {
    // Local dev reaches the app through a dev server, so `127.0.0.1` alone would
    // put every developer on one shared rate-limit bucket.
    expect(trustedIpHeaders(local)).toEqual([...LOCAL_IP_HEADERS]);
  });

  it("defaults to the local headers when NODE_ENV is unset", () => {
    expect(trustedIpHeaders({} as NodeJS.ProcessEnv)).toEqual([...LOCAL_IP_HEADERS]);
  });
});
