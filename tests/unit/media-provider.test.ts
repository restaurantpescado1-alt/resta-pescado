import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MediaConfigError,
  createMediaProvider,
  type MediaUploadInput,
} from "../../src/lib/media-provider";

/**
 * The provider is the one place the app talks to an external service with a secret.
 * Every test here injects a fake `fetch`, so the suite proves the exact requests we
 * send — method, URL, auth header, multipart fields — without a network or an
 * ImageKit account, and proves what the caller is told when the service misbehaves.
 */
const imagekitEnv = {
  MEDIA_PROVIDER: "imagekit",
  IMAGEKIT_URL_ENDPOINT: "https://ik.example.test/img",
  IMAGEKIT_PRIVATE_KEY: "test-private-key",
  IMAGEKIT_UPLOAD_BASE: "https://upload.example.test",
  IMAGEKIT_API_BASE: "https://api.example.test",
};

const uploadInput: MediaUploadInput = {
  key: "gallery/2026/abc.webp",
  bytes: new Uint8Array([1, 2, 3, 4]),
  contentType: "image/webp",
  width: 640,
  height: 480,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function withFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider selection", () => {
  it("defaults to the legacy store when nothing is configured", () => {
    expect(createMediaProvider({}).kind).toBe("r2");
  });

  it("selects ImageKit when configured", () => {
    expect(createMediaProvider(imagekitEnv).kind).toBe("imagekit");
  });

  it("accepts the r2 shim explicitly", () => {
    expect(createMediaProvider({ MEDIA_PROVIDER: "r2" }).kind).toBe("r2");
  });

  it("rejects an unknown provider rather than guessing a store", () => {
    expect(() => createMediaProvider({ MEDIA_PROVIDER: "s3" })).toThrow(MediaConfigError);
  });

  it("fails closed when ImageKit has no endpoint", () => {
    expect(() =>
      createMediaProvider({ ...imagekitEnv, IMAGEKIT_URL_ENDPOINT: "" }),
    ).toThrow(MediaConfigError);
  });

  it("fails closed on the checked-in placeholder endpoint", () => {
    expect(() =>
      createMediaProvider({
        ...imagekitEnv,
        IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/PLACEHOLDER_ENDPOINT",
      }),
    ).toThrow(MediaConfigError);
  });

  it("fails closed when the private key is missing or a placeholder", () => {
    expect(() => createMediaProvider({ ...imagekitEnv, IMAGEKIT_PRIVATE_KEY: "" })).toThrow(
      MediaConfigError,
    );
    expect(() =>
      createMediaProvider({ ...imagekitEnv, IMAGEKIT_PRIVATE_KEY: "your-private-key" }),
    ).toThrow(MediaConfigError);
  });
});

