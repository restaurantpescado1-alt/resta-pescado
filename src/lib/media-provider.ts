/**
 * Media storage behind the dish and gallery image routes.
 *
 * ImageKit is the active provider; R2 is the historical one, kept as a legacy
 * shim so rows that point at objects uploaded before the switch fail loudly
 * ("not performed", "not found") instead of crashing the read or delete paths.
 *
 * Every function is pure over an injected `fetch` and a configuration record so
 * the providers can be unit-tested without a network or a Cloudflare binding.
 * TLS keys are only needed for ImageKit's API and are never exposed to the
 * browser: uploads go through authenticated server actions and every delivery
 * URL the dashboard builds points back at `/api/media`, which proxies the CDN.
 */

export type MediaProviderKind = "r2" | "imagekit";

/**
 * A reference to one stored image, whatever provider holds it.
 *
 * `key` is the delivery path `/api/media` serves (`menu/{year}/{uuid}.{ext}`),
 * which is the same shape for both providers. `assetId` is the provider's own
 * identifier for the stored object — ImageKit's `fileId`, and `null` for legacy
 * R2 rows, where the object key is the identifier. The two must stay separate:
 * a delivery path is not necessarily a delete handle, and a delete handle is not
 * a URL.
 */
export interface MediaAssetRef {
  readonly provider: MediaProviderKind;
  readonly key: string;
  readonly assetId: string | null;
}

export interface MediaUploadInput {
  /** The delivery path the asset will be served under. */
  readonly key: string;
  /** `Uint8Array<ArrayBuffer>` rather than the bare `Uint8Array`: the bytes go into a `Blob`, which only accepts an `ArrayBuffer` view, never a `SharedArrayBuffer` one. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly contentType: string;
  readonly width: number;
  readonly height: number;
}

export type MediaDeleteResult =
  | { readonly status: "deleted" }
  /**
   * The asset was already gone. Deleting twice is not a failure: the database no
   * longer references the asset either way, so this is distinct from an error.
   */
  | { readonly status: "not-found" }
  /** The provider cannot act on the ref (legacy store without a binding). */
  | { readonly status: "not-performed"; readonly reason: string };

export type MediaReadResult =
  /** The asset exists: its bytes, plus the `Content-Type` the store knows. */
  | {
      readonly status: "ok";
      readonly contentType: string | null;
      readonly body: ReadableStream<Uint8Array>;
    }
  | { readonly status: "not-found" }
  /**
   * The store exists but failed. The route surfaces this as a gateway error
   * rather than letting a broken upstream masquerade as "no such image".
   */
  | { readonly status: "unavailable"; readonly cause: unknown };

export interface MediaProvider {
  readonly kind: MediaProviderKind;
  /** Stores `input` and returns the ref to persist in D1. Rejects on failure. */
  upload(input: MediaUploadInput): Promise<MediaAssetRef>;
  /** Reads the bytes behind a delivery path. */
  read(key: string): Promise<MediaReadResult>;
  /** Deletes the asset a persisted ref points at. Throws only on provider errors. */
  delete(ref: MediaAssetRef): Promise<MediaDeleteResult>;
}

/**
 * Configuration the provider resolvers read from the Worker environment.
 * Read as a loose record (not the typed `CloudflareEnv`) so this module is
 * independent of the generated bindings file and tests can hand it anything.
 */
export type MediaEnvironment = Record<string, unknown>;

/** Thrown when configuration is unusable. Fail closed: never guess a store. */
export class MediaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaConfigError";
  }
}

/** Values that only exist as placeholders in docs or the checked-in config. */
const PLACEHOLDER_PRIVATE_KEYS: ReadonlySet<string> = new Set([
  "PLACEHOLDER",
  "changeme",
  "your-imagekit-private-key",
  "your-private-key",
]);

const PLACEHOLDER_ENDPOINTS: ReadonlySet<string> = new Set([
  "PLACEHOLDER",
  "PLACEHOLDER_ENDPOINT",
  "your-endpoint",
  "https://ik.imagekit.io/PLACEHOLDER_ENDPOINT",
  "https://ik.imagekit.io/your-endpoint",
]);

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolves the active provider from the environment.
 *
 * `MEDIA_PROVIDER` selects the store (`imagekit`, or `r2` for the legacy shim;
 * unset means `r2`). An unknown value is a configuration error rather than a
 * silent fallback, because falling back could quietly send an upload to the
 * wrong store.
 */
