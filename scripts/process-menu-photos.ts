/**
 * Menu photo pipeline.
 *
 * Reads the owner's raw AI-generated menu photos from an external directory and
 * writes optimized website copies into `public/images/menu/`.
 *
 * The source directory is deliberately outside the repository and is never written
 * to. Every file operation here is read-only against the source; the only writes go
 * to the output directory and to an optional report path. There is no code path that
 * renames, moves, or deletes a source file.
 *
 * Usage:
 *   node node_modules\tsx\dist\cli.mjs scripts/process-menu-photos.ts --source "<path>" [--report "<file>"] [--force]
 *
 * `--source` defaults to `$MENU_PHOTO_SOURCE`. `--force` overwrites existing outputs;
 * without it, an already-converted file is left alone so re-running is cheap and
 * idempotent.
 *
 * ## How a source file is matched to a dish
 *
 * Not by guessing. `SOURCE_FILE_BY_ITEM_ID` is an explicit, exact table: one line per
 * dish, naming the one file the owner supplied for it. Nothing normalises accents,
 * case, spaces, or hyphens to find a "close enough" file, because a near-miss here
 * would put the wrong dish beside a price. The script verifies the table against the
 * canonical menu in `scripts/approved-menu.ts` and refuses to run unless the two agree
 * exactly: every approved item has a row, every row names an approved item, and every
 * named file exists in the source directory.
 *
 * ## What these files are
 *
 * AI-generated *illustrative* pictures of food, not photographs of what the
 * restaurant serves. `docs/CONTENT_POLICY.md` ranks an owner-approved temporary AI
 * image above no image at all, and nothing here may be presented as a documentary
 * photograph of a plate. `src/lib/dish-images.ts` carries the label every surface
 * has to render alongside them.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import sharp from "sharp";

import { allApprovedItems } from "./approved-menu";

/**
 * Derivative geometry.
 *
 * The menu row renders the image in a box at most 192 CSS px wide (`md:w-48`), so
 * 720px covers a 3x screen with headroom while staying far smaller than the 1448px
 * masters. Serving the masters as a 192px thumbnail would ship roughly 56x the pixels
 * the page can display.
 */
const TARGET_WIDTH = 720;
const TARGET_HEIGHT = 540;

const WEBP_QUALITY = 82;

const DEFAULT_OUT_DIR = join("public", "images", "menu");

/**
 * The dish these pixels are for, named verbatim from the owner's menu.
 *
 * Keys are the stable ids from `scripts/approved-menu.ts`; values are the exact
 * filenames in the source directory, punctuation and apostrophes included.
 */
const SOURCE_FILE_BY_ITEM_ID: Readonly<Record<string, string>> = {
  // Nos Entrées
  "item-salade-aubergines": "Salade d\u2019Aubergines.png",
  "item-salade-tomate": "Salade de Tomate.png",
  "item-salade-poulpe": "Salade de Poulpe.png",
  "item-salade-pomme-de-terre": "salade-pomme-de-terre.png",
  "item-hmis": "hmis.png",
  "item-salade-variee": "salade-variee.png",
  "item-frites": "frites.png",
  "item-bourek-crevettes": "bourek-crevettes.png",
  "item-bourek-thon": "bourek-thon.png",
  // Nos Soupes
  "item-soupe-de-poissons": "soupe-poissons.png",
  "item-soupe-turque": "soupe-turque.png",
  // Nos Poissons
  "item-sardines-friture": "sardines-friture.png",
  "item-sardines-fritures-garnies": "sardines-fritures-garnies.png",
  "item-chtitha-sardines": "chtitha-sardines.png",
  "item-sepia-en-sauce": "Sepia en Sauce.png",
  "item-thon-grille": "thon-grille.png",
  "item-rouget": "rouget.png",
  "item-merlan": "merlan.png",
  "item-espadon": "espadon.png",
  "item-espadon-en-sauce": "espadon-en-sauce.png",
  "item-chien-de-mer": "chien-de-mer.png",
  "item-calamar": "calamar.png",
  "item-dorade": "dorade.png",
  "item-loup-de-mer": "loup-de-mer.png",
  // `crevettes-en-sauce-v2` rather than the superseded first attempt.
  "item-crevettes-en-sauce": "crevettes-en-sauce-v2.png",
  "item-crevettes-grillees": "crevettes-grillees.png",
  "item-plat-varie-de-poissons": "plat-varie-poissons.png",
  // Nos Desserts
  "item-flan-caramel": "flan-caramel.png",
  "item-flan-cafe": "flan-cafe.png",
  "item-salade-de-fruits": "salade-fruits.png",
  // Nos Boissons
  "item-soda": "soda.png",
  "item-jus": "jus.png",
  "item-eau-minerale-pm": "eau-minerale-pm.png",
  // `canette-v2` rather than the superseded generic silver can.
  "item-canette": "canette-v2.png",
  "item-jus-de-citron": "jus-citron-1l.png",
  "item-jus-d-orange": "jus-orange-1l.png",
  "item-cocktail-de-fruits": "cocktail-fruits-1l.png",
};

