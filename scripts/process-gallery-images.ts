/**
 * Builds the public gallery images from the curated sources in
 * `public/images/gallery/`.
 *
 * Run locally only. Sharp is a native Node module and is deliberately *not* a
 * dependency of the production Worker: the output is a static asset committed to the
 * repository, so nothing needs to decode an image at request time.
 *
 *   npm run images:gallery
 *   npx tsx scripts/process-gallery-images.ts --force
 *
 * Why this exists at all: the curated sources are 1448x1086 PNG files weighing
 * 2.3-2.9 MB each, which is roughly 18 MB for one gallery. That is a real cost on a
 * phone, and it is not what `docs/GALLERY.md` says was delivered. So each approved
 * source gets a WebP derivative at a size the gallery actually displays, and the
 * sources are left exactly as they are.
 *
 * Rules this script will not break:
 *
 * - **Sources are never written to.** Every output is a new file under `webp/`.
 * - **Nothing is upscaled.** `withoutEnlargement` is on, so a source already smaller
 *   than the target keeps its own size.
 * - **Nothing is stretched.** Output is 4:3; a source that is not 4:3 is cropped with
 *   `cover`, which CONTENT_POLICY.md explicitly allows, rather than distorted.
 * - **No metadata is carried over.** Camera strings and GPS have no business in a
 *   published asset.
 *
 * The approved list, alt text, and provenance live in `src/lib/gallery-images.ts`, which
 * is the single source of truth for both this script and the page. Adding a photograph
 * means adding it there and re-running.
 */

import { mkdir, readFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import sharp from "sharp";

import { GALLERY_IMAGE_ROOT, GALLERY_WEBP_SUBDIR, listBundledGalleryImages } from "../src/lib/gallery-images";

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900;
const QUALITY = 78;

/** Reduced to a size worth serving; the gallery shows at most three across. */
async function derive(sourcePath: string, outPath: string): Promise<"written" | "skipped"> {
  const out = await stat(outPath).catch(() => null);
  if (out && !process.argv.includes("--force")) {
    return "skipped";
  }

  const buffer = await readFile(sourcePath);
  await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(outPath);

  return "written";
}

async function main(): Promise<void> {
  // `sourceFile` is relative to the image root, the same base the web path uses, so the
  // two can never drift apart.
  const imageRoot = resolve(process.cwd(), GALLERY_IMAGE_ROOT);
  const outDir = resolve(imageRoot, GALLERY_WEBP_SUBDIR);
  await mkdir(outDir, { recursive: true });

  const images = listBundledGalleryImages();
  console.log(`Gallery: ${images.length} approved image(s) under ${imageRoot}\n`);

  let totalIn = 0;
  let totalOut = 0;

  for (const image of images) {
    const sourcePath = join(imageRoot, image.sourceFile);
    const outPath = join(outDir, `${image.slug}.webp`);

    const exists = await stat(sourcePath).catch(() => null);
    if (!exists) {
      console.error(`  MISSING  ${image.sourceFile} (referenced as ${image.slug})`);
      process.exitCode = 1;
      continue;
    }

    const before = (await sharp(sourcePath).metadata()).width;
    const state = await derive(sourcePath, outPath);
    const after = (await stat(outPath)).size;
    const dimensions = await sharp(outPath).metadata();

    totalIn += exists.size;
    totalOut += after;
    console.log(
      `  ${state.padEnd(7)} ${basename(image.sourceFile)} -> ${basename(outPath)}  ` +
        `${before}px -> ${dimensions.width}x${dimensions.height}  ` +
        `${(exists.size / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`,
    );
  }

  console.log(
    `\n  total ${(totalIn / 1024 / 1024).toFixed(1)} MB -> ${(totalOut / 1024 / 1024).toFixed(2)} MB`,
  );

  if (process.exitCode) {
    console.error("\nSome sources were missing. Nothing was published for those entries.");
  }
}

/** Exposed for the unit suite, which checks the geometry without running Sharp. */
export { TARGET_WIDTH, TARGET_HEIGHT, QUALITY };

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("process-gallery-images.ts");
if (invokedDirectly) {
  await main();
}