export function createMediaProvider(env: MediaEnvironment): MediaProvider {
  const kind = trimmed(env.MEDIA_PROVIDER) || "r2";

  if (kind === "imagekit") {
    return createImageKitProvider(env);
  }
  if (kind === "r2") {
    return createR2Provider(env);
  }

  throw new MediaConfigError(
    `Unsupported MEDIA_PROVIDER "${kind}". Use "imagekit", or "r2" for the legacy store only.`,
  );
}

/** The ImageKit endpoints, overridable so tests can point at a local fake. */
export const IMAGEKIT_DEFAULT_UPLOAD_BASE = "https://upload.imagekit.io";
export const IMAGEKIT_DEFAULT_API_BASE = "https://api.imagekit.io";

function normalizeBase(value: unknown, fallback: string): string {
  const base = trimmed(value) || fallback;
  return base.replace(/\/+$/, "");
}

/**
 * A value counts as "filled in" when it is present and is not one of the
 * documented placeholders. An endpoint that fails this is unusable in production
 * and, worse, silently wrong, so the constructor refuses to serve through it.
 */
function assertConfigured(
  value: string,
  name: string,
  placeholders: ReadonlySet<string>,
): string {
  if (value.length === 0 || placeholders.has(value)) {
    throw new MediaConfigError(
      `${name} is not configured. ` +
        "Set it in the Worker environment (IMAGEKIT_PRIVATE_KEY as a secret via `wrangler secret put`, " +
        "IMAGEKIT_URL_ENDPOINT as a variable) or in .dev.vars for local development.",
    );
  }
  return value;
}

export function createImageKitProvider(env: MediaEnvironment): MediaProvider {
  const urlEndpoint = assertConfigured(
    trimmed(env.IMAGEKIT_URL_ENDPOINT).replace(/\/+$/, ""),
    "IMAGEKIT_URL_ENDPOINT",
    PLACEHOLDER_ENDPOINTS,
  );
  const privateKey = assertConfigured(
    trimmed(env.IMAGEKIT_PRIVATE_KEY),
    "IMAGEKIT_PRIVATE_KEY",
    PLACEHOLDER_PRIVATE_KEYS,
  );

  return new ImageKitProvider(
    urlEndpoint,
    privateKey,
    normalizeBase(env.IMAGEKIT_UPLOAD_BASE, IMAGEKIT_DEFAULT_UPLOAD_BASE),
    normalizeBase(env.IMAGEKIT_API_BASE, IMAGEKIT_DEFAULT_API_BASE),
    fetch,
  );
}

class ImageKitProvider implements MediaProvider {
  readonly kind: MediaProviderKind = "imagekit";

