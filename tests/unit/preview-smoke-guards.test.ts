import { describe, expect, it } from "vitest";

import { APPROVED_CATEGORIES, allApprovedItems } from "../../scripts/approved-menu";
import {
  UPDATE_CLAIM_PATTERNS,
  classifyTarget,
  findUpdateClaim,
  hostKindOf,
  looksLikeCloudflareAccess,
  normalizeHostname,
  parsePreviewSmokeArgs,
} from "../../scripts/preview-smoke-guards";
import { SEED_DELIVERY, SEED_SETTINGS } from "../../scripts/site-settings";

/**
 * The smoke test is only safe because of its target rules, so these tests pin the
 * rules down: an `http:` URL, a loopback host, and any production-looking host must be
 * refused before a browser is ever opened. The claim patterns are also pinned against
 * the confirmed seed copy, so "no daily-update claims" can never flag the restaurant's
 * own confirmed sentences.
 */

describe("normalizeHostname", () => {
  it("lowercases and strips brackets, ports and the trailing dot", () => {
    expect(normalizeHostname("RESTA-PESCADO-PREVIEW.TEAM.WORKERS.DEV.")).toBe(
      "resta-pescado-preview.team.workers.dev",
    );
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(normalizeHostname("localhost:8787")).toBe("localhost:8787");
  });
});

describe("hostKindOf", () => {
  it("recognises loopback names", () => {
    for (const host of ["localhost", "127.0.0.1", "127.8.9.10", "0.0.0.0", "::1", "[::1]", "intranet.local", "api.localhost"]) {
      expect(hostKindOf(host), host).toBe("loopback");
    }
  });

  it("recognises the preview worker regardless of account or case", () => {
    expect(hostKindOf("resta-pescado-preview.my-team.workers.dev")).toBe("preview");
    expect(hostKindOf("RESTA-PESCADO-PREVIEW.TEAM.WORKERS.DEV")).toBe("preview");
    expect(hostKindOf("resta-pescado-preview.workers.dev")).toBe("preview");
  });

  it("treats every other host as production", () => {
    expect(hostKindOf("resta-pescado.workers.dev")).toBe("production");
    expect(hostKindOf("resta-pescado.fr")).toBe("production");
    expect(hostKindOf("resta-pescado-preview-dev.team.workers.dev")).toBe("production");
  });
});

describe("classifyTarget", () => {
  it("refuses a missing or malformed URL", () => {
    expect("error" in classifyTarget("not a url")).toBe(true);
    expect("error" in classifyTarget("https://")).toBe(true);
  });

  it("requires https", () => {
    const result = classifyTarget("http://resta-pescado-preview.a.workers.dev");
    expect("error" in result && result.error).toMatch(/https/);
  });

  it("refuses loopback hosts", () => {
    for (const input of [
      "https://localhost/",
      "https://127.0.0.1:8787",
      "https://[::1]",
      "https://intranet.local/",
    ]) {
      const result = classifyTarget(input);
      expect("error" in result, input).toBe(true);
      expect("error" in result && result.error).toMatch(/local/);
    }
  });

  it("accepts the preview worker", () => {
    const result = classifyTarget("https://resta-pescado-preview.my-team.workers.dev/");
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.kind).toBe("preview");
      expect(result.url.origin).toBe("https://resta-pescado-preview.my-team.workers.dev");
      expect(result.hostname).toBe("resta-pescado-preview.my-team.workers.dev");
    }
  });

  it("refuses a production-looking host unless --allow-production is honoured", () => {
    const refused = classifyTarget("https://resta-pescado.fr/");
    expect("error" in refused && refused.error).toMatch(/production/);

    const allowed = classifyTarget("https://resta-pescado.fr/", { allowProduction: true });
    expect(allowed).not.toHaveProperty("error");
    if (!("error" in allowed)) {
      expect(allowed.kind).toBe("production");
    }
  });
});

describe("parsePreviewSmokeArgs", () => {
  it("requires --url", () => {
    expect(parsePreviewSmokeArgs([]).input).toBeNull();
    expect(parsePreviewSmokeArgs(["--help"]).help).toBe(true);
  });

  it("reads the URL in either spelling", () => {
    expect(parsePreviewSmokeArgs(["--url", "https://a.workers.dev"]).input).toBe(
      "https://a.workers.dev",
    );
    expect(parsePreviewSmokeArgs(["--url=https://b.workers.dev"]).input).toBe(
      "https://b.workers.dev",
    );
  });

  it("honours --allow-production", () => {
    expect(parsePreviewSmokeArgs(["--url", "https://a.fr", "--allow-production"]).allowProduction).toBe(
      true,
    );
  });

  it("rejects a duplicated URL, an unknown flag, and a missing value", () => {
    expect(() =>
      parsePreviewSmokeArgs(["--url", "https://a.workers.dev", "--url", "https://b.workers.dev"]),
    ).toThrow(/more than once/);
    expect(() => parsePreviewSmokeArgs(["--urll", "https://a.workers.dev"])).toThrow(/Unknown argument/);
    expect(() => parsePreviewSmokeArgs(["--url"])).toThrow(/needs a value/);
  });
});

describe("looksLikeCloudflareAccess", () => {
  it("flags a redirect into the Access login domain", () => {
    expect(
      looksLikeCloudflareAccess({
        status: 200,
        finalUrl: "https://my-team.cloudflareaccess.com/cdn-cgi/access/callback",
        bodyHead: "",
      }),
    ).toBe(true);
  });

  it("flags a 403 challenge page by its wording", () => {
    for (const head of [
      "Access denied",
      "This website is using Cloudflare Access",
      "Blocked by Cloudflare",
      "cf-request-id: 0a1b2c3d",
    ]) {
      expect(
        looksLikeCloudflareAccess({ status: 403, finalUrl: "https://preview.workers.dev/", bodyHead: head }),
        head,
      ).toBe(true);
    }
  });

  it("does not flag a normal page or a real 500", () => {
    expect(
      looksLikeCloudflareAccess({
        status: 200,
        finalUrl: "https://resta-pescado-preview.a.workers.dev/",
        bodyHead: "Poissons et fruits de mer",
      }),
    ).toBe(false);
    expect(
      looksLikeCloudflareAccess({
        status: 500,
        finalUrl: "https://resta-pescado-preview.a.workers.dev/menu",
        bodyHead: "Internal Server Error",
      }),
    ).toBe(false);
  });
});

describe("update claim patterns", () => {
  it("match the claims the V1 site cannot support", () => {
    expect(findUpdateClaim("La carte est mise à jour chaque jour.")).toContain("chaque jour");
    expect(findUpdateClaim("Découvrez nos poissons du jour.")).toContain("du jour");
    expect(findUpdateClaim("Un menu quotidien, changé souvent.")).toContain("quotidien");
    expect(findUpdateClaim("Aujourd'hui : la mise à jour est hebdomadaire.")).toBeNull();
  });

  it("never flag the owner-confirmed copy or the approved menu", () => {
    const seedStringValues = (values: Record<string, unknown>): string[] =>
      Object.values(values).filter((value): value is string => typeof value === "string") as string[];

    const combined = [
      ...seedStringValues(SEED_SETTINGS),
      ...seedStringValues(SEED_DELIVERY),
      ...APPROVED_CATEGORIES.map((category) => category.nameFr),
      ...allApprovedItems().map((item) => item.nameFr),
    ].join("\n");

    for (const pattern of UPDATE_CLAIM_PATTERNS) {
      expect(pattern.test(combined), String(pattern)).toBe(false);
    }
  });
});