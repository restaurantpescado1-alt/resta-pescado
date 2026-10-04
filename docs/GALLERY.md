# Gallery

How the photographs on `/galerie` get there, what has been verified about them, and what
has not.

## Two sources, one grid

`/galerie` renders two kinds of image from one list:

| Source | Where it lives | Who controls the order |
| --- | --- | --- |
| Bundled photographs | `public/images/gallery/webp/*.webp`, described by `src/lib/gallery-images.ts` | Curated in code |
| Owner uploads | R2, rows in `gallery_images` | `sort_order`, in the dashboard |

Bundled images come first. The table is read on every request, so an uploaded photograph
appears without a rebuild.

The AI fish illustrations are deliberately absent from both. They illustrate species, not the
restaurant, and putting them on a page captioned as the restaurant would misrepresent them.
A test asserts they never appear in the gallery.

## The derived files

The curated originals are 1448x1086 PNG files weighing 2.3-2.9 MB each. Serving those is
roughly 17 MB for one gallery, so `npm run images:gallery` writes a 1200x900 WebP derivative
of each into `public/images/gallery/webp/`. The set comes to about 1.06 MB.

The script reads `src/lib/gallery-images.ts`, never writes to a source, never upscales,
never stretches, and strips metadata. Cropping a non-4:3 source down to 4:3 is allowed by
`docs/CONTENT_POLICY.md`.

**Sharp is not a production dependency.** It runs here, at build time. The output is a
committed static file, so the Worker never decodes an image while serving a request.

## What has not been verified

Every bundled photograph is marked `provenance: "unverified"` in
`src/lib/gallery-images.ts`, and `docs/gallery-manifest.json` records the same.

The reason is specific. These files arrived as curated exports with no EXIF text and no ICC
profile, and nothing in this repository can show whether they are unaltered documentary
photographs of this restaurant or were generated or materially edited.
`docs/CONTENT_POLICY.md` ranks an owner-approved temporary AI image fifth, below it only "no
image", and forbids passing materially different work off as documentary.

**The owner has to confirm this set before launch.** Either the photographs are real and the
flag comes off, or the unconfirmed ones come off the site. The flag lives in the data rather
than only in prose so it cannot be quietly dropped.

Nothing in the repository asserts a species, a certification, a provenance, or that any
photograph shows a dish actually served.

## The duplicate dining-room file

`public/images/gallery/` contains both `restaurant-dining-room.png` and
`restaurant-dining-room.jpg`. They are **different photographs**, not two copies of one
image:

- Mean absolute channel difference between the decoded pixels is 70.4 out of 255.
- The PNG is 1448x1086 (4:3); the JPEG is 1960x1103 (16:9).
- The JPEG is the only file in the set carrying an EXIF block.
- The previously approved derivative was 804x603, a 4:3 ratio, which matches the PNG.

**The PNG is published and the JPEG is not.** The JPEG is still on disk, because deleting a
file needs the owner's approval. If it turns out to be a second dining-room view worth
showing, add it to `src/lib/gallery-images.ts` under its own slug.

`wooden-ship-decor` was referenced by an earlier manifest and exists nowhere in the
repository. The reference was removed rather than left pointing at a missing file.

## Initialising the bundled set in production, later

The bundled photographs ship inside the repository, so production needs nothing: the same
files are served. The question only arises if the bundled photographs are ever moved into R2
alongside owner uploads, so that everything is editable without a deploy.

Do **not** do that by running the local seed against production. `scripts/seed-local.ts`
rewrites `site_settings` and deletes menu rows it does not recognise, and
`scripts/local-db-guard.ts` refuses to run against a non-local path. That refusal is
load-bearing.

If bundled photographs ever need to become database rows, the intended shape is an
append-only, idempotent migration of the same kind as `drizzle/`:

- insert a `gallery_images` row per bundled photograph, keyed on a stable id derived from
  the slug, so re-running inserts nothing twice
- `ON CONFLICT DO NOTHING`, never `DO UPDATE`: an owner who has since hidden or deleted a
  photograph keeps that decision
- no `DELETE`, no truncation, no reconciliation of rows it did not create
- run it as its own migration, not as part of the seed

The rule underneath all of it: **owner-created production content is never overwritten or
deleted by a script.** The seed's reset path is gated behind
`scripts/local-db-guard.ts` and `SEED_ALLOW_DELETE=1`, and stays that way.

## Known limitations

- **D1 and R2 cannot be atomic together.** Every image operation is ordered to avoid losing
  a live image, and each ordering is documented where it is implemented
  (`src/lib/image-replace.ts`, `src/lib/image-remove.ts`). If the process dies between the
  database commit and the object delete, the object survives as an orphan. The removal path
  logs the orphan key; there is no reconciliation job, and this does not claim otherwise.
- **A post-commit row count cannot roll a D1 batch back.** `runAtomicBatch` checks that an
  update matched the expected number of rows and throws otherwise. By the time that check
  runs the batch is already committed, so the throw reports the mismatch rather than
  undoing it. It exists to make a lost update visible, not to prevent one.
- **Concurrent edits are last-write-wins.** Two owner tabs editing the same dish can
  overwrite each other. There is one owner account, so the exposure is small, and no
  optimistic locking is implemented.