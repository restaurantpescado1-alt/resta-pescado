/**
 * Creates a real, minimal PNG in memory so the upload tests exercise the same
 * signature and dimension parsing as a real photo, without a binary fixture in
 * the repository.
 *
 * The image is a flat colour. That is deliberate: `docs/CONTENT_POLICY.md` forbids
 * inventing food photography, and a grey rectangle is not pretending to be a
 * dish.
 */
export interface PngOptions {
  width: number;
  height: number;
  /** RGB triple. */
  colour?: [number, number, number];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

  return out;
}

/** A valid, uncompressed-deflate truecolour PNG. */
export function createPng({ width, height, colour = [0x8a, 0x9a, 0xa5] }: PngOptions): Uint8Array {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines: one filter byte (0 = none) then RGB triples.
  const raw = new Uint8Array(height * (1 + width * 3));
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    raw[cursor] = 0;
    cursor += 1;
    for (let x = 0; x < width; x += 1) {
      raw[cursor] = colour[0];
      raw[cursor + 1] = colour[1];
      raw[cursor + 2] = colour[2];
      cursor += 3;
    }
  }

  // zlib container around stored (uncompressed) deflate blocks.
  const blocks: number[] = [];
  const maxBlock = 0xffff;
  for (let offset = 0; offset < raw.length; offset += maxBlock) {
    const chunk = raw.subarray(offset, offset + maxBlock);
    const isLast = offset + maxBlock >= raw.length ? 1 : 0;
    const length = chunk.length;
    blocks.push(
      isLast,
      length & 0xff,
      (length >> 8) & 0xff,
      ~length & 0xff,
      (~length >> 8) & 0xff,
      ...chunk,
    );
  }

  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const adler = (((b << 16) | a) >>> 0) & 0xffffffff;
  const adlerBytes = new Uint8Array([
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  ]);

  const idat = new Uint8Array(2 + blocks.length + adlerBytes.length);
  idat[0] = 0x78;
  idat[1] = 0x01;
  idat.set(blocks, 2);
  idat.set(adlerBytes, 2 + blocks.length);

  const iend = new Uint8Array(0);

  const chunks = [pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", iend)];

  const total = signature.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let position = signature.length;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }

  return out;
}

/** A minimal baseline JPEG: SOI, APP0/JFIF, a SOF0 frame, and EOI. */
export function createJpeg({ width, height }: Omit<PngOptions, "colour">): Uint8Array {
  const out: number[] = [0xff, 0xd8];

  // APP0 / JFIF
  out.push(0xff, 0xe0, 0x00, 0x10);
  out.push(0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00);

  // SOF0: precision 8, height, width, 1 component, no sampling table.
  out.push(0xff, 0xc0, 0x00, 0x0b, 0x08);
  out.push((height >> 8) & 0xff, height & 0xff);
  out.push((width >> 8) & 0xff, width & 0xff);
  out.push(0x01, 0x01, 0x11, 0x00);

  out.push(0xff, 0xd9);

  return new Uint8Array(out);
}

/** A minimal lossy WebP (VP8): frame tag, sync code, and 14-bit dimensions. */
export function createWebpLossy({ width, height }: Omit<PngOptions, "colour">): Uint8Array {
  const total = 30;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  const ascii = (text: string, offset: number) => {
    for (let i = 0; i < text.length; i += 1) {
      out[offset + i] = text.charCodeAt(i);
    }
  };

  ascii("RIFF", 0);
  view.setUint32(4, total - 8, true);
  ascii("WEBP", 8);
  ascii("VP8 ", 12);
  view.setUint32(16, total - 20, true); // chunk size
  out[20] = 0x00; // frame tag: key frame, no partitioning, version 0
  out[21] = 0x00;
  out[22] = 0x00;
  out[23] = 0x9d; // sync code
  out[24] = 0x01;
  out[25] = 0x2a;
  // 14-bit little-endian width and height.
  out[26] = width & 0xff;
  out[27] = (width >> 8) & 0x3f;
  out[28] = height & 0xff;
  out[29] = (height >> 8) & 0x3f;

  return out;
}

/** A minimal extended WebP (VP8X): flags, 3 reserved bytes, 24-bit canvas size. */
export function createWebpExtended({ width, height }: Omit<PngOptions, "colour">): Uint8Array {
  const total = 30;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  const ascii = (text: string, offset: number) => {
    for (let i = 0; i < text.length; i += 1) {
      out[offset + i] = text.charCodeAt(i);
    }
  };

  ascii("RIFF", 0);
  view.setUint32(4, total - 8, true);
  ascii("WEBP", 8);
  ascii("VP8X", 12);
  view.setUint32(16, total - 20, true); // chunk size
  out[20] = 0x10; // flags: alpha
  // Canvas size is stored as width-1 / height-1, 24-bit little-endian.
  const w = width - 1;
  const h = height - 1;
  out[24] = w & 0xff;
  out[25] = (w >> 8) & 0xff;
  out[26] = (w >> 16) & 0xff;
  out[27] = h & 0xff;
  out[28] = (h >> 8) & 0xff;
  out[29] = (h >> 16) & 0xff;

  return out;
}

/** A minimal lossless WebP (VP8L): signature plus a 1x1-style header. */
export function createWebp({ width, height }: Omit<PngOptions, "colour">): Uint8Array {
  const total = 30;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  const ascii = (text: string, offset: number) => {
    for (let i = 0; i < text.length; i += 1) {
      out[offset + i] = text.charCodeAt(i);
    }
  };

  ascii("RIFF", 0);
  view.setUint32(4, total - 8, true);
  ascii("WEBP", 8);
  ascii("VP8L", 12);
  view.setUint32(16, 1, true); // chunk size
  out[20] = 0x2f; // VP8L signature
  // 14-bit (width-1) then 14-bit (height-1), packed little-endian.
  const bits = (width - 1) | ((height - 1) << 14);
  view.setUint32(21, bits >>> 0, true);
  out[25] = 0x00; // colour space / alpha hint
  out[26] = 0x00; // transform

  return out;
}
