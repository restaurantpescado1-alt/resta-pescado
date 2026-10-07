/**
 * Image validation for dish uploads. Every function here is pure so it can be
 * unit tested without a media store, a Worker, or a network.
 *
 * Order matters and is deliberate: cheap checks first, container parsing last, so
 * an oversized or wrongly-typed upload never reaches the more expensive work.
 */

/** Only these three formats are accepted, per docs/SECURITY.md. */
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** 2 MiB. Comfortably under the Workers request body limit, over any menu photo. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Rejects thumbnails and absurd crops. Also caps the decompression bomb risk. */
export const MIN_IMAGE_DIMENSION = 100;
export const MAX_IMAGE_DIMENSION = 6000;

export const EXTENSION_BY_MIME: Record<AllowedMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface ImageDimensions {
  width: number;
  height: number;
}

export type ImageValidationResult =
  | {
      ok: true;
      mimeType: AllowedMimeType;
      extension: "jpg" | "png" | "webp";
      dimensions: ImageDimensions;
      bytes: ArrayBuffer;
    }
  | { ok: false; reason: string };

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

/**
 * JPEG: SOI marker `FF D8` followed by a segment chain. Dimensions live in the
 * first SOFn frame marker (C0..C3, C5..C7, C9..CB, CD..CF), which carries a
 * 5-byte header before height and width as big-endian uint16.
 */
function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Not a marker: skip one byte and resynchronise.
      offset += 1;
      continue;
    }

    let marker = bytes[offset + 1] ?? 0;
    // Fill bytes: a run of 0xFF is legal padding before the real marker.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1] ?? 0;
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // Standalone marker, no payload.
      offset += 2;
      continue;
    }

    if (marker === 0xd9 || marker === 0xda) {
      // EOI, or start of scan: no frame header found.
      return null;
    }

    const segmentLength = (bytes[offset + 2] ?? 0) * 256 + (bytes[offset + 3] ?? 0);
    if (segmentLength < 2) {
      return null;
    }

    const isFrameMarker =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isFrameMarker) {
      const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0);
      const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0);
      return { width, height };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

/** PNG: 8-byte signature, then an IHDR chunk whose data starts at byte 16. */
function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 24) {
    return null;
  }
  if (readAscii(bytes, 12, 4) !== "IHDR") {
    return null;
  }
  const width = ((bytes[16] ?? 0) << 24) | ((bytes[17] ?? 0) << 16) | ((bytes[18] ?? 0) << 8) | (bytes[19] ?? 0);
  const height = ((bytes[20] ?? 0) << 24) | ((bytes[21] ?? 0) << 16) | ((bytes[22] ?? 0) << 8) | (bytes[23] ?? 0);
  return { width, height };
}

/** WebP: `RIFF....WEBP`, then one of the VP8, VP8L, or VP8X chunks. */
function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 30) {
    return null;
  }
  if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
    return null;
  }

  const chunk = readAscii(bytes, 12, 4);

  if (chunk === "VP8 ") {
    // Lossy. Chunk payload starts at byte 20: 3-byte frame tag, 3-byte sync
    // code `9D 01 2A`, then width and height as 14-bit little-endian values.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    const width = ((bytes[26] ?? 0) | ((bytes[27] ?? 0) << 8)) & 0x3fff;
    const height = ((bytes[28] ?? 0) | ((bytes[29] ?? 0) << 8)) & 0x3fff;
    return { width, height };
  }

  if (chunk === "VP8L") {
    // Lossless: 1 signature byte then 14-bit width-1 and 14-bit height-1.
    if (bytes[20] !== 0x2f) {
      return null;
    }
    const bits = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { width, height };
  }

  if (chunk === "VP8X") {
    // Extended: 24-bit little-endian canvas width-1 and height-1.
    const width =
      ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16)) + 1;
    const height =
      ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16)) + 1;
    return { width, height };
  }

  return null;
}

/**
 * Confirms the bytes really are the format they claim to be. A renamed `.exe` or
 * an HTML page served as `image/png` fails here.
 */
export function detectMimeType(bytes: Uint8Array): AllowedMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  const isPngSignature =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPngSignature) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function readImageDimensions(bytes: Uint8Array, mimeType: AllowedMimeType): ImageDimensions | null {
  switch (mimeType) {
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/png":
      return readPngDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
  }
}

