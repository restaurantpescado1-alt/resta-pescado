/**
 * Fish reference image pipeline.
 *
 * Reads the owner's raw AI-generated fish illustrations from an external directory
 * and writes optimized website copies into `public/images/fish-guide/`.
 *
 * The source directory is deliberately outside the repository and is never written
 * to. Every file operation here is read-only against the source; the only writes go
 * to the output directory. That is the whole contract of this script, so the safety
 * is enforced by construction rather than by convention: there is no code path that
 * renames, moves, or deletes a source file.
 *
 * Usage:
 *   npx tsx scripts/process-fish-images.ts --source "<path>" [--out "<path>"] [--force]
 *
 * `--source` defaults to `$FISH_IMAGE_SOURCE`. `--force` overwrites existing
 * outputs; without it, an already-converted file is left alone so re-running is
 * cheap and idempotent.
 *
 * What the output is for: these are AI-generated *reference illustrations* of fish
 * species, not photographs of the cooked dishes. `docs/CONTENT_POLICY.md` ranks an
 * owner-approved temporary AI image above no image at all, and nothing here may be
 * presented as a serving photo. `src/lib/fish-images.ts` carries the label that
 * every surface has to render alongside them.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import sharp from "sharp";

/** Output geometry. 4:3 landscape, per the Phase 2 brief. */
const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900;

/**
 * Warm ivory letterbox colour, used only where a source is not itself 4:3 and
 * `contain` leaves a gap. All current sources are exactly 4:3, so nothing is padded
 * today; this exists so a future odd-shaped source degrades into a clean margin
 * rather than a stretched or cropped fish.
 */
const BACKGROUND = "#F7F2E8";

const WEBP_QUALITY = 88;

const DEFAULT_OUT_DIR = join("public", "images", "fish-guide");

/** Extensions we are willing to read. Anything else is reported and skipped. */
const SUPPORTED_INPUT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

/**
 * Strips the raw filename down to a stable fish slug.
 *
 * The owner's raw files are named `fish-<name>-ai-01.png`, and some carry a doubled
 * `.png.png`. Both suffixes are dropped so the same fish always produces the same
 * output name regardless of which spelling arrived on disk.
 */
export function fishSlugFromFileName(fileName: string): string {
  return basename(fileName, extname(fileName))
    .replace(/\.png$/i, "")
    .replace(/^fish-/, "")
    .replace(/-ai-\d+$/i, "")
    .toLowerCase()
    .trim();
}

function parseArgs(argv: readonly string[]): {
  source: string;
  outDir: string;
  force: boolean;
} {
  const args = [...argv];
  const valueOf = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    if (index === -1) {
      return undefined;
    }
    const value = args[index + 1];
    args.splice(index, 2);
    return value;
  };

  const sourceFlag = valueOf("--source");
  const outFlag = valueOf("--out");
  const force = args.includes("--force");
  args.splice(args.indexOf("--force"), 1);

  const source = sourceFlag ?? process.env.FISH_IMAGE_SOURCE;
  if (!source) {
    throw new Error(
      "No source directory. Pass --source \"<path>\" or set FISH_IMAGE_SOURCE. " +
        "The raw images are kept outside the repository on purpose.",
    );
  }

  return {
    source: resolve(source),
    outDir: resolve(outFlag ?? DEFAULT_OUT_DIR),
    force,
  };
}

type Processed = {
  slug: string;
  fileName: string;
  outputBytes: number;
  sourceWidth: number;
  sourceHeight: number;
  /** True when the source was smaller than the target and got letterboxed, not upscaled. */
  padded: boolean;
};

type Skipped = { fileName: string; reason: string };

export async function processFishImages(options: {
  sourceDir: string;
  outDir: string;
  force?: boolean;
}): Promise<{ processed: Processed[]; skipped: Skipped[] }> {
  const { sourceDir, outDir, force = false } = options;

  const entries = await readdir(sourceDir, { withFileTypes: true, recursive: true });
  await mkdir(outDir, { recursive: true });

  const processed: Processed[] = [];
  const skipped: Skipped[] = [];

  // Sorted so a run is reproducible and so two runs produce identical output order
  // in the log, which makes a diff of the report meaningful.
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.parentPath ? join(entry.parentPath, entry.name) : entry.name)
    .sort();

  for (const path of files) {
    const fileName = basename(path);
    const extension = extname(fileName).toLowerCase();

    if (!SUPPORTED_INPUT.has(extension)) {
      skipped.push({ fileName, reason: `unsupported extension "${extension || "(none)"}"` });
      continue;
    }

    const slug = fishSlugFromFileName(fileName);
    if (!slug) {
      skipped.push({ fileName, reason: "could not derive a fish name from the filename" });
      continue;
    }

    const outputPath = join(outDir, `${slug}.webp`);

    // Read once, up front. Sharp consumes a Buffer rather than the path so that
    // there is no code path in which libvips could open the source for writing.
    const input = await readFile(path);
    const image = sharp(input, { failOn: "error" });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      skipped.push({ fileName, reason: "unreadable image dimensions" });
      continue;
    }

    if (!force) {
      const existing = await readFile(outputPath).catch(() => null);
      if (existing) {
        skipped.push({ fileName, reason: `already converted (use --force to redo)` });
        continue;
      }
    }

    const { data, info } = await sharp(input, { failOn: "error" })
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        // `contain` preserves the whole fish. Combined with the ivory background
        // this letterboxes a non-4:3 source instead of cropping it, which matters
        // because cropping could cut off part of the animal being documented.
        fit: "contain",
        background: BACKGROUND,
        // Never invent detail: a 900px-wide source stays 900px wide and is padded,
        // rather than being blown up to 1200.
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer({ resolveWithObject: true });

    await writeFile(outputPath, data);

    processed.push({
      slug,
      fileName,
      outputBytes: info.size,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      padded: metadata.width / metadata.height !== TARGET_WIDTH / TARGET_HEIGHT,
    });
  }

  return { processed, skipped };
}

async function main(): Promise<void> {
  const { source, outDir, force } = parseArgs(process.argv.slice(2));
  const { processed, skipped } = await processFishImages({ sourceDir: source, outDir, force });

  console.log(`source : ${source}`);
  console.log(`output : ${outDir}`);
  console.log(`target : ${TARGET_WIDTH}x${TARGET_HEIGHT} WebP q${WEBP_QUALITY} contain on ${BACKGROUND}`);
  console.log("");

  for (const item of processed) {
    const size = `${(item.outputBytes / 1024).toFixed(0)} KB`;
    const note = item.padded ? " (padded, source not 4:3)" : "";
    console.log(`  ok        ${item.slug.padEnd(16)} ${item.sourceWidth}x${item.sourceHeight} -> ${size}${note}`);
  }
  for (const item of skipped) {
    console.log(`  skipped   ${item.fileName}: ${item.reason}`);
  }

  console.log("");
  console.log(`${processed.length} written, ${skipped.length} skipped.`);
  console.log("These are AI-generated fish reference illustrations, not dish photographs.");
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("process-fish-images.ts");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}