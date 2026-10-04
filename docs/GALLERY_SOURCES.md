# Curated gallery sources

The curated originals live in `public/images/gallery/`. They are the authoritative
versions of the restaurant photographs, kept at full size and never written to by any
script in this repository.

- **Format:** PNG, 1448x1086 (4:3). `starters-and-salads.png` is 1672x941 (16:9).
- **Weight:** roughly 2.3-2.9 MB each, about 16.8 MB for the set.
- **Metadata:** no EXIF text and no ICC profile on the PNGs.

They are not served to visitors in this form. `npm run images:gallery` derives a WebP copy
of each approved photograph into `public/images/gallery/webp/` at 1200x900, which is what
`/galerie` actually loads. That takes the set from 16.8 MB to about 1.06 MB. The derived
files are committed, so the Worker never has to decode an image at request time and Sharp
stays out of the production runtime.

The approved list, alt text, and provenance live in `src/lib/gallery-images.ts`. That module
is the single source of truth for the page, the processing script, and the tests. Add a
photograph there, then re-run the script.

This file is documentation, not runtime, which is why it lives here rather than in
`public/images/gallery/` alongside the images it describes.