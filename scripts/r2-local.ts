import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPng } from "../tests/helpers/image-fixtures";

/**
 * Local R2 helper for the seed.
 *
 * The obvious approach, writing a nested directory under
 * `.wrangler/state/v3/r2/<bucket>/`, does not work. Wrangler's local R2
 * persistence stores objects in a SQLite table (`_mf_objects`) alongside a blob
 * store, and the files the seed wrote were invisible to the running Worker, so
 * `/api/media` returned 404 for an object that was plainly on disk.
 *
 * Instead the seed shells out to `wrangler r2 object put --local`, which is the
 * supported way to write a local object and keeps the state layout entirely
 * wrangler's business. The temporary file it needs is removed afterwards.
 */

export const createPlaceholderPng = (width: number, height: number): Uint8Array =>
  createPng({ width, height, colour: [0x8a, 0x9a, 0xa5] });

/**
 * Resolves the project's own wrangler entrypoint.
 *
 * The `.bin/wrangler.cmd` shim cannot be spawned directly: recent Node refuses to
 * run a `.cmd` without a shell, and going through a shell reintroduces argument
 * concatenation. Running the JavaScript entrypoint with the current interpreter
 * avoids both problems and keeps the seed on the pinned wrangler version.
 */
const WRANGLER_BIN = join(process.cwd(), "node_modules", "wrangler", "bin", "wrangler.js");

function runWrangler(args: string[]): Promise<void> {
  if (!existsSync(WRANGLER_BIN)) {
    return Promise.reject(new Error(`wrangler not found at ${WRANGLER_BIN}. Run npm install.`));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER_BIN, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
      cwd: process.cwd(),
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`wrangler r2 object put failed (exit ${code}): ${stderr.trim()}`));
    });
  });
}

export async function putLocalR2Object(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  bucketName = "resta-pescado-media",
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "resta-pescado-r2-"));
  const file = join(directory, "object");

  try {
    await writeFile(file, bytes);
    await runWrangler([
      "r2",
      "object",
      "put",
      `${bucketName}/${key}`,
      "--file",
      file,
      "--content-type",
      contentType,
      "--local",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  return key;
}
