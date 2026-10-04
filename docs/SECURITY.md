# Security Requirements

- One owner account; public registration disabled.
- Secure HTTP-only SameSite cookies.
- Check session and owner role server-side on every admin operation.
- Parameterized Drizzle queries; positive integer DA prices; foreign keys enabled.
- Rate-limit login, reset, upload, and destructive actions.
- Allow JPEG, PNG, and WebP only; verify MIME, signature, dimensions, size, and file completeness.
- Random R2 keys; never expose write credentials to browsers.
- Upload replacement first, update D1 second, delete old object only after success.
- Image removal: clear the reference and write the audit row atomically first, then delete
  the object. A failed commit keeps both the reference and the object. A failed delete after
  a successful commit leaves an unreferenced object, which is logged rather than repaired:
  restoring the old reference would point a dish the owner just cleared at an object whose
  deletion failed. Bundled fish-guide images are never deleted from R2, because they are not
  in it.
- Audit create, update, delete, reorder, settings, and sensitive login actions.
- Keep secrets out of Git, Notion, screenshots, and chat.
- Use D1 Time Travel plus scheduled JSON exports to R2; test restore before launch.

## Limits of upload validation, stated honestly

The byte-level completeness check in `src/lib/images.ts` (`isCompleteImage`) asks each format
for its terminator: JPEG's `FF D9`, PNG's `IEND`, and WebP's declared RIFF length. That
rejects a truncated or interrupted upload, which every other check would have accepted, because
all of them read only the front of the file.

It is **not** a decode. It cannot open the image, verify the pixel data, or catch damage
inside a file whose length and terminator are intact. A real guarantee needs an image decoder
at upload time, which would mean Sharp in the Worker runtime; that is deliberately out of
scope, because it would put a native module in the request path. The practical consequence is
that `SafeImage` degrades a broken image to its alt text instead of showing the browser's
broken-image glyph.
