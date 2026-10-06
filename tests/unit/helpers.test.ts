import { describe, expect, it } from "vitest";

import { ADMIN_RATE_LIMITS, NotOwnerError } from "../../src/lib/admin-access";
import { LOCAL_IP_HEADERS, PRODUCTION_IP_HEADER, resolveDeploymentMode, trustedIpHeaders } from "../../src/lib/auth-ip";
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

describe("deployment mode", () => {
  const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;

  it("reads the mode from the Wrangler var when it is set", () => {
    expect(resolveDeploymentMode(env({ DEPLOYMENT_MODE: "preview" }))).toBe("preview");
    expect(resolveDeploymentMode(env({ DEPLOYMENT_MODE: "local" }))).toBe("local");
    expect(resolveDeploymentMode(env({ DEPLOYMENT_MODE: "production" }))).toBe("production");
  });

  it("treats an unrecognised mode as production rather than local", () => {
    // A typo such as `DEPLOYMENT_MODE=lcal` must not silently relax the policy.
    expect(resolveDeploymentMode(env({ DEPLOYMENT_MODE: "lcal" }))).toBe("production");
    expect(resolveDeploymentMode(env({ DEPLOYMENT_MODE: "" }))).toBe("production");
  });

  it("falls back to NODE_ENV only when the Wrangler var is absent", () => {
    expect(resolveDeploymentMode(env({ NODE_ENV: "development" }))).toBe("local");
    expect(resolveDeploymentMode(env({ NODE_ENV: "production" }))).toBe("production");
  });

  it("fails closed when nothing is set", () => {
    // The Worker leaves `NODE_ENV` undefined. Selecting the local headers here
    // is what made the production rate limit spoofable.
    expect(resolveDeploymentMode(env({}))).toBe("production");
  });
});

describe("trusted client IP headers", () => {
  const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;
  const production = env({ DEPLOYMENT_MODE: "production" });
  const preview = env({ DEPLOYMENT_MODE: "preview" });
  const local = env({ DEPLOYMENT_MODE: "local" });

  it("trusts only CF-Connecting-IP in production", () => {
    expect(trustedIpHeaders(production)).toEqual([PRODUCTION_IP_HEADER]);
  });

  it("trusts only CF-Connecting-IP in preview, which is also behind Cloudflare", () => {
    expect(trustedIpHeaders(preview)).toEqual([PRODUCTION_IP_HEADER]);
  });

  it("never trusts X-Forwarded-For or X-Real-IP outside local mode", () => {
    // These are attacker-controlled unless something upstream guarantees them, so
    // trusting them in production would let anyone sidestep a rate limit by
    // setting a header.
    for (const mode of [production, preview, env({}), env({ NODE_ENV: "production" })]) {
      expect(trustedIpHeaders(mode)).toEqual([PRODUCTION_IP_HEADER]);
    }
  });

  it("trusts the local proxy headers in local mode", () => {
    expect(trustedIpHeaders(local)).toEqual([...LOCAL_IP_HEADERS, PRODUCTION_IP_HEADER]);
  });

  it("still resolves an address in local mode when no proxy header is present", () => {
    // Better Auth falls back to one shared bucket when no trusted header
    // resolves, and miniflare always sets CF-Connecting-IP even though nothing
    // sets X-Forwarded-For.
    expect(trustedIpHeaders(local)).toContain(PRODUCTION_IP_HEADER);
    expect(trustedIpHeaders(local).at(-1)).toBe(PRODUCTION_IP_HEADER);
  });

  it("keeps local headers available to next dev, which has no Wrangler vars", () => {
    expect(trustedIpHeaders(env({ NODE_ENV: "development" }))).toEqual([
      ...LOCAL_IP_HEADERS,
      PRODUCTION_IP_HEADER,
    ]);
  });
});
