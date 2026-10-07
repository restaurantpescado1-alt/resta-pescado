# Security Requirements

- One owner account; public registration disabled.
- Secure HTTP-only SameSite cookies.
- Check session and owner role server-side on every admin operation.
- Parameterized Drizzle queries; positive integer DA prices; foreign keys enabled.
- Rate-limit login, reset, upload, and destructive actions.
- Allow JPEG, PNG, and WebP only; verify MIME, signature, dimensions, size, and file completeness.
- Random object keys; never expose write credentials to browsers. The ImageKit private key is
  a Worker secret: upload, delete and read all run server-side through `src/lib/media-provider.ts`,
  and the browser only ever holds a `/api/media/...` URL.
- Serve `/api/media/...` with per-request authorization: menu keys from an allow list, gallery
  keys only through a visible `bundled_gallery_images` row or an owner session, everything else 404.
- Read the client IP from `CF-Connecting-IP` only; `X-Forwarded-For` and `X-Real-IP` are trusted
  only in local mode, and an unknown `DEPLOYMENT_MODE` falls back to the strict answer.
- Upload replacement first, update D1 second, delete old object only after success.
- Image removal: clear the reference and write the audit row atomically first, then delete
  the object. A failed commit keeps both the reference and the object. A failed delete after
  a successful commit leaves an unreferenced object, which is logged rather than repaired:
  restoration of the old reference would point a dish the owner just cleared at an object whose
  deletion failed. Bundled fish-guide images are never deleted from the media store, because
  they are not in it.
- Audit create, update, delete, reorder, settings, and sensitive login actions.
- Keep secrets out of Git, Notion, screenshots, and chat.
- Provision the owner password interactively only: `db:provision:owner` reads it from a masked
  prompt (typed twice), never from `OWNER_PASSWORD` in the environment or a file, writes only the
  `hashPassword` output to a temporary directory under the OS temporary folder with restrictive
  permissions, and removes it when the run ends - including on failure. Nothing that prints the
  real SQL (the apply runs a file, and the dry run shows a redacted copy).
- Use D1 Time Travel plus a scheduled JSON export stored outside D1; test restore before
  launch. The export target used to be the removed R2 bucket, so no location is configured yet —
  choosing one (any object store outside Cloudflare D1) is part of launch, not optional.

## Order of checks on an owner write

Every action in `src/app/admin/owner-actions.ts` runs the same four steps, in this order:

```text
1. requireOwner        the session and the role, server-side
2. rate limit          per owner and per action, before the work is validated
3. Zod parse           the whole payload, including the expected version
4. write + audit       one batch, exact row count, then revalidate
```

The order matters in two places. Authorization is first because nothing else should run for a
caller who is not the owner, including the validation that would tell them what a valid payload
looks like. The rate limit is before validation so that a flood of malformed requests is
throttled rather than parsed.

The audit row is written by the same batch as the change, so "the journal says it happened" and
"it happened" cannot come apart. `docs/ARCHITECTURE.md` describes the batch and the exact-count
check.

## Password change, and the recovery gap it sits next to

The form at `/admin/compte` is the only credential-management surface. It calls Better Auth's
`changePassword` with the current password, so possession of an unlocked session is not enough to
take the account over, and with `revokeOtherSessions: true`, so a password change also ends
sessions open elsewhere.

- Rate limit: 5 attempts per 5 minutes. The tightest in the dashboard, because there is no
  fallback if the current password is guessed out from under the owner.
- `signOut` is a server action, and its redirect is hard-coded. A caller-chosen redirect target
  would be an open redirect on an authenticated endpoint.
- **No recovery exists.** Better Auth's signup is disabled and no email provider is configured, so
  a forgotten password cannot be reset from the site or from a message. Recovery means a password
  reset in the D1 console — setting `account.password` to a `hashPassword` output. It is not
  `npm run db:seed:remote` (content only, no account) and it is not
  `npm run db:provision:owner`, which refuses to write to a database that already has an account
  and so cannot be used to rotate one. This is a launch blocker for a site with more than one
  person holding the credentials, and it is recorded rather than papered over: adding a fake
  "mot de passe oublié" link would be worse than nothing.
- **The session cookie after a change depends on `nextCookies()`.** `revokeOtherSessions` deletes
  the current session and issues a new one; if the new cookie is not carried back to the browser
  the owner is signed out by their own password change. See `docs/ARCHITECTURE.md`.

## Known gaps, stated rather than implied

- **No second factor, one account.** `profiles.role = 'owner'` is the entire access model. The
  account is an email address and a password, and both are known to one person.
- **No CSRF token of our own.** Server actions carry Next.js's own origin and action-id checks and
  the cookie is `SameSite=Lax`, which is what makes this acceptable. Adding a hand-rolled token on
  top would be ceremony, not security.
- **Audit readability is deliberately lossy.** The journal renders entity ids and the fields that
  changed. It does not render the owner's email, and it is not a tamper-evident log — see
  `docs/ARCHITECTURE.md`.
- **People in photographs.** The bundled gallery is confirmed by the owner as the restaurant's
  own photographs; that is provenance, not a release. If a photograph shows an identifiable person,
  a written release is a separate requirement and nothing in this codebase records one.
- **Hiding a photograph does not recall a URL.** `/api/media` authorizes every request the site
  makes, so a hidden or deleted image stops being served there, but ImageKit delivers from its
  CDN: a CDN URL that was already shared or cached keeps working until the file is deleted from
  ImageKit itself. Deletion removes the file; hiding does not. Private/signed delivery is the
  follow-up that would make hiding absolute.

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