/** Public path fragment for a dish: the stable id minus its `item-` prefix. */
export function dishSlugFromItemId(itemId: string): string {
  return itemId.replace(/^item-/, "");
}

export interface MenuPhotoEntry {
  itemId: string;
  nameFr: string;
  sourceFile: string;
  derivative: string;
  sourceWidth: number;
  sourceHeight: number;
  derivativeWidth: number;
  derivativeHeight: number;
  sourceBytes: number;
  derivativeBytes: number;
  sha256: string;
  /** Standard deviation of luminance on a small sample; low means flat or blank. */
  luminanceSpread: number;
}

/**
 * Cross-checks the explicit table against the canonical menu before any pixel is read.
 *
 * Both directions matter. A table with a typo in an id would silently skip a dish, and
 * an id the owner never approved would attach a photo to a dish that does not exist.
 */
export function validateManifest(): { ok: true } | { ok: false; problems: string[] } {
  const problems: string[] = [];

  const approved = allApprovedItems();
  const approvedIds = new Set(approved.map((item) => item.id));
  const tableIds = Object.keys(SOURCE_FILE_BY_ITEM_ID);

  for (const item of approved) {
    if (!SOURCE_FILE_BY_ITEM_ID[item.id]) {
      problems.push(`no source file mapped for ${item.id} (${item.nameFr})`);
    }
  }

  for (const id of tableIds) {
    if (!approvedIds.has(id)) {
      problems.push(`mapped id ${id} is not on the approved menu`);
    }
  }

  const seen = new Set<string>();
  for (const id of tableIds) {
    const file = SOURCE_FILE_BY_ITEM_ID[id];
    if (file === undefined) {
      problems.push(`id ${id} has no source file`);
      continue;
    }
    if (seen.has(file)) {
      problems.push(`source file "${file}" is mapped to more than one dish`);
    }
    seen.add(file);
  }

  if (tableIds.length !== approved.length) {
    problems.push(`table has ${tableIds.length} rows, the approved menu has ${approved.length} items`);
  }

  return problems.length === 0 ? { ok: true } : { ok: false, problems };
}

/** Luminance spread on a 32x24 sample: a cheap stand-in for "is this picture blank". */
async function luminanceSpread(input: Buffer): Promise<number> {
  const { data } = await sharp(input, { failOn: "error" })
    .resize(32, 24, { fit: "fill" })
    .removeAlpha()
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (const value of data) {
    sum += value;
  }
  const mean = sum / data.length;

  let variance = 0;
  for (const value of data) {
    variance += (value - mean) ** 2;
  }
  return Math.sqrt(variance / data.length);
}

export async function processMenuPhotos(options: {
  sourceDir: string;
  outDir: string;
  force?: boolean;
}): Promise<{ processed: MenuPhotoEntry[]; skipped: Array<{ itemId: string; reason: string }> }> {
  const { sourceDir, outDir, force = false } = options;

  const check = validateManifest();
  if (!check.ok) {
    throw new Error("Manifest does not match the approved menu:\n  - " + check.problems.join("\n  - "));
  }

  const present = new Set(await readdir(sourceDir));
  const missing = Object.entries(SOURCE_FILE_BY_ITEM_ID).filter(([, file]) => !present.has(file));
  if (missing.length > 0) {
    throw new Error(
      "Source directory is missing files the manifest names:\n  - " +
        missing.map(([id, file]) => `${id} → "${file}"`).join("\n  - "),
    );
  }

  await mkdir(outDir, { recursive: true });

  const approvedById = new Map(allApprovedItems().map((item) => [item.id, item]));
  const processed: MenuPhotoEntry[] = [];
  const skipped: Array<{ itemId: string; reason: string }> = [];

  for (const [itemId, fileName] of Object.entries(SOURCE_FILE_BY_ITEM_ID)) {
    const approved = approvedById.get(itemId);
    if (!approved) {
      skipped.push({ itemId, reason: "not on the approved menu" });
      continue;
    }

    const sourcePath = join(sourceDir, fileName);
    const slug = dishSlugFromItemId(itemId);
    const outputPath = join(outDir, `${slug}.webp`);

    const input = await readFile(sourcePath);
    const sourceStat = await stat(sourcePath);
    const sha256 = createHash("sha256").update(input).digest("hex");

    const metadata = await sharp(input, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) {
      skipped.push({ itemId, reason: "unreadable image dimensions" });
      continue;
    }

    if (!force) {
      const existing = await stat(outputPath).catch(() => null);
      if (existing) {
        skipped.push({ itemId, reason: "already converted (use --force to redo)" });
        continue;
      }
    }

    /*
     * `cover` rather than `contain`: every master the owner supplied is already 4:3,
     * so nothing is cropped to speak of, and cover guarantees the exact 720x540
     * geometry the manifest declares. A non-4:3 future source is reported below rather
     * than silently letterboxed.
     */
    const { data, info } = await sharp(input, { failOn: "error" })
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: WEBP_QUALITY, effort: 5 })
      .toBuffer({ resolveWithObject: true });

    await writeFile(outputPath, data);

    processed.push({
      itemId,
      nameFr: approved.nameFr,
      sourceFile: fileName,
      derivative: `${slug}.webp`,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      derivativeWidth: info.width,
      derivativeHeight: info.height,
      sourceBytes: sourceStat.size,
      derivativeBytes: info.size,
      sha256,
      luminanceSpread: await luminanceSpread(input),
    });
  }

  return { processed, skipped };
}