/**
 * Whether the file is a whole image rather than a recognisable header.
 *
 * Every other check here reads the front of the file: the magic number, then the
 * dimension fields. That is enough to know what the upload claims to be, and not enough
 * to know a browser will be able to display it. A file that stops after its header
 * passes all of it.
 *
 * That matters more than it sounds. There is no control for removing a dish photo, so a
 * truncated upload cannot be undone through the dashboard: it would sit in the media
 * store, D1 would point at it, and every visitor would see a broken image on the live
 * menu until someone edited the database by hand.
 *
 * So each format is asked for its terminator, which is pure byte inspection and needs no
 * image decoder:
 *
 * - JPEG ends with the EOI marker `FF D9`.
 * - PNG ends with the `IEND` chunk.
 * - WebP declares its own total length in the RIFF header, so the file can be compared
 *   against the number it claims to be. That is stricter than a terminator and also
 *   catches trailing garbage.
 *
 * This catches truncation and corruption at the end of a file. It is not a full decode,
 * and does not pretend to be: a genuinely damaged file whose length and terminator are
 * intact can still slip through.
 */
export function isCompleteImage(bytes: Uint8Array, mimeType: AllowedMimeType): boolean {
  if (mimeType === "image/jpeg") {
    if (bytes.byteLength < 4) {
      return false;
    }
    return bytes[bytes.byteLength - 2] === 0xff && bytes[bytes.byteLength - 1] === 0xd9;
  }

  if (mimeType === "image/png") {
    if (bytes.byteLength < 8) {
      return false;
    }
    // "IEND" is the last chunk of a valid PNG, immediately before the final CRC.
    const tail = readAscii(bytes, bytes.byteLength - 8, 4);
    return tail === "IEND";
  }

  // WebP: bytes 4..8 hold the RIFF payload length, which covers everything after the
  // first eight bytes. Comparing it to the actual length catches both a short file and
  // bytes appended after the image.
  if (bytes.byteLength < 12) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declared = view.getUint32(4, true);
  return declared + 8 === bytes.byteLength;
}

/**
 * Full gate for an upload. Checks, in order: declared type, size, real
 * signature, parseable dimensions, dimension bounds, and completeness. Returns a reason
 * string on the first failure so the admin sees an actionable message.
 */
export function validateImageUpload(
  declaredMimeType: string,
  bytes: Uint8Array,
  maxBytes: number = MAX_IMAGE_BYTES,
): ImageValidationResult {
  const isAllowed = (ALLOWED_MIME_TYPES as readonly string[]).includes(declaredMimeType);
  if (!isAllowed) {
    return { ok: false, reason: "Format non autorisé. Utilisez JPEG, PNG ou WebP." };
  }
  const mimeType = declaredMimeType as AllowedMimeType;

  if (bytes.byteLength === 0) {
    return { ok: false, reason: "Le fichier image est vide." };
  }

  if (bytes.byteLength > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, reason: `Image trop lourde. Maximum ${limitMb} Mo.` };
  }

  const detected = detectMimeType(bytes);
  if (detected === null) {
    return { ok: false, reason: "Le fichier n'est pas une image valide." };
  }
  if (detected !== mimeType) {
    return { ok: false, reason: "Le contenu du fichier ne correspond pas au format annoncé." };
  }

  const dimensions = readImageDimensions(bytes, mimeType);
  if (dimensions === null) {
    return { ok: false, reason: "Impossible de lire les dimensions de l'image." };
  }
  if (
    dimensions.width < MIN_IMAGE_DIMENSION ||
    dimensions.height < MIN_IMAGE_DIMENSION ||
    dimensions.width > MAX_IMAGE_DIMENSION ||
    dimensions.height > MAX_IMAGE_DIMENSION
  ) {
    return {
      ok: false,
      reason: `Dimensions d'image non autorisées. Entre ${MIN_IMAGE_DIMENSION} et ${MAX_IMAGE_DIMENSION} pixels.`,
    };
  }

  if (!isCompleteImage(bytes, mimeType)) {
    return {
      ok: false,
      reason: "L'image semble incomplète ou corrompue. Réessayez avec un autre fichier.",
    };
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  return {
    ok: true,
    mimeType,
    extension: EXTENSION_BY_MIME[mimeType],
    dimensions,
    bytes: copy.buffer,
  };
}

/**
 * Randomised delivery key: `menu/{year}/{uuid}.{ext}`. The uuid is the only source
 * of unpredictability, which is what stops one upload overwriting another. The
 * shape is the same for every provider (R2 object key or ImageKit filePath), so
 * `/api/media` does not care which store holds the bytes.
 */
export function buildImageKey(extension: "jpg" | "png" | "webp", now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  return `menu/${year}/${crypto.randomUUID()}.${extension}`;
}

/**
 * Randomised gallery delivery key: `gallery/{year}/{uuid}.{ext}`. Kept in its own
 * namespace so gallery photographs are never confused with dish photos, and no
 * code that sweeps one namespace can touch the other.
 */
export function buildGalleryKey(extension: "jpg" | "png" | "webp", now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  return `gallery/${year}/${crypto.randomUUID()}.${extension}`;
}