  constructor(
    private readonly urlEndpoint: string,
    private readonly privateKey: string,
    private readonly uploadBase: string,
    private readonly apiBase: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** ImageKit authenticates API calls with the private key as HTTP Basic. */
  private authorizationHeader(): string {
    return `Basic ${btoa(`${this.privateKey}:`)}`;
  }

  async upload(input: MediaUploadInput): Promise<MediaAssetRef> {
    const parts = input.key.split("/");
    if (parts.length < 2 || !parts.at(-1)) {
      throw new MediaConfigError(
        `Invalid image key "${input.key}": expected {menu|gallery}/{year}/{uuid}.{ext}.`,
      );
    }
    const fileName = parts.at(-1)!;
    // ImageKit's `fileName` field only allows alphanumeric, `.` and `-` (any
    // other character, including `/`, is replaced), so folder structure has to
    // be handed over separately.
    const folder = parts.slice(0, -1).join("/");

    const form = new FormData();
    form.set("file", new Blob([input.bytes], { type: input.contentType }), fileName);
    form.set("fileName", fileName);
    form.set("folder", folder);
    // Our keys are already unique, so a stored name collision would mean a
    // programming error, not a lucky uuid.
    form.set("useUniqueFileName", "false");
    form.set("tags", "resta-pescado");

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.uploadBase}/api/v1/files/upload`, {
        method: "POST",
        headers: { Authorization: this.authorizationHeader() },
        body: form,
      });
    } catch (error) {
      throw new Error("ImageKit upload request failed.", { cause: error });
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`ImageKit rejected the upload (${response.status}): ${detail}`);
    }

    const payload = (await response.json()) as { fileId?: unknown };
    if (typeof payload.fileId !== "string" || payload.fileId.length === 0) {
      throw new Error("ImageKit upload did not return a fileId.");
    }

    return { provider: "imagekit", key: input.key, assetId: payload.fileId };
  }

  async read(key: string): Promise<MediaReadResult> {
    const url = `${this.urlEndpoint}/${key.split("/").map(encodeURIComponent).join("/")}`;

    let upstream: Response;
    try {
      upstream = await this.fetchImpl(url);
    } catch (cause) {
      return { status: "unavailable", cause };
    }

    if (upstream.status === 404) {
      return { status: "not-found" };
    }
    if (!upstream.ok) {
      try {
        await upstream.body?.cancel();
      } catch {
        // Cancelling is best-effort; the unavailable outcome is what matters.
      }
      return {
        status: "unavailable",
        cause: new Error(`ImageKit CDN returned ${upstream.status} for ${key}.`),
      };
    }
    if (!upstream.body) {
      return {
        status: "unavailable",
        cause: new Error(`ImageKit CDN returned 200 with an empty body for ${key}.`),
      };
    }

    return {
      status: "ok",
      contentType: upstream.headers.get("content-type"),
      body: upstream.body,
    };
  }

  async delete(ref: MediaAssetRef): Promise<MediaDeleteResult> {
    if (!ref.assetId) {
      return {
        status: "not-performed",
        reason: "The stored row carries no ImageKit fileId to delete.",
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        `${this.apiBase}/v1/files/${encodeURIComponent(ref.assetId)}`,
        { method: "DELETE", headers: { Authorization: this.authorizationHeader() } },
      );
    } catch (error) {
      throw new Error("ImageKit delete request failed.", { cause: error });
    }

    if (response.status === 204 || response.status === 200) {
      return { status: "deleted" };
    }
    if (response.status === 404) {
      return { status: "not-found" };
    }
    throw new Error(`ImageKit refused the delete (${response.status}).`);
  }
}

/**
 * Legacy R2 shim.
 *
 * The R2 binding has been removed from `wrangler.jsonc`, so after this phase a
 * deployed Worker has no `MEDIA` binding at all. Since no seed row carries an R2
 * image, the scenarios below are mostly theoretical; when they do occur the shim
 * must report honestly and touch nothing: an object in a store that no binding
 * exists for cannot be read or deleted, and pretending otherwise would leak a
 * "deleted" outcome that never deleted anything.
 */
export function createR2Provider(env: MediaEnvironment): MediaProvider {
  return new R2Provider(env.MEDIA);
}

class R2Provider implements MediaProvider {
  readonly kind: MediaProviderKind = "r2";
  private warned = false;

  constructor(private readonly binding: unknown) {}

  private warnOnce(message: string): void {
    if (this.warned) {
      return;
    }
    this.warned = true;
    console.warn(`R2Provider (legacy): ${message}`);
  }

  async upload(): Promise<MediaAssetRef> {
    throw new Error(
      "Storing to R2 is no longer supported. Set MEDIA_PROVIDER=imagekit and configure ImageKit.",
    );
  }

  async read(key: string): Promise<MediaReadResult> {
    if (!this.binding) {
      this.warnOnce(`key ${key} cannot be read: no MEDIA binding is configured.`);
      return { status: "not-found" };
    }

    const object = await (this.binding as R2Bucket).get(key);
    if (!object || !object.body) {
      return { status: "not-found" };
    }

    return {
      status: "ok",
      contentType: object.httpMetadata?.contentType ?? null,
      body: object.body as ReadableStream<Uint8Array>,
    };
  }

  async delete(ref: MediaAssetRef): Promise<MediaDeleteResult> {
    if (!this.binding) {
      this.warnOnce(`ref ${ref.key} will not be deleted: no MEDIA binding is configured.`);
      return {
        status: "not-performed",
        reason: "No MEDIA binding is configured.",
      };
    }

    await (this.binding as R2Bucket).delete(ref.key);
    return { status: "deleted" };
  }
}