function parseArgs(argv: readonly string[]): { source: string; report: string | null; force: boolean } {
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
  const reportFlag = valueOf("--report");
  const forceIndex = args.indexOf("--force");
  const force = forceIndex !== -1;
  if (force) {
    args.splice(forceIndex, 1);
  }

  const source = sourceFlag ?? process.env.MENU_PHOTO_SOURCE;
  if (!source) {
    throw new Error(
      'No source directory. Pass --source "<path>" or set MENU_PHOTO_SOURCE. ' +
        "The raw images are kept outside the repository on purpose.",
    );
  }

  return { source: resolve(source), report: reportFlag ? resolve(reportFlag) : null, force };
}

async function main(): Promise<void> {
  const { source, report, force } = parseArgs(process.argv.slice(2));
  const { processed, skipped } = await processMenuPhotos({ sourceDir: source, outDir: DEFAULT_OUT_DIR, force });

  const hashes = new Map<string, string[]>();
  for (const entry of processed) {
    hashes.set(entry.sha256, [...(hashes.get(entry.sha256) ?? []), entry.itemId]);
  }
  const duplicates = [...hashes.entries()].filter(([, ids]) => ids.length > 1);
  const notFourByThree = processed.filter(
    (entry) => entry.sourceWidth / entry.sourceHeight !== TARGET_WIDTH / TARGET_HEIGHT,
  );

  console.log(`source : ${source}`);
  console.log(`output : ${DEFAULT_OUT_DIR}`);
  console.log(`target : ${TARGET_WIDTH}x${TARGET_HEIGHT} WebP q${WEBP_QUALITY}`);
  console.log("");

  for (const entry of processed) {
    const kb = `${(entry.sourceBytes / 1024).toFixed(0)}KB -> ${(entry.derivativeBytes / 1024).toFixed(0)}KB`;
    console.log(`  ok  ${entry.itemId.padEnd(32)} ${String(entry.sourceWidth).padStart(4)}x${entry.sourceHeight}  ${kb}  spread=${entry.luminanceSpread.toFixed(1)}`);
  }
  for (const entry of skipped) {
    console.log(`  skipped  ${entry.itemId}: ${entry.reason}`);
  }

  console.log("");
  console.log(`${processed.length} written, ${skipped.length} skipped.`);
  if (duplicates.length > 0) {
    console.log("DUPLICATE PIXELS:");
    for (const [hash, ids] of duplicates) {
      console.log(`  ${hash.slice(0, 12)}  ${ids.join(", ")}`);
    }
  } else {
    console.log("duplicate pixels: none (every dish has distinct source bytes)");
  }
  if (notFourByThree.length > 0) {
    console.log("sources that are not exactly 4:3 (cover crops the difference):");
    for (const entry of notFourByThree) {
      console.log(`  ${entry.itemId}  ${entry.sourceWidth}x${entry.sourceHeight}`);
    }
  } else {
    console.log("aspect ratios: every source is exactly 4:3");
  }

  console.log("");
  console.log("These are AI-generated illustrative images of food, not photographs of the restaurant.");

  if (report) {
    await writeFile(report, JSON.stringify({ processed, skipped, duplicates }, null, 2) + "\n");
    console.log(`report : ${report}`);
  }
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, "/").endsWith("process-menu-photos.ts");
if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
