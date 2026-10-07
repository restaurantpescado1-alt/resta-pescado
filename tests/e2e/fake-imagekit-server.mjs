/**
 * Local fake of the ImageKit upload API and CDN for the Playwright suite.
 *
 * The Worker is configured (via .dev.vars) to send every ImageKit request here:
 * uploads, CDN reads, and file deletions. That means the end-to-end suite exercises
 * the real upload → D1 → serve → delete path without a real ImageKit account, and it
 * fails loudly if the app ever calls a host the fake does not implement.
 *
 * It is plain Node (not a test file, not bundled) because Playwright starts it with
 * `node` and it must run standalone. It deliberately implements the small ImageKit
 * surface the app uses and nothing else:
 *
 *   GET  /health                    → 200 (Playwright readiness check)
 *   POST /api/v1/files/upload       → ImageKit upload API (multipart) → JSON fileId
 *   GET  /<folder>/<fileName>       → the CDN: bytes the fake stored, or 404
 *   DELETE /v1/files/:fileId        → ImageKit delete API → 204 / 404
 *
 * A handwritten multipart parser is safer than a dependency here: the fake is a test
 * harness and should not need `npm install` to run. It works on Buffers so image
 * bytes round-trip exactly rather than being forced through UTF-8.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.FAKE_IMAGEKIT_PORT ?? 8788);
const HOST = "127.0.0.1";

/** key (no leading slash) → the stored file. */
const files = new Map();
/** Hex fileId prefix keeps ids opaque, the way ImageKit's are. */
const fileIdOf = (key) => `fakefile_${Buffer.from(key).toString("hex")}`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  if (Buffer.isBuffer(body)) {
    res.end(body);
  } else {
    res.end(body);
  }
}

function json(res, status, value) {
  send(res, status, JSON.stringify(value), { "content-type": "application/json" });
}

/** ImageKit API calls use `Authorization: Basic <base64(privateKey:)>`. */
function authorized(headers) {
  const header = headers.authorization ?? "";
  if (!/^Basic\s+[A-Za-z0-9+/=]+$/i.test(header)) {
    return false;
  }
  const [user] = Buffer.from(header.slice(6).trim(), "base64").toString().split(":");
  // The empty-password form is what our implementation sends. Any user is
  // accepted; the point is that the header is present and well-formed.
  return typeof user === "string";
}

const CRLF = Buffer.from("\r\n");
const CRLFCRLF = Buffer.from("\r\n\r\n");

/**
 * Splits a multipart/form-data body into fields. Returns raw Buffers so binary
 * content survives; decode with `.toString()` where a text field is expected.
 */
function parseMultipart(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType ?? "");
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) {
    throw new Error(`No boundary in Content-Type: ${contentType}`);
  }
  const delimiter = Buffer.from(`--${boundary}`);

  const sections = [];
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(delimiter, cursor);
    if (start === -1) {
      break;
    }
    const next = body.indexOf(delimiter, start + delimiter.length);
    const end = next === -1 ? body.length : next;
    const section = body.subarray(start + delimiter.length, end);
    if (section.length <= 2) {
      // The opening/closing `--` marker; nothing to read here.
      cursor = end;
      continue;
    }
    sections.push(section);
    cursor = end;
  }

  const fields = [];
  for (const section of sections) {
    const bodyStart = section.indexOf(CRLFCRLF);
    if (bodyStart === -1) {
      continue;
    }
    const headerBlock = section.subarray(0, bodyStart).toString("latin1");
    let value = section.subarray(bodyStart + CRLFCRLF.length);
    // `value` is a Buffer, and Buffers have no `endsWith`: compare the tail instead.
    if (value.length >= CRLF.length && value.subarray(value.length - CRLF.length).equals(CRLF)) {
      value = value.subarray(0, value.length - CRLF.length);
    }

    const disposition = /Content-Disposition: form-data;\s*(.*)$/im.exec(headerBlock)?.[1] ?? "";
    const name = /name="([^"]+)"/.exec(disposition)?.[1] ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
    const fileContentType = /Content-Type:\s*(\S+)/.exec(headerBlock)?.[1] ?? null;

    fields.push({ name, filename, contentType: fileContentType, value });
  }
  return fields;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (req.method === "GET" && pathname === "/health") {
      return send(res, 200, "ok");
    }

    if (req.method === "POST" && pathname === "/api/v1/files/upload") {
      if (!authorized(req.headers)) {
        return send(res, 401, "Unauthorized");
      }
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const fields = parseMultipart(Buffer.concat(chunks), req.headers["content-type"]);

      const file = fields.find((f) => f.name === "file");
      const fileName = fields.find((f) => f.name === "fileName")?.value.toString();
      const folder = fields.find((f) => f.name === "folder")?.value.toString() ?? "";

      if (!file || !fileName || !file.filename) {
        return send(res, 400, "Bad multipart upload: missing file or fileName");
      }

      const key = `${folder}/${fileName}`.replace(/^\/+/, "");
      files.set(key, {
        bytes: file.value,
        contentType: file.contentType ?? "application/octet-stream",
      });

      return json(res, 200, {
        fileId: fileIdOf(key),
        filePath: `/${key}`,
        name: fileName,
        url: `http://${HOST}:${PORT}/${key}`,
        tags: ["resta-pescado"],
      });
    }

    if (req.method === "DELETE" && pathname.startsWith("/v1/files/")) {
      if (!authorized(req.headers)) {
        return send(res, 401, "Unauthorized");
      }
      const fileId = decodeURIComponent(pathname.slice("/v1/files/".length));
      let foundKey = null;
      for (const key of files.keys()) {
        if (fileIdOf(key) === fileId) {
          foundKey = key;
          break;
        }
      }
      if (!foundKey) {
        return send(res, 404, "Not found");
      }
      files.delete(foundKey);
      return send(res, 204, "");
    }

    if (req.method === "GET" && pathname !== "/") {
      const key = pathname.replace(/^\/+/, "");
      const entry = files.get(key);
      if (!entry) {
        return send(res, 404, "Not found");
      }
      return send(res, 200, entry.bytes, {
        "content-type": entry.contentType,
        "cache-control": "public, max-age=31536000, immutable",
        etag: `"${key}"`,
      });
    }

    return send(res, 404, "Not found");
  } catch (error) {
    send(res, 500, String(error));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`[fake-imagekit] listening on http://${HOST}:${PORT}\n`);
});