describe("ImageKit upload", () => {
  it("posts multipart with Basic auth and returns the provider ref", async () => {
    const fetchSpy = withFetch(async () => jsonResponse(200, { fileId: "file-123" }));

    const provider = createMediaProvider(imagekitEnv);
    const ref = await provider.upload(uploadInput);

    expect(ref).toEqual({
      provider: "imagekit",
      key: "gallery/2026/abc.webp",
      assetId: "file-123",
    });

    expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(
      "https://upload.example.test/api/v1/files/upload",
      expect.anything(),
    );

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("test-private-key:")}`,
    );

    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("fileName")).toBe("abc.webp");
    expect(body.get("folder")).toBe("gallery/2026");
    expect(body.get("useUniqueFileName")).toBe("false");
    expect(body.get("tags")).toBe("resta-pescado");
    const file = body.get("file") as File;
    expect(file.type).toBe("image/webp");
  });

  it("uses the real ImageKit hosts when no override is set", async () => {
    const fetchSpy = withFetch(async () => jsonResponse(200, { fileId: "file-123" }));

    await createMediaProvider({
      MEDIA_PROVIDER: "imagekit",
      IMAGEKIT_URL_ENDPOINT: "https://ik.example.test",
      IMAGEKIT_PRIVATE_KEY: "test-private-key",
    }).upload(uploadInput);

    expect(fetchSpy.mock.calls[0]![0]).toBe("https://upload.imagekit.io/api/v1/files/upload");
  });

  it("surfaces a rejection as an error rather than a fake ref", async () => {
    withFetch(async () => jsonResponse(401, { message: "Invalid credentials" }));

    await expect(createMediaProvider(imagekitEnv).upload(uploadInput)).rejects.toThrow(/401/);
  });

  it("rejects a response that has no fileId", async () => {
    withFetch(async () => jsonResponse(200, {}));

    await expect(createMediaProvider(imagekitEnv).upload(uploadInput)).rejects.toThrow(/fileId/);
  });

  it("rejects a transport failure", async () => {
    withFetch(async () => {
      throw new Error("socket hang up");
    });

    await expect(createMediaProvider(imagekitEnv).upload(uploadInput)).rejects.toThrow(
      "ImageKit upload request failed.",
    );
  });

  it("refuses an image key whose folder and filename cannot be separated", async () => {
    await expect(
      createMediaProvider(imagekitEnv).upload({ ...uploadInput, key: "nonsense.webp" }),
    ).rejects.toThrow(MediaConfigError);
  });
});

describe("ImageKit read", () => {
  it("returns the bytes and the CDN's content type", async () => {
    withFetch(async () => new Response("bytes", {
      status: 200,
      headers: { "content-type": "image/webp" },
    }));

    const result = await createMediaProvider(imagekitEnv).read("menu/2026/abc.webp");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.contentType).toBe("image/webp");
      expect(result.body).toBeTruthy();
    }
  });

  it("looks the key up under the URL endpoint", async () => {
    const fetchSpy = withFetch(async () => new Response("bytes", { status: 200 }));

    await createMediaProvider(imagekitEnv).read("menu/2026/abc.webp");

    expect(fetchSpy.mock.calls[0]![0]).toBe("https://ik.example.test/img/menu/2026/abc.webp");
  });

  it("reports a missing asset as not-found, not an error", async () => {
    withFetch(async () => new Response("Not found", { status: 404 }));

    const result = await createMediaProvider(imagekitEnv).read("menu/2026/missing.webp");

    expect(result).toEqual({ status: "not-found" });
  });

  it("reports an upstream failure as unavailable so the route can answer 502", async () => {
    withFetch(async () => new Response("boom", { status: 503 }));

    const result = await createMediaProvider(imagekitEnv).read("menu/2026/abc.webp");

    expect(result.status).toBe("unavailable");
  });

  it("reports a transport failure as unavailable", async () => {
    withFetch(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });

    const result = await createMediaProvider(imagekitEnv).read("menu/2026/abc.webp");

    expect(result.status).toBe("unavailable");
  });
});

describe("ImageKit delete", () => {
  const ref = { provider: "imagekit", key: "gallery/2026/abc.webp", assetId: "file-123" } as const;

  it("deletes through the API with Basic auth", async () => {
    const fetchSpy = withFetch(async () => new Response(null, { status: 204 }));

    const result = await createMediaProvider(imagekitEnv).delete(ref);

    expect(result).toEqual({ status: "deleted" });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/v1/files/file-123");
    expect(init?.method).toBe("DELETE");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${btoa("test-private-key:")}`,
    );
  });

  it("treats an already-deleted file as not-found rather than an error", async () => {
    withFetch(async () => new Response("Not found", { status: 404 }));

    expect(await createMediaProvider(imagekitEnv).delete(ref)).toEqual({ status: "not-found" });
  });

  it("throws when the API refuses the delete", async () => {
    withFetch(async () => new Response("Forbidden", { status: 403 }));

    await expect(createMediaProvider(imagekitEnv).delete(ref)).rejects.toThrow(/403/);
  });

  it("throws on a transport failure", async () => {
    withFetch(async () => {
      throw new Error("socket hang up");
    });

    await expect(createMediaProvider(imagekitEnv).delete(ref)).rejects.toThrow(
      "ImageKit delete request failed.",
    );
  });

  it("reports nothing to do when the row carries no fileId", async () => {
    const fetchSpy = withFetch(async () => new Response(null, { status: 204 }));

    const result = await createMediaProvider(imagekitEnv).delete({ ...ref, assetId: null });

    expect(result.status).toBe("not-performed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("legacy R2 shim", () => {
  it("refuses to upload to a store the app has switched away from", async () => {
    await expect(createMediaProvider({ MEDIA_PROVIDER: "r2" }).upload(uploadInput)).rejects.toThrow(
      /no longer supported/,
    );
  });

  it("reports a read as not-found when there is no binding", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = createMediaProvider({ MEDIA_PROVIDER: "r2" });

    expect(await provider.read("menu/2026/abc.webp")).toEqual({ status: "not-found" });
    expect(await provider.read("menu/2026/abc.webp")).toEqual({ status: "not-found" });
  });

  it("reports a delete as not-performed instead of claiming success", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await createMediaProvider({ MEDIA_PROVIDER: "r2" }).delete({
      provider: "r2",
      key: "menu/2026/abc.webp",
      assetId: null,
    });

    expect(result).toEqual({
      status: "not-performed",
      reason: "No MEDIA binding is configured.",
    });
  